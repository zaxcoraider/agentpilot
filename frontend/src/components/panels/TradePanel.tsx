import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useApi } from "../../hooks/useApi";
import { useWallet } from "../../context/WalletContext";
import { DCA_CONTRACT_ADDRESS, DCA_ABI, ARB_SEPOLIA_CHAIN_ID, XLAYER_CHAIN_ID } from "../../config";

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const AGENT_WALLET = import.meta.env.VITE_AGENTIC_WALLET || "0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0";

async function switchToXLayer() {
  await window.ethereum!.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: `0x${XLAYER_CHAIN_ID.toString(16)}` }],
  }).catch(async (err: { code?: number }) => {
    if (err.code === 4902) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: `0x${XLAYER_CHAIN_ID.toString(16)}`,
          chainName: "X Layer",
          nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
          rpcUrls: ["https://rpc.xlayer.tech"],
          blockExplorerUrls: ["https://www.oklink.com/xlayer"],
        }],
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

export function TradePanel() {
  const { get, post, loading } = useApi();
  const { address, openModal } = useWallet();
  const [from, setFrom] = useState(NATIVE);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [txHash, setTxHash] = useState("");
  const [swapError, setSwapError] = useState("");
  const [swapStatus, setSwapStatus] = useState("");
  const [agentBalance, setAgentBalance] = useState("...");
  const [tab, setTab] = useState<"swap" | "dca">("swap");

  // DCA state
  const [dcaInterval, setDcaInterval] = useState("3600");
  const [dcaMsg, setDcaMsg] = useState("");

  // Load agent wallet OKB balance
  useEffect(() => {
    get<{ data: Array<{ tokenAssets?: Array<{ symbol?: string; balance?: string }> }> }>(
      `/wallet/balance/${AGENT_WALLET}?chain=xlayer`
    ).then((r) => {
      const assets = r?.data?.flatMap((d) => d.tokenAssets || []) || [];
      const okb = assets.find((a) => a.symbol === "OKB");
      setAgentBalance(okb ? `${Number(okb.balance).toFixed(4)} OKB` : "0 OKB");
    });
  }, [get, txHash]); // refresh after a swap

  const getQuote = async () => {
    if (!from || !to || !amount) return;
    const r = await post<{ data: Quote | Quote[] }>("/swap/quote", {
      from,
      to,
      readableAmount: amount,
      chain: "xlayer",
    });
    if (r?.data) {
      const q = Array.isArray(r.data) ? r.data[0] : r.data;
      setQuote(q);
    }
  };

  // Agent executes swap autonomously from its own wallet
  const executeSwap = async () => {
    if (!from || !to || !amount || !quote) return;
    setTxHash("");
    setSwapError("");
    setSwapStatus("Agent executing swap...");

    const r = await post<{ ok: boolean; data?: { txHash?: string }; error?: string }>(
      "/swap/agent-execute",
      { from, to, readableAmount: amount, chain: "xlayer" }
    );

    if (r?.data?.txHash) {
      setTxHash(r.data.txHash);
      setSwapStatus("Swap confirmed!");
    } else {
      setSwapError(r?.error || "Swap failed — check agent wallet balance");
      setSwapStatus("");
    }
  };

  // Fund agent wallet: user sends OKB via MetaMask
  const fundAgent = async () => {
    if (!address) { openModal(); return; }
    if (!window.ethereum) return;
    try {
      setSwapStatus("Switch to X Layer to fund agent...");
      await switchToXLayer();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      setSwapStatus("Confirm transfer in MetaMask...");
      const tx = await signer.sendTransaction({
        to: AGENT_WALLET,
        value: ethers.parseEther(amount || "0.001"),
      });
      setSwapStatus(`Agent funded! TX: ${tx.hash.slice(0, 16)}...`);
      setTxHash(tx.hash);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSwapError(msg.includes("user rejected") ? "Cancelled" : msg.slice(0, 100));
      setSwapStatus("");
    }
  };

  const createDCA = async () => {
    if (!from || !to || !amount) {
      setDcaMsg("Fill in FROM TOKEN, TO TOKEN and AMOUNT first.");
      return;
    }
    if (!address) { openModal(); return; }
    if (!window.ethereum) {
      setDcaMsg("No wallet detected. Connect a wallet first.");
      return;
    }
    setDcaMsg("Switching to Arbitrum Sepolia...");
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${ARB_SEPOLIA_CHAIN_ID.toString(16)}` }],
      });
    } catch (switchErr: unknown) {
      if ((switchErr as { code?: number }).code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${ARB_SEPOLIA_CHAIN_ID.toString(16)}`,
            chainName: "Arbitrum Sepolia",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
            blockExplorerUrls: ["https://sepolia.arbiscan.io"],
          }],
        });
      } else {
        setDcaMsg("Failed to switch network. Approve in your wallet.");
        return;
      }
    }
    setDcaMsg("Confirm in your wallet...");
    try {
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
      setDcaMsg(`Plan created: ${(planId || tx.hash).slice(0, 18)}...`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDcaMsg(`Error: ${msg.slice(0, 100)}`);
    }
  };

  return (
    <div className="panel h-full">
      <div className="panel-header">
        <span className="panel-title">⇄ Trade</span>
        <div className="flex gap-1">
          <button
            className={`text-xs font-mono px-2 py-0.5 rounded ${tab === "swap" ? "bg-terminal-green text-terminal-bg" : "text-terminal-muted hover:text-terminal-green"}`}
            onClick={() => setTab("swap")}
          >SWAP</button>
          <button
            className={`text-xs font-mono px-2 py-0.5 rounded ${tab === "dca" ? "bg-terminal-cyan text-terminal-bg" : "text-terminal-muted hover:text-terminal-cyan"}`}
            onClick={() => setTab("dca")}
          >AUTO-DCA</button>
        </div>
      </div>
      <div className="panel-body flex flex-col gap-2">

        {/* Agent wallet status */}
        <div className="border border-terminal-green border-opacity-20 rounded p-2 bg-terminal-green bg-opacity-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-terminal-muted">AGENT WALLET</span>
            <span className="text-xs font-mono text-terminal-green font-bold">{agentBalance}</span>
          </div>
          <p className="text-xs font-mono text-terminal-muted opacity-60 truncate mt-0.5">{AGENT_WALLET}</p>
        </div>

        {/* Token inputs */}
        <div className="grid grid-cols-2 gap-1">
          <div>
            <p className="data-label mb-0.5">FROM</p>
            <input className="input-field text-xs" placeholder="0x... or native" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <p className="data-label mb-0.5">TO</p>
            <input className="input-field text-xs" placeholder="0x token" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div>
          <p className="data-label mb-0.5">AMOUNT</p>
          <input className="input-field" placeholder="e.g. 0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>

        {tab === "swap" && (
          <>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={getQuote} disabled={loading}>
                {loading ? "FETCHING..." : "GET QUOTE"}
              </button>
              <button className="btn-primary flex-1" onClick={executeSwap} disabled={loading || !quote}>
                {loading ? "EXECUTING..." : "AGENT SWAP"}
              </button>
            </div>

            {/* Fund agent shortcut */}
            <button
              className="w-full text-xs font-mono py-1 rounded border border-terminal-cyan border-opacity-30 text-terminal-cyan hover:bg-terminal-cyan hover:bg-opacity-10 transition-colors"
              onClick={fundAgent}
              disabled={loading}
            >
              + FUND AGENT WALLET ({amount || "0.001"} OKB)
            </button>

            {quote && (
              <div className="border border-terminal-border rounded p-2 space-y-1 bg-terminal-bg">
                <p className="data-label mb-1">QUOTE · OKX DEX</p>
                <div className="data-row">
                  <span className="data-label">You get</span>
                  <span className="text-xs font-mono text-terminal-green">
                    {quote.toTokenAmount && quote.toToken?.decimal
                      ? `${(Number(quote.toTokenAmount) / Math.pow(10, Number(quote.toToken.decimal))).toFixed(6)} ${quote.toToken.tokenSymbol || ""}`
                      : quote.toTokenAmount || "—"}
                  </span>
                </div>
                <div className="data-row">
                  <span className="data-label">Gas fee</span>
                  <span className="data-value">
                    {quote.estimateGasFee ? `${Number(quote.estimateGasFee).toLocaleString()} wei` : "—"}
                  </span>
                </div>
                <div className="data-row">
                  <span className="data-label">Trade fee</span>
                  <span className="data-value">{quote.tradeFee ? `$${Number(quote.tradeFee).toFixed(6)}` : "—"}</span>
                </div>
                <div className="data-row">
                  <span className="data-label">Price impact</span>
                  <span className={`text-xs font-mono ${Math.abs(Number(quote.priceImpactPercent)) > 1 ? "text-terminal-red" : "text-terminal-green"}`}>
                    {quote.priceImpactPercent ? `${quote.priceImpactPercent}%` : "< 0.01%"}
                  </span>
                </div>
              </div>
            )}

            {swapStatus && !txHash && (
              <p className="text-xs font-mono text-terminal-cyan">{swapStatus}</p>
            )}
            {swapError && (
              <p className="text-xs font-mono text-terminal-red break-all">{swapError}</p>
            )}
            {txHash && (
              <div className="border border-terminal-green border-opacity-30 rounded p-2 bg-terminal-green bg-opacity-5">
                <p className="text-xs font-mono text-terminal-green font-bold">TX CONFIRMED ✓</p>
                <a
                  href={`https://www.oklink.com/xlayer/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-terminal-cyan break-all mt-1 hover:underline block"
                >
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
            <div className="border border-terminal-cyan border-opacity-20 rounded p-2 text-xs font-mono text-terminal-muted">
              <p className="text-terminal-cyan font-bold">SimpleDCA · Arbitrum Sepolia</p>
              <p className="mt-0.5">Every {Number(dcaInterval) / 3600 >= 1 ? `${Number(dcaInterval) / 3600}h` : `${Number(dcaInterval) / 60}min`} · {amount || "—"} per swap</p>
            </div>
            <button className="btn-primary w-full" onClick={createDCA} disabled={loading}>
              {loading ? "CREATING..." : "CREATE DCA PLAN"}
            </button>
            {dcaMsg && (
              <p className={`text-xs font-mono ${dcaMsg.startsWith("Plan created") ? "text-terminal-green" : "text-terminal-red"}`}>
                {dcaMsg}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
