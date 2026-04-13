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
  holders?: string | number;
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
  };
}

/** Normalize whatever onchainos returns into our Token shape */
function normalizeTokens(raw: unknown): Token[] {
  if (!raw) return [];
  // data may be at root or nested under .data
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
  }));
}

export function DiscoverPanel() {
  const { get, loading, error } = useApi();
  const { setSelectedToken } = useSelectedToken();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Token[]>([]);
  const [trending, setTrending] = useState<Token[]>([]);
  const [trendingError, setTrendingError] = useState("");
  const [trendingTimeFrame, setTrendingTimeFrame] = useState("4");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalStatus, setSignalStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [signalChain, setSignalChain] = useState("ethereum");

  const SIGNAL_CHAINS = [
    { id: "xlayer",   label: "X Layer" },
    { id: "ethereum", label: "ETH" },
    { id: "solana",   label: "SOL" },
    { id: "bsc",      label: "BNB" },
    { id: "base",     label: "BASE" },
  ];

  const loadTrending = (tf = trendingTimeFrame) => {
    setTrendingError("");
    setTrending([]);
    get<unknown>(`/token/trending?chain=xlayer&timeFrame=${tf}`).then((r) => {
      const tokens = normalizeTokens(r);
      if (tokens.length > 0) {
        setTrending(tokens.slice(0, 8));
      } else {
        setTrendingError("No trending tokens found on X Layer");
      }
    });
  };

  useEffect(() => {
    loadTrending();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    const r = await get<unknown>(`/token/search?query=${encodeURIComponent(query)}&chain=xlayer`);
    const tokens = normalizeTokens(r);
    setResults(tokens.slice(0, 6));
  };

  const loadSignals = async (chain = signalChain) => {
    setSignalStatus("loading");
    setSignals([]);
    const r = await get<Signal[] | { data?: Signal[] }>(`/signal/smart-money?chain=${chain}`);
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
            placeholder="Search token name, symbol, address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className="btn-primary" onClick={search} disabled={loading}>
            {loading ? "..." : "GO"}
          </button>
        </div>

        {/* Search error */}
        {error && !loading && (
          <p className="text-xs font-mono text-terminal-red">Error: {error}</p>
        )}

        {/* Search Results */}
        {results.length > 0 && (
          <div className="space-y-1">
            <p className="data-label">RESULTS</p>
            {results.map((t, i) => (
              <div key={i} className="data-row">
                <span className="text-xs font-mono text-terminal-cyan">{t.tokenSymbol || "—"}</span>
                <span className="data-label truncate max-w-[120px]">
                  {t.tokenName || (t.tokenContractAddress ? t.tokenContractAddress.slice(0, 10) + "..." : "—")}
                </span>
                <span className="text-xs font-mono text-terminal-green">
                  ${Number(t.price || 0).toFixed(4)}
                </span>
                <span className={`text-xs font-mono ${Number(t.change) >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>
                  {Number(t.change) >= 0 ? "+" : ""}{Number(t.change || 0).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Trending */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="data-label">HOT TOKENS · X LAYER</p>
            <div className="flex items-center gap-1">
              {[{ id: "1", label: "5M" }, { id: "2", label: "1H" }, { id: "3", label: "4H" }, { id: "4", label: "24H" }].map((tf) => (
                <button
                  key={tf.id}
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${trendingTimeFrame === tf.id ? "bg-terminal-green text-terminal-bg" : "text-terminal-muted hover:text-terminal-green"}`}
                  onClick={() => { setTrendingTimeFrame(tf.id); loadTrending(tf.id); }}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {trending.length === 0 && !trendingError && (
              <p className="text-xs text-terminal-muted font-mono">Loading...</p>
            )}
            {trendingError && (
              <p className="text-xs text-terminal-muted font-mono">{trendingError}</p>
            )}
            {trending.map((t, i) => (
              <div
                key={i}
                className="data-row cursor-pointer hover:bg-terminal-green hover:bg-opacity-5 rounded px-1 transition-colors"
                onClick={() => {
                  if (t.tokenContractAddress) {
                    setSelectedToken({
                      address: t.tokenContractAddress,
                      symbol: t.tokenSymbol || "?",
                      name: t.tokenName || "",
                      price: Number(t.price || 0),
                    });
                  }
                }}
                title={t.tokenContractAddress ? `Select ${t.tokenSymbol} — pre-fills Trade & Protect panels` : ""}
              >
                <span className="text-terminal-muted font-mono text-xs w-4">{i + 1}</span>
                <span className="text-xs font-mono text-terminal-cyan flex-1 ml-2">{t.tokenSymbol || "?"}</span>
                <span className="text-xs font-mono text-terminal-muted flex-1 truncate">{t.tokenName || ""}</span>
                <span className={`text-xs font-mono ${Number(t.change) >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>
                  {Number(t.change) >= 0 ? "+" : ""}{Number(t.change || 0).toFixed(2)}%
                </span>
                <span className="text-xs text-terminal-muted opacity-40">→</span>
              </div>
            ))}
          </div>
        </div>

        {/* Smart Money */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="data-label">SMART MONEY · {signalChain.toUpperCase()}</p>
            <div className="flex items-center gap-1">
              {SIGNAL_CHAINS.map((c) => (
                <button
                  key={c.id}
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${signalChain === c.id ? "bg-terminal-cyan text-terminal-bg" : "text-terminal-muted hover:text-terminal-cyan"}`}
                  onClick={() => {
                    setSignalChain(c.id);
                    loadSignals(c.id);
                  }}
                  disabled={signalStatus === "loading"}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {signalStatus === "idle" && (
            <p className="text-xs text-terminal-muted font-mono">Select a chain to load whale activity</p>
          )}
          {signalStatus === "error" && (
            <p className="text-xs text-terminal-red font-mono">No signal data returned for X Layer</p>
          )}
          {signalStatus === "done" && signals.length === 0 && (
            <p className="text-xs text-terminal-muted font-mono">No signals found</p>
          )}
          {signals.map((s, i) => {
            const sold = Number(s.soldRatioPercent || 0);
            const wallet = s.triggerWalletAddress?.split(",")[0] || "";
            const explorerBase = signalChain === "xlayer"
              ? "https://www.oklink.com/xlayer/address"
              : signalChain === "solana"
                ? "https://solscan.io/account"
                : `https://www.oklink.com/${signalChain}/address`;
            const explorerUrl = wallet ? `${explorerBase}/${wallet}` : null;

            return (
              <div key={i} className="data-row">
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-terminal-cyan hover:underline hover:text-terminal-green transition-colors"
                    title={wallet}
                  >
                    {wallet.slice(0, 6)}...{wallet.slice(-4)}
                  </a>
                ) : (
                  <span className="text-xs font-mono text-terminal-muted">—</span>
                )}
                <span className="text-xs font-mono text-terminal-cyan font-bold">
                  {s.token?.symbol || "?"}
                </span>
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
