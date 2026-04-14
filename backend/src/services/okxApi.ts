/**
 * OKX DEX HTTP API — drop-in replacement for onchainos CLI
 * Maps CLI args to direct HTTP calls to web3.okx.com
 */

import crypto from "crypto";

const BASE = "https://web3.okx.com";

// Chain name → chainIndex
const CHAIN_MAP: Record<string, string> = {
  xlayer: "196", ethereum: "1", eth: "1",
  solana: "501", sol: "501",
  bsc: "56", bnb: "56",
  polygon: "137", matic: "137",
  arbitrum: "42161", arb: "42161",
  base: "8453",
  optimism: "10", op: "10",
};

function chainIndex(name: string): string {
  return CHAIN_MAP[name.toLowerCase()] || name;
}

function authHeaders(method: string, path: string, body = ""): Record<string, string> {
  const ts = new Date().toISOString();
  const msg = ts + method.toUpperCase() + path + body;
  const sign = crypto
    .createHmac("sha256", process.env.OKX_SECRET_KEY || "")
    .update(msg)
    .digest("base64");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": process.env.OKX_API_KEY || "",
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": process.env.OKX_PASSPHRASE || "",
  };
  if (process.env.OKX_PROJECT_ID) {
    headers["OK-ACCESS-PROJECT"] = process.env.OKX_PROJECT_ID;
  }
  return headers;
}

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders("GET", path) });
  const data = await res.json() as { code?: string; data?: unknown; msg?: string };
  if (data.code && data.code !== "0") throw new Error(`OKX API error: ${data.msg || data.code}`);
  return { ok: true, data: data.data ?? data };
}

async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
  const bodyStr = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders("POST", path, bodyStr),
    body: bodyStr,
  });
  const data = await res.json() as { code?: string; data?: unknown; msg?: string };
  if (data.code && data.code !== "0") throw new Error(`OKX API error: ${data.msg || data.code}`);
  return { ok: true, data: data.data ?? data };
}

// ─── command handlers ────────────────────────────────────────────────────────

type Args = Record<string, string>;

function parseArgs(args: string[]): { cmd: string; sub: string; flags: Args } {
  const cmd = args[0] || "";
  const sub = args[1] || "";
  const flags: Args = {};
  for (let i = 2; i < args.length; i += 2) {
    if (args[i]?.startsWith("--")) flags[args[i].slice(2)] = args[i + 1] || "";
  }
  return { cmd, sub, flags };
}

