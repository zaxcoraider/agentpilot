import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { logAction } from "../services/registry";

const router = Router();

const DCA_ABI = [
  "function createPlan(address tokenIn, address tokenOut, uint256 amountPerInterval, uint256 intervalSeconds) external returns (bytes32 planId)",
  "function cancelPlan(bytes32 planId) external",
  "function getOwnerPlans(address owner) external view returns (bytes32[])",
  "function isPlanDue(bytes32 planId) external view returns (bool)",
  "function plans(bytes32) external view returns (address owner, address tokenIn, address tokenOut, uint256 amountPerInterval, uint256 intervalSeconds, uint256 lastExecuted, uint256 totalExecutions, bool active)",
  "event DCAPlanCreated(bytes32 indexed planId, address indexed owner, address tokenIn, address tokenOut, uint256 amountPerInterval, uint256 intervalSeconds)",
  "event DCAExecuted(bytes32 indexed planId, address indexed owner, uint256 amountIn, uint256 executionNumber, uint256 timestamp)",
];

function getDCAContract(readOnly = true): ethers.Contract | null {
  const hookAddress = process.env.DCA_HOOK_ADDRESS;
  const rpc = process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";

  if (!hookAddress) return null;

  const provider = new ethers.JsonRpcProvider(rpc);

  if (readOnly) {
    return new ethers.Contract(hookAddress, DCA_ABI, provider);
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) return null;

  const wallet = new ethers.Wallet(privateKey, provider);
  return new ethers.Contract(hookAddress, DCA_ABI, wallet);
}

// POST /api/dca/create
// Body: { tokenIn, tokenOut, amountPerInterval, intervalSeconds }
router.post("/dca/create", async (req: Request, res: Response) => {
  const { tokenIn, tokenOut, amountPerInterval, intervalSeconds } = req.body;

  if (!tokenIn || !tokenOut || !amountPerInterval || !intervalSeconds) {
    res.status(400).json({
      ok: false,
      error: "tokenIn, tokenOut, amountPerInterval, intervalSeconds are required",
    });
    return;
  }

  const contract = getDCAContract(false);
  if (!contract) {
    res.status(503).json({ ok: false, error: "DCA_HOOK_ADDRESS not configured. Deploy SimpleDCA first." });
    return;
  }

  // Convert human-readable amount to wei (18 decimals default)
  let amountWei: bigint;
  try {
    amountWei = ethers.parseUnits(String(amountPerInterval), 18);
  } catch {
    amountWei = BigInt(amountPerInterval);
  }

  try {
    const tx = await contract.createPlan(
      tokenIn,
      tokenOut,
      amountWei,
      intervalSeconds
    ) as ethers.TransactionResponse;

    console.log(`[dca] tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    const event = receipt?.logs
      .map((log) => {
        try { return contract.interface.parseLog(log as unknown as { topics: string[]; data: string }); } catch { return null; }
      })
      .find((e) => e?.name === "DCAPlanCreated");

    const planId = event?.args?.planId ?? null;
    console.log(`[dca] plan created: ${planId}`);

    logAction("invest", `dca:create:${planId}`);

    res.json({
      ok: true,
      data: {
        planId,
        txHash: tx.hash,
        tokenIn,
        tokenOut,
        amountPerInterval,
        intervalSeconds,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dca] createPlan error:", msg);
    res.status(500).json({ ok: false, error: msg });
  }
});

// GET /api/dca/plans/:address
router.get("/dca/plans/:address", async (req: Request, res: Response) => {
  const { address } = req.params;

  const contract = getDCAContract(true);
  if (!contract) {
    res.status(503).json({ ok: false, error: "DCA_HOOK_ADDRESS not configured" });
    return;
  }

  const planIds: string[] = await contract.getOwnerPlans(address);

  const plans = await Promise.all(
    planIds.map(async (planId) => {
      const plan = await contract.plans(planId);
      const isDue = await contract.isPlanDue(planId);
      return {
        planId,
        owner: plan.owner,
        tokenIn: plan.tokenIn,
        tokenOut: plan.tokenOut,
        amountPerInterval: plan.amountPerInterval.toString(),
        intervalSeconds: plan.intervalSeconds.toString(),
        lastExecuted: Number(plan.lastExecuted),
        totalExecutions: Number(plan.totalExecutions),
        active: plan.active,
        isDue,
        nextExecution: Number(plan.lastExecuted) + Number(plan.intervalSeconds),
      };
    })
  );

  logAction("scan", `dca:plans:${address}`);
  res.json({ ok: true, data: plans });
});

// DELETE /api/dca/:planId
router.delete("/dca/:planId", async (req: Request, res: Response) => {
  const { planId } = req.params;

  const contract = getDCAContract(false);
  if (!contract) {
    res.status(503).json({ ok: false, error: "DCA_HOOK_ADDRESS not configured" });
    return;
  }

  const tx = await contract.cancelPlan(planId) as ethers.TransactionResponse;
  await tx.wait();

  logAction("invest", `dca:cancel:${planId}`);

  res.json({ ok: true, data: { planId, txHash: tx.hash, cancelled: true } });
});

export default router;
