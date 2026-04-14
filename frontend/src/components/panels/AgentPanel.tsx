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

interface Decision {
  action: string;
  token?: string;
  amount?: string;
  reasoning: string;
  confidence?: string;
  executed?: boolean;
  txHash?: string;
  timestamp: number;
}

interface DcaPlan {
  id: string;
  fromSymbol: string;
  toSymbol: string;
  amount: string;
  intervalMs: number;
  totalRuns: number;
  nextRun: number;
  active: boolean;
  wallet: "agent" | "pk";
  txHistory: Array<{ txHash: string; timestamp: number }>;
}

interface TokenAsset {
  symbol: string;
  balance: string;
  tokenPrice: string;
  usdValue: string;
}

interface WalletInfo {
  address: string;
  type: string;
  balance?: { data?: { details?: Array<{ tokenAssets?: TokenAsset[] }> } };
}

const ACTION_COLOR: Record<string, string> = {
  BUY: "text-terminal-green", SELL: "text-terminal-red",
  HOLD: "text-terminal-cyan", WAIT: "text-terminal-muted",
  REBALANCE: "text-terminal-cyan", FOLLOW_TEE: "text-terminal-green",
  DCA: "text-terminal-green",
};

const ACTION_BG: Record<string, string> = {
  BUY: "bg-terminal-green text-terminal-bg",
  SELL: "bg-terminal-red text-terminal-bg",
  FOLLOW_TEE: "bg-terminal-green text-terminal-bg",
  REBALANCE: "border border-terminal-cyan text-terminal-cyan",
  HOLD: "border border-terminal-border text-terminal-muted",
  WAIT: "border border-terminal-border text-terminal-muted",
};

function fmtInterval(ms: number) {
  const s = ms / 1000;
  if (s < 3600) return `${s / 60}m`;
  if (s < 86400) return `${s / 3600}h`;
  return `${s / 86400}d`;
}

