import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";
import { recordAction, getAgentId } from "../services/actionLogger";
import { ActionType } from "../services/actionLogger";
import { x402 } from "../middleware/x402";

const router = Router();

// GET /api/swap/supported-chains
router.get("/swap/supported-chains", async (_req: Request, res: Response) => {
  try {
    const data = await run(["swap", "chains"]);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /api/swap/gas?chain=xlayer
router.get("/swap/gas", async (req: Request, res: Response) => {
  const { chain = "xlayer" } = req.query as Record<string, string>;
  try {
    const data = await run(["gateway", "gas", "--chain", chain]);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /api/swap/liquidity?chain=xlayer
router.get("/swap/liquidity", async (req: Request, res: Response) => {
  const { chain = "xlayer" } = req.query as Record<string, string>;
  try {
    const data = await run(["swap", "liquidity", "--chain", chain]);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/swap/quote
router.post("/swap/quote", async (req: Request, res: Response) => {
  const { from, to, amount, readableAmount, chain = "xlayer" } = req.body;

  if (!from || !to || (!amount && !readableAmount)) {
    res.status(400).json({ ok: false, error: "from, to, and amount (or readableAmount) are required" });
    return;
  }

  try {
    const args = ["swap", "quote", "--from", from, "--to", to, "--chain", chain];
    if (readableAmount) args.push("--readable-amount", readableAmount);
    else args.push("--amount", amount);

    const data = await run(args);
    logAction("swap", `quote:${from}->${to}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/swap/check-approval
router.post("/swap/check-approval", async (req: Request, res: Response) => {
  const { tokenAddress, walletAddress, chain = "xlayer" } = req.body;
  if (!tokenAddress || !walletAddress) {
    res.status(400).json({ ok: false, error: "tokenAddress and walletAddress are required" });
    return;
  }
  try {
    const data = await run([
      "swap", "check-approvals",
      "--address", walletAddress,
      "--token", tokenAddress,
      "--chain", chain,
    ]);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/swap/approve
router.post("/swap/approve", async (req: Request, res: Response) => {
  const { tokenAddress, chain = "xlayer" } = req.body;
  if (!tokenAddress) {
    res.status(400).json({ ok: false, error: "tokenAddress is required" });
    return;
  }
  try {
    const MAX_AMOUNT = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    const data = await run([
      "swap", "approve",
      "--token", tokenAddress,
      "--amount", MAX_AMOUNT,
      "--chain", chain,
    ]);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/swap/execute
// Returns unsigned tx data for the frontend to sign via MetaMask
router.post("/swap/execute", async (req: Request, res: Response) => {
  const { from, to, amount, readableAmount, chain = "xlayer", walletAddress } = req.body;

  if (!from || !to || (!amount && !readableAmount)) {
    res.status(400).json({ ok: false, error: "from, to, and amount (or readableAmount) are required" });
    return;
  }
  if (!walletAddress) {
    res.status(400).json({ ok: false, error: "walletAddress is required — connect your wallet first" });
    return;
  }

  try {
    const args = ["swap", "swap", "--from", from, "--to", to, "--chain", chain, "--wallet", walletAddress];
    if (readableAmount) args.push("--readable-amount", readableAmount);
    else args.push("--amount", amount);

    const data = await run(args);
    console.log("[swap/execute] onchainos response:", JSON.stringify(data).slice(0, 300));
    logAction("swap", `tx-build:${from}->${to}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// Rate limiting for agent-execute: 1 swap per IP per 10 minutes, max 5 swaps/day globally
const ipLastSwap = new Map<string, number>();
let dailySwapCount = 0;
let dailySwapReset = Date.now() + 86400_000;
const DAILY_SWAP_LIMIT = 5;
const IP_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// POST /api/swap/agent-execute
// One-shot: quote → approve (if needed) → swap → sign & broadcast → txHash
// Uses onchainos swap execute with agent wallet
router.post("/swap/agent-execute", async (req: Request, res: Response) => {
  const { from, to, amount, readableAmount, chain = "xlayer", slippage } = req.body;

  if (!from || !to || (!amount && !readableAmount)) {
    res.status(400).json({ ok: false, error: "from, to, and amount are required" });
    return;
  }

  const { PRIVATE_KEY } = process.env;
  if (!PRIVATE_KEY) {
    res.status(503).json({ ok: false, error: "Agent wallet not configured (PRIVATE_KEY missing)" });
    return;
  }

  // Cap agent-execute to 1 unit max to protect the agent wallet
  const numericAmount = parseFloat(readableAmount || "0");
  if (numericAmount > 1) {
    res.status(400).json({ ok: false, error: "Agent swap capped at 1 unit max" });
    return;
  }

  // Rate limiting
  const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  if (now > dailySwapReset) { dailySwapCount = 0; dailySwapReset = now + 86400_000; }
  if (dailySwapCount >= DAILY_SWAP_LIMIT) {
    res.status(429).json({ ok: false, error: "Daily agent swap limit reached. Try again tomorrow." });
    return;
  }
  const lastSwap = ipLastSwap.get(ip) || 0;
  if (now - lastSwap < IP_COOLDOWN_MS) {
    const waitMin = Math.ceil((IP_COOLDOWN_MS - (now - lastSwap)) / 60000);
    res.status(429).json({ ok: false, error: `Please wait ${waitMin} min before another agent swap.` });
    return;
  }
  ipLastSwap.set(ip, now);
  dailySwapCount++;

  try {
    console.log("[agent-execute] START");
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const agentAddress = wallet.address;
    console.log("[agent-execute] using agent address:", agentAddress);

    // Step 1: get tx data from onchainos swap swap
    const args = [
      "swap", "swap",
      "--from", from,
      "--to", to,
      "--chain", chain,
      "--wallet", agentAddress,
    ];
    if (readableAmount) args.push("--readable-amount", readableAmount);
    else args.push("--amount", amount);
    if (slippage) args.push("--slippage", String(slippage));

    const swapData = await run(args) as { ok?: boolean; data?: Array<{ tx?: { to?: string; data?: string; value?: string; gas?: string; gasPrice?: string } }> | { tx?: { to?: string; data?: string; value?: string; gas?: string; gasPrice?: string } }; error?: string };
    console.log("[agent-execute] swap data:", JSON.stringify(swapData).slice(0, 300));

    if (!swapData || swapData.ok === false) {
      res.status(400).json({ ok: false, error: (swapData as any)?.error || "Failed to get swap tx" });
      return;
    }

    const raw = Array.isArray(swapData.data) ? swapData.data[0] : swapData.data;
    const txFields = (raw as any)?.tx || raw;
    console.log("[agent-execute] txFields.to:", txFields?.to, "value:", txFields?.value);
    if (!txFields?.to) {
      res.status(400).json({ ok: false, error: "No tx data from onchainos" });
      return;
    }

    // Step 2: sign and broadcast with agent private key via X Layer RPC
    const XLAYER_RPC = process.env.XLAYER_RPC || "https://rpc.xlayer.tech";
    console.log("[agent-execute] connecting to RPC:", XLAYER_RPC);
    const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
    const signer = wallet.connect(provider);
    console.log("[agent-execute] signer ready, sending tx...");

    const rawValue = txFields.value || "0";
    const value = rawValue.startsWith("0x") ? rawValue : "0x" + BigInt(rawValue).toString(16);
    const gasLimit = txFields.gas ? (txFields.gas.startsWith?.("0x") ? txFields.gas : "0x" + BigInt(txFields.gas).toString(16)) : undefined;

    const tx = await signer.sendTransaction({
      to: txFields.to,
      data: txFields.data || "0x",
      value,
      ...(gasLimit ? { gasLimit } : {}),
    });
    console.log("[agent-execute] tx sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("[agent-execute] confirmed:", receipt?.hash);
    const txHash = receipt?.hash || tx.hash;

    // Respond first, then log async
    res.json({ ok: true, data: { txHash } });

    logAction("swap", `agent:${from}->${to}:${readableAmount || amount}`);
    getAgentId().then((agentId) => {
      if (agentId) {
        recordAction(agentId, ActionType.SWAP, `agent-execute:${from}->${to}:${readableAmount || amount}`, {
          txHash,
          cost: 0,
        });
      }
    }).catch(() => {});
  } catch (err) {
    console.error("[agent-execute] CRASH:", (err as Error).message);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
