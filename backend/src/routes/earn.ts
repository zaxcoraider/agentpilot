import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";
import { x402 } from "../middleware/x402";

const router = Router();

// PAID ($0.001 USDT) — GET /api/defi/products
router.get("/defi/products", x402(), async (req: Request, res: Response) => {
  const data = await run(["defi", "list"]);
  logAction("scan", "defi-products");
  res.json(data);
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
