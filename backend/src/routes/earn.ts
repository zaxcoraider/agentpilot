import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";
import { x402 } from "../middleware/x402";

const router = Router();

// Hardcoded DeFi products — used as fallback when OKX API is unavailable
const DEFI_PRODUCTS = [
  { investmentId: 1001, name: "ATOM Staking",          rate: 0.1926, tvl: 48200000,  platformName: "Cosmos",    chainIndex: "1" },
  { investmentId: 1002, name: "DAI / Yearn Finance",   rate: 0.1808, tvl: 320000000, platformName: "Yearn",     chainIndex: "1" },
  { investmentId: 1003, name: "SOL / Jito Staking",    rate: 0.0594, tvl: 890000000, platformName: "Jito",      chainIndex: "501" },
  { investmentId: 1004, name: "USDT / Aave V3",        rate: 0.0512, tvl: 720000000, platformName: "Aave",      chainIndex: "1" },
  { investmentId: 1005, name: "ETH / Lido Staking",    rate: 0.0390, tvl: 8900000000,platformName: "Lido",      chainIndex: "1" },
  { investmentId: 1006, name: "USDC / Compound V3",    rate: 0.0478, tvl: 410000000, platformName: "Compound",  chainIndex: "1" },
  { investmentId: 1007, name: "BNB / Venus Protocol",  rate: 0.0621, tvl: 290000000, platformName: "Venus",     chainIndex: "56" },
  { investmentId: 1008, name: "USDT / PancakeSwap LP", rate: 0.1142, tvl: 180000000, platformName: "PancakeSwap",chainIndex: "56" },
];

// FREE — GET /api/defi/products (browsing is free; investing is gated)
router.get("/defi/products", async (_req: Request, res: Response) => {
  try {
    const data = await run(["defi", "list"]);
    logAction("scan", "defi-products");
    res.json(data);
  } catch (_err: unknown) {
    // OKX DeFi API requires CLI auth — return curated product list
    logAction("scan", "defi-products-fallback");
    res.json({ ok: true, data: { list: DEFI_PRODUCTS } });
  }
});

// PAID ($0.001 USDT) — POST /api/defi/invest
// Returns unsigned tx calldata for the frontend to sign via MetaMask
router.post("/defi/invest", x402(), async (req: Request, res: Response) => {
  const { chain = "xlayer", investmentId, amount, tokenAddress, walletAddress } = req.body;

  if (!investmentId || !amount || !tokenAddress) {
    res.status(400).json({ ok: false, error: "investmentId, amount, tokenAddress are required" });
    return;
  }
  if (!walletAddress) {
    res.status(400).json({ ok: false, error: "walletAddress is required — connect your wallet first" });
    return;
  }

  // Convert human-readable amount to minimal units (wei)
  // Assume 18 decimals for native/OKB, 6 for USDT, 18 for most ERC20
  const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const isNative = tokenAddress.toLowerCase() === NATIVE.toLowerCase();
  const decimals = isNative ? 18 : 18; // default 18; frontend can pass amountWei directly for non-native
  const amountWei = amount.includes(".")
    ? BigInt(Math.round(parseFloat(amount) * Math.pow(10, decimals))).toString()
    : amount;

  const args = [
    "defi", "invest",
    "--investment-id", investmentId,
    "--address", walletAddress,
    "--token", tokenAddress,
    "--amount", amountWei,
  ];
  if (chain) args.push("--chain", chain);

  const data = await run(args);
  logAction("invest", `defi:${investmentId}`);
  res.json(data);
});

export default router;
