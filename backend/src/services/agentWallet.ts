/**
 * Agentic Wallet Service
 * Executes swaps autonomously via OKX TEE-secured agentic wallet
 * Uses onchainos CLI: swap swap → wallet contract-call pipeline
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { ethers } from "ethers";
import { logAction } from "./registry";

const execFileAsync = promisify(execFile);

export const AGENTIC_WALLET = process.env.AGENTIC_WALLET || "0xae5816be55e5c36fcb7f7ba61dcfefac70715c0c";

interface SwapTx {
  to: string;
  data: string;
  value: string;
  gas: string;
  gasPrice?: string;
}

interface SwapResult {
  ok: boolean;
  data?: Array<{ routerResult: unknown; tx: SwapTx }>;
  error?: string;
}

async function runCli(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync("onchainos", args, { timeout: 30000 });
  return JSON.parse(stdout);
}

/** Get swap calldata from OKX DEX for agentic wallet */
export async function getSwapCalldata(
  from: string,
  to: string,
  readableAmount: string,
  chain = "xlayer"
): Promise<SwapTx> {
  const result = await runCli([
    "swap", "swap",
    "--from", from,
    "--to", to,
    "--readable-amount", readableAmount,
    "--chain", chain,
    "--wallet", AGENTIC_WALLET,
    "--swap-mode", "exactIn",
  ]) as SwapResult;

  if (!result.ok || !result.data?.[0]?.tx) {
    throw new Error("Failed to get swap calldata");
  }
  return result.data[0].tx;
}

/** Execute transaction via TEE agentic wallet — no private key needed */
export async function executeViaAgentWallet(
  tx: SwapTx,
  chain = "xlayer"
): Promise<string> {
  // Try onchainos TEE wallet first (Windows/local)
  try {
    const args = [
      "wallet", "contract-call",
      "--to", tx.to,
      "--chain", chain,
      "--amt", tx.value || "0",
      "--input-data", tx.data,
      "--gas-limit", tx.gas,
      "--force",
    ];
    const result = await runCli(args) as { ok: boolean; data?: { txHash?: string; hash?: string }; error?: string };
    if (result.ok) return result.data?.txHash || result.data?.hash || "pending";
  } catch {
    // CLI unavailable (Railway/Linux) — fall through to ethers fallback
  }

  // Fallback: execute via EVM_PRIVATE_KEY (Railway deployment)
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) throw new Error("Agentic wallet CLI unavailable and EVM_PRIVATE_KEY not set");

  const rpc = process.env.XLAYER_RPC || "https://rpc.xlayer.tech";
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(privateKey, provider);

  const txResponse = await wallet.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value ? BigInt(tx.value) : 0n,
    gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
  });

  const receipt = await txResponse.wait();
  return receipt?.hash || txResponse.hash;
}

/** Full autonomous swap: quote → sign → broadcast via agentic wallet */
export async function agentSwap(
  from: string,
  to: string,
  readableAmount: string,
  chain = "xlayer"
): Promise<{ txHash: string; tx: SwapTx }> {
  const tx = await getSwapCalldata(from, to, readableAmount, chain);
  const txHash = await executeViaAgentWallet(tx, chain);
  logAction("trade", `agent-swap:${from}→${to}:${readableAmount}`);
  return { txHash, tx };
}

// ─── In-memory DCA plan store ────────────────────────────────────────────────

export interface AgentDcaPlan {
  id: string;
  from: string;
  to: string;
  fromSymbol: string;
  toSymbol: string;
  amount: string;
  intervalMs: number;
  createdAt: number;
  lastRun: number;
  nextRun: number;
  totalRuns: number;
  active: boolean;
  wallet: "agent";
  chain: string;
  txHistory: Array<{ txHash: string; timestamp: number; amount: string }>;
}

const plans = new Map<string, AgentDcaPlan>();
let schedulerHandle: ReturnType<typeof setInterval> | null = null;

export function createDcaPlan(
  from: string,
  to: string,
  fromSymbol: string,
  toSymbol: string,
  amount: string,
  intervalMs: number,
  chain = "xlayer"
): AgentDcaPlan {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = Date.now();
  const plan: AgentDcaPlan = {
    id, from, to, fromSymbol, toSymbol, amount,
    intervalMs, createdAt: now, lastRun: 0,
    nextRun: now + intervalMs,
    totalRuns: 0, active: true, wallet: "agent", chain,
    txHistory: [],
  };
  plans.set(id, plan);
  ensureScheduler();
  return plan;
}

export function cancelDcaPlan(id: string): boolean {
  const plan = plans.get(id);
  if (!plan) return false;
  plan.active = false;
  return true;
}

export function listDcaPlans(): AgentDcaPlan[] {
  return Array.from(plans.values());
}

export function getDcaPlan(id: string): AgentDcaPlan | undefined {
  return plans.get(id);
}

function ensureScheduler() {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(runDuePlans, 15_000); // check every 15s
  console.log("[agentDca] scheduler started");
}

async function runDuePlans() {
  const now = Date.now();
  for (const plan of plans.values()) {
    if (!plan.active) continue;
    if (now < plan.nextRun) continue;

    console.log(`[agentDca] executing plan ${plan.id}: ${plan.amount} ${plan.fromSymbol}→${plan.toSymbol}`);
    plan.lastRun = now;
    plan.nextRun = now + plan.intervalMs;

    try {
      const { txHash } = await agentSwap(plan.from, plan.to, plan.amount, plan.chain);
      plan.totalRuns++;
      plan.txHistory.unshift({ txHash, timestamp: now, amount: plan.amount });
      if (plan.txHistory.length > 20) plan.txHistory.pop();
      console.log(`[agentDca] plan ${plan.id} executed: ${txHash}`);
    } catch (err) {
      console.error(`[agentDca] plan ${plan.id} failed:`, (err as Error).message);
    }
  }
}
