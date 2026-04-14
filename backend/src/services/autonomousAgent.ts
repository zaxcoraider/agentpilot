/**
 * Autonomous Agent — self-directed trading on X Layer
 *
 * Strategy:
 *   Every 30 minutes:
 *   1. Check agent wallet OKB balance (safety floor: 0.005 OKB)
 *   2. Fetch onchainos smart money signals for X Layer
 *   3. Fetch trending tokens on X Layer
 *   4. Score each token: signal strength + trending rank
 *   5. If best score passes threshold → swap 0.001 OKB into that token
 *   6. Log decision reasoning on-chain + DB
 */

import { run } from "./onchainos";
import { recordAction, getAgentId, ActionType } from "./actionLogger";
import { logAction } from "./registry";

const INTERVAL_MS = 30 * 60 * 1000;   // 30 minutes
const SWAP_AMOUNT  = "0.001";          // OKB per autonomous trade
const MIN_BALANCE  = 0.005;            // stop trading below this OKB
const OKB_ADDRESS  = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const CHAIN        = "xlayer";

let _timer: ReturnType<typeof setTimeout> | null = null;
let _running = false;
let _paused = false;

export function pauseAgent()  { _paused = true;  console.log("[agent] ⏸ Paused"); }
export function resumeAgent() { _paused = false; console.log("[agent] ▶ Resumed"); runCycle(); }
export function isAgentPaused() { return _paused; }

export interface AgentDecision {
  timestamp: number;
  action: "BUY" | "HOLD" | "SKIP";
  symbol?: string;
  tokenAddress?: string;
  score?: number;
  reason: string;
  txHash?: string;
}

let _lastDecision: AgentDecision | null = null;
export function getLastDecision(): AgentDecision | null { return _lastDecision; }

// ─── helpers ────────────────────────────────────────────────────────────────

async function getOKBBalance(): Promise<number> {
  try {
    const data = await run(["portfolio", "token-balances", "--chain", CHAIN]) as any;
    const tokens: any[] = Array.isArray(data?.data) ? data.data : [];
    const okb = tokens.find((t: any) =>
      t.tokenContractAddress?.toLowerCase() === OKB_ADDRESS ||
      t.symbol?.toUpperCase() === "OKB"
    );
    return parseFloat(okb?.balance || "0");
  } catch {
    return 0;
  }
}

async function getSignals(): Promise<Array<{ tokenAddress: string; score: number; symbol: string }>> {
  try {
    const data = await run(["signal", "list", "--chain", CHAIN]) as any;
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    return list.map((s: any) => ({
      tokenAddress: s.tokenContractAddress || s.address || "",
      symbol: s.tokenSymbol || s.symbol || "?",
      score: parseFloat(s.signalScore || s.score || "0"),
    })).filter(s => s.tokenAddress && s.score > 0);
  } catch {
    return [];
  }
}

async function getTrending(): Promise<Array<{ tokenAddress: string; symbol: string; rank: number }>> {
  try {
    const data = await run(["token", "trending", "--chain", CHAIN]) as any;
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    return list.map((t: any, i: number) => ({
      tokenAddress: t.tokenContractAddress || t.address || "",
      symbol: t.tokenSymbol || t.symbol || "?",
      rank: i + 1,
    })).filter(t => t.tokenAddress);
  } catch {
    return [];
  }
}

// ─── core decision loop ──────────────────────────────────────────────────────

