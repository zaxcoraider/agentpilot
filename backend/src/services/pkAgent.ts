/**
 * Private Key Agent
 * Autonomous agent using EVM_PRIVATE_KEY wallet
 * Strategy: portfolio rebalancing + stop-loss + follow TEE agent signals
 * Larger positions, moderate risk, ethers.js execution
 */

import { ethers } from "ethers";
import { run } from "./onchainos";
import { getLastAiDecision } from "./aiAgent";
import { logAction } from "./registry";

const XLAYER_RPC = process.env.XLAYER_RPC || "https://rpc.xlayer.tech";

export const PK_WALLET = process.env.PK_WALLET_ADDRESS || "";

const TOKENS = {
  OKB:  { address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, symbol: "OKB" },
  USDT: { address: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", decimals: 6,  symbol: "USDT" },
  USDC: { address: "0x74b7f16337b8972027f6196a17a631ac6de26d22", decimals: 6,  symbol: "USDC" },
};

export interface PkDecision {
  action: "REBALANCE" | "STOP_LOSS" | "FOLLOW_TEE" | "DCA" | "HOLD";
  from?: string;
  to?: string;
  fromSymbol?: string;
  toSymbol?: string;
  amount?: string;
  reasoning: string;
  executed: boolean;
  txHash?: string;
  timestamp: number;
}

export interface PkDcaPlan {
  id: string;
  fromSymbol: string;
  toSymbol: string;
  from: string;
  to: string;
  amount: string;
  intervalMs: number;
  createdAt: number;
  lastRun: number;
  nextRun: number;
  totalRuns: number;
  active: boolean;
  wallet: "pk";
  chain: string;
  txHistory: Array<{ txHash: string; timestamp: number }>;
}

let lastDecision: PkDecision | null = null;
const pkPlans = new Map<string, PkDcaPlan>();
let schedulerHandle: ReturnType<typeof setInterval> | null = null;

export function getLastPkDecision(): PkDecision | null { return lastDecision; }
export function listPkDcaPlans(): PkDcaPlan[] { return Array.from(pkPlans.values()); }
export function getPkDcaPlan(id: string): PkDcaPlan | undefined { return pkPlans.get(id); }
export function cancelPkDcaPlan(id: string): boolean {
  const p = pkPlans.get(id);
  if (!p) return false;
  p.active = false;
  return true;
}

function getProvider() {
  return new ethers.JsonRpcProvider(XLAYER_RPC);
}

function getSigner() {
  const pk = process.env.EVM_PRIVATE_KEY;
  if (!pk) throw new Error("EVM_PRIVATE_KEY not set");
  return new ethers.Wallet(pk, getProvider());
}

async function getWalletAddress(): Promise<string> {
  if (PK_WALLET) return PK_WALLET;
  try { return (await getSigner()).address; } catch { return ""; }
}

async function getBalances(): Promise<{ okb: number; usdt: number; usdc: number; totalUsd: number }> {
  const address = await getWalletAddress();
  if (!address) return { okb: 0, usdt: 0, usdc: 0, totalUsd: 0 };

  try {
    const data = await run(["portfolio", "all-balances", "--address", address, "--chain", "xlayer"]) as {
      data?: { details?: Array<{ tokenAssets?: Array<{ symbol: string; balance: string; tokenPrice: string }> }> }
    };
    const assets = data?.data?.details?.[0]?.tokenAssets || [];
    const get = (sym: string) => {
      const t = assets.find(a => a.symbol.toUpperCase().includes(sym));
      return t ? Number(t.balance) * Number(t.tokenPrice) : 0;
    };
    const okbAsset = assets.find(a => a.symbol === "OKB");
    const okb = okbAsset ? Number(okbAsset.balance) : 0;
    const usdt = get("USDT") / (assets.find(a => a.symbol.includes("USDT"))?.tokenPrice ? Number(assets.find(a => a.symbol.includes("USDT"))?.tokenPrice) : 1);
    const usdc = get("USDC") / (assets.find(a => a.symbol.includes("USDC"))?.tokenPrice ? Number(assets.find(a => a.symbol.includes("USDC"))?.tokenPrice) : 1);
    const totalUsd = assets.reduce((s, t) => s + Number(t.balance) * Number(t.tokenPrice), 0);
    return { okb, usdt, usdc, totalUsd };
  } catch {
    return { okb: 0, usdt: 0, usdc: 0, totalUsd: 0 };
  }
}

async function executeSwap(from: string, to: string, amount: string): Promise<string> {
  const address = await getWalletAddress();

  // Get swap calldata from OKX DEX V6
  const swapData = await run([
    "swap", "swap",
    "--from", from, "--to", to,
    "--readable-amount", amount,
    "--chain", "xlayer",
    "--wallet", address,
    "--swap-mode", "exactIn",
  ]) as { data?: Array<{ tx?: { to: string; data: string; value: string; gas: string } }> };

  const tx = swapData?.data?.[0]?.tx;
  if (!tx) throw new Error("No swap tx data returned");

  const signer = getSigner();
  const txResponse = await signer.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value ? BigInt(tx.value) : 0n,
    gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
  });
  const receipt = await txResponse.wait();
  return receipt?.hash || txResponse.hash;
}

