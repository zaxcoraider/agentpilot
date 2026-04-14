import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";
import { x402 } from "../middleware/x402";

const router = Router();

// FREE — GET /api/token/search?query=OKB&chain=xlayer
router.get("/token/search", async (req: Request, res: Response) => {
  try {
    const { query = "", chain = "xlayer" } = req.query as Record<string, string>;
    const data = await run(["token", "search", "--query", query, "--chain", chain]);
    logAction("search", query);
    res.json(data);
  } catch (_err: unknown) {
    res.json({ ok: true, data: [] });
  }
});

// Known X Layer tokens — used as fallback when market data API is unavailable
const XLAYER_TOKENS = [
  { tokenSymbol: "OKB",  tokenName: "OKB",          tokenContractAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", price: 0, change: 0 },
  { tokenSymbol: "USDT", tokenName: "Tether USD",    tokenContractAddress: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", price: 1, change: 0 },
  { tokenSymbol: "USDC", tokenName: "USD Coin",      tokenContractAddress: "0x74b7f16337b8972027f6196a17a631ac6de26d22", price: 1, change: 0 },
  { tokenSymbol: "WBTC", tokenName: "Wrapped BTC",   tokenContractAddress: "0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1", price: 0, change: 0 },
  { tokenSymbol: "WETH", tokenName: "Wrapped Ether", tokenContractAddress: "0x5a77f1443d16ee5761d310e38b62f77f726bC71c", price: 0, change: 0 },
];

// FREE — GET /api/token/trending?chain=xlayer&timeFrame=4
router.get("/token/trending", async (req: Request, res: Response) => {
  try {
    const { chain = "xlayer", timeFrame = "4" } = req.query as Record<string, string>;
    const args = ["token", "hot-tokens", "--chain", chain, "--time-frame", timeFrame];
    const data = await run(args);
    logAction("scan", `trending:${chain}:${timeFrame}`);
    res.json(data);
  } catch (_err: unknown) {
    // Market data not available via direct HTTP — return known X Layer tokens
    res.json({ ok: true, data: XLAYER_TOKENS });
  }
});

// FREE — GET /api/token/holders/:address?chain=xlayer
router.get("/token/holders/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { chain = "xlayer" } = req.query as Record<string, string>;
    const data = await run(["token", "holders", "--address", address, "--chain", chain]);
    logAction("scan", `holders:${address}`);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// FREE — GET /api/token/price/:address?chain=xlayer
router.get("/token/price/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { chain = "xlayer" } = req.query as Record<string, string>;
    const data = await run(["token", "price-info", "--address", address, "--chain", chain]);
    logAction("scan", `price:${address}`);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// FREE — GET /api/market/kline/:address?chain=xlayer&bar=1H&limit=100
router.get("/market/kline/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { chain = "xlayer", bar = "1H", limit = "100" } = req.query as Record<string, string>;
    const data = await run([
      "market", "kline",
      "--address", address,
      "--chain", chain,
      "--bar", bar,
      "--limit", limit,
    ]);
    logAction("scan", `kline:${address}`);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// PAID ($0.001 USDT) — GET /api/signal/smart-money?chain=xlayer
router.get("/signal/smart-money", x402(), async (req: Request, res: Response) => {
  try {
    const { chain = "ethereum" } = req.query as Record<string, string>;
    const data = await run(["signal", "list", "--chain", chain, "--wallet-type", "1"]);
    logAction("scan", `signal:${chain}`);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /api/signal/smart-money-agent?chain=ethereum
router.get("/signal/smart-money-agent", async (req: Request, res: Response) => {
  const requestedChain = (req.query.chain as string) || "ethereum";
  const chain = ["ethereum", "solana", "bsc"].includes(requestedChain) ? requestedChain : "ethereum";
  try {
    const data = await run(["signal", "list", "--chain", chain, "--wallet-type", "1"]);
    logAction("scan", `signal-agent:${chain}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
