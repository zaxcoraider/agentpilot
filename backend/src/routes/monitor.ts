import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";

const router = Router();

// GET /api/wallet/balance/:address?chain=xlayer
router.get("/wallet/balance/:address", async (req: Request, res: Response) => {
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
});

// GET /api/leaderboard?chain=xlayer&timeFrame=3&sortBy=1
router.get("/leaderboard", async (req: Request, res: Response) => {
  const { chain = "ethereum", timeFrame = "3", sortBy = "1" } = req.query as Record<string, string>;
  const data = await run([
    "leaderboard", "list",
    "--chain", chain,
    "--time-frame", timeFrame,
    "--sort-by", sortBy,
  ]);
  logAction("scan", `leaderboard:${chain}`);
  res.json(data);
});

export default router;
