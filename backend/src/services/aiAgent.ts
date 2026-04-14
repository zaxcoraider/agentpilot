/**
 * AI Agent Brain
 * Uses Claude Haiku to analyze live whale signals and decide trades
 * Falls back to rule-based engine if ANTHROPIC_API_KEY is not set
 * Executes via OKX TEE agentic wallet — fully autonomous
 */

import Anthropic from "@anthropic-ai/sdk";
import { run } from "./onchainos";
import { agentSwap, AGENTIC_WALLET } from "./agentWallet";
import { logAction } from "./registry";

export interface AiDecision {
  action: "BUY" | "HOLD" | "SELL" | "WAIT";
  token?: string;
  tokenAddress?: string;
  amount?: string;
  reasoning: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  signals: unknown[];
  executed?: boolean;
  txHash?: string;
  timestamp: number;
}

// Last decision cache
let lastDecision: AiDecision | null = null;
let isRunning = false;

export function getLastAiDecision(): AiDecision | null {
  return lastDecision;
}

export async function runAiDecision(autoExecute = false): Promise<AiDecision> {
  if (isRunning) throw new Error("AI agent already running");
  isRunning = true;

  try {
    // 1. Fetch live signals from onchainos
    const signalData = await run(["signal", "list", "--chain", "ethereum", "--wallet-type", "1"]) as { data?: unknown[] };
    const signals = (signalData?.data || []).slice(0, 10);

    // 2. Fetch agent wallet balance
    const balanceData = await run([
      "portfolio", "all-balances",
      "--address", AGENTIC_WALLET,
      "--chain", "xlayer",
    ]) as { data?: { details?: Array<{ tokenAssets?: Array<{ symbol: string; balance: string; usdValue: string }> }> } };
    const tokens = balanceData?.data?.details?.[0]?.tokenAssets || [];
    const balanceSummary = tokens.map(t => `${t.symbol}: ${t.balance} ($${Number(t.usdValue).toFixed(2)})`).join(", ") || "No balance";

    // 3. Claude AI brain (if API key set) — else rule-based fallback
    if (process.env.ANTHROPIC_API_KEY) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `You are an autonomous DeFi agent on X Layer. Analyze these whale signals and decide a trade.

AGENT BALANCE: ${balanceSummary}
SIGNALS: ${JSON.stringify(signals.slice(0, 5))}

X Layer tokens: OKB=0xEeee...eEeE, USDT=0x1E4a5963aBFD975d8c9021ce480b42188849D41d, USDC=0x74b7f16337b8972027f6196a17a631ac6de26d22
Rules: BUY only if strong accumulation (soldRatio<30%, amountUsd>$5K, multiple wallets). Max 15% of OKB balance. WAIT if uncertain.

Reply ONLY with valid JSON (no markdown):
{"action":"BUY"|"HOLD"|"WAIT","token":"symbol","tokenAddress":"0x...","fromTokenAddress":"0x...","amount":"0.001","confidence":"HIGH"|"MEDIUM"|"LOW","reasoning":"2 sentences"}`,
        }],
      });
      const text = (message.content[0] as { text: string }).text.trim();
      try {
        const p = JSON.parse(text) as {
          action: AiDecision["action"]; token?: string; tokenAddress?: string;
          fromTokenAddress?: string; amount?: string;
          confidence: AiDecision["confidence"]; reasoning: string;
        };
        const decision: AiDecision = {
          action: p.action, token: p.token, tokenAddress: p.tokenAddress,
          amount: p.amount, reasoning: p.reasoning, confidence: p.confidence,
          signals, executed: false, timestamp: Date.now(),
        };
        if (autoExecute && decision.action === "BUY" && decision.tokenAddress && decision.amount) {
          try {
            const from = p.fromTokenAddress || "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
            const { txHash } = await agentSwap(from, decision.tokenAddress, decision.amount, "xlayer");
            decision.executed = true; decision.txHash = txHash;
            logAction("trade", `ai-claude:${decision.action}:${decision.token}`);
          } catch (e) { decision.reasoning += ` [Exec failed: ${(e as Error).message}]`; }
        }
        lastDecision = decision;
        return decision;
      } catch { /* fall through to rule-based */ }
    }

    // 3. Rule-based AI engine — analyze signals
    interface SignalItem {
      amountUsd?: string | number;
      soldRatioPercent?: string | number;
      triggerWalletCount?: string | number;
      token?: { symbol?: string; marketCapUsd?: string | number };
    }

    const typed = signals as SignalItem[];

    // Score each signal: accumulation strength
    const scored = typed.map((s) => {
      const usd = Number(s.amountUsd || 0);
      const sold = Number(s.soldRatioPercent || 0);
      const wallets = Number(s.triggerWalletCount || 1);
      const mcap = Number(s.token?.marketCapUsd || 0);
      // Accumulation score: high USD + low sell ratio + multiple wallets
      const score = (usd / 1000) * (1 - sold / 100) * Math.sqrt(wallets);
      return { ...s, score, usd, sold, wallets, mcap };
    }).sort((a, b) => b.score - a.score);

    const top = scored[0];
    const avgScore = scored.slice(0, 3).reduce((s, x) => s + x.score, 0) / 3;

    // Agent wallet OKB balance
    const okbBalance = Number(tokens.find(t => t.symbol === "OKB")?.balance || 0);
    const maxSpend = okbBalance * 0.15; // max 15% per trade

    let parsed: {
      action: AiDecision["action"];
      token?: string;
      tokenAddress?: string;
      fromTokenAddress?: string;
      amount?: string;
      confidence: AiDecision["confidence"];
      reasoning: string;
    };

    // X Layer tradeable tokens
    const XLAYER_TOKENS: Record<string, string> = {
      USDT: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
      USDC: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
    };
    const OKB_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

    if (avgScore > 5 && top.sold < 25 && top.usd > 5000 && maxSpend >= 0.001) {
      // Strong accumulation signal → BUY USDT with OKB (safe stable swap)
      const amount = Math.min(maxSpend, 0.005).toFixed(4);
      parsed = {
        action: "BUY",
        token: "USDT",
        tokenAddress: XLAYER_TOKENS["USDT"],
        fromTokenAddress: OKB_ADDRESS,
        amount,
        confidence: avgScore > 15 ? "HIGH" : "MEDIUM",
        reasoning: `${top.wallets} whale wallet(s) accumulated $${top.usd.toLocaleString(undefined, {maximumFractionDigits: 0})} in ${top.token?.symbol || "?"} with only ${top.sold}% sold. Accumulation score ${avgScore.toFixed(1)} exceeds threshold. Swapping ${amount} OKB → USDT on X Layer as a safe position.`,
      };
    } else if (avgScore > 2 && top.sold < 50) {
      parsed = {
        action: "HOLD",
        confidence: "MEDIUM",
        reasoning: `Moderate signal detected: $${top.usd.toLocaleString(undefined, {maximumFractionDigits: 0})} in ${top.token?.symbol || "?"} with ${top.sold}% sold. Score ${avgScore.toFixed(1)} below BUY threshold of 5. Monitoring for stronger confirmation before trading.`,
      };
    } else if (top.sold > 70) {
      parsed = {
        action: "WAIT",
        confidence: "HIGH",
        reasoning: `Whale wallets are distributing — ${top.sold}% of ${top.token?.symbol || "?"} position sold. High sell pressure detected. Staying out until accumulation resumes.`,
      };
    } else {
      parsed = {
        action: "WAIT",
        confidence: "LOW",
        reasoning: `No strong accumulation signal. Top signal score: ${avgScore.toFixed(1)}. Whales hold ${(100 - top.sold).toFixed(0)}% of their ${top.token?.symbol || "?"} position but USD volume ($${top.usd.toLocaleString(undefined, {maximumFractionDigits: 0})}) is insufficient to trigger a trade.`,
      };
    }

    const decision: AiDecision = {
      action: parsed.action,
      token: parsed.token,
      tokenAddress: parsed.tokenAddress,
      amount: parsed.amount,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence,
      signals,
      executed: false,
      timestamp: Date.now(),
    };

    // 4. Auto-execute if enabled and action is BUY
    if (autoExecute && decision.action === "BUY" && decision.tokenAddress && decision.amount) {
      try {
        const fromAddress = parsed.fromTokenAddress || "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
        const { txHash } = await agentSwap(fromAddress, decision.tokenAddress, decision.amount, "xlayer");
        decision.executed = true;
        decision.txHash = txHash;
        logAction("trade", `ai-agent:${decision.action}:${decision.token}:${decision.amount}`);
      } catch (err) {
        decision.reasoning += ` [Execution failed: ${(err as Error).message}]`;
      }
    }

    lastDecision = decision;
    return decision;
  } finally {
    isRunning = false;
  }
}
