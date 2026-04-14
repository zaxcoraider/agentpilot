import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import {
  AGENTIC_WALLET,
  agentSwap,
  createDcaPlan,
  cancelDcaPlan,
  listDcaPlans,
  getDcaPlan,
} from "../services/agentWallet";
import { runAiDecision, getLastAiDecision } from "../services/aiAgent";
import { logAction } from "../services/registry";

const router = Router();

// GET /api/agent/wallet — agentic wallet info + balance
router.get("/agent/wallet", async (_req: Request, res: Response) => {
  try {
    const balanceData = await run([
      "portfolio", "all-balances",
      "--address", AGENTIC_WALLET,
      "--chain", "xlayer",
    ]);
    logAction("scan", "agent-wallet-balance");
    res.json({
      ok: true,
      data: {
        address: AGENTIC_WALLET,
        type: "OKX Agentic (TEE)",
        chain: "X Layer",
        balance: balanceData,
      },
    });
  } catch (err) {
    res.json({
      ok: true,
      data: {
        address: AGENTIC_WALLET,
        type: "OKX Agentic (TEE)",
        chain: "X Layer",
        balance: null,
        error: (err as Error).message,
      },
    });
  }
});

// POST /api/agent/swap — execute a one-time swap via agentic wallet
// Body: { from, to, amount, chain? }
router.post("/agent/swap", async (req: Request, res: Response) => {
  const { from, to, amount, chain = "xlayer" } = req.body;
  if (!from || !to || !amount) {
    res.status(400).json({ ok: false, error: "from, to, amount required" });
    return;
  }
  try {
    const result = await agentSwap(from, to, amount, chain);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// GET /api/agent/ai — get last AI decision
router.get("/agent/ai", (_req: Request, res: Response) => {
  const decision = getLastAiDecision();
  res.json({ ok: true, data: decision });
});

// POST /api/agent/ai — run AI analysis (autoExecute=true to also trade)
router.post("/agent/ai", async (req: Request, res: Response) => {
  const { autoExecute = false } = req.body;
  try {
    const decision = await runAiDecision(Boolean(autoExecute));
    res.json({ ok: true, data: decision });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/agent/dca — create autonomous DCA plan via agentic wallet
// Body: { from, to, fromSymbol, toSymbol, amount, intervalSeconds, chain? }
router.post("/agent/dca", (req: Request, res: Response) => {
  const {
    from, to,
    fromSymbol = "OKB", toSymbol = "USDT",
    amount, intervalSeconds, chain = "xlayer",
  } = req.body;

  if (!from || !to || !amount || !intervalSeconds) {
    res.status(400).json({ ok: false, error: "from, to, amount, intervalSeconds required" });
    return;
  }

  const intervalMs = Number(intervalSeconds) * 1000;
  if (intervalMs < 60_000) {
    res.status(400).json({ ok: false, error: "Minimum interval is 60 seconds" });
    return;
  }

  const plan = createDcaPlan(from, to, fromSymbol, toSymbol, String(amount), intervalMs, chain);
  logAction("invest", `agent-dca:${fromSymbol}→${toSymbol}:${amount}`);
  res.json({ ok: true, data: plan });
});

// GET /api/agent/dca — list all DCA plans
router.get("/agent/dca", (_req: Request, res: Response) => {
  res.json({ ok: true, data: listDcaPlans() });
});

// GET /api/agent/dca/:id — get single plan
router.get("/agent/dca/:id", (req: Request, res: Response) => {
  const plan = getDcaPlan(req.params.id);
  if (!plan) { res.status(404).json({ ok: false, error: "Plan not found" }); return; }
  res.json({ ok: true, data: plan });
});

// DELETE /api/agent/dca/:id — cancel plan
router.delete("/agent/dca/:id", (req: Request, res: Response) => {
  const ok = cancelDcaPlan(req.params.id);
  if (!ok) { res.status(404).json({ ok: false, error: "Plan not found" }); return; }
  logAction("invest", `agent-dca:cancel:${req.params.id}`);
  res.json({ ok: true, data: { cancelled: true } });
});

export default router;