/** Run one cycle of PK agent decision + optional execution */
export async function runPkDecision(autoExecute = false): Promise<PkDecision> {
  const address = await getWalletAddress();
  if (!address) {
    return {
      action: "HOLD",
      reasoning: "EVM_PRIVATE_KEY not configured. Set it in Railway env vars to enable PK agent.",
      executed: false, timestamp: Date.now(),
    };
  }

  const balances = await getBalances();
  const teeDecision = getLastAiDecision();

  let decision: PkDecision;

  // Strategy 1: Follow TEE Agent — if TEE just bought, PK agent follows with larger position
  if (
    teeDecision &&
    teeDecision.action === "BUY" &&
    teeDecision.executed &&
    Date.now() - teeDecision.timestamp < 5 * 60_000 && // within last 5 min
    balances.okb > 0.005
  ) {
    const followAmount = (balances.okb * 0.2).toFixed(4); // 20% of OKB
    decision = {
      action: "FOLLOW_TEE",
      from: TOKENS.OKB.address,
      to: TOKENS.USDT.address,
      fromSymbol: "OKB",
      toSymbol: "USDT",
      amount: followAmount,
      reasoning: `TEE agent executed BUY ${teeDecision.token} ${teeDecision.amount} OKB. PK agent follows with larger position: ${followAmount} OKB → USDT on X Layer. Signal confirmed by ${teeDecision.confidence} confidence AI analysis.`,
      executed: false, timestamp: Date.now(),
    };
  }
  // Strategy 2: Rebalance — if OKB > 80% of portfolio, convert some to USDT
  else if (balances.totalUsd > 0 && (balances.okb * (balances.totalUsd / balances.okb)) / balances.totalUsd > 0.8 && balances.okb > 0.01) {
    const rebalanceAmount = (balances.okb * 0.25).toFixed(4);
    decision = {
      action: "REBALANCE",
      from: TOKENS.OKB.address,
      to: TOKENS.USDT.address,
      fromSymbol: "OKB",
      toSymbol: "USDT",
      amount: rebalanceAmount,
      reasoning: `Portfolio is OKB-heavy (>80%). Rebalancing: selling ${rebalanceAmount} OKB → USDT to reduce concentration risk and maintain stable reserves.`,
      executed: false, timestamp: Date.now(),
    };
  }
  // Strategy 3: Hold — balanced portfolio
  else {
    const okbPct = balances.totalUsd > 0
      ? ((balances.okb * (balances.totalUsd / (balances.okb || 1))) / balances.totalUsd * 100).toFixed(0)
      : "0";
    decision = {
      action: "HOLD",
      reasoning: `Portfolio balanced. OKB: ${balances.okb.toFixed(4)}, USDT: ${balances.usdt.toFixed(2)}, Total: $${balances.totalUsd.toFixed(2)}. No rebalance needed (OKB ~${okbPct}% of portfolio). Waiting for TEE agent signal or DCA trigger.`,
      executed: false, timestamp: Date.now(),
    };
  }

  // Execute if requested and action requires it
  if (autoExecute && decision.from && decision.to && decision.amount) {
    try {
      const txHash = await executeSwap(decision.from, decision.to, decision.amount);
      decision.executed = true;
      decision.txHash = txHash;
      logAction("trade", `pk-agent:${decision.action}:${decision.amount}`);
    } catch (err) {
      decision.reasoning += ` [Execution failed: ${(err as Error).message}]`;
    }
  }

  lastDecision = decision;
  return decision;
}

/** Create DCA plan for PK agent */
export function createPkDcaPlan(
  from: string, to: string,
  fromSymbol: string, toSymbol: string,
  amount: string, intervalMs: number, chain = "xlayer"
): PkDcaPlan {
  const id = "pk_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const now = Date.now();
  const plan: PkDcaPlan = {
    id, from, to, fromSymbol, toSymbol, amount,
    intervalMs, createdAt: now, lastRun: 0,
    nextRun: now + intervalMs,
    totalRuns: 0, active: true, wallet: "pk", chain,
    txHistory: [],
  };
  pkPlans.set(id, plan);
  ensurePkScheduler();
  return plan;
}

function ensurePkScheduler() {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(runDuePkPlans, 15_000);
  console.log("[pkAgent] scheduler started");
}

async function runDuePkPlans() {
  const now = Date.now();
  for (const plan of pkPlans.values()) {
    if (!plan.active || now < plan.nextRun) continue;
    plan.lastRun = now;
    plan.nextRun = now + plan.intervalMs;
    console.log(`[pkAgent] executing DCA ${plan.id}: ${plan.amount} ${plan.fromSymbol}→${plan.toSymbol}`);
    try {
      const txHash = await executeSwap(plan.from, plan.to, plan.amount);
      plan.totalRuns++;
      plan.txHistory.unshift({ txHash, timestamp: now });
      if (plan.txHistory.length > 20) plan.txHistory.pop();
      console.log(`[pkAgent] DCA ${plan.id} done: ${txHash}`);
    } catch (err) {
      console.error(`[pkAgent] DCA ${plan.id} failed:`, (err as Error).message);
    }
  }
}
