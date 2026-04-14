import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../hooks/useApi";
import { useWallet } from "../../context/WalletContext";

const AGENTIC_WALLET = "0xae5816be55e5c36fcb7f7ba61dcfefac70715c0c";
const EXPLORER = "https://www.oklink.com/xlayer";

const XLAYER_TOKENS = [
  { symbol: "OKB",  address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" },
  { symbol: "USDT", address: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d" },
  { symbol: "USDC", address: "0x74b7f16337b8972027f6196a17a631ac6de26d22" },
  { symbol: "WETH", address: "0x5a77f1443d16ee5761d310e38b62f77f726bC71c" },
];

interface DcaPlan {
  id: string;
  fromSymbol: string;
  toSymbol: string;
  amount: string;
  intervalMs: number;
  totalRuns: number;
  nextRun: number;
  active: boolean;
  txHistory: Array<{ txHash: string; timestamp: number; amount: string }>;
}

interface AgentBalance {
  address: string;
  type: string;
  balance?: { data?: { details?: Array<{ tokenAssets?: Array<{ symbol: string; balance: string; tokenPrice: string; usdValue: string }> }> }; totalValueUsd?: string };
}

export function AgentPanel() {
  const { get, post, del, loading } = useApi();
  const { address: userAddress } = useWallet();

  const [agentBalance, setAgentBalance] = useState<AgentBalance | null>(null);
  const [dcaPlans, setDcaPlans] = useState<DcaPlan[]>([]);
  const [tab, setTab] = useState<"wallet" | "dca" | "swap" | "ai">("wallet");

  // Swap form
  const [swapFrom, setSwapFrom] = useState(XLAYER_TOKENS[0]);
  const [swapTo, setSwapTo] = useState(XLAYER_TOKENS[1]);
  const [swapAmount, setSwapAmount] = useState("");
  const [swapResult, setSwapResult] = useState("");
  const [swapError, setSwapError] = useState("");

  // DCA form
  const [dcaFrom, setDcaFrom] = useState(XLAYER_TOKENS[0]);
  const [dcaTo, setDcaTo] = useState(XLAYER_TOKENS[1]);
  const [dcaAmount, setDcaAmount] = useState("");
  const [dcaInterval, setDcaInterval] = useState("3600");
  const [dcaError, setDcaError] = useState("");

  // AI state
  interface AiDecision {
    action: "BUY" | "HOLD" | "SELL" | "WAIT";
    token?: string;
    tokenAddress?: string;
    amount?: string;
    reasoning: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    executed?: boolean;
    txHash?: string;
    timestamp: number;
    signals?: unknown[];
  }
  const [aiDecision, setAiDecision] = useState<AiDecision | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);

  const loadWallet = useCallback(async () => {
    const r = await get<{ data: AgentBalance }>("/agent/wallet");
    if (r?.data) setAgentBalance(r.data);
  }, [get]);

  const loadPlans = useCallback(async () => {
    const r = await get<{ data: DcaPlan[] }>("/agent/dca");
    if (r?.data) setDcaPlans(r.data);
  }, [get]);

  useEffect(() => {
    loadWallet();
    loadPlans();
    const t = setInterval(() => { loadWallet(); loadPlans(); }, 15000);
    return () => clearInterval(t);
  }, [loadWallet, loadPlans]);

  const agentTokens = agentBalance?.balance?.data?.details?.[0]?.tokenAssets || [];
  const totalUsd = agentTokens.reduce((s, t) => s + Number(t.usdValue || 0), 0);

  const executeSwap = async () => {
    if (!swapAmount) return;
    setSwapError(""); setSwapResult("");
    const r = await post<{ data: { txHash: string } }>("/agent/swap", {
      from: swapFrom.address,
      to: swapTo.address,
      amount: swapAmount,
      chain: "xlayer",
    });
    if (r?.data?.txHash) {
      setSwapResult(r.data.txHash);
      setSwapAmount("");
      loadWallet();
    } else {
      setSwapError("Swap failed — check agent wallet balance");
    }
  };

  const createDca = async () => {
    if (!dcaAmount || !dcaInterval) return;
    setDcaError("");
    const r = await post<{ data: DcaPlan }>("/agent/dca", {
      from: dcaFrom.address,
      to: dcaTo.address,
      fromSymbol: dcaFrom.symbol,
      toSymbol: dcaTo.symbol,
      amount: dcaAmount,
      intervalSeconds: Number(dcaInterval),
      chain: "xlayer",
    });
    if (r?.data) {
      setDcaAmount(""); setDcaInterval("3600");
      loadPlans();
    } else {
      setDcaError("Failed to create DCA plan");
    }
  };

  const runAi = async () => {
    setAiRunning(true);
    const r = await post<{ data: AiDecision }>("/agent/ai", { autoExecute });
    if (r?.data) setAiDecision(r.data);
    setAiRunning(false);
    if (autoExecute) loadWallet();
  };

  const cancelPlan = async (id: string) => {
    await del(`/agent/dca/${id}`);
    loadPlans();
  };

  const fmtInterval = (ms: number) => {
    const s = ms / 1000;
    if (s < 3600) return `${s / 60}m`;
    if (s < 86400) return `${s / 3600}h`;
    return `${s / 86400}d`;
  };

  const fmtTime = (ts: number) => {
    const diff = ts - Date.now();
    if (diff <= 0) return "due now";
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
  };

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <span className="panel-title">⬡ Agent</span>
        <span className="badge-green">TEE WALLET</span>
      </div>

      {/* Dual wallet summary */}
      <div className="px-2 pt-2 grid grid-cols-2 gap-1">
        <div className="border border-terminal-border rounded p-1.5">
          <p className="text-xs text-terminal-muted font-mono">USER WALLET</p>
          <p className="text-xs font-mono text-terminal-cyan truncate">
            {userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : "Not connected"}
          </p>
          <p className="text-xs text-terminal-muted font-mono">MetaMask · Manual</p>
        </div>
        <div className="border border-terminal-green border-opacity-40 rounded p-1.5 bg-terminal-green bg-opacity-5">
          <p className="text-xs text-terminal-green font-mono">AGENT WALLET</p>
          <a
            href={`${EXPLORER}/address/${AGENTIC_WALLET}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs font-mono text-terminal-cyan hover:underline"
          >
            {AGENTIC_WALLET.slice(0, 6)}...{AGENTIC_WALLET.slice(-4)}
          </a>
          <p className="text-xs text-terminal-green font-mono">${totalUsd.toFixed(2)} · TEE Auto</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-2 pt-2">
        {(["wallet", "ai", "swap", "dca"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs font-mono px-2 py-0.5 rounded ${tab === t ? "bg-terminal-green text-terminal-bg" : "text-terminal-muted hover:text-terminal-green"}`}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto panel-body">

        {/* WALLET TAB */}
        {tab === "wallet" && (
          <div className="space-y-2">
            <p className="data-label">AGENT BALANCES · X LAYER</p>
            {agentTokens.length === 0 && (
              <p className="text-xs text-terminal-muted font-mono">
                {loading ? "Loading..." : "No tokens — fund the agent wallet to begin"}
              </p>
            )}
            {agentTokens.map((t, i) => (
              <div key={i} className="data-row">
                <span className="text-xs font-mono text-terminal-cyan">{t.symbol}</span>
                <span className="text-xs font-mono text-terminal-text">{Number(t.balance).toFixed(6)}</span>
                <span className="text-xs font-mono text-terminal-muted">${Number(t.tokenPrice).toFixed(2)}</span>
                <span className="text-xs font-mono text-terminal-green">${Number(t.usdValue).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-terminal-border pt-1 mt-1">
              <div className="data-row">
                <span className="data-label">TOTAL VALUE</span>
                <span className="text-xs font-mono text-terminal-green font-bold">${totalUsd.toFixed(2)}</span>
              </div>
              <div className="data-row">
                <span className="data-label">TYPE</span>
                <span className="text-xs font-mono text-terminal-cyan">OKX TEE · Zero Gas X Layer</span>
              </div>
              <div className="data-row">
                <span className="data-label">ADDRESS</span>
                <a
                  href={`${EXPLORER}/address/${AGENTIC_WALLET}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono text-terminal-cyan hover:underline"
                >
                  {AGENTIC_WALLET.slice(0, 10)}...{AGENTIC_WALLET.slice(-6)}
                </a>
              </div>
            </div>
          </div>
        )}

        {/* AI TAB */}
        {tab === "ai" && (
          <div className="space-y-2">
            <p className="data-label">AI TOOLKIT · SIGNAL ANALYSIS</p>
            <p className="text-xs text-terminal-muted font-mono">Claude analyzes live whale signals → decides → executes via TEE wallet</p>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoExecute}
                  onChange={(e) => setAutoExecute(e.target.checked)}
                  className="accent-terminal-green"
                />
                <span className="text-xs font-mono text-terminal-muted">Auto-execute if BUY</span>
              </label>
            </div>

            <button
              className="btn-primary w-full"
              onClick={runAi}
              disabled={aiRunning || loading}
            >
              {aiRunning ? "ANALYZING SIGNALS..." : "⬡ RUN AI AGENT"}
            </button>

            {aiDecision && (
              <div className="space-y-1.5 mt-1">
                {/* Action badge */}
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${
                    aiDecision.action === "BUY" ? "bg-terminal-green text-terminal-bg" :
                    aiDecision.action === "SELL" ? "bg-terminal-red text-terminal-bg" :
                    "bg-terminal-border text-terminal-muted"
                  }`}>
                    {aiDecision.action}
                  </span>
                  {aiDecision.token && (
                    <span className="text-xs font-mono text-terminal-cyan">{aiDecision.token}</span>
                  )}
                  <span className={`text-xs font-mono ${
                    aiDecision.confidence === "HIGH" ? "text-terminal-green" :
                    aiDecision.confidence === "MEDIUM" ? "text-terminal-cyan" :
                    "text-terminal-muted"
                  }`}>
                    {aiDecision.confidence} confidence
                  </span>
                </div>

                {/* Reasoning */}
                <div className="border border-terminal-border rounded p-2 bg-terminal-bg">
                  <p className="text-xs font-mono text-terminal-muted leading-relaxed">{aiDecision.reasoning}</p>
                </div>

                {/* Trade details */}
                {aiDecision.action === "BUY" && aiDecision.amount && (
                  <div className="data-row">
                    <span className="data-label">TRADE</span>
                    <span className="text-xs font-mono text-terminal-cyan">{aiDecision.amount} OKB → {aiDecision.token}</span>
                  </div>
                )}

                {/* Execution result */}
                {aiDecision.executed && aiDecision.txHash && (
                  <a
                    href={`${EXPLORER}/tx/${aiDecision.txHash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-terminal-green hover:underline break-all block"
                  >
                    ✓ EXECUTED: {aiDecision.txHash.slice(0, 24)}...
                  </a>
                )}
                {aiDecision.action === "BUY" && !aiDecision.executed && (
                  <p className="text-xs text-terminal-muted font-mono">Enable auto-execute to trade automatically</p>
                )}

                <p className="text-xs text-terminal-muted font-mono opacity-50">
                  {new Date(aiDecision.timestamp).toLocaleTimeString()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* SWAP TAB — one-time agent swap */}
        {tab === "swap" && (
          <div className="space-y-2">
            <p className="data-label">AGENT ONE-TIME SWAP</p>
            <p className="text-xs text-terminal-muted font-mono">Agent wallet signs autonomously — no MetaMask needed</p>

            <div className="space-y-1">
              <div className="flex gap-1 items-center">
                <span className="data-label w-10">FROM</span>
                <select
                  className="input-field flex-1 text-xs"
                  value={swapFrom.address}
                  onChange={(e) => setSwapFrom(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[0])}
                >
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
              </div>
              <div className="flex gap-1 items-center">
                <span className="data-label w-10">TO</span>
                <select
                  className="input-field flex-1 text-xs"
                  value={swapTo.address}
                  onChange={(e) => setSwapTo(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[1])}
                >
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
              </div>
              <input
                className="input-field w-full"
                placeholder={`Amount (${swapFrom.symbol})`}
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
              />
              <button
                className="btn-primary w-full"
                onClick={executeSwap}
                disabled={loading || !swapAmount}
              >
                {loading ? "EXECUTING..." : "⬡ EXECUTE VIA AGENT"}
              </button>
            </div>

            {swapError && <p className="text-xs text-terminal-red font-mono">{swapError}</p>}
            {swapResult && (
              <a
                href={`${EXPLORER}/tx/${swapResult}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs font-mono text-terminal-green hover:underline break-all block"
              >
                ✓ TX: {swapResult.slice(0, 20)}...
              </a>
            )}
          </div>
        )}

        {/* DCA TAB */}
        {tab === "dca" && (
          <div className="space-y-2">
            <p className="data-label">AUTONOMOUS DCA · AGENT WALLET</p>

            <div className="space-y-1">
              <div className="flex gap-1">
                <select
                  className="input-field flex-1 text-xs"
                  value={dcaFrom.address}
                  onChange={(e) => setDcaFrom(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[0])}
                >
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
                <span className="text-terminal-muted font-mono text-xs self-center">→</span>
                <select
                  className="input-field flex-1 text-xs"
                  value={dcaTo.address}
                  onChange={(e) => setDcaTo(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[1])}
                >
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
              </div>
              <div className="flex gap-1">
                <input
                  className="input-field flex-1"
                  placeholder={`Amount per run (${dcaFrom.symbol})`}
                  value={dcaAmount}
                  onChange={(e) => setDcaAmount(e.target.value)}
                />
                <select
                  className="input-field w-24 text-xs"
                  value={dcaInterval}
                  onChange={(e) => setDcaInterval(e.target.value)}
                >
                  <option value="60">1 min</option>
                  <option value="300">5 min</option>
                  <option value="3600">1 hour</option>
                  <option value="86400">1 day</option>
                  <option value="604800">1 week</option>
                </select>
              </div>
              <button
                className="btn-primary w-full"
                onClick={createDca}
                disabled={loading || !dcaAmount}
              >
                {loading ? "CREATING..." : "⬡ START AGENT DCA"}
              </button>
            </div>

            {dcaError && <p className="text-xs text-terminal-red font-mono">{dcaError}</p>}

            {/* Active plans */}
            {dcaPlans.length > 0 && (
              <div className="space-y-1 mt-1">
                <p className="data-label">ACTIVE PLANS</p>
                {dcaPlans.map((plan) => (
                  <div key={plan.id} className={`border rounded p-1.5 ${plan.active ? "border-terminal-green border-opacity-30" : "border-terminal-border opacity-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-terminal-cyan">
                        {plan.amount} {plan.fromSymbol} → {plan.toSymbol}
                      </span>
                      <div className="flex gap-1 items-center">
                        <span className="text-xs text-terminal-muted font-mono">every {fmtInterval(plan.intervalMs)}</span>
                        {plan.active && (
                          <button
                            onClick={() => cancelPlan(plan.id)}
                            className="text-xs text-terminal-red hover:underline font-mono"
                          >
                            STOP
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3 mt-0.5">
                      <span className="text-xs text-terminal-muted font-mono">runs: {plan.totalRuns}</span>
                      {plan.active && <span className="text-xs text-terminal-muted font-mono">next: {fmtTime(plan.nextRun)}</span>}
                    </div>
                    {plan.txHistory.slice(0, 2).map((tx, i) => (
                      <a
                        key={i}
                        href={`${EXPLORER}/tx/${tx.txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs font-mono text-terminal-green hover:underline block truncate"
                      >
                        ✓ {tx.txHash.slice(0, 18)}...
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