async function runCycle() {
  if (_running || _paused) return;
  _running = true;

  try {
    console.log("[agent] 🤖 Autonomous cycle starting...");

    // 1. Safety: check balance
    const balance = await getOKBBalance();
    console.log(`[agent] OKB balance: ${balance}`);
    if (balance < MIN_BALANCE) {
      console.log(`[agent] ⛔ Balance ${balance} OKB below floor ${MIN_BALANCE} — skipping cycle`);
      _lastDecision = { timestamp: Date.now(), action: "SKIP", reason: `Balance ${balance} OKB below floor ${MIN_BALANCE}` };
      return;
    }

    // 2. Gather market intelligence
    const [signals, trending] = await Promise.all([getSignals(), getTrending()]);
    console.log(`[agent] signals: ${signals.length}, trending: ${trending.length}`);

    if (signals.length === 0 && trending.length === 0) {
      console.log("[agent] No market data — skipping cycle");
      return;
    }

    // 3. Score tokens: signal score (0–100) + trending bonus (rank 1 = 20pts, rank 2 = 15, etc.)
    const scoreMap = new Map<string, { symbol: string; score: number; reason: string }>();

    for (const s of signals) {
      const addr = s.tokenAddress.toLowerCase();
      const existing = scoreMap.get(addr) || { symbol: s.symbol, score: 0, reason: "" };
      existing.score += s.score;
      existing.reason += `signal:${s.score.toFixed(1)} `;
      scoreMap.set(addr, existing);
    }

    for (const t of trending) {
      const addr = t.tokenAddress.toLowerCase();
      const bonus = Math.max(0, 25 - t.rank * 5);
      const existing = scoreMap.get(addr) || { symbol: t.symbol, score: 0, reason: "" };
      existing.score += bonus;
      existing.reason += `trending:#${t.rank}(+${bonus}) `;
      scoreMap.set(addr, existing);
    }

    // 4. Pick best candidate (skip OKB itself)
    const candidates = [...scoreMap.entries()]
      .filter(([addr]) => addr !== OKB_ADDRESS)
      .sort((a, b) => b[1].score - a[1].score);

    if (candidates.length === 0) {
      console.log("[agent] No candidates found — skipping cycle");
      return;
    }

    const [bestAddr, bestData] = candidates[0];
    const SCORE_THRESHOLD = 30;

    if (bestData.score < SCORE_THRESHOLD) {
      console.log(`[agent] Best score ${bestData.score.toFixed(1)} below threshold ${SCORE_THRESHOLD} — holding`);
      logAction("signal", `agent-hold:score:${bestData.score.toFixed(1)}<${SCORE_THRESHOLD}`);
      _lastDecision = { timestamp: Date.now(), action: "HOLD", symbol: bestData.symbol, score: bestData.score, reason: `Score ${bestData.score.toFixed(1)} below threshold ${SCORE_THRESHOLD}` };
      return;
    }

    console.log(`[agent] 🎯 Decision: BUY ${bestData.symbol} (${bestAddr.slice(0, 10)}...) score=${bestData.score.toFixed(1)} reason=[${bestData.reason.trim()}]`);

    // 5. Execute swap OKB → best token
    const { PRIVATE_KEY, XLAYER_RPC } = process.env;
    if (!PRIVATE_KEY) { console.log("[agent] No PRIVATE_KEY — abort"); return; }

    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const agentAddress = wallet.address;

    const swapData = await run([
      "swap", "swap",
      "--from", OKB_ADDRESS,
      "--to", bestAddr,
      "--chain", CHAIN,
      "--wallet", agentAddress,
      "--readable-amount", SWAP_AMOUNT,
    ]) as any;

    const raw = Array.isArray(swapData?.data) ? swapData.data[0] : swapData?.data;
    const txFields = (raw as any)?.tx || raw;

    if (!txFields?.to) {
      console.log("[agent] ❌ No tx data from onchainos — skipping");
      return;
    }

    const provider = new ethers.JsonRpcProvider(XLAYER_RPC || "https://rpc.xlayer.tech");
    const signer = wallet.connect(provider);
    const rawValue = txFields.value || "0";
    const value = rawValue.startsWith("0x") ? rawValue : "0x" + BigInt(rawValue).toString(16);

    const tx = await signer.sendTransaction({
      to: txFields.to,
      data: txFields.data || "0x",
      value,
      ...(txFields.gas ? { gasLimit: BigInt(txFields.gas) } : {}),
    });

    const receipt = await tx.wait();
    const txHash = receipt?.hash || tx.hash;

    const details = `autonomous:OKB→${bestData.symbol}:${SWAP_AMOUNT}:score=${bestData.score.toFixed(1)}:[${bestData.reason.trim()}]`;
    console.log(`[agent] ✅ Swap confirmed: ${txHash}`);
    console.log(`[agent] Reason: ${details}`);
    _lastDecision = { timestamp: Date.now(), action: "BUY", symbol: bestData.symbol, tokenAddress: bestAddr, score: bestData.score, reason: bestData.reason.trim(), txHash };

    // 6. Log on-chain + DB
    logAction("swap", details);
    const agentId = await getAgentId();
    if (agentId) {
      recordAction(agentId, ActionType.SWAP, details, { txHash, cost: parseFloat(SWAP_AMOUNT) });
    }

  } catch (err) {
    console.error("[agent] ❌ Cycle error:", (err as Error).message);
  } finally {
    _running = false;
  }
}

// ─── public API ──────────────────────────────────────────────────────────────

export function startAutonomousAgent() {
  if (_timer) return;
  console.log(`[agent] 🚀 Autonomous agent started — cycle every ${INTERVAL_MS / 60000} minutes`);

  // Run immediately on startup, then on interval
  runCycle();
  _timer = setInterval(runCycle, INTERVAL_MS);
}

export function stopAutonomousAgent() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  console.log("[agent] Autonomous agent stopped");
}
