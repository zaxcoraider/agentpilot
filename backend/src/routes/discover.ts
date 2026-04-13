import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";
import { x402 } from "../middleware/x402";

const router = Router();

// FREE — GET /api/token/search?query=OKB&chain=xlayer
router.get("/token/search", async (req: Request, res: Response) => {
  const { query = "", chain = "xlayer" } = req.query as Record<string, string>;
  const data = await run(["token", "search", "--query", query, "--chain", chain]);
  logAction("search", query);
  res.json(data);
});

// FREE — GET /api/token/trending?chain=xlayer&timeFrame=4
// timeFrame: 1=5min, 2=1h, 3=4h, 4=24h
router.get("/token/trending", async (req: Request, res: Response) => {
  const { chain = "xlayer", timeFrame = "4" } = req.query as Record<string, string>;
  const args = ["token", "hot-tokens", "--chain", chain, "--time-frame", timeFrame];
  const data = await run(args);
  logAction("scan", `trending:${chain}:${timeFrame}`);
  res.json(data);
});

// FREE — GET /api/token/holders/:address?chain=xlayer
router.get("/token/holders/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  const { chain = "xlayer" } = req.query as Record<string, string>;
  const data = await run(["token", "holders", "--address", address, "--chain", chain]);
  logAction("scan", `holders:${address}`);
  res.json(data);
});

// FREE — GET /api/token/price/:address?chain=xlayer
router.get("/token/price/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  const { chain = "xlayer" } = req.query as Record<string, string>;
  const data = await run(["token", "price-info", "--address", address, "--chain", chain]);
  logAction("scan", `price:${address}`);
  res.json(data);
});

// FREE — GET /api/market/kline/:address?chain=xlayer&bar=1H&limit=100
router.get("/market/kline/:address", async (req: Request, res: Response) => {
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
});

// PAID ($0.001 USDT) — GET /api/signal/smart-money?chain=xlayer
router.get("/signal/smart-money", x402(), async (req: Request, res: Response) => {
  const { chain = "ethereum" } = req.query as Record<string, string>;
  // wallet-type 1 = Smart Money
  const data = await run(["signal", "list", "--chain", chain, "--wallet-type", "1"]);
  logAction("scan", `signal:${chain}`);
  res.json(data);
});

export default router;
