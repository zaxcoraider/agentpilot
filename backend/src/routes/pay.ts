import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { logAction } from "../services/registry";

const router = Router();

// POST /api/pay/x402
// Body: { to, amount, token?, memo?, adminKey }
// Executes a native OKB transfer on X Layer (x402-style payment) — admin only
router.post("/pay/x402", async (req: Request, res: Response) => {
  const { to, amount, memo = "", adminKey } = req.body;

  if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
    res.status(403).json({ ok: false, error: "Unauthorized" });
    return;
  }

  if (!to || !amount) {
    res.status(400).json({ ok: false, error: "to and amount are required" });
    return;
  }

  const { PRIVATE_KEY, XLAYER_RPC } = process.env;
  if (!PRIVATE_KEY || !XLAYER_RPC) {
    res.status(500).json({ ok: false, error: "Wallet not configured" });
    return;
  }

  try {
    const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const balance = await provider.getBalance(wallet.address);
    const valueWei = ethers.parseEther(amount);
    if (balance < valueWei) {
      res.status(400).json({ ok: false, error: `Insufficient balance. Have ${ethers.formatEther(balance)} OKB, need ${amount}` });
      return;
    }

    const tx = await wallet.sendTransaction({ to, value: valueWei });
    await tx.wait();

    logAction("payment", `x402:${to}:${amount}OKB:${memo}`);

    res.json({ ok: true, data: { txHash: tx.hash, to, amount, memo } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pay] error:", msg);
    res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
