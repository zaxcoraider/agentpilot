import { Router, Request, Response } from "express";
import { db } from "../services/db";
import { getAgentId } from "../services/actionLogger";

const router = Router();

// GET /api/analytics/actions?limit=20&type=SWAP
router.get("/analytics/actions", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const type = req.query.type as string | undefined;
  const agentId = req.query.agentId as string | undefined;

  try {
    const agId = agentId || await getAgentId();
    if (!agId) { res.json({ ok: true, data: [] }); return; }

    const actions = await db.action.findMany({
      where: {
        agentId: agId,
        ...(type ? { type: type as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({ ok: true, data: actions });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /api/analytics/summary — totals for Monitor panel
router.get("/analytics/summary", async (_req: Request, res: Response) => {
  try {
    const agentId = await getAgentId();
    if (!agentId) { res.json({ ok: true, data: {} }); return; }

    const [totalActions, swaps, payments, totalCost] = await Promise.all([
      db.action.count({ where: { agentId } }),
      db.action.count({ where: { agentId, type: "SWAP" } }),
      db.action.count({ where: { agentId, type: "PAYMENT" } }),
      db.action.aggregate({ where: { agentId }, _sum: { cost: true } }),
    ]);

    const onChainCount = await db.action.count({ where: { agentId, onChain: true } });

    res.json({
      ok: true,
      data: {
        totalActions,
        swaps,
        payments,
        onChainTxns: onChainCount,
        totalCostOKB: (totalCost._sum.cost ?? 0).toFixed(8),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /api/analytics/dca-plans
router.get("/analytics/dca-plans", async (_req: Request, res: Response) => {
  try {
    const agentId = await getAgentId();
    if (!agentId) { res.json({ ok: true, data: [] }); return; }

    const plans = await db.dCAPlan.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, data: plans });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/analytics/dca-plans — save a DCA plan created on-chain
router.post("/analytics/dca-plans", async (req: Request, res: Response) => {
  const { tokenIn, tokenOut, amount, intervalSecs, planIdOnChain } = req.body;

  if (!tokenIn || !tokenOut || !amount || !intervalSecs) {
    res.status(400).json({ ok: false, error: "tokenIn, tokenOut, amount, intervalSecs are required" });
    return;
  }

  try {
    const agentId = await getAgentId();
    if (!agentId) {
      res.status(503).json({ ok: false, error: "Agent not initialised" });
      return;
    }

    const nextExecution = new Date(Date.now() + Number(intervalSecs) * 1000);

    const plan = await db.dCAPlan.create({
      data: {
        agentId,
        tokenIn,
        tokenOut,
        amount: String(amount),
        intervalSecs: Number(intervalSecs),
        nextExecution,
        planIdOnChain: planIdOnChain || null,
      },
    });

    res.json({ ok: true, data: plan });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /api/analytics/alerts
router.get("/analytics/alerts", async (_req: Request, res: Response) => {
  try {
    const agentId = await getAgentId();
    if (!agentId) { res.json({ ok: true, data: [] }); return; }

    const alerts = await db.alert.findMany({
      where: { agentId, active: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, data: alerts });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /api/analytics/subscription?walletAddress=0x...
router.get("/analytics/subscription", async (req: Request, res: Response) => {
  const { walletAddress } = req.query as { walletAddress?: string };

  try {
    const where = walletAddress
      ? { user: { walletAddress } }
      : {};

    const sub = await db.subscription.findFirst({
      where,
      include: { user: { select: { walletAddress: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, data: sub });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
