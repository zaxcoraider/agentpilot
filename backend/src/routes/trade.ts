import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";
import { recordAction, getAgentId } from "../services/actionLogger";
import { ActionType } from "../services/actionLogger";

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
    logAction("swap", `tx-build:${from}->${to}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/swap/agent-execute
// Agent wallet signs and broadcasts the swap using its own private key
router.post("/swap/agent-execute", async (req: Request, res: Response) => {
  const { from, to, amount, readableAmount, chain = "xlayer" } = req.body;

  if (!from || !to || (!amount && !readableAmount)) {
    res.status(400).json({ ok: false, error: "from, to, and amount are required" });
    return;
  }

  const { PRIVATE_KEY } = process.env;
  if (!PRIVATE_KEY) {
    res.status(503).json({ ok: false, error: "Agent wallet not configured (PRIVATE_KEY missing)" });
    return;
  }

  try {
    const { ethers } = await import("ethers");
    const agentWallet = new ethers.Wallet(PRIVATE_KEY);
    const agentAddress = agentWallet.address;

    const args = [
      "swap", "execute",
      "--from", from,
      "--to", to,
      "--chain", chain,
      "--wallet", agentAddress,
    ];
    if (readableAmount) args.push("--readable-amount", readableAmount);
    else args.push("--amount", amount);

    const data = await run(args) as { ok?: boolean; data?: { txHash?: string }; error?: string };

    if (!data || (data as { ok?: boolean }).ok === false) {
      res.status(400).json({ ok: false, error: (data as { error?: string })?.error || "Swap failed" });
      return;
    }

    const txHash = (data as { data?: { txHash?: string } }).data?.txHash;

    // Record to DB (always) + on-chain (SWAP is critical)
    const agentId = await getAgentId();
    if (agentId) {
      recordAction(agentId, ActionType.SWAP, `agent-execute:${from}->${to}:${readableAmount || amount}`, {
        txHash,
        cost: 0,
      });
    }

    res.json({ ok: true, data: (data as { data?: unknown }).data });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
