/**
 * AI Agent Brain
 * Claude analyzes live market signals and decides whether to execute trades
 * via the OKX TEE agentic wallet — fully autonomous
 */

import Anthropic from "@anthropic-ai/sdk";
import { run } from "./onchainos";
import { agentSwap, AGENTIC_WALLET } from "./agentWallet";
import { logAction } from "./registry";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    // 3. Ask Claude to analyze and decide
    const prompt = `You are an autonomous DeFi trading agent controlling an OKX TEE-secured agentic wallet on X Layer.

AGENT WALLET BALANCE:
${balanceSummary}

LIVE SMART MONEY SIGNALS (whale wallet activity on Ethereum):
${JSON.stringify(signals, null, 2)}

TASK: Analyze these signals and decide whether to execute a trade on X Layer using OKB (native token).

Rules:
- Only BUY if multiple whale wallets are accumulating (low soldRatioPercent < 30%) and amountUsd > $1000
- Only trade tokens available on X Layer: OKB (native), USDT (0x1E4a5963aBFD975d8c9021ce480b42188849D41d), USDC (0x74b7f16337b8972027f6196a17a631ac6de26d22)
- Never risk more than 20% of balance in one trade
- If no strong signal, output WAIT
- Amount must be in human-readable format (e.g. "0.001" for OKB)

Respond with ONLY valid JSON, no markdown:
{
  "action": "BUY" | "HOLD" | "SELL" | "WAIT",
  "token": "token symbol if trading",
  "tokenAddress": "contract address on X Layer if trading",
  "fromToken": "OKB" or "USDT",
  "fromTokenAddress": "source token address",
  "amount": "human-readable amount",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "2-3 sentence explanation of why"
}`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = (message.content[0] as { text: string }).text.trim();

    // Parse JSON response
    let parsed: {
      action: AiDecision["action"];
      token?: string;
      tokenAddress?: string;
      fromTokenAddress?: string;
      amount?: string;
      confidence: AiDecision["confidence"];
      reasoning: string;
    };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = {
        action: "WAIT",
        confidence: "LOW",
        reasoning: "Could not parse AI response — defaulting to WAIT for safety.",
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
