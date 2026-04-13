import { useState } from "react";
import { useApi } from "../../hooks/useApi";

interface RiskData {
  riskControlLevel?: string;   // "1"=low "2"=medium "3"=high
  top10HoldPercent?: string | number;
  lpBurnedPercent?: string | number;
  bundleHoldingPercent?: string | number;
  tokenTags?: string[];
  tokenContractAddress?: string;
}

interface Approval {
  spender?: string;
  allowance?: string;
  token?: string;
  tokenSymbol?: string;
  tokenContractAddress?: string;
}

function getRiskLabel(level?: string) {
  if (level === "1") return { label: "LOW", color: "text-terminal-green" };
  if (level === "2") return { label: "MEDIUM", color: "text-terminal-yellow" };
  if (level === "3") return { label: "HIGH", color: "text-terminal-red" };
  return { label: "UNKNOWN", color: "text-terminal-muted" };
}

function getScore(level?: string) {
  if (level === "1") return 85;
  if (level === "2") return 52;
  if (level === "3") return 20;
  return 0;
}

function pct(val?: string | number) {
  const n = Number(val || 0);
  return isNaN(n) ? "—" : `${n.toFixed(2)}%`;
}

export function ProtectPanel() {
  const { get, loading } = useApi();
  const [tokenAddress, setTokenAddress] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [tab, setTab] = useState<"risk" | "approvals">("risk");
  const [error, setError] = useState("");

  const scanRisk = async () => {
    const addr = tokenAddress.trim();
    if (!addr) return;
    setError("");
    setRisk(null);
    const r = await get<{ data: RiskData }>(`/security/token-risk/${addr}?chain=xlayer`);
    if (r?.data) {
      setRisk(r.data);
    } else {
      setError("No risk data returned. Check token address.");
    }
  };

  const checkApprovals = async () => {
    const wallet = walletAddress.trim();
    const token = tokenAddress.trim();
    if (!wallet || !token) {
      setError("Enter both wallet address and token address.");
      return;
    }
    setError("");
    const r = await get<{ data: Approval[] }>(
      `/security/approval/${wallet}?chain=xlayer&token=${token}`
    );
    if (r?.data && Array.isArray(r.data)) {
      setApprovals(r.data);
    } else {
      setApprovals([]);
      setError("No approval data returned.");
    }
  };

  const score = getScore(risk?.riskControlLevel);
  const { label: riskLabel, color: riskColor } = getRiskLabel(risk?.riskControlLevel);
  const strokeColor = score > 70 ? "#00ff9f" : score > 40 ? "#ffd700" : "#ff4466";

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <span className="panel-title">⚿ Protect</span>
        <div className="flex gap-1">
          <button
            className={`text-xs font-mono px-2 py-0.5 rounded ${tab === "risk" ? "bg-terminal-green text-terminal-bg" : "text-terminal-muted hover:text-terminal-green"}`}
            onClick={() => setTab("risk")}
          >RISK</button>
          <button
            className={`text-xs font-mono px-2 py-0.5 rounded ${tab === "approvals" ? "bg-terminal-cyan text-terminal-bg" : "text-terminal-muted hover:text-terminal-cyan"}`}
            onClick={() => setTab("approvals")}
          >APPROVALS</button>
        </div>
      </div>

      <div className="panel-body space-y-3">
        {/* Token address — shared */}
        <div className="flex gap-2">
          <input
            className="input-field flex-1"
            placeholder="Token contract address..."
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (tab === "risk" ? scanRisk() : checkApprovals())}
          />
          <button
            className="btn-primary"
            onClick={tab === "risk" ? scanRisk : checkApprovals}
            disabled={loading}
          >
            {loading ? "..." : "SCAN"}
          </button>
        </div>

        {/* Wallet address — approvals tab only */}
        {tab === "approvals" && (
          <input
            className="input-field w-full"
            placeholder="Your wallet address (for approval check)..."
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
          />
        )}

        {error && (
          <p className="text-xs font-mono text-terminal-red">{error}</p>
        )}

        {/* RISK TAB */}
        {tab === "risk" && (
          <>
            {!risk && !loading && (
              <div className="border border-terminal-border rounded p-3 text-center">
                <p className="text-xs text-terminal-muted font-mono">Paste a token address to scan for risks</p>
                <p className="text-xs text-terminal-muted font-mono mt-1 opacity-60">$0.001 USDT via x402</p>
              </div>
            )}
            {risk && (
              <div className="space-y-3">
                {/* Score ring */}
                <div className="flex items-center gap-4 border border-terminal-border rounded p-3 bg-terminal-bg">
                  <div className="relative w-16 h-16 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="#1a1a2e" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15" fill="none"
                        stroke={strokeColor}
                        strokeWidth="3"
                        strokeDasharray={`${(score / 100) * 94} 94`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-mono font-bold text-terminal-text">
                      {score}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-mono text-terminal-muted">SAFETY SCORE</p>
                    <p className={`text-sm font-mono font-bold ${riskColor}`}>
                      {riskLabel} RISK
                    </p>
                  </div>
                </div>

                {/* Metrics */}
                <div className="space-y-1">
                  <div className="data-row">
                    <span className="data-label">Top 10 Holders</span>
                    <span className="data-value">{pct(risk.top10HoldPercent)}</span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">LP Burned</span>
                    <span className={`text-xs font-mono ${Number(risk.lpBurnedPercent || 0) > 50 ? "text-terminal-green" : "text-terminal-red"}`}>
                      {pct(risk.lpBurnedPercent)}
                    </span>
                  </div>
                  <div className="data-row">
                    <span className="data-label">Bundle Holding</span>
                    <span className={`text-xs font-mono ${Number(risk.bundleHoldingPercent || 0) < 5 ? "text-terminal-green" : "text-terminal-yellow"}`}>
                      {pct(risk.bundleHoldingPercent)}
                    </span>
                  </div>
                </div>

                {/* Tags */}
                {risk.tokenTags && risk.tokenTags.length > 0 && (
                  <div>
                    <p className="data-label mb-1">TOKEN TAGS</p>
                    <div className="flex flex-wrap gap-1">
                      {risk.tokenTags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-xs font-mono px-2 py-0.5 rounded border border-terminal-green border-opacity-40 text-terminal-green bg-terminal-green bg-opacity-10"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* APPROVALS TAB */}
        {tab === "approvals" && (
          <div className="space-y-2">
            {approvals.length === 0 && !loading && (
              <p className="text-xs text-terminal-muted font-mono text-center py-4">
                Enter token + wallet address then SCAN
              </p>
            )}
            {approvals.map((a, i) => (
              <div key={i} className="border border-terminal-border rounded p-2 space-y-1 bg-terminal-bg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-terminal-cyan">
                    {a.tokenSymbol || a.token || "Unknown Token"}
                  </span>
                </div>
                <p className="text-xs font-mono text-terminal-muted">
                  Spender: {a.spender ? `${a.spender.slice(0, 16)}...` : "—"}
                </p>
                <p className="text-xs font-mono text-terminal-red">
                  Allowance: {a.allowance === "unlimited" ? "∞ Unlimited" : (a.allowance || "—")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
