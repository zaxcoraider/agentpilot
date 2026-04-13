import { useState, useEffect } from "react";
import { useApi } from "../../hooks/useApi";
import { useWallet } from "../../context/WalletContext";

interface Product {
  investmentId?: number;
  name?: string;
  rate?: string | number;   // APY as decimal e.g. "0.193" = 19.3%
  tvl?: string | number;
  platformName?: string;
  chainIndex?: string;
}

export function EarnPanel() {
  const { get, post, loading } = useApi();
  const { address, openModal } = useWallet();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [amount, setAmount] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [txHash, setTxHash] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadProducts = async () => {
    setError("");
    const r = await get<{ list?: Product[]; data?: { list?: Product[] } | Product[] }>("/defi/products");
    // API returns { ok, data: { list: [...] } }
    const inner = r?.data;
    const list: Product[] = Array.isArray(inner)
      ? inner
      : (inner as { list?: Product[] })?.list || r?.list || [];
    if (Array.isArray(list) && list.length > 0) {
      setProducts(list.slice(0, 8));
      setLoaded(true);
    } else {
      setError("No DeFi products found");
      setLoaded(true);
    }
  };

  // Auto-load on mount
  useEffect(() => { loadProducts(); }, []);

  const invest = async () => {
    if (!selected?.investmentId || !amount || !tokenAddress) {
      setError("Enter amount and token address to deposit.");
      return;
    }
    if (!address) { openModal(); return; }
    if (!window.ethereum) { setError("No wallet detected"); return; }
    setError("");

    // 1. Get unsigned invest tx calldata from backend (onchainos defi invest)
    const r = await post<{ data: Array<{ transactions?: Array<Record<string, string>>; txData?: Record<string, string>; [key: string]: unknown }> | { transactions?: Array<Record<string, string>>; [key: string]: unknown } }>(
      "/defi/invest",
      { investmentId: String(selected.investmentId), amount, tokenAddress, chain: "xlayer", walletAddress: address }
    );

    if (!r?.data) { setError("Failed to build invest tx. Check product/token address."); return; }

    // onchainos defi invest may return array of transactions (approve + deposit)
    const result = Array.isArray(r.data) ? r.data[0] : r.data;
    const txList: Array<Record<string, string>> = result?.transactions || (result ? [result as Record<string, string>] : []);

    if (txList.length === 0) { setError("No transaction data returned from DeFi protocol."); return; }

    // 2. Sign each tx (approve + deposit) sequentially via MetaMask
    try {
      let lastHash = "";
      for (const tx of txList) {
        const rawValue = tx.value || "0";
        const txParams: Record<string, string> = {
          from: address,
          to: tx.to || tx.contractAddress || "",
          data: tx.data || tx.calldata || "0x",
          value: rawValue.startsWith("0x") ? rawValue : "0x" + BigInt(rawValue).toString(16),
        };
        if (tx.gas || tx.gasLimit) {
          const g = tx.gas || tx.gasLimit;
          txParams.gas = g.startsWith?.("0x") ? g : "0x" + BigInt(g).toString(16);
        }
        lastHash = await window.ethereum.request({ method: "eth_sendTransaction", params: [txParams] }) as string;
      }
      setTxHash(lastHash);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Transaction failed: ${msg.slice(0, 120)}`);
    }
  };

  const formatAPY = (rate?: string | number) => {
    const n = Number(rate || 0) * 100;
    return n > 0 ? `${n.toFixed(2)}%` : "—";
  };

  const getAPYColor = (rate?: string | number) => {
    const n = Number(rate || 0) * 100;
    if (n > 15) return "text-terminal-green";
    if (n > 5) return "text-terminal-cyan";
    return "text-terminal-text";
  };

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <span className="panel-title">◎ Earn</span>
        <span className="badge-green">TOP YIELDS</span>
      </div>
      <div className="panel-body space-y-2">

        {!loaded && loading && (
          <p className="text-xs text-terminal-muted font-mono">Loading DeFi products...</p>
        )}

        {error && (
          <p className="text-xs text-terminal-red font-mono">{error}</p>
        )}

        <div className="space-y-1">
          {products.map((p, i) => (
            <button
              key={i}
              className={`w-full text-left border rounded p-2 transition-colors ${
                selected?.investmentId === p.investmentId
                  ? "border-terminal-green bg-terminal-green bg-opacity-5"
                  : "border-terminal-border hover:border-terminal-muted"
              }`}
              onClick={() => setSelected(p)}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-terminal-cyan">
                  {p.name || `Product ${i + 1}`}
                </span>
                <span className={`text-xs font-mono font-bold ${getAPYColor(p.rate)}`}>
                  {formatAPY(p.rate)} APY
                </span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-terminal-muted font-mono">{p.platformName || "DeFi"}</span>
                <span className="text-xs text-terminal-muted font-mono">
                  TVL ${Number(p.tvl || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="border border-terminal-green border-opacity-30 rounded p-2 space-y-2 bg-terminal-green bg-opacity-5">
            <p className="text-xs font-mono text-terminal-green">
              SELECTED: {selected.name} · {formatAPY(selected.rate)} APY · {selected.platformName}
            </p>
            <div className="data-row">
              <span className="data-label">TVL</span>
              <span className="data-value">${Number(selected.tvl || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="data-row">
              <span className="data-label">APY</span>
              <span className="text-xs font-mono text-terminal-green font-bold">{formatAPY(selected.rate)}</span>
            </div>
            <input
              className="input-field w-full"
              placeholder="Amount to deposit (e.g. 10)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <input
              className="input-field w-full"
              placeholder="Token address (e.g. 0x... or native)"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
            />
            <button className="btn-primary w-full" onClick={invest} disabled={loading || !amount || !tokenAddress}>
              {loading ? "PROCESSING..." : "DEPOSIT VIA ONCHAINOS"}
            </button>
            {txHash && (
              <p className="text-xs font-mono text-terminal-green break-all">TX: {txHash}</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
