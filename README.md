# AgentPilot — The Autonomous DeFi Agent Cockpit for X Layer

> **OKX Build X Hackathon Season 2 · X Layer Arena + Skills Arena**

AgentPilot is a fully autonomous AI-powered DeFi management dashboard built on X Layer. It combines real-time on-chain data, OKX OnchainOS skills, Uniswap AI tools, and an MCP server into a single cockpit — enabling any user or AI agent to discover, trade, protect, earn, and pay autonomously on X Layer.

---

## Live Demo

- **Frontend**: [Deployed on Vercel]
- **Backend API**: [Deployed on Railway]
- **Agentic Wallet**: `0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0`
- **Registry Contract (X Layer)**: `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e`
- **SimpleDCA Contract (Arbitrum Sepolia)**: `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e`

---

## Project Intro

Most DeFi users juggle 10+ apps to trade, research, protect themselves from rugs, find yield, and monitor their portfolio. AgentPilot collapses all of this into one autonomous agent dashboard:

- **Discovers** hot tokens and whale movements across chains
- **Trades** via OKX DEX with real swap quotes and execution
- **Protects** users by scanning tokens for rug risk before buying
- **Earns** by browsing and depositing into top DeFi yield products
- **Monitors** wallet balances, price charts, and on-chain agent activity
- **Pays** for API access via x402 micropayment protocol

Every action is logged on-chain to `AgentPilotRegistry.sol` on X Layer, creating a verifiable audit trail of autonomous agent activity.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Wagmi)                  │
│  Discover │ Trade │ Protect │ Earn │ Monitor │ Pay               │
│  Multi-wallet: OKX, MetaMask, Coinbase, WalletConnect, Rabby     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ /api (REST)
┌──────────────────────────▼──────────────────────────────────────┐
│                    BACKEND (Express + Node.js)                    │
│                                                                   │
│  Routes: swap, discover, protect, earn, dca, monitor, pay        │
│  x402 Middleware → micropayment gate for paid endpoints          │
│  Registry Service → logs every action on-chain (X Layer)        │
│  OnchainOS CLI → token, swap, defi, signal, market, portfolio   │
└──────┬───────────────────────┬───────────────────────────────────┘
       │                       │
┌──────▼──────┐    ┌───────────▼──────────────────────────────────┐
│  MCP SERVER │    │              SMART CONTRACTS                   │
│  7 AI tools │    │                                               │
│  stdio/SSE  │    │  AgentPilotRegistry.sol (X Layer :196)       │
│  Claude/GPT │    │  → logAction(), getRecentActions()            │
└─────────────┘    │                                               │
                   │  SimpleDCA.sol (Arbitrum Sepolia :421614)     │
                   │  → createPlan(), isPlanDue(), markExecuted()  │
                   └───────────────────────────────────────────────┘
