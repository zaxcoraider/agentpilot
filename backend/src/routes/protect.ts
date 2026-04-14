import { Router, Request, Response } from "express";
import { run } from "../services/onchainos";
import { logAction } from "../services/registry";

const router = Router();

// FREE — GET /api/security/token-risk/:address?chain=xlayer
router.get("/security/token-risk/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  const { chain = "xlayer" } = req.query as Record<string, string>;
  try {
    const raw = await run(["token", "advanced-info", "--address", address, "--chain", chain]) as {
      ok?: boolean;
      data?: unknown[] | Record<string, unknown>;
    };

    // OKX advanced-info returns data as array or object — normalise to flat RiskData
    const item = Array.isArray(raw?.data)
      ? (raw.data[0] as Record<string, unknown>)
      : (raw?.data as Record<string, unknown>) || {};

    const risk = {
      riskControlLevel: item.riskControlLevel ?? item.securityLevel ?? item.level ?? null,
      top10HoldPercent: item.top10HoldPercent ?? item.topHolderPercent ?? null,
      lpBurnedPercent:  item.lpBurnedPercent  ?? item.burnPercent       ?? null,
      bundleHoldingPercent: item.bundleHoldingPercent ?? item.devHoldPercent ?? null,
      tokenTags: Array.isArray(item.tokenTags) ? item.tokenTags :
                 Array.isArray(item.tags)      ? item.tags      : [],
      raw: item, // pass raw so frontend can render extra fields if needed
    };

    logAction("scan", `risk:${address}`);
    res.json({ ok: true, data: risk });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// FREE — GET /api/security/approval/:address?chain=xlayer&token=0x...
// token param required
router.get("/security/approval/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  const { chain = "xlayer", token } = req.query as Record<string, string>;

  if (!token) {
    res.status(400).json({ ok: false, error: "token query param required (token contract address)" });
    return;
  }

  try {
    const data = await run([
      "swap", "check-approvals",
      "--address", address,
      "--token", token,
      "--chain", chain,
    ]);
    logAction("scan", `approval:${address}`);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
