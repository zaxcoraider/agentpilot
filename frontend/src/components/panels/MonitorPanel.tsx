import { useState, useEffect, useCallback } from "react";
import { useApi } from "../../hooks/useApi";
import { ethers } from "ethers";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { CONTRACT_ADDRESS, REGISTRY_ABI } from "../../config";
import { useWallet } from "../../context/WalletContext";

interface TokenAsset {
  symbol?: string;
  balance?: string | number;
  tokenPrice?: string | number;
  tokenContractAddress?: string;
  chainIndex?: string;
  isRiskToken?: boolean;
}

interface Balance {
  tokenAssets?: TokenAsset[];
}

interface Action {
  agentAddress?: string;
  actionType?: string;
  details?: string;
  timestamp?: number;
}

interface XLayerTx {
  txId?: string;
  blockHash?: string;
  height?: string;
  transactionTime?: string;
  from?: string;
  to?: string;
  isFromContract?: boolean;
  isToContract?: boolean;
  amount?: string;
  transactionSymbol?: string;
  txFee?: string;
  state?: string;
  tokenContractAddress?: string;
  methodId?: string;
}

interface KlinePoint {
  time: string;
  price: number;
}

const AGENTIC_WALLET = import.meta.env.VITE_AGENTIC_WALLET || "0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0";
const OKB_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export function MonitorPanel() {
  const { get, post } = useApi();
  const { address: connectedWallet } = useWallet();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [kline, setKline] = useState<KlinePoint[]>([]);
  const [totalValue, setTotalValue] = useState("—");
  const [tab, setTab] = useState<"balance" | "chart" | "actions">("balance");
  const [txs, setTxs] = useState<XLayerTx[]>([]);
  const [agentDecision, setAgentDecision] = useState<{ action: string; symbol?: string; score?: number; reason: string; txHash?: string; timestamp: number } | null>(null);
  const [agentPaused, setAgentPaused] = useState(false);

  const loadBalances = useCallback(async () => {
    const wallet = connectedWallet || AGENTIC_WALLET;
    const r = await get<{ data: Balance[] }>(`/wallet/balance/${wallet}?chain=xlayer`);
    if (r?.data && Array.isArray(r.data)) {
      const assets: TokenAsset[] = r.data.flatMap((d) => d.tokenAssets || []);
      setBalances(assets.slice(0, 8) as unknown as Balance[]);
      const total = assets.reduce(
        (s, b) => s + Number(b.balance || 0) * Number(b.tokenPrice || 0),
        0
      );
      setTotalValue(`$${total.toFixed(2)}`);
    } else {
      setBalances([]);
      setTotalValue("$0.00");
    }
  }, [get, connectedWallet]);

  const loadKline = useCallback(async () => {
    const r = await get<{ data: unknown[] }>(
      `/market/kline/${OKB_ADDRESS}?chain=xlayer&bar=1H&limit=24`
    );
    if (r?.data && Array.isArray(r.data)) {
      // OKX candle format: [timestamp, open, high, low, close, vol, volCcy, confirm]
      const points = r.data
        .map((d) => {
          const arr = d as string[];
          return {
            time: new Date(Number(arr[0])).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            price: Number(arr[4] || 0), // close price at index 4
          };
        })
        .filter((p) => p.price > 0)
        .reverse(); // oldest → newest for chart
      if (points.length > 0) setKline(points);
    }
  }, [get]);

  const [actionCount, setActionCount] = useState<number | null>(null);

  const loadActions = useCallback(async () => {
    const wallet = connectedWallet || AGENTIC_WALLET;
    // Fetch tx count from RPC
    try {
      const provider = new ethers.JsonRpcProvider("https://rpc.xlayer.tech");
      const count = await provider.getTransactionCount(ethers.getAddress(wallet));
      setActionCount(count);
    } catch (e) { console.warn("[actions] rpc error:", e); }
    // Fetch real transaction history from OKLink X Layer API
    try {
      const r = await get<{ data: XLayerTx[] }>(`/txs/${wallet}?limit=20`);
      if (r?.data && Array.isArray(r.data)) setTxs(r.data);
    } catch (e) { console.warn("[txs] error:", e); }
  }, [get, connectedWallet]);

  const loadDecision = useCallback(async () => {
    const r = await get<{ data: typeof agentDecision; paused: boolean }>("/agent/decision");
    if (r?.data) setAgentDecision(r.data);
    if (typeof r?.paused === "boolean") setAgentPaused(r.paused);
  }, [get]);

  const toggleAgent = async () => {
    const adminKey = import.meta.env.VITE_ADMIN_KEY;
    if (!adminKey) { alert("VITE_ADMIN_KEY not configured"); return; }
    if (agentPaused) {
      await post("/agent/resume", { adminKey });
      setAgentPaused(false);
    } else {
      await post("/agent/pause", { adminKey });
      setAgentPaused(true);
    }
  };

  useEffect(() => {
    loadBalances();
    loadKline();
    loadActions();
    loadDecision();
    const interval = setInterval(() => { loadBalances(); loadActions(); loadDecision(); }, 30000);
    return () => clearInterval(interval);
  }, [loadBalances, loadKline, loadActions, loadDecision, connectedWallet]);

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <span className="panel-title">◉ Monitor</span>
        <button
          onClick={toggleAgent}
          className={`text-xs font-mono px-2 py-0.5 rounded border ${agentPaused ? "border-terminal-green text-terminal-green hover:bg-terminal-green hover:bg-opacity-10" : "border-terminal-red text-terminal-red hover:bg-terminal-red hover:bg-opacity-10"}`}
        >
          {agentPaused ? "▶ RESUME" : "⏸ PAUSE"}
        </button>
        <div className="flex gap-1">
          {(["balance", "chart", "actions"] as const).map((t) => (
            <button
              key={t}
              className={`text-xs font-mono px-2 py-0.5 rounded ${tab === t ? "bg-terminal-green text-terminal-bg" : "text-terminal-muted hover:text-terminal-green"}`}
              onClick={() => setTab(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body">
        {/* Agent brain status */}
        {(agentDecision || agentPaused) && (
          <div className={`border rounded p-2 mb-2 text-xs font-mono space-y-0.5 ${agentPaused ? "border-terminal-red bg-terminal-red bg-opacity-5" : agentDecision?.action === "BUY" ? "border-terminal-green bg-terminal-green bg-opacity-5" : "border-terminal-border bg-terminal-bg"}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold ${agentPaused ? "text-terminal-red" : agentDecision?.action === "BUY" ? "text-terminal-green" : agentDecision?.action === "HOLD" ? "text-terminal-yellow" : "text-terminal-muted"}`}>
                🤖 AGENT · {agentPaused ? "PAUSED" : `${agentDecision?.action}${agentDecision?.symbol ? ` ${agentDecision.symbol}` : ""}`}
              </span>
              <span className="text-terminal-muted">{agentDecision ? new Date(agentDecision.timestamp).toLocaleTimeString() : ""}</span>
            </div>
            {agentDecision?.score !== undefined && (
              <span className="text-terminal-cyan">score: {agentDecision.score.toFixed(1)}</span>
            )}
            {agentDecision && <p className="text-terminal-muted truncate">{agentDecision.reason}</p>}
            {agentDecision?.txHash && (
              <a href={`https://www.oklink.com/xlayer/tx/${agentDecision.txHash}`} target="_blank" rel="noopener noreferrer" className="text-terminal-cyan hover:underline truncate block">
                tx: {agentDecision.txHash.slice(0, 20)}...
              </a>
            )}
          </div>
        )}

        {tab === "balance" && (
          <div className="space-y-2">
            <div className="border border-terminal-green border-opacity-30 rounded p-2 bg-terminal-green bg-opacity-5">
              <p className="data-label">TOTAL VALUE</p>
              <p className="text-xl font-mono font-bold text-terminal-green mt-1">{totalValue}</p>
              <p className="text-xs font-mono text-terminal-muted mt-0.5">
                {connectedWallet
                  ? `${connectedWallet.slice(0, 10)}...${connectedWallet.slice(-6)}`
                  : "Connect wallet to load balance"}
              </p>
            </div>
            <div className="space-y-1">
              {balances.length === 0 && (
                <p className="text-xs text-terminal-muted font-mono text-center py-2">No tokens found on X Layer</p>
              )}
              {(balances as unknown as TokenAsset[]).map((b, i) => (
                <div key={i} className="data-row">
                  <span className="text-xs font-mono text-terminal-cyan">{b.symbol || "?"}</span>
                  <span className="data-value">{Number(b.balance || 0).toFixed(4)}</span>
                  <span className="text-xs font-mono text-terminal-green">
                    ${(Number(b.balance || 0) * Number((b as unknown as TokenAsset).tokenPrice || 0)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "chart" && (
          <div className="h-full min-h-[200px]">
            <p className="data-label mb-2">OKB PRICE · 24H</p>
            {kline.length === 0 ? (
              <p className="text-xs text-terminal-muted font-mono">Loading chart...</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={kline}>
                  <XAxis dataKey="time" tick={{ fill: "#4a4a6a", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#4a4a6a", fontSize: 10, fontFamily: "monospace" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} width={50} />
                  <Tooltip
                    contentStyle={{ background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: "4px", fontSize: "11px", fontFamily: "monospace" }}
                    labelStyle={{ color: "#4a4a6a" }}
                    itemStyle={{ color: "#00ff9f" }}
                  />
                  <Line type="monotone" dataKey="price" stroke="#00ff9f" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {tab === "actions" && (
          <div className="space-y-1">
            <div className="border border-terminal-green border-opacity-30 rounded p-2 bg-terminal-green bg-opacity-5 mb-2">
              <p className="text-xs text-terminal-muted font-mono">TOTAL ON-CHAIN TXS · X LAYER</p>
              <p className="text-2xl font-mono font-bold text-terminal-green">
                {actionCount !== null ? actionCount.toLocaleString() : "—"}
              </p>
              <a
                href={`https://www.oklink.com/xlayer/address/${connectedWallet || AGENTIC_WALLET}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs font-mono text-terminal-cyan hover:underline"
              >
                View on OKLink →
              </a>
            </div>
            {txs.length === 0 && <p className="text-xs text-terminal-muted font-mono text-center py-2">Loading transactions...</p>}
            {txs.map((tx, i) => {
              const wallet = (connectedWallet || AGENTIC_WALLET).toLowerCase();
              const isSend = tx.from?.toLowerCase() === wallet;
              const ts = tx.transactionTime ? new Date(Number(tx.transactionTime)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
              const amount = tx.amount ? `${Number(tx.amount).toFixed(4)} ${tx.transactionSymbol || ""}` : "";
              const shortHash = tx.txId ? `${tx.txId.slice(0, 10)}...${tx.txId.slice(-6)}` : "—";
              return (
                <div key={i} className="border border-terminal-border rounded p-2 bg-terminal-bg space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-mono font-bold ${isSend ? "text-terminal-red" : "text-terminal-green"}`}>
                      {isSend ? "↑ SEND" : "↓ RECV"}
                      {tx.isToContract ? " · CONTRACT" : ""}
                    </span>
                    <span className="text-xs text-terminal-muted font-mono">{ts}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-terminal-cyan">{amount}</span>
                    <span className={`text-xs font-mono ${tx.state === "2" ? "text-terminal-green" : tx.state === "0" ? "text-terminal-yellow" : "text-terminal-red"}`}>
                      {tx.state === "2" ? "✓" : tx.state === "0" ? "pending" : "fail"}
                    </span>
                  </div>
                  <a
                    href={`https://www.oklink.com/xlayer/tx/${tx.txId}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-terminal-muted hover:text-terminal-cyan truncate block"
                  >
                    {shortHash}
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