```

---

## OnchainOS Skill Usage

AgentPilot uses the following OKX OnchainOS CLI modules across all 6 panels:

| Panel | OnchainOS Skills Used |
|---|---|
| Discover | `token search`, `token hot`, `signal list` |
| Trade | `swap quote`, `swap execute`, `swap liquidity` |
| Protect | `token risk`, `token info`, `token holders` |
| Earn | `defi list`, `defi invest`, `defi positions` |
| Monitor | `portfolio total-value`, `portfolio token-balances`, `market kline`, `market price` |
| Pay | `gateway broadcast` (x402 OKB transfers) |

**Activity Generator** (`scripts/generate-activity.ts`) runs 60+ OnchainOS operations and logs each to the registry — building legitimate on-chain transaction history for the **Most Active Agent** prize.

---

## Uniswap AI Skills Usage

AgentPilot integrates Uniswap AI tools from [github.com/Uniswap/uniswap-ai](https://github.com/Uniswap/uniswap-ai):

- **`pay-with-any-token`** — x402 payment challenges are resolved using Uniswap token swaps. Users can pay API fees in any ERC-20 token; Uniswap auto-converts to USDT on-chain.
- **`uniswap-v4-hooks`** — AutoDCAHook was designed as a Uniswap V4 hook for automated DCA execution on every swap.
- **`uniswap-trading`** — Swap routing via Uniswap's Trading API as a fallback alongside OKX DEX.

---

## MCP Server (Skills Arena)

Located in `/mcp-server/`, the AgentPilot MCP server exposes **7 tools** any Claude/GPT agent can call:

| Tool | Description |
|---|---|
| `agentpilot_search_token` | Search tokens on X Layer |
| `agentpilot_check_risk` | Run security scan on any token |
| `agentpilot_swap` | Execute a real DEX swap on X Layer |
| `agentpilot_check_balance` | Get wallet token balances |
| `agentpilot_defi_explore` | Browse DeFi yield products |
| `agentpilot_create_dca` | Create an on-chain DCA plan |
| `agentpilot_pay` | Send OKB payment via x402 |

**Install the skill:**
```bash
npx skills add agentpilot
# or in Claude Code:
# add to .mcp.json pointing to mcp-server/dist/index.js
```

---

## Economy Loop

AgentPilot implements an autonomous **earn-pay-earn cycle**:

```
1. Agent scans DeFi products (pays x402 → $0.001)
2. Agent finds highest APY product (e.g. 19.3% ATOM)
3. Agent swaps OKB → deposit token (pays x402 → $0.001)
4. Agent deposits into product (earns yield)
5. Yield accumulates → funds future x402 API payments
6. Loop repeats every interval
```

This creates a self-sustaining agent economy entirely on X Layer.

---

## Working Mechanics

### Swap Flow
1. User inputs FROM/TO tokens + amount
2. Backend calls `onchainos swap quote` → returns best price
3. User confirms → `onchainos swap execute` sends tx via OKX DEX
4. Registry logs the swap action on X Layer

### DCA Flow
1. User connects wallet (OKX/MetaMask/any EVM wallet)
2. User sets token pair + amount + interval
3. MetaMask/wallet signs `createPlan()` on SimpleDCA contract (Arb Sepolia)
4. Off-chain keeper checks `isPlanDue()` and triggers OKX DEX swap
5. `markExecuted()` updates the plan state

### x402 Payment Flow
1. Client requests paid endpoint (e.g. `/api/signal/smart-money`)
2. Middleware returns `402 Payment Required` with payment details
3. Client sends USDT payment on X Layer
4. Middleware verifies → unlocks endpoint
5. Response returned with data

### Risk Scan Flow
1. User inputs token address
2. `onchainos token risk` returns: rug risk, LP burn %, top holder %, bundle %
3. Risk score (0-100) displayed with color-coded threat level
4. Approvals tab shows active token spenders to revoke

---

## Deployment Addresses

| Contract | Network | Address |
|---|---|---|
| AgentPilotRegistry | X Layer (196) | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` |
| SimpleDCA | Arbitrum Sepolia (421614) | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` |

**Agentic Wallet**: `0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0`

Explorer: [OKX X Layer Explorer](https://www.okx.com/explorer/xlayer/address/0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e)

---

## Project Positioning in X Layer Ecosystem

AgentPilot is positioned as the **primary AI agent interface layer for X Layer**, filling three gaps:

1. **No unified DeFi dashboard exists for X Layer** — AgentPilot is the first all-in-one terminal
2. **AI agents need X Layer tooling** — The MCP server makes X Layer accessible to any AI agent
3. **On-chain agent identity is missing** — AgentPilotRegistry.sol creates a verifiable activity log for any agent operating on X Layer

As X Layer grows, AgentPilot becomes the infrastructure layer that connects AI agents to X Layer DeFi.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, Wagmi v2, Viem, Ethers.js, Recharts |
| Backend | Node.js, Express, TypeScript, OKX OnchainOS CLI |
| Contracts | Solidity 0.8.20, Hardhat, X Layer + Arbitrum Sepolia |
| AI/MCP | @modelcontextprotocol/sdk, stdio transport |
| Payments | x402 protocol, USDT on X Layer |
| Wallet | Wagmi: MetaMask, OKX Wallet, Coinbase, WalletConnect, Rabby |

---

## Local Setup

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/agentpilot
cd agentpilot

# Install all deps
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../mcp-server && npm install

# Configure env
cp .env.example .env
# Fill in: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE, PRIVATE_KEY

# Run backend
cd backend && npm run dev

# Run frontend
cd frontend && npm run dev

# Visit http://localhost:5173
```

---

## Team

- **zaxcoraider** — Full-stack developer, smart contract engineer

---

## License

MIT
