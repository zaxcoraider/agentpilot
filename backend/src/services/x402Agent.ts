/**
 * x402 Agent Auto-Pay Service
 *
 * Uses OKX onchainos payment eip3009-sign to sign USDT micropayments
 * via EIP-3009 TransferWithAuthorization — zero gas, instant, off-chain signature.
 *
 * Flow:
 *   Agent hits gated endpoint → 402 with accepts array
 *   → eip3009-sign signs USDT transfer off-chain
 *   → retry with X-PAYMENT header containing base64 payment proof
 *   → backend verifies via OKX API → unlocks endpoint
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { logAction } from "./registry";

const execFileAsync = promisify(execFile);
const API_BASE = process.env.BACKEND_URL || "http://localhost:3001";

// Credit tracking
let totalSpent = 0;
let totalCalls = 0;
let autoPayCount = 0;

interface AcceptsEntry {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  asset: string;
  extra?: Record<string, unknown>;
}

interface X402Response {
  version?: string;
  accepts?: AcceptsEntry[];
}

interface Eip3009Result {
  ok: boolean;
  data?: {
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    signature: string;
  };
  error?: string;
}

/**
 * Sign a USDT payment via EIP-3009 (zero gas, off-chain signature).
 * Uses onchainos payment eip3009-sign with EVM_PRIVATE_KEY.
 */
async function signPayment(accepts: AcceptsEntry[]): Promise<string | null> {
  const { PRIVATE_KEY } = process.env;
  if (!PRIVATE_KEY) {
    console.warn("[x402] PRIVATE_KEY not set — cannot auto-pay");
    return null;
  }

  try {
    const { stdout } = await execFileAsync(
      "onchainos",
      ["payment", "eip3009-sign", "--accepts", JSON.stringify(accepts)],
      {
        timeout: 15000,
        env: { ...process.env, EVM_PRIVATE_KEY: PRIVATE_KEY },
      }
    );

    const result = JSON.parse(stdout.trim()) as Eip3009Result;

    if (!result.ok || !result.data) {
      console.warn("[x402] eip3009-sign failed:", result.error);
      return null;
    }

    // Encode payment proof as base64 JSON — sent in X-PAYMENT header
    const proof = Buffer.from(
      JSON.stringify({
        authorization: result.data.authorization,
        signature: result.data.signature,
        scheme: accepts[0]?.scheme || "exact",
        network: accepts[0]?.network || "eip155:196",
      })
    ).toString("base64");

    const amount = Number(accepts[0]?.maxAmountRequired || 0) / 1_000_000;
    totalSpent += amount;
    autoPayCount++;

    logAction("payment", `x402:eip3009:${accepts[0]?.resource}:$${amount.toFixed(4)}USDT`);
    console.log(`[x402] Signed EIP-3009 payment $${amount.toFixed(4)} USDT for ${accepts[0]?.resource}`);

    return proof;
  } catch (err) {
    console.error("[x402] Sign error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Smart fetch that automatically handles 402 responses.
 * Signs EIP-3009 USDT payment and retries once.
 */
export async function agentFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T | null> {
  totalCalls++;
  const url = `${API_BASE}${path}`;

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

  // Got 402 — sign payment and retry
  console.log(`[x402] 402 received for ${path} — signing EIP-3009 payment...`);

  const payReq = await res.json() as X402Response;
  const accepts = payReq.accepts;

  if (!accepts || accepts.length === 0) {
    console.warn("[x402] No accepts array in 402 response");
    return null;
  }

  const proof = await signPayment(accepts);
  if (!proof) return null;

  // Retry with payment proof
  const retry = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": proof,
      ...(options.headers as Record<string, string> || {}),
    },
  });

  if (!retry.ok) return null;
  return retry.json() as Promise<T>;
}

export function getPaymentStats() {
  return {
    totalCalls,
    autoPayCount,
    totalSpentUSDT: totalSpent.toFixed(6),
    successRate: totalCalls > 0 ? `${((autoPayCount / totalCalls) * 100).toFixed(1)}%` : "0%",
  };
}
