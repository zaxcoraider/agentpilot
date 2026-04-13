import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";
import { x402 } from "../middleware/x402";

const router = Router();

// PAID ($0.001 USDT) — GET /api/security/token-risk/:address?chain=xlayer
router.get("/security/token-risk/:address", x402(), async (req: Request, res: Response) => {
  const { address } = req.params;
  const { chain = "xlayer" } = req.query as Record<string, string>;
  const data = await run(["token", "advanced-info", "--address", address, "--chain", chain]);
  logAction("scan", `risk:${address}`);
  res.json(data);
});

// FREE — GET /api/security/approval/:address?chain=xlayer&token=0x...
// token param required by onchainos CLI
router.get("/security/approval/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  const { chain = "xlayer", token } = req.query as Record<string, string>;

  if (!token) {
    res.status(400).json({ ok: false, error: "token query param required (token contract address)" });
    return;
  }

  const data = await run([
    "swap", "check-approvals",
    "--address", address,
    "--token", token,
    "--chain", chain,
  ]);
  logAction("scan", `approval:${address}`);
  res.json(data);
});

export default router;
