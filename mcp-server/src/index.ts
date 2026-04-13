#!/usr/bin/env node
/**
 * AgentPilot MCP Server
 *
 * Exposes AgentPilot's OKX OnchainOS-powered DeFi capabilities as MCP tools
 * so any Claude Code user can interact with X Layer directly from their editor.
 *
 * Usage:
 *   claude mcp add agentpilot node /absolute/path/to/mcp-server/dist/index.js
 *
 * Environment (optional — defaults to localhost):
 *   AGENTPILOT_API=http://localhost:3001/api
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const API = (process.env.AGENTPILOT_API || "http://localhost:3001/api").replace(/\/$/, "");

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`);
  const json = await res.json() as unknown;
  return json;
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json() as unknown;
  return json;
}

function text(content: unknown): TextContent {
  return {
    type: "text",
    text: typeof content === "string" ? content : JSON.stringify(content, null, 2),
  };
}

function errText(message: string): TextContent {
  return { type: "text", text: `ERROR: ${message}` };
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: "agentpilot_search_token",
    description:
      "Search for tokens on X Layer (OKX zkEVM). Returns token name, symbol, contract address, price, and 24h change. Free to use.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token name, symbol, or contract address to search for",
        },
        chain: {
          type: "string",
          description: "Chain identifier (default: xlayer)",
          default: "xlayer",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "agentpilot_check_risk",
    description:
      "Scan a token contract for security risks on X Layer. Returns risk level (1=low, 2=medium, 3=high), top-10 holder concentration, LP burn percentage, bundle holding %, and risk tags. Costs $0.001 USDT via x402 micropayment (auto-handled by the server).",
    inputSchema: {
      type: "object",
      properties: {
        tokenAddress: {
          type: "string",
          description: "ERC-20 token contract address to scan",
        },
        chain: {
          type: "string",
          description: "Chain identifier (default: xlayer)",
          default: "xlayer",
        },
      },
      required: ["tokenAddress"],
    },
  },

  {
    name: "agentpilot_swap",
    description:
      "Execute a token swap on X Layer via OKX DEX aggregator. Finds best route across all DEXes. WARNING: This executes a real on-chain transaction from the configured agentic wallet — confirm amounts before calling.",
    inputSchema: {
      type: "object",
      properties: {
        fromToken: {
          type: "string",
          description: "Contract address of the token to sell (use 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE for native OKB)",
        },
        toToken: {
          type: "string",
          description: "Contract address of the token to buy",
        },
        amount: {
          type: "string",
          description: "Human-readable amount to swap (e.g. '1.5' for 1.5 OKB). Use readableAmount format.",
        },
        chain: {
          type: "string",
          description: "Chain identifier (default: xlayer)",
          default: "xlayer",
        },
      },
      required: ["fromToken", "toToken", "amount"],
    },
  },

  {
    name: "agentpilot_check_balance",
    description:
      "Check the token balances of any wallet address on X Layer. Returns all token holdings with their USD values and a total portfolio value.",
    inputSchema: {
      type: "object",
      properties: {
        walletAddress: {
          type: "string",
          description: "EVM wallet address to check (0x...)",
        },
        chain: {
          type: "string",
          description: "Chain identifier (default: xlayer)",
          default: "xlayer",
        },
      },
      required: ["walletAddress"],
    },
  },

  {
    name: "agentpilot_defi_explore",
    description:
      "Discover DeFi yield products on X Layer — lending pools, liquidity pools, staking opportunities. Returns product name, APY, TVL, and platform. Costs $0.001 USDT via x402 (auto-handled).",
    inputSchema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Chain identifier (default: xlayer)",
          default: "xlayer",
        },
      },
      required: [],
    },
  },

  {
    name: "agentpilot_create_dca",
    description:
      "Create an automated Dollar-Cost Averaging (DCA) plan via the AgentPilot AutoDCAHook on Arbitrum Sepolia (Uniswap V4). The plan automatically swaps tokenIn → tokenOut every intervalSeconds. WARNING: Executes a real transaction from the configured wallet.",
    inputSchema: {
      type: "object",
      properties: {
        tokenIn: {
          type: "string",
          description: "Contract address of the token to spend (input token)",
        },
        tokenOut: {
          type: "string",
          description: "Contract address of the token to accumulate (output token)",
        },
        amountPerInterval: {
          type: "string",
          description: "Amount of tokenIn to swap each interval, in token wei (smallest unit). E.g. '1000000' = 1 USDC (6 decimals)",
        },
        intervalSeconds: {
          type: "number",
          description: "How often to execute the DCA in seconds. E.g. 86400 = daily, 3600 = hourly",
        },
      },
      required: ["tokenIn", "tokenOut", "amountPerInterval", "intervalSeconds"],
    },
  },

  {
    name: "agentpilot_pay",
    description:
      "Send an OKB payment on X Layer from the configured agentic wallet. Useful for x402 micropayments, tipping, or agent-to-agent value transfer. WARNING: Real transaction — cannot be reversed.",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient wallet address (0x...)",
        },
        amount: {
          type: "string",
          description: "Amount of OKB to send as a decimal string (e.g. '0.001')",
        },
        memo: {
          type: "string",
          description: "Optional memo or description for the payment",
          default: "",
        },
      },
      required: ["to", "amount"],
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

async function handleSearchToken(args: Args): Promise<TextContent> {
  const query = String(args.query || "");
  const chain = String(args.chain || "xlayer");

  if (!query) return errText("query is required");

  const data = await apiGet(`/token/search?query=${encodeURIComponent(query)}&chain=${chain}`);
  const result = data as { data?: unknown[] };

  if (!result?.data || result.data.length === 0) {
    return text(`No tokens found for "${query}" on ${chain}.`);
  }

  const tokens = result.data.slice(0, 8) as Array<Record<string, unknown>>;
  const lines = tokens.map((t) => {
    const sym = t.tokenSymbol || "?";
    const name = t.tokenName || "";
    const price = Number(t.price || 0).toFixed(6);
    const change = Number(t.change || 0).toFixed(2);
    const addr = String(t.tokenContractAddress || "").slice(0, 16) + "...";
    const sign = Number(t.change || 0) >= 0 ? "+" : "";
    return `• ${sym} (${name}) | $${price} | ${sign}${change}% | ${addr}`;
  });

  return text(`Token search results for "${query}" on ${chain}:\n\n${lines.join("\n")}`);
}

async function handleCheckRisk(args: Args): Promise<TextContent> {
  const addr = String(args.tokenAddress || "");
  const chain = String(args.chain || "xlayer");

  if (!addr) return errText("tokenAddress is required");

  const data = await apiGet(`/security/token-risk/${addr}?chain=${chain}`) as Record<string, unknown>;

  if (!data || (data as { error?: string }).error) {
    return text(`Risk scan failed: ${(data as { error?: string }).error || "No data returned"}`);
  }

  const inner = (data.data || data) as Record<string, unknown>;
  const lvl = String(inner.riskControlLevel || "?");
  const riskLabel: Record<string, string> = { "1": "LOW ✓", "2": "MEDIUM ⚠", "3": "HIGH ✗" };
  const top10 = Number(inner.top10HoldPercent || 0).toFixed(2);
  const lpBurned = Number(inner.lpBurnedPercent || 0).toFixed(2);
  const bundle = Number(inner.bundleHoldingPercent || 0).toFixed(2);
  const tags = Array.isArray(inner.tokenTags) ? inner.tokenTags.join(", ") : "none";

  return text(
    `Risk Report for ${addr} (${chain})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Risk Level:       ${riskLabel[lvl] || `UNKNOWN (${lvl})`}\n` +
    `Top 10 Holders:   ${top10}%\n` +
    `LP Burned:        ${lpBurned}%\n` +
    `Bundle Holding:   ${bundle}%\n` +
    `Tags:             ${tags}`
  );
}

async function handleSwap(args: Args): Promise<TextContent> {
  const from = String(args.fromToken || "");
  const to = String(args.toToken || "");
  const amount = String(args.amount || "");
  const chain = String(args.chain || "xlayer");

  if (!from || !to || !amount) {
    return errText("fromToken, toToken, and amount are all required");
  }

  const data = await apiPost("/swap/execute", {
    from,
    to,
    readableAmount: amount,
    chain,
  }) as Record<string, unknown>;

  if ((data as { error?: string }).error) {
    return text(`Swap failed: ${(data as { error?: string }).error}`);
  }

  return text(`Swap executed successfully:\n${JSON.stringify(data, null, 2)}`);
}

async function handleCheckBalance(args: Args): Promise<TextContent> {
  const wallet = String(args.walletAddress || "");
  const chain = String(args.chain || "xlayer");

  if (!wallet) return errText("walletAddress is required");

  const data = await apiGet(`/wallet/balance/${wallet}?chain=${chain}`) as Record<string, unknown>;
  const balanceData = data as { data?: Array<{ tokenAssets?: Array<Record<string, unknown>> }> };

  if (!balanceData?.data || !Array.isArray(balanceData.data)) {
    return text(`No balance data found for ${wallet} on ${chain}.`);
  }

  const assets = balanceData.data.flatMap((d) => d.tokenAssets || []) as Array<Record<string, unknown>>;

  if (assets.length === 0) {
    return text(`Wallet ${wallet} has no token holdings on ${chain}.`);
  }

  let total = 0;
  const lines = assets.slice(0, 12).map((b) => {
    const bal = Number(b.balance || 0);
    const price = Number(b.tokenPrice || 0);
    const usd = bal * price;
    total += usd;
    return `• ${b.symbol || "?"}: ${bal.toFixed(6)} ($${usd.toFixed(2)})`;
  });

  return text(
    `Balance for ${wallet} on ${chain}:\n` +
    `Total Value: $${total.toFixed(2)}\n\n` +
    lines.join("\n")
  );
}

async function handleDefiExplore(args: Args): Promise<TextContent> {
  const chain = String(args.chain || "xlayer");
  const data = await apiGet(`/defi/products?chain=${chain}`) as Record<string, unknown>;

  if ((data as { error?: string }).error) {
    return text(`DeFi explore failed: ${(data as { error?: string }).error}`);
  }

  const products = (data as { data?: unknown[] }).data;
  if (!products || products.length === 0) {
    return text(`No DeFi products found on ${chain}.`);
  }

  const lines = (products as Array<Record<string, unknown>>).slice(0, 10).map((p) => {
    const name = p.protocolName || p.projectName || "Unknown";
    const apy = p.apy || p.apyInfo || "?";
    const tvl = p.tvlUsd ? `$${Number(p.tvlUsd).toLocaleString()}` : "?";
    const type = p.investType || p.type || "pool";
    return `• ${name} | APY: ${apy} | TVL: ${tvl} | Type: ${type}`;
  });

  return text(`DeFi Opportunities on ${chain}:\n\n${lines.join("\n")}`);
}

async function handleCreateDca(args: Args): Promise<TextContent> {
  const tokenIn = String(args.tokenIn || "");
  const tokenOut = String(args.tokenOut || "");
  const amountPerInterval = String(args.amountPerInterval || "");
  const intervalSeconds = Number(args.intervalSeconds || 0);

  if (!tokenIn || !tokenOut || !amountPerInterval || !intervalSeconds) {
    return errText("tokenIn, tokenOut, amountPerInterval, and intervalSeconds are all required");
  }

  const data = await apiPost("/dca/create", {
    tokenIn,
    tokenOut,
    amountPerInterval,
    intervalSeconds,
  }) as Record<string, unknown>;

  if (!(data as { ok?: boolean }).ok) {
    return text(`DCA creation failed: ${(data as { error?: string }).error || JSON.stringify(data)}`);
  }

  const plan = (data as { data?: Record<string, unknown> }).data || {};
  const every = intervalSeconds >= 86400
    ? `${intervalSeconds / 86400}d`
    : intervalSeconds >= 3600
      ? `${intervalSeconds / 3600}h`
      : `${intervalSeconds}s`;

  return text(
    `DCA Plan Created ✓\n` +
    `Plan ID:   ${plan.planId || "—"}\n` +
    `Tx Hash:   ${plan.txHash || "—"}\n` +
    `Interval:  every ${every}\n` +
    `Route:     ${tokenIn.slice(0, 10)}... → ${tokenOut.slice(0, 10)}...\n` +
    `Amount:    ${amountPerInterval} wei per interval`
  );
}

async function handlePay(args: Args): Promise<TextContent> {
  const to = String(args.to || "");
  const amount = String(args.amount || "");
  const memo = String(args.memo || "");

  if (!to || !amount) return errText("to and amount are required");

  const data = await apiPost("/pay/x402", { to, amount, memo }) as Record<string, unknown>;

  if (!(data as { ok?: boolean }).ok) {
    return text(`Payment failed: ${(data as { error?: string }).error || JSON.stringify(data)}`);
  }

  const d = (data as { data?: Record<string, unknown> }).data || {};
  return text(
    `Payment Sent ✓\n` +
    `To:       ${to}\n` +
    `Amount:   ${amount} OKB\n` +
    `Tx Hash:  ${d.txHash || "—"}` +
    (memo ? `\nMemo:     ${memo}` : "")
  );
}

// ─── Tool dispatch ────────────────────────────────────────────────────────────

const HANDLERS: Record<string, (args: Args) => Promise<TextContent>> = {
  agentpilot_search_token: handleSearchToken,
  agentpilot_check_risk: handleCheckRisk,
  agentpilot_swap: handleSwap,
  agentpilot_check_balance: handleCheckBalance,
  agentpilot_defi_explore: handleDefiExplore,
  agentpilot_create_dca: handleCreateDca,
  agentpilot_pay: handlePay,
};

// ─── Server bootstrap ─────────────────────────────────────────────────────────

async function main() {
  const server = new Server(
    { name: "agentpilot", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Execute a tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = HANDLERS[name];

    if (!handler) {
      return {
        content: [errText(`Unknown tool: ${name}`)],
        isError: true,
      };
    }

    try {
      const result = await handler((args || {}) as Args);
      return { content: [result] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Distinguish network errors (backend not running) from tool errors
      const isConnRefused = message.includes("ECONNREFUSED") || message.includes("fetch failed");
      const friendly = isConnRefused
        ? `AgentPilot backend is not running. Start it with: cd agentpilot/backend && npm run dev\n(Expected at ${API})`
        : message;
      return {
        content: [errText(friendly)],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is now running — communicates over stdin/stdout
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
