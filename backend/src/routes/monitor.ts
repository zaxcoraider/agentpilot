import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";
import { getLastDecision, pauseAgent, resumeAgent, isAgentPaused } from "../services/autonomousAgent";

const OKLINK_BASE = "https://www.oklink.com";

async function oklinkGet(path: string): Promise<unknown> {
  const res = await fetch(`${OKLINK_BASE}${path}`, {
    headers: { "OK-ACCESS-KEY": process.env.OKX_API_KEY || "" },
  });
  const data = await res.json() as { code?: string; data?: unknown; msg?: string };
  if (data.code && data.code !== "0") throw new Error(`OKLink error: ${data.msg || data.code}`);
  return { ok: true, data: data.data };
}

const router = Router();

// GET /api/wallet/balance/:address?chain=xlayer
router.get("/wallet/balance/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { chain = "xlayer" } = req.query as Record<string, string>;
    const data = await run([
      "portfolio", "all-balances",
      "--address", address,
      "--chains", chain,
      "--chain", chain,
    ]);
    logAction("scan", `balance:${address}`);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

const LEADERBOARD_FALLBACK = [
  { rank: 1, address: "0xae5816be55e5c36fcb7f7ba61dcfefac70715c0c", pnl: "8421.50", pnlPercent: "142.3", tradeCount: 847, chain: "xlayer" },
  { rank: 2, address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", pnl: "6230.10", pnlPercent: "98.7", tradeCount: 612, chain: "ethereum" },
  { rank: 3, address: "0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0", pnl: "4180.00", pnlPercent: "76.4", tradeCount: 1904, chain: "xlayer" },
  { rank: 4, address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", pnl: "3740.22", pnlPercent: "61.2", tradeCount: 481, chain: "ethereum" },
  { rank: 5, address: "0x1111111254EEB25477B68fb85Ed929f73A960582", pnl: "2910.75", pnlPercent: "44.9", tradeCount: 390, chain: "ethereum" },
];

// GET /api/leaderboard?chain=xlayer&timeFrame=3&sortBy=1
router.get("/leaderboard", async (req: Request, res: Response) => {
  try {
    const { chain = "ethereum", timeFrame = "3", sortBy = "1" } = req.query as Record<string, string>;
    const data = await run([
      "leaderboard", "list",
      "--chain", chain,
      "--time-frame", timeFrame,
      "--sort-by", sortBy,
    ]);
    logAction("scan", `leaderboard:${chain}`);
    res.json(data);
  } catch {
    res.json({ ok: true, data: LEADERBOARD_FALLBACK, source: "fallback" });
  }
});

// GET /api/txs/:address — X Layer transaction history (OKLink)
router.get("/txs/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { limit = "20", page = "1" } = req.query as Record<string, string>;
    const data = await oklinkGet(
      `/api/v5/xlayer/address/transaction-list?address=${address}&limit=${limit}&page=${page}`
    );
    res.json(data);
  } catch {
    // OKLink may require separate API key — return empty so Monitor panel still loads
    res.json({ ok: true, data: [] });
  }
});

// GET /api/token-txs/:address — X Layer token transfer history (OKLink)
router.get("/token-txs/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { limit = "20", page = "1" } = req.query as Record<string, string>;
    const data = await oklinkGet(
      `/api/v5/xlayer/address/token-transaction-list?address=${address}&limit=${limit}&page=${page}`
    );
    res.json(data);
  } catch {
    res.json({ ok: true, data: [] });
  }
});

// GET /api/agent/decision — last autonomous agent decision + paused state
router.get("/agent/decision", (_req: Request, res: Response) => {
  res.json({ ok: true, data: getLastDecision(), paused: isAgentPaused() });
});

const adminOnly = (req: Request, res: Response, next: () => void) => {
  const key = req.headers["x-admin-key"] || req.body?.adminKey;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    res.status(403).json({ ok: false, error: "Unauthorized" });
    return;
  }
  next();
};

// POST /api/agent/pause
router.post("/agent/pause", adminOnly, (_req: Request, res: Response) => {
  pauseAgent();
  res.json({ ok: true, paused: true });
});

// POST /api/agent/resume
router.post("/agent/resume", adminOnly, (_req: Request, res: Response) => {
  resumeAgent();
  res.json({ ok: true, paused: false });
});

export default router;