function fmtNext(ts: number) {
  const diff = ts - Date.now();
  if (diff <= 0) return "due";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export function AgentPanel() {
  const { get, post, del, loading } = useApi();
  const { address: userAddress } = useWallet();

  const [teeWallet, setTeeWallet] = useState<WalletInfo | null>(null);
  const [pkWallet, setPkWallet] = useState<WalletInfo | null>(null);
  const [teeDecision, setTeeDecision] = useState<Decision | null>(null);
  const [pkDecision, setPkDecision] = useState<Decision | null>(null);
  const [teePlans, setTeePlans] = useState<DcaPlan[]>([]);
  const [pkPlans, setPkPlans] = useState<DcaPlan[]>([]);
  const [tab, setTab] = useState<"overview" | "tee" | "pk">("overview");

  // TEE Agent form
  const [teeAutoEx, setTeeAutoEx] = useState(false);
  const [teeRunning, setTeeRunning] = useState(false);
  const [teeSwapFrom, setTeeSwapFrom] = useState(XLAYER_TOKENS[0]);
  const [teeSwapTo, setTeeSwapTo] = useState(XLAYER_TOKENS[1]);
  const [teeSwapAmt, setTeeSwapAmt] = useState("");
  const [teeSwapTx, setTeeSwapTx] = useState("");
  const [teeDcaFrom, setTeeDcaFrom] = useState(XLAYER_TOKENS[0]);
  const [teeDcaTo, setTeeDcaTo] = useState(XLAYER_TOKENS[1]);
  const [teeDcaAmt, setTeeDcaAmt] = useState("");
  const [teeDcaInt, setTeeDcaInt] = useState("3600");

  // PK Agent form
  const [pkAutoEx, setPkAutoEx] = useState(false);
  const [pkRunning, setPkRunning] = useState(false);
  const [pkDcaFrom, setPkDcaFrom] = useState(XLAYER_TOKENS[0]);
  const [pkDcaTo, setPkDcaTo] = useState(XLAYER_TOKENS[1]);
  const [pkDcaAmt, setPkDcaAmt] = useState("");
  const [pkDcaInt, setPkDcaInt] = useState("3600");

  const loadAll = useCallback(async () => {
    const [tw, pw, td, pd, tp, pp] = await Promise.all([
      get<{ data: WalletInfo }>("/agent/wallet"),
      get<{ data: WalletInfo }>("/agent/pk/wallet"),
      get<{ data: Decision }>("/agent/ai"),
      get<{ data: Decision }>("/agent/pk/ai"),
      get<{ data: DcaPlan[] }>("/agent/dca"),
      get<{ data: DcaPlan[] }>("/agent/pk/dca"),
    ]);
    if (tw?.data) setTeeWallet(tw.data);
    if (pw?.data) setPkWallet(pw.data);
    if (td?.data) setTeeDecision(td.data);
    if (pd?.data) setPkDecision(pd.data);
    if (tp?.data) setTeePlans(tp.data);
    if (pp?.data) setPkPlans(pp.data);
  }, [get]);

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 15000);
    return () => clearInterval(t);
  }, [loadAll]);

  const getTokens = (w: WalletInfo | null) =>
    w?.balance?.data?.details?.[0]?.tokenAssets || [];

  const totalUsd = (w: WalletInfo | null) =>
    getTokens(w).reduce((s, t) => s + Number(t.usdValue || 0), 0);

  const runTeeAi = async () => {
    setTeeRunning(true);
    const r = await post<{ data: Decision }>("/agent/ai", { autoExecute: teeAutoEx });
    if (r?.data) { setTeeDecision(r.data); if (teeAutoEx) loadAll(); }
    setTeeRunning(false);
  };

  const runPkAi = async () => {
    setPkRunning(true);
    const r = await post<{ data: Decision }>("/agent/pk/ai", { autoExecute: pkAutoEx });
    if (r?.data) { setPkDecision(r.data); if (pkAutoEx) loadAll(); }
    setPkRunning(false);
  };

  const teeSwap = async () => {
    const r = await post<{ data: { txHash: string } }>("/agent/swap", { from: teeSwapFrom.address, to: teeSwapTo.address, amount: teeSwapAmt, chain: "xlayer" });
    if (r?.data?.txHash) { setTeeSwapTx(r.data.txHash); setTeeSwapAmt(""); loadAll(); }
  };

  const createTeeDca = async () => {
    await post("/agent/dca", { from: teeDcaFrom.address, to: teeDcaTo.address, fromSymbol: teeDcaFrom.symbol, toSymbol: teeDcaTo.symbol, amount: teeDcaAmt, intervalSeconds: Number(teeDcaInt), chain: "xlayer" });
    setTeeDcaAmt(""); loadAll();
  };

  const createPkDca = async () => {
    await post("/agent/pk/dca", { from: pkDcaFrom.address, to: pkDcaTo.address, fromSymbol: pkDcaFrom.symbol, toSymbol: pkDcaTo.symbol, amount: pkDcaAmt, intervalSeconds: Number(pkDcaInt), chain: "xlayer" });
    setPkDcaAmt(""); loadAll();
  };

  const cancelPlan = async (id: string, isPk: boolean) => {
    await del(`${isPk ? "/agent/pk/dca" : "/agent/dca"}/${id}`);
    loadAll();
  };

  const allPlans = [...teePlans, ...pkPlans].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));

  return (
    <div className="panel h-full flex flex-col">
      <div className="panel-header">
        <span className="panel-title">⬡ Agent</span>
        <div className="flex gap-1">
          <span className="badge-green">TEE</span>
          <span className="text-xs font-mono text-terminal-muted">+</span>
          <span className="text-xs font-mono px-1 py-0.5 rounded border border-terminal-cyan text-terminal-cyan">PK</span>
        </div>
      </div>

      {/* Dual wallet strip */}
      <div className="px-2 pt-1.5 grid grid-cols-2 gap-1">
        <div className="border border-terminal-green border-opacity-40 rounded p-1.5 bg-terminal-green bg-opacity-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-terminal-green font-mono font-bold">TEE AGENT</span>
            <span className="text-xs text-terminal-green font-mono">${totalUsd(teeWallet).toFixed(2)}</span>
          </div>
          <a href={`${EXPLORER}/address/${AGENTIC_WALLET}`} target="_blank" rel="noopener noreferrer"
            className="text-xs font-mono text-terminal-cyan hover:underline">
            {AGENTIC_WALLET.slice(0, 8)}...{AGENTIC_WALLET.slice(-4)}
          </a>
          <p className="text-xs text-terminal-muted font-mono">OKX TEE · Signal AI</p>
        </div>
        <div className="border border-terminal-cyan border-opacity-40 rounded p-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-terminal-cyan font-mono font-bold">PK AGENT</span>
            <span className="text-xs text-terminal-cyan font-mono">${totalUsd(pkWallet).toFixed(2)}</span>
          </div>
          <span className="text-xs font-mono text-terminal-muted">
            {pkWallet?.address ? `${pkWallet.address.slice(0, 8)}...${pkWallet.address.slice(-4)}` : userAddress ? `${userAddress.slice(0, 8)}...${userAddress.slice(-4)}` : "No key set"}
          </span>
          <p className="text-xs text-terminal-muted font-mono">Private Key · Rebalance</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-2 pt-1.5">
        {(["overview", "tee", "pk"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-xs font-mono px-2 py-0.5 rounded ${tab === t ? (t === "tee" ? "bg-terminal-green text-terminal-bg" : t === "pk" ? "bg-terminal-cyan text-terminal-bg" : "bg-terminal-border text-terminal-text") : "text-terminal-muted hover:text-terminal-text"}`}>
            {t === "overview" ? "OVERVIEW" : t === "tee" ? "⬡ TEE" : "⬢ PK"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto panel-body">

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="space-y-2">
            {/* Latest decisions */}
            <p className="data-label">LATEST DECISIONS</p>
            {[
              { label: "TEE", d: teeDecision, color: "terminal-green" },
              { label: "PK",  d: pkDecision,  color: "terminal-cyan"  },
            ].map(({ label, d, color }) => d ? (
              <div key={label} className={`border border-${color} border-opacity-20 rounded p-1.5`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-xs font-mono text-${color}`}>{label}</span>
                  <span className={`text-xs font-mono font-bold px-1.5 rounded ${ACTION_BG[d.action] || "text-terminal-muted"}`}>{d.action}</span>
                  {d.token && <span className="text-xs font-mono text-terminal-cyan">{d.token}</span>}
                  {d.amount && <span className="text-xs font-mono text-terminal-muted">{d.amount}</span>}
                </div>
                <p className="text-xs text-terminal-muted font-mono leading-relaxed line-clamp-2">{d.reasoning}</p>
                {d.executed && d.txHash && (
                  <a href={`${EXPLORER}/tx/${d.txHash}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-terminal-green hover:underline truncate block">
                    ✓ {d.txHash.slice(0, 20)}...
                  </a>
                )}
              </div>
            ) : (
              <div key={label} className="border border-terminal-border rounded p-1.5">
                <span className="text-xs text-terminal-muted font-mono">{label} agent — click Run in {label === "TEE" ? "⬡ TEE" : "⬢ PK"} tab</span>
              </div>
            ))}

            {/* All DCA plans */}
            {allPlans.length > 0 && (
              <>
                <p className="data-label mt-1">DCA PLANS</p>
                {allPlans.map((plan) => (
                  <div key={plan.id} className={`border rounded p-1.5 ${plan.active ? (plan.wallet === "agent" ? "border-terminal-green border-opacity-30" : "border-terminal-cyan border-opacity-30") : "border-terminal-border opacity-40"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-mono ${plan.wallet === "agent" ? "text-terminal-green" : "text-terminal-cyan"}`}>
                          {plan.wallet === "agent" ? "⬡" : "⬢"}
                        </span>
                        <span className="text-xs font-mono text-terminal-text">{plan.amount} {plan.fromSymbol}→{plan.toSymbol}</span>
                        <span className="text-xs text-terminal-muted font-mono">/{fmtInterval(plan.intervalMs)}</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-terminal-muted font-mono">{plan.totalRuns} runs</span>
                        {plan.active && <span className="text-xs text-terminal-muted font-mono">next {fmtNext(plan.nextRun)}</span>}
                        {plan.active && (
                          <button onClick={() => cancelPlan(plan.id, plan.wallet === "pk")}
                            className="text-xs text-terminal-red hover:underline font-mono">STOP</button>
                        )}
                      </div>
                    </div>
                    {plan.txHistory.slice(0, 1).map((tx, i) => (
                      <a key={i} href={`${EXPLORER}/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-mono text-terminal-green hover:underline truncate block mt-0.5">
                        ✓ {tx.txHash.slice(0, 22)}...
                      </a>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* TEE AGENT TAB */}
        {tab === "tee" && (
          <div className="space-y-2">
            <p className="data-label">TEE AGENT · SIGNAL AI + DCA</p>

            {/* Balances */}
            {getTokens(teeWallet).map((t, i) => (
              <div key={i} className="data-row">
                <span className="text-xs font-mono text-terminal-cyan w-12">{t.symbol}</span>
                <span className="text-xs font-mono text-terminal-text">{Number(t.balance).toFixed(5)}</span>
                <span className="text-xs font-mono text-terminal-green">${Number(t.usdValue).toFixed(2)}</span>
              </div>
            ))}

            {/* AI */}
            <div className="border border-terminal-green border-opacity-20 rounded p-1.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="data-label">AI SIGNAL ANALYSIS</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={teeAutoEx} onChange={e => setTeeAutoEx(e.target.checked)} className="accent-terminal-green" />
                  <span className="text-xs font-mono text-terminal-muted">Auto-execute</span>
                </label>
              </div>
              <button className="btn-primary w-full" onClick={runTeeAi} disabled={teeRunning || loading}>
                {teeRunning ? "ANALYZING..." : "⬡ RUN TEE AI AGENT"}
              </button>
              {teeDecision && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-mono font-bold px-1.5 rounded ${ACTION_BG[teeDecision.action] || ""}`}>{teeDecision.action}</span>
                    {teeDecision.confidence && <span className={`text-xs font-mono ${ACTION_COLOR[teeDecision.action]}`}>{teeDecision.confidence}</span>}
                  </div>
                  <p className="text-xs text-terminal-muted font-mono leading-relaxed">{teeDecision.reasoning}</p>
                  {teeDecision.executed && teeDecision.txHash && (
                    <a href={`${EXPLORER}/tx/${teeDecision.txHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono text-terminal-green hover:underline break-all block">✓ {teeDecision.txHash}</a>
                  )}
                </div>
              )}
            </div>

            {/* Manual swap */}
            <div className="space-y-1">
              <p className="data-label">ONE-TIME SWAP</p>
              <div className="flex gap-1">
                <select className="input-field flex-1 text-xs" value={teeSwapFrom.address} onChange={e => setTeeSwapFrom(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[0])}>
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
                <span className="text-terminal-muted self-center font-mono text-xs">→</span>
                <select className="input-field flex-1 text-xs" value={teeSwapTo.address} onChange={e => setTeeSwapTo(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[1])}>
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
              </div>
              <div className="flex gap-1">
                <input className="input-field flex-1" placeholder="Amount" value={teeSwapAmt} onChange={e => setTeeSwapAmt(e.target.value)} />
                <button className="btn-primary" onClick={teeSwap} disabled={loading || !teeSwapAmt}>SWAP</button>
              </div>
              {teeSwapTx && <a href={`${EXPLORER}/tx/${teeSwapTx}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-terminal-green hover:underline block truncate">✓ {teeSwapTx.slice(0, 24)}...</a>}
            </div>

            {/* DCA */}
            <div className="space-y-1">
              <p className="data-label">AUTO DCA</p>
              <div className="flex gap-1">
                <select className="input-field flex-1 text-xs" value={teeDcaFrom.address} onChange={e => setTeeDcaFrom(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[0])}>
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
                <span className="text-terminal-muted self-center font-mono text-xs">→</span>
                <select className="input-field flex-1 text-xs" value={teeDcaTo.address} onChange={e => setTeeDcaTo(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[1])}>
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
              </div>
              <div className="flex gap-1">
                <input className="input-field flex-1" placeholder="Amount per run" value={teeDcaAmt} onChange={e => setTeeDcaAmt(e.target.value)} />
                <select className="input-field w-20 text-xs" value={teeDcaInt} onChange={e => setTeeDcaInt(e.target.value)}>
                  <option value="60">1m</option><option value="300">5m</option>
                  <option value="3600">1h</option><option value="86400">1d</option>
                </select>
                <button className="btn-primary" onClick={createTeeDca} disabled={loading || !teeDcaAmt}>+</button>
              </div>
            </div>
          </div>
        )}

        {/* PK AGENT TAB */}
        {tab === "pk" && (
          <div className="space-y-2">
            <p className="data-label">PK AGENT · REBALANCE + FOLLOW</p>

            {/* Balances */}
            {getTokens(pkWallet).map((t, i) => (
              <div key={i} className="data-row">
                <span className="text-xs font-mono text-terminal-cyan w-12">{t.symbol}</span>
                <span className="text-xs font-mono text-terminal-text">{Number(t.balance).toFixed(5)}</span>
                <span className="text-xs font-mono text-terminal-cyan">${Number(t.usdValue).toFixed(2)}</span>
              </div>
            ))}
            {!pkWallet?.address && <p className="text-xs text-terminal-muted font-mono">Set EVM_PRIVATE_KEY in Railway to enable PK agent</p>}

            {/* AI */}
            <div className="border border-terminal-cyan border-opacity-20 rounded p-1.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="data-label">REBALANCE ANALYSIS</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={pkAutoEx} onChange={e => setPkAutoEx(e.target.checked)} className="accent-terminal-cyan" />
                  <span className="text-xs font-mono text-terminal-muted">Auto-execute</span>
                </label>
              </div>
              <button className="w-full text-xs font-mono py-1.5 rounded border border-terminal-cyan text-terminal-cyan hover:bg-terminal-cyan hover:text-terminal-bg transition-colors disabled:opacity-50"
                onClick={runPkAi} disabled={pkRunning || loading}>
                {pkRunning ? "ANALYZING..." : "⬢ RUN PK AGENT"}
              </button>
              {pkDecision && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-mono font-bold px-1.5 rounded ${ACTION_BG[pkDecision.action] || ""}`}>{pkDecision.action}</span>
                    {pkDecision.amount && <span className="text-xs text-terminal-muted font-mono">{pkDecision.amount}</span>}
                  </div>
                  <p className="text-xs text-terminal-muted font-mono leading-relaxed">{pkDecision.reasoning}</p>
                  {pkDecision.executed && pkDecision.txHash && (
                    <a href={`${EXPLORER}/tx/${pkDecision.txHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono text-terminal-cyan hover:underline break-all block">✓ {pkDecision.txHash}</a>
                  )}
                </div>
              )}
            </div>

            {/* DCA */}
            <div className="space-y-1">
              <p className="data-label">AUTO DCA</p>
              <div className="flex gap-1">
                <select className="input-field flex-1 text-xs" value={pkDcaFrom.address} onChange={e => setPkDcaFrom(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[0])}>
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
                <span className="text-terminal-muted self-center font-mono text-xs">→</span>
                <select className="input-field flex-1 text-xs" value={pkDcaTo.address} onChange={e => setPkDcaTo(XLAYER_TOKENS.find(t => t.address === e.target.value) || XLAYER_TOKENS[1])}>
                  {XLAYER_TOKENS.map(t => <option key={t.address} value={t.address}>{t.symbol}</option>)}
                </select>
              </div>
              <div className="flex gap-1">
                <input className="input-field flex-1" placeholder="Amount per run" value={pkDcaAmt} onChange={e => setPkDcaAmt(e.target.value)} />
                <select className="input-field w-20 text-xs" value={pkDcaInt} onChange={e => setPkDcaInt(e.target.value)}>
                  <option value="60">1m</option><option value="300">5m</option>
                  <option value="3600">1h</option><option value="86400">1d</option>
                </select>
                <button className="w-8 text-xs font-mono py-1 rounded border border-terminal-cyan text-terminal-cyan hover:bg-terminal-cyan hover:text-terminal-bg"
                  onClick={createPkDca} disabled={loading || !pkDcaAmt}>+</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
