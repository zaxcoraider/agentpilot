import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";
import { getLastDecision, pauseAgent, resumeAgent, isAgentPaused } from "../services/autonomousAgent";

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
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: (err as Error).message });
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
