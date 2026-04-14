import { useState, useEffect } from "react";
import { useApi } from "../../hooks/useApi";
import { useSelectedToken } from "../../context/SelectedTokenContext";

interface Token {
  tokenSymbol?: string;
  tokenName?: string;
  tokenContractAddress?: string;
  price?: string | number;
  change?: string | number;
  marketCap?: string | number;
  volume?: string | number;
  holders?: string | number;
  liquidity?: string | number;
  logoUrl?: string;
  riskLevel?: string;
}

interface Signal {
  triggerWalletAddress?: string;
  walletType?: string;
  amountUsd?: string | number;
  soldRatioPercent?: string | number;
  token?: {
    symbol?: string;
    name?: string;
    marketCapUsd?: string | number;
    tokenAddress?: string;
  };
}

function normalizeTokens(raw: unknown): Token[] {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : [];
  return (list as Record<string, unknown>[]).map((t) => ({
    tokenSymbol: String(t.tokenSymbol || t.symbol || ""),
    tokenName: String(t.tokenName || t.name || ""),
    tokenContractAddress: String(t.tokenContractAddress || t.address || ""),
    price: Number(t.price ?? t.tokenPrice ?? 0),
    change: Number(t.change ?? t.change24h ?? t.priceChange24h ?? 0),
    marketCap: Number(t.marketCap ?? t.marketCapUsd ?? 0),
    volume: Number(t.volume ?? t.volume24h ?? 0),
    holders: Number(t.holders ?? 0),
    liquidity: Number(t.liquidity ?? 0),
    logoUrl: String(t.tokenLogoUrl || t.logoUrl || ""),
    riskLevel: String(t.riskLevelControl ?? t.riskControlLevel ?? ""),
  }));
}