export async function runHttp(args: string[]): Promise<unknown> {
  const { cmd, sub, flags } = parseArgs(args);
  const ci = chainIndex(flags.chain || "xlayer");

  // ── token ──────────────────────────────────────────────────────────────────
  if (cmd === "token") {
    if (sub === "search") {
      const q = flags.query || flags.address || "";
      return get(`/api/v5/dex/market/token-search?tokenNameOrAddress=${encodeURIComponent(q)}&chainIndex=${ci}`);
    }
    if (sub === "hot-tokens") {
      const tf = flags["time-frame"] || "4";
      // X Layer not supported in hot-token API — omit chainIndex to get global trending
      const chainParam = ci !== "196" ? `&chainIndex=${ci}` : "";
      return get(`/api/v5/dex/market/hot-token?rankingType=4&rankingTimeFrame=${tf}${chainParam}`);
    }
    if (sub === "advanced-info") {
      return get(`/api/v5/dex/market/token-security?tokenContractAddress=${flags.address}&chainIndex=${ci}`);
    }
    if (sub === "price-info") {
      return get(`/api/v5/dex/market/current-price?tokenContractAddress=${flags.address}&chainIndex=${ci}`);
    }
    if (sub === "holders") {
      return get(`/api/v5/dex/market/token-holder?tokenContractAddress=${flags.address}&chainIndex=${ci}`);
    }
    if (sub === "trending") {
      const chainParam = ci !== "196" ? `&chainIndex=${ci}` : "";
      return get(`/api/v5/dex/market/hot-token?rankingType=4&rankingTimeFrame=4${chainParam}`);
    }
  }

  // ── signal ─────────────────────────────────────────────────────────────────
  if (cmd === "signal" && sub === "list") {
    const wt = flags["wallet-type"] || "1";
    return get(`/api/v5/dex/market/signal?chainIndex=${ci}&walletType=${wt}&limit=20`);
  }

  // ── swap ───────────────────────────────────────────────────────────────────
  if (cmd === "swap") {
    if (sub === "chains") return get(`/api/v5/dex/aggregator/supported/chain`);
    if (sub === "liquidity") return get(`/api/v5/dex/aggregator/get-liquidity?chainId=${ci}`);
    if (sub === "quote") {
      const amount = flags["readable-amount"]
        ? String(Math.round(parseFloat(flags["readable-amount"]) * 1e18))
        : flags.amount || "0";
      return get(`/api/v5/dex/aggregator/quote?chainId=${ci}&fromTokenAddress=${flags.from}&toTokenAddress=${flags.to}&amount=${amount}`);
    }
    if (sub === "swap") {
      const amount = flags["readable-amount"]
        ? String(Math.round(parseFloat(flags["readable-amount"]) * 1e18))
        : flags.amount || "0";
      const slippage = flags.slippage || "0.05";
      return get(`/api/v5/dex/aggregator/swap?chainId=${ci}&fromTokenAddress=${flags.from}&toTokenAddress=${flags.to}&amount=${amount}&userWalletAddress=${flags.wallet}&slippage=${slippage}`);
    }
    if (sub === "approve") {
      const amount = flags.amount || "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      return get(`/api/v5/dex/aggregator/approve-transaction?chainId=${ci}&tokenContractAddress=${flags.token}&approveAmount=${amount}`);
    }
    if (sub === "check-approvals") {
      return get(`/api/v5/dex/aggregator/token-approval-lock?chainId=${ci}&tokenContractAddress=${flags.token}&walletAddress=${flags.address}`);
    }
  }

  // ── gateway ────────────────────────────────────────────────────────────────
  if (cmd === "gateway") {
    if (sub === "gas") return get(`/api/v5/dex/market/gas-price?chainIndex=${ci}`);
    if (sub === "chains") return get(`/api/v5/dex/aggregator/supported/chain`);
    if (sub === "simulate") return get(`/api/v5/dex/pre-transaction/transaction-simulation`);
    if (sub === "broadcast") return post(`/api/v5/dex/pre-transaction/broadcast-transaction`, { chainIndex: ci, signedTx: flags["signed-tx"] || "" });
  }

  // ── portfolio ──────────────────────────────────────────────────────────────
  if (cmd === "portfolio") {
    if (sub === "all-balances" || sub === "token-balances") {
      return get(`/api/v5/dex/balance/all-token-balances-by-address?address=${flags.address}&chains=${ci}`);
    }
    if (sub === "total-value") {
      return get(`/api/v5/dex/balance/total-value?address=${flags.address}&chains=${ci}`);
    }
  }

  // ── market ─────────────────────────────────────────────────────────────────
  if (cmd === "market") {
    if (sub === "kline") {
      const bar = flags.bar || "1H";
      const limit = flags.limit || "100";
      return get(`/api/v5/dex/market/candles?tokenContractAddress=${flags.address}&chainIndex=${ci}&bar=${bar}&limit=${limit}`);
    }
    if (sub === "price") {
      return get(`/api/v5/dex/market/current-price?tokenContractAddress=${flags.address}&chainIndex=${ci}`);
    }
  }

  // ── defi ───────────────────────────────────────────────────────────────────
  if (cmd === "defi") {
    if (sub === "list") return post(`/api/v5/defi/explore/product/list`, {});
    if (sub === "invest") {
      return get(`/api/v5/defi/invest/transaction?investmentId=${flags["investment-id"]}&investAddress=${flags.address}&tokenAddress=${flags.token}&investAmount=${flags.amount}&chainIndex=${ci}`);
    }
    if (sub === "positions") return get(`/api/v5/defi/invest/account?address=${flags.address}&chainIndex=${ci}`);
  }

  // ── leaderboard ────────────────────────────────────────────────────────────
  if (cmd === "leaderboard" && sub === "list") {
    return get(`/api/v5/dex/market/leaderboard?chainIndex=${ci}&timeFrame=${flags["time-frame"] || "3"}&sortBy=${flags["sort-by"] || "1"}`);
  }

  throw new Error(`Unsupported onchainos command: ${cmd} ${sub}`);
}
