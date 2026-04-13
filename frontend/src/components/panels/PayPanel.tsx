import { useState, useEffect } from "react";
import { useApi } from "../../hooks/useApi";

interface PaymentHistory {
  endpoint: string;
  amount: string;
  time: number;
  status: "success" | "failed";
}

interface PayStats {
  totalCalls: number;
  autoPayCount: number;
  totalSpentOKB: string;
  successRate: string;
}

export function PayPanel() {
  const { get, post, loading } = useApi();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [txHash, setTxHash] = useState("");
  const [stats, setStats] = useState<PayStats | null>(null);
  const [history, setHistory] = useState<PaymentHistory[]>([]);

  useEffect(() => {
    get<{ data: PayStats }>("/pay/stats").then((r) => {
      if (r?.data) setStats(r.data);
    });
  }, [get]);

  const sendPayment = async () => {
    if (!to || !amount) return;
    const r = await post<{ data: { txHash?: string } }>("/pay/x402", { to, amount, memo });
    if (r?.data?.txHash) {
      setTxHash(r.data.txHash);
      setHistory((prev) => [
        { endpoint: `Transfer → ${to.slice(0, 8)}...`, amount: `${amount} OKB`, time: Date.now(), status: "success" },
        ...prev.slice(0, 9),
      ]);
    }
  };

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <span className="panel-title">⚡ Pay</span>
        <span className="badge-cyan">x402/v1</span>
      </div>
      <div className="panel-body space-y-2">

        {/* Agent Auto-Pay Stats */}
        <div className="border border-terminal-cyan border-opacity-30 rounded p-2 bg-terminal-cyan bg-opacity-5">
          <p className="data-label mb-1">AGENT AUTO-PAY · x402</p>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <p className="text-xs text-terminal-muted font-mono">Auto-payments</p>
              <p className="text-sm font-mono font-bold text-terminal-cyan">{stats?.autoPayCount ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-terminal-muted font-mono">Total spent</p>
              <p className="text-sm font-mono font-bold text-terminal-cyan">${(stats as unknown as { totalSpentUSDT?: string })?.totalSpentUSDT ?? stats?.totalSpentOKB ?? "—"} USDT</p>
            </div>
            <div>
              <p className="text-xs text-terminal-muted font-mono">API calls</p>
              <p className="text-sm font-mono font-bold text-terminal-text">{stats?.totalCalls ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-terminal-muted font-mono">Network</p>
              <p className="text-sm font-mono font-bold text-terminal-green">X Layer</p>
            </div>
          </div>
          <p className="text-xs font-mono text-terminal-muted mt-1 opacity-70">
            Agent pays for its own intelligence — no human required
          </p>
        </div>

        {/* Gated endpoints */}
        <div className="border border-terminal-border rounded p-2 space-y-1">
          <p className="data-label mb-1">GATED ENDPOINTS</p>
          {[
            { name: "Smart Money Signals", price: "$0.001" },
            { name: "Token Risk Scan",     price: "$0.001" },
            { name: "DeFi Products",       price: "$0.001" },
            { name: "DeFi Invest",         price: "$0.001" },
          ].map((e, i) => (
            <div key={i} className="data-row">
              <span className="data-label">{e.name}</span>
              <span className="badge-cyan">{e.price} USDT</span>
            </div>
          ))}
        </div>

        {/* Send payment */}
        <div className="space-y-1.5">
          <p className="data-label">SEND OKB PAYMENT</p>
          <input className="input-field" placeholder="Recipient 0x..." value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="flex gap-1.5">
            <input className="input-field flex-1" placeholder="Amount (OKB)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className="input-field flex-1" placeholder="Memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
          <button className="btn-primary w-full" onClick={sendPayment} disabled={loading || !to || !amount}>
            {loading ? "SENDING..." : "SEND PAYMENT"}
          </button>
          {txHash && (
            <p className="text-xs font-mono text-terminal-green break-all">TX: {txHash}</p>
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <p className="data-label mb-1">HISTORY</p>
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="data-row">
                  <span className="data-label truncate max-w-[130px]">{h.endpoint}</span>
                  <span className="text-xs font-mono text-terminal-cyan">{h.amount}</span>
                  <span className={`status-dot ${h.status === "success" ? "bg-terminal-green" : "bg-terminal-red"}`} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
