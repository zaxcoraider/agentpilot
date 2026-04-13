/**
 * x402 Agent Auto-Pay Service
 *
 * When the AgentPilot agent hits a 402 Payment Required response,
 * it automatically pays from its own wallet and retries — no human needed.
 *
 * This is the "agentic payment" use case:
 *   Agent needs intelligence → pays for it → acts on it → earns from it → funds next payment
 */

import { ethers } from "ethers";
import { logAction } from "./registry";

const API_BASE = process.env.BACKEND_URL || "http://localhost:3001";

// Credit tracking
let totalSpent = 0; // in OKB
let totalCalls = 0;
let autoPayCount = 0;

interface X402Response {
  version?: string;
  accepts?: Array<{
    payTo?: string;
    maxAmountRequired?: string;
    asset?: string;
    network?: string;
    humanReadable?: string;
  }>;
}

/**
 * Smart fetch that automatically handles 402 responses.
 * If a 402 is received, pays from agent wallet and retries once.
 */
export async function agentFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T | null> {
  totalCalls++;
  const url = `${API_BASE}${path}`;

  // First attempt
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {}),
    },
  });

  if (res.status !== 402) {
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  }

  // ── Got 402 — agent auto-pays ─────────────────────────────────────────────
  console.log(`  [x402] 402 received for ${path} — agent auto-paying...`);

  const payReq = await res.json() as X402Response;
  const accept = payReq.accepts?.[0];

  if (!accept?.payTo) {
    console.warn("  [x402] No payment target in 402 response");
    return null;
  }

  // Pay from agent wallet on X Layer
  const txHash = await agentPay(
    accept.payTo,
    accept.maxAmountRequired || "1000",
    path
  );

  if (!txHash) {
    console.warn("  [x402] Payment failed");
    return null;
  }

  autoPayCount++;
  console.log(`  [x402] Paid → ${txHash.slice(0, 20)}... Retrying request...`);

  // Retry with payment proof
  const retry = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": txHash,
      ...(options.headers as Record<string, string> || {}),
    },
  });

  if (!retry.ok) return null;
  return retry.json() as Promise<T>;
}

/**
 * Send payment from agent wallet.
 * Pays in OKB (native) to the recipient, logs on-chain.
 * Returns tx hash as payment credential.
 */
async function agentPay(
  recipient: string,
  amountUnits: string,
  resource: string
): Promise<string | null> {
  const { PRIVATE_KEY, XLAYER_RPC } = process.env;
  if (!PRIVATE_KEY || !XLAYER_RPC) return null;

  try {
    const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // Convert USDT units to OKB equivalent (0.001 USDT ≈ 0.000025 OKB at $40/OKB)
    // Using a fixed small amount for demo — in production would use price oracle
    const amountOKB = "0.000025"; // ~$0.001 worth of OKB
    const valueWei = ethers.parseEther(amountOKB);

    const tx = await wallet.sendTransaction({
      to: recipient,
      value: valueWei,
      data: ethers.hexlify(ethers.toUtf8Bytes(`x402:${resource}`)),
    });

    totalSpent += parseFloat(amountOKB);

    // Log payment to registry
    logAction("payment", `x402:auto-pay:${resource}:${amountOKB}OKB→${recipient.slice(0, 10)}`);

    console.log(`  [x402] Auto-paid ${amountOKB} OKB for ${resource}`);
    return tx.hash;
  } catch (err) {
    console.error("  [x402] Pay error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Get agent payment stats */
export function getPaymentStats() {
  return {
    totalCalls,
    autoPayCount,
    totalSpentOKB: totalSpent.toFixed(8),
    successRate: totalCalls > 0 ? `${((autoPayCount / totalCalls) * 100).toFixed(1)}%` : "0%",
  };
}
