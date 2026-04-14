import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useApi } from "../../hooks/useApi";
import { useWallet } from "../../context/WalletContext";
import { useSelectedToken } from "../../context/SelectedTokenContext";
import { DCA_CONTRACT_ADDRESS, DCA_ABI, ARB_SEPOLIA_CHAIN_ID, XLAYER_CHAIN_ID } from "../../config";

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const AGENT_WALLET = import.meta.env.VITE_AGENTIC_WALLET || "0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0";

async function switchChain(chainId: number, chainName: string, symbol: string, rpc: string, explorer: string) {
  await window.ethereum!.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: `0x${chainId.toString(16)}` }],
  }).catch(async (err: { code?: number }) => {
    if (err.code === 4902) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}`, chainName, nativeCurrency: { name: symbol, symbol, decimals: 18 }, rpcUrls: [rpc], blockExplorerUrls: [explorer] }],
      });
    } else throw err;
  });
}

interface Quote {
  fromTokenAmount?: string;
  toTokenAmount?: string;
  estimateGasFee?: string;
  priceImpactPercent?: string;
  tradeFee?: string;
  toToken?: { decimal?: string; tokenSymbol?: string };
  fromToken?: { tokenSymbol?: string };
}

interface GasData {
  normal?: { gasPrice?: string };
  fast?: { gasPrice?: string };
  safeLow?: { gasPrice?: string };
}

export function TradePanel() {
  const { get, post, loading } = useApi();
  const { address, openModal } = useWallet();
  const { selectedToken } = useSelectedToken();

  const [from, setFrom] = useState(NATIVE);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [gasData, setGasData] = useState<GasData | null>(null);
  const [txHash, setTxHash] = useState("");
  const [swapError, setSwapError] = useState("");
  const [swapStatus, setSwapStatus] = useState("");
  const [agentBalance, setAgentBalance] = useState("...");
  const [tab, setTab] = useState<"swap" | "dca">("swap");
  const [dcaInterval, setDcaInterval] = useState("3600");
  const [dcaMsg, setDcaMsg] = useState("");
  const [dcaTxHash, setDcaTxHash] = useState("");

  // Pre-fill TO when token selected from Discover
  useEffect(() => {
    if (selectedToken?.address) {
      setTo(selectedToken.address);
      setQuote(null);
      setTxHash("");
      setSwapError("");
      setSwapStatus("");
    }
  }, [selectedToken]);

  // Load agent balance + gas on mount
  useEffect(() => {
    get<{ data: Array<{ tokenAssets?: Array<{ symbol?: string; balance?: string }> }> }>(
      `/wallet/balance/${AGENT_WALLET}?chain=xlayer`
    ).then((r) => {
      const assets = r?.data?.flatMap((d) => d.tokenAssets || []) || [];
      const okb = assets.find((a) => a.symbol === "OKB");
      setAgentBalance(okb ? `${Number(okb.balance).toFixed(4)} OKB` : "0 OKB");
    });

    get<{ data: GasData }>("/swap/gas?chain=xlayer").then((r) => {
      if (r?.data) setGasData(r.data);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txHash]);

  const getQuote = async () => {
    if (!from || !to || !amount) return;
    setQuote(null);
    setSwapError("");
    const r = await post<{ data: Quote | Quote[] }>("/swap/quote", {
      from, to, readableAmount: amount, chain: "xlayer",
    });
    if (r?.data) {
      const q = Array.isArray(r.data) ? r.data[0] : r.data;
      setQuote(q);
    }
  };

  // Agent one-shot swap via onchainos swap execute
  const agentSwap = async () => {
    if (!from || !to || !amount) return;
    setTxHash(""); setSwapError(""); setSwapStatus("Agent executing swap...");
    const r = await post<{ ok: boolean; data?: { txHash?: string }; error?: string }>(
      "/swap/agent-execute",
      { from, to, readableAmount: amount, chain: "xlayer", slippage }
    );
    if (r?.data?.txHash) {
      setTxHash(r.data.txHash);
      setSwapStatus("Swap confirmed!");
    } else {
      setSwapError(r?.error || "Swap failed — check agent wallet balance");
      setSwapStatus("");
    }
  };

  // User wallet swap — backend builds tx, ethers BrowserProvider signs
  const userSwap = async () => {
    if (!from || !to || !amount) return;
    if (!address) { openModal(); return; }
    if (!window.ethereum) { setSwapError("No wallet detected"); return; }
    setTxHash(""); setSwapError(""); setSwapStatus("Building swap tx...");
    try {
      await switchChain(XLAYER_CHAIN_ID, "X Layer", "OKB", "https://rpc.xlayer.tech", "https://www.oklink.com/xlayer");
      const r = await post<{ data: { to?: string; data?: string; value?: string; gas?: string } | Array<{ to?: string; data?: string; value?: string; gas?: string }> }>(
        "/swap/execute",
        { from, to, readableAmount: amount, chain: "xlayer", walletAddress: address }
      );
      const raw = Array.isArray(r?.data) ? r.data[0] : r?.data;
      const txData = (raw as any)?.tx || raw;
      if (!txData?.to) { setSwapError("No tx data returned"); setSwapStatus(""); return; }

      setSwapStatus("Confirm in wallet...");
      const rawValue = txData.value || "0";
      const hexValue = rawValue.startsWith("0x") ? rawValue : "0x" + BigInt(rawValue).toString(16);
      // Pass only essential fields — let the wallet manage nonce and gas estimation
      const txParams: Record<string, string> = {
        from: address,
        to: txData.to as string,
        data: (txData.data as string) || "0x",
        value: hexValue,
      };
      const hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [txParams] }) as string;
      setTxHash(hash);
      setSwapStatus("Swap submitted!");
    } catch (err: unknown) {
      console.error("[userSwap] error:", err);
      const code = (err as any)?.code;
      const msg = (err as any)?.message || (err as any)?.reason || String(err);
      const inner = (err as any)?.data?.message || (err as any)?.error?.message || "";
      if (code === 4001) { setSwapError("Transaction rejected by wallet"); }
      else { setSwapError((inner || msg).slice(0, 160)); }
      setSwapStatus("");
    }
  };

const createDCA = async () => {
    if (!from || !to || !amount) { setDcaMsg("Fill FROM, TO, and AMOUNT first."); return; }
    if (!address) { openModal(); return; }
    if (!window.ethereum) { setDcaMsg("No wallet detected."); return; }
    setDcaMsg("Switching to Arbitrum Sepolia...");
    try {
      await switchChain(ARB_SEPOLIA_CHAIN_ID, "Arbitrum Sepolia", "ETH", "https://sepolia-rollup.arbitrum.io/rpc", "https://sepolia.arbiscan.io");
      setDcaMsg("Confirm in wallet...");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(DCA_CONTRACT_ADDRESS, DCA_ABI, signer);
      const amountWei = ethers.parseUnits(amount, 18);
      const tx = await contract.createPlan(from, to, amountWei, Number(dcaInterval));
      setDcaMsg("Confirming on-chain...");
      const receipt = await tx.wait();
      const iface = new ethers.Interface(DCA_ABI);
      let planId: string | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "DCAPlanCreated") { planId = parsed.args.planId; break; }
        } catch { /* skip */ }
      }
      setDcaTxHash(tx.hash);
      setDcaMsg(`Plan created!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDcaMsg(msg.includes("user rejected") ? "Error: Cancelled" : `Error: ${msg.slice(0, 100)}`);
    }
  };

  const gasGwei = gasData?.normal?.gasPrice
    ? `${(Number(gasData.normal.gasPrice) / 1e9).toFixed(2)} Gwei`
    : null;

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <span className="panel-title">⇄ Trade</span>
        {selectedToken && (
          <span className="text-xs font-mono text-terminal-cyan bg-terminal-cyan bg-opacity-10 px-2 py-0.5 rounded">
            {selectedToken.symbol} selected
          </span>
        )}
        <div className="flex gap-1">
          <button className={`text-xs font-mono px-2 py-0.5 rounded ${tab === "swap" ? "bg-terminal-green text-terminal-bg" : "text-terminal-muted hover:text-terminal-green"}`} onClick={() => setTab("swap")}>SWAP</button>
          <button className={`text-xs font-mono px-2 py-0.5 rounded ${tab === "dca" ? "bg-terminal-cyan text-terminal-bg" : "text-terminal-muted hover:text-terminal-cyan"}`} onClick={() => setTab("dca")}>AUTO-DCA</button>
        </div>
      </div>

      <div className="panel-body flex flex-col gap-2">

        {/* Agent wallet + gas */}
        <div className="border border-terminal-green border-opacity-20 rounded p-2 bg-terminal-green bg-opacity-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-terminal-muted">AGENT WALLET</span>
            <div className="flex items-center gap-2">
              {gasGwei && <span className="text-xs font-mono text-terminal-muted">⛽ {gasGwei}</span>}
              <span className="text-xs font-mono text-terminal-green font-bold">{agentBalance}</span>
            </div>
          </div>
          <p className="text-xs font-mono text-terminal-muted opacity-50 truncate mt-0.5">{AGENT_WALLET}</p>
        </div>

        {/* Token inputs */}
        <div className="grid grid-cols-2 gap-1">
          <div>
            <p className="data-label mb-0.5">FROM</p>
            <input className="input-field text-xs" placeholder="native or 0x..." value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <p className="data-label mb-0.5">TO {selectedToken ? <span className="text-terminal-cyan">({selectedToken.symbol})</span> : ""}</p>
            <input className="input-field text-xs" placeholder="0x token" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <div className="col-span-2">
            <p className="data-label mb-0.5">AMOUNT</p>
            <input className="input-field" placeholder="e.g. 0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <p className="data-label mb-0.5">SLIPPAGE %</p>
            <input className="input-field" placeholder="0.5" value={slippage} onChange={(e) => setSlippage(e.target.value)} />
          </div>
        </div>

        {tab === "swap" && (
          <>
            {/* Action buttons */}
            <button className="btn-secondary w-full" onClick={getQuote} disabled={loading || !from || !to || !amount}>
              {loading ? "FETCHING..." : "GET QUOTE"}
            </button>

            {quote && (
              <div className="border border-terminal-border rounded p-2 space-y-1 bg-terminal-bg">
                <p className="data-label mb-1">QUOTE · OKX DEX (500+ sources)</p>
                <div className="data-row">
                  <span className="data-label">You get</span>
                  <span className="text-xs font-mono text-terminal-green font-bold">
                    {quote.toTokenAmount && quote.toToken?.decimal
                      ? `${(Number(quote.toTokenAmount) / Math.pow(10, Number(quote.toToken.decimal))).toFixed(6)} ${quote.toToken.tokenSymbol || ""}`
                      : quote.toTokenAmount || "—"}
                  </span>
                </div>
                <div className="data-row">
                  <span className="data-label">Price impact</span>
                  <span className={`text-xs font-mono ${Math.abs(Number(quote.priceImpactPercent)) > 1 ? "text-terminal-red" : "text-terminal-green"}`}>
                    {quote.priceImpactPercent ? `${quote.priceImpactPercent}%` : "< 0.01%"}
                  </span>
                </div>
                <div className="data-row">
                  <span className="data-label">Trade fee</span>
                  <span className="data-value">{quote.tradeFee ? `$${Number(quote.tradeFee).toFixed(6)}` : "—"}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1">
              <button className="btn-primary" onClick={agentSwap} disabled={loading || !from || !to || !amount}>
                {loading ? "..." : "AUTO SWAP"}
              </button>
              <button className="btn-secondary" onClick={userSwap} disabled={loading || !from || !to || !amount}>
                {loading ? "..." : "MY WALLET"}
              </button>
            </div>

            {swapStatus && !txHash && <p className="text-xs font-mono text-terminal-cyan">{swapStatus}</p>}
            {swapError && <p className="text-xs font-mono text-terminal-red break-all">{swapError}</p>}
            {txHash && (
              <div className="border border-terminal-green border-opacity-30 rounded p-2 bg-terminal-green bg-opacity-5">
                <p className="text-xs font-mono text-terminal-green font-bold">TX CONFIRMED ✓</p>
                <a href={`https://www.oklink.com/xlayer/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono text-terminal-cyan break-all hover:underline block mt-1">
                  {txHash}
                </a>
              </div>
            )}
          </>
        )}

        {tab === "dca" && (
          <>
            <div className="flex items-center gap-2">
              <p className="data-label whitespace-nowrap">INTERVAL</p>
              <select className="input-field flex-1" value={dcaInterval} onChange={(e) => setDcaInterval(e.target.value)}>
                <option value="3600">Every 1 hour</option>
                <option value="21600">Every 6 hours</option>
                <option value="86400">Every 24 hours</option>
                <option value="604800">Every 7 days</option>
              </select>
            </div>
            <div className="border border-terminal-cyan border-opacity-20 rounded p-2 text-xs font-mono text-terminal-muted space-y-0.5">
              <p className="text-terminal-cyan font-bold">AutoDCAHook · Uniswap V4 · Arb Sepolia</p>
              <p>Interval: every {Number(dcaInterval) / 3600 >= 1 ? `${Number(dcaInterval) / 3600}h` : `${Number(dcaInterval) / 60}min`}</p>
              <p>Amount: {amount || "—"} per swap · Slippage: {slippage}%</p>
              {selectedToken && <p className="text-terminal-green">Buying: {selectedToken.symbol}</p>}
            </div>
            <button className="btn-primary w-full" onClick={createDCA} disabled={loading}>
              {loading ? "CREATING..." : "CREATE DCA PLAN"}
            </button>
            {dcaMsg && !dcaTxHash && (
              <p className={`text-xs font-mono break-all ${dcaMsg.startsWith("Error") ? "text-terminal-red" : "text-terminal-cyan"}`}>
                {dcaMsg}
              </p>
            )}
            {dcaTxHash && (
              <div className="border border-terminal-green border-opacity-30 rounded p-2 bg-terminal-green bg-opacity-5">
                <p className="text-xs font-mono text-terminal-green font-bold">DCA PLAN CREATED ✓</p>
                <a href={`https://sepolia.arbiscan.io/tx/${dcaTxHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono text-terminal-cyan break-all hover:underline block mt-1">
                  {dcaTxHash}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
