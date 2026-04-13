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

interface KlinePoint {
  time: string;
  price: number;
}

const AGENTIC_WALLET = import.meta.env.VITE_AGENTIC_WALLET || "0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0";
const OKB_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export function MonitorPanel() {
  const { get } = useApi();
  const { address: connectedWallet } = useWallet();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [kline, setKline] = useState<KlinePoint[]>([]);
  const [totalValue, setTotalValue] = useState("—");
  const [tab, setTab] = useState<"balance" | "chart" | "actions">("balance");

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
    const r = await get<{ data: Array<{ ts?: number; c?: string | number }> }>(
      `/market/kline/${OKB_ADDRESS}?chain=xlayer&bar=1H&limit=24`
    );
    if (r?.data && Array.isArray(r.data)) {
      setKline(
        r.data.map((d) => ({
          time: new Date(Number(d.ts || 0)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          price: Number(d.c || 0),
        }))
      );
    }
  }, [get]);

  const loadActions = useCallback(async () => {
    if (!window.ethereum) return;
    // Use connected wallet if available, else fall back to agentic wallet
    const target = connectedWallet || AGENTIC_WALLET;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, REGISTRY_ABI, provider);
      const raw = await contract.getRecentActions(target, 10);
      setActions(
        raw.map((a: Action) => ({
          agentAddress: String(a.agentAddress || ""),
          actionType: String(a.actionType || ""),
          details: String(a.details || ""),
          timestamp: Number(a.timestamp || 0),
        }))
      );
    } catch { /* no wallet connected */ }
  }, [connectedWallet]);

  useEffect(() => {
    loadBalances();
    loadKline();
    loadActions();
    const interval = setInterval(() => { loadBalances(); loadActions(); }, 30000);
    return () => clearInterval(interval);
  }, [loadBalances, loadKline, loadActions, connectedWallet]);

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <span className="panel-title">◉ Monitor</span>
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
            <p className="data-label mb-1">RECENT ACTIONS · ON-CHAIN</p>
            {actions.length === 0 && (
              <p className="text-xs text-terminal-muted font-mono">
                {connectedWallet
                  ? `No on-chain actions for ${connectedWallet.slice(0, 8)}...`
                  : "Connect wallet to load on-chain actions"}
              </p>
            )}
            {actions.map((a, i) => (
              <div key={i} className="border border-terminal-border rounded p-2 bg-terminal-bg space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className={`badge-${a.actionType === "swap" ? "cyan" : a.actionType === "invest" ? "green" : "cyan"}`}>
                    {a.actionType?.toUpperCase()}
                  </span>
                  <span className="text-xs text-terminal-muted font-mono">
                    {a.timestamp ? new Date(a.timestamp * 1000).toLocaleTimeString() : "—"}
                  </span>
                </div>
                <p className="text-xs font-mono text-terminal-muted truncate">{a.details}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