function fmtNum(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const TRENDING_CHAINS = [
  { id: "xlayer",   label: "X Layer" },
  { id: "ethereum", label: "ETH" },
  { id: "solana",   label: "SOL" },
  { id: "bsc",      label: "BNB" },
  { id: "base",     label: "BASE" },
];

const SIGNAL_CHAINS = [
  { id: "ethereum", label: "ETH" },
  { id: "solana",   label: "SOL" },
  { id: "bsc",      label: "BNB" },
  { id: "base",     label: "BASE" },
];

export function DiscoverPanel() {
  const { get, loading, error } = useApi();
  const { setSelectedToken } = useSelectedToken();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Token[]>([]);

  const [trending, setTrending] = useState<Token[]>([]);
  const [trendingChain, setTrendingChain] = useState("xlayer");
  const [trendingTimeFrame, setTrendingTimeFrame] = useState("4");
  const [trendingStatus, setTrendingStatus] = useState<"loading" | "done" | "error">("loading");

  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalStatus, setSignalStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [signalChain, setSignalChain] = useState("ethereum");

  const loadTrending = (chain = trendingChain, tf = trendingTimeFrame) => {
    setTrendingStatus("loading");
    setTrending([]);
    get<unknown>(`/token/trending?chain=${chain}&timeFrame=${tf}`).then((r) => {
      const tokens = normalizeTokens(r);
      if (tokens.length > 0) {
        setTrending(tokens.slice(0, 8));
        setTrendingStatus("done");
      } else {
        setTrendingStatus("error");
      }
    });
  };

  const loadSignals = async (chain = signalChain) => {
    setSignalStatus("loading");
    setSignals([]);
    const r = await get<Signal[] | { data?: Signal[] }>(`/signal/smart-money-agent?chain=${chain}`);
    const list: Signal[] = Array.isArray(r)
      ? r
      : Array.isArray((r as { data?: Signal[] })?.data)
        ? (r as { data: Signal[] }).data
        : [];
    if (list.length > 0) {
      setSignals(list.slice(0, 5));
      setSignalStatus("done");
    } else {
      setSignalStatus("error");
    }
  };

  useEffect(() => {
    loadTrending();
    loadSignals("ethereum");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    const r = await get<unknown>(`/token/search?query=${encodeURIComponent(query)}&chain=ethereum`);
    const tokens = normalizeTokens(r);
    setResults(tokens.slice(0, 6));
  };

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <span className="panel-title">◈ Discover</span>
        <span className="status-dot bg-terminal-green animate-pulse_slow" />
      </div>
      <div className="panel-body space-y-3">

        {/* Search */}
        <div className="flex gap-2">
          <input
            className="input-field flex-1"
            placeholder="Search token name, symbol or address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className="btn-primary" onClick={search} disabled={loading}>
            {loading ? "..." : "GO"}
          </button>
        </div>
        {error && !loading && (
          <p className="text-xs font-mono text-terminal-red">Error: {error}</p>
        )}

        {/* Search Results */}
        {results.length > 0 && (
          <div className="space-y-1">
            <p className="data-label">RESULTS</p>
            {results.map((t, i) => (
              <div
                key={i}
                className="data-row cursor-pointer hover:bg-terminal-green hover:bg-opacity-5 rounded px-1"
                onClick={() => t.tokenContractAddress && setSelectedToken({
                  address: t.tokenContractAddress,
                  symbol: t.tokenSymbol || "?",
                  name: t.tokenName || "",
                  price: Number(t.price || 0),
                })}
              >
                <span className="text-xs font-mono text-terminal-cyan w-14 truncate">{t.tokenSymbol || "—"}</span>
                <span className="text-xs font-mono text-terminal-green">${Number(t.price || 0).toFixed(4)}</span>
                <span className={`text-xs font-mono ${Number(t.change) >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>
                  {Number(t.change) >= 0 ? "+" : ""}{Number(t.change || 0).toFixed(2)}%
                </span>
                {t.marketCap ? <span className="text-xs text-terminal-muted font-mono">{fmtNum(Number(t.marketCap))}</span> : null}
              </div>
            ))}
          </div>
        )}

        {/* Trending */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <p className="data-label">HOT TOKENS</p>
              {TRENDING_CHAINS.map((c) => (
                <button
                  key={c.id}
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${trendingChain === c.id ? "bg-terminal-green text-terminal-bg" : "text-terminal-muted hover:text-terminal-green"}`}
                  onClick={() => { setTrendingChain(c.id); loadTrending(c.id, trendingTimeFrame); }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {[{ id: "1", label: "5M" }, { id: "2", label: "1H" }, { id: "3", label: "4H" }, { id: "4", label: "24H" }].map((tf) => (
                <button
                  key={tf.id}
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${trendingTimeFrame === tf.id ? "bg-terminal-cyan text-terminal-bg" : "text-terminal-muted hover:text-terminal-cyan"}`}
                  onClick={() => { setTrendingTimeFrame(tf.id); loadTrending(trendingChain, tf.id); }}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            {trendingStatus === "loading" && <p className="text-xs text-terminal-muted font-mono">Loading...</p>}
            {trendingStatus === "error" && <p className="text-xs text-terminal-muted font-mono">No data for this chain/timeframe</p>}
            {trending.map((t, i) => (
              <div
                key={i}
                className="data-row cursor-pointer hover:bg-terminal-green hover:bg-opacity-5 rounded px-1 transition-colors"
                onClick={() => t.tokenContractAddress && setSelectedToken({
                  address: t.tokenContractAddress,
                  symbol: t.tokenSymbol || "?",
                  name: t.tokenName || "",
                  price: Number(t.price || 0),
                })}
                title={t.tokenContractAddress ? `Select ${t.tokenSymbol}` : ""}
              >
                <span className="text-terminal-muted font-mono text-xs w-4">{i + 1}</span>
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt={t.tokenSymbol} className="w-4 h-4 rounded-full flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : null}
                <span className="text-xs font-mono text-terminal-cyan w-14 truncate">{t.tokenSymbol || "?"}</span>
                <span className="text-xs font-mono text-terminal-green w-20 truncate">${Number(t.price || 0).toFixed(4)}</span>
                <span className={`text-xs font-mono w-16 ${Number(t.change) >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>
                  {Number(t.change) >= 0 ? "+" : ""}{Number(t.change || 0).toFixed(1)}%
                </span>
                {Number(t.marketCap) > 0 && (
                  <span className="text-xs text-terminal-muted font-mono">{fmtNum(Number(t.marketCap))}</span>
                )}
                {t.riskLevel === "1" && <span className="text-xs text-terminal-green opacity-60">✓</span>}
                {t.riskLevel === "3" && <span className="text-xs text-terminal-red opacity-80">!</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Smart Money Signals */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="data-label">SMART MONEY · {signalChain.toUpperCase()}</p>
            <div className="flex items-center gap-1">
              {SIGNAL_CHAINS.map((c) => (
                <button
                  key={c.id}
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${signalChain === c.id ? "bg-terminal-cyan text-terminal-bg" : "text-terminal-muted hover:text-terminal-cyan"}`}
                  onClick={() => { setSignalChain(c.id); loadSignals(c.id); }}
                  disabled={signalStatus === "loading"}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {signalStatus === "idle" && <p className="text-xs text-terminal-muted font-mono">Loading...</p>}
          {signalStatus === "loading" && <p className="text-xs text-terminal-muted font-mono">Loading...</p>}
          {signalStatus === "error" && <p className="text-xs text-terminal-muted font-mono">No signals found</p>}

          {signals.map((s, i) => {
            const sold = Number(s.soldRatioPercent || 0);
            const wallets = s.triggerWalletAddress?.split(",") || [];
            const wallet = wallets[0] || "";
            const count = wallets.length;
            const explorerBase = signalChain === "solana"
              ? "https://solscan.io/account"
              : `https://www.oklink.com/${signalChain}/address`;
            const explorerUrl = wallet ? `${explorerBase}/${wallet}` : null;
            const tokenUrl = s.token?.tokenAddress
              ? `https://www.oklink.com/${signalChain}/token/${s.token.tokenAddress}`
              : null;

            return (
              <div key={i} className="data-row">
                {explorerUrl ? (
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-terminal-cyan hover:underline"
                    title={`${count} wallet${count > 1 ? "s" : ""}: ${s.triggerWalletAddress}`}>
                    {wallet.slice(0, 6)}...{wallet.slice(-4)}{count > 1 ? ` +${count - 1}` : ""}
                  </a>
                ) : <span className="text-xs font-mono text-terminal-muted">—</span>}

                {tokenUrl ? (
                  <a href={tokenUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-terminal-cyan font-bold hover:underline">
                    {s.token?.symbol || "?"}
                  </a>
                ) : <span className="text-xs font-mono text-terminal-cyan font-bold">{s.token?.symbol || "?"}</span>}

                <span className="text-xs font-mono text-terminal-green">
                  ${Number(s.amountUsd || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-xs font-mono ${sold > 50 ? "text-terminal-red" : "text-terminal-green"}`}>
                  {sold > 0 ? `${sold}% sold` : "holding"}
                </span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
