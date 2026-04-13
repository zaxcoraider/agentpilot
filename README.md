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

AgentPilot collapses the entire DeFi workflow into one autonomous agent dashboard:

- **Discovers** hot tokens and whale movements across chains (X Layer, ETH, SOL, BNB, BASE)
- **Trades** via OKX DEX with real swap quotes and execution through the Agentic Wallet
- **Protects** users by scanning tokens for rug risk before buying — auto-triggered on token selection
- **Earns** by browsing and depositing into top DeFi yield products
- **Monitors** wallet balances, price charts, and on-chain agent activity
- **Pays** via x402 EIP-3009 micropayment protocol — zero gas, USDT on X Layer

Every action is logged on-chain to `AgentPilotRegistry.sol` on X Layer, creating a verifiable audit trail of autonomous agent activity.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Wagmi)                  │
│  Discover │ Trade │ Protect │ Earn │ Monitor │ Pay               │
│  Click trending token → auto-fills Trade + Protect panels        │
│  Multi-wallet: OKX, MetaMask, Coinbase, WalletConnect, Rabby     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ /api (REST)
┌──────────────────────────▼──────────────────────────────────────┐
│                    BACKEND (Express + Node.js)                    │
│                                                                   │
│  Routes: swap, discover, protect, earn, dca, monitor, pay        │
│  x402 Middleware → EIP-3009 USDT micropayment gate               │
│  x402Agent → auto-pays 402s via onchainos payment eip3009-sign   │
│  Registry Service → logs every action on-chain (X Layer)         │
│  OnchainOS CLI → token, swap, defi, signal, market, portfolio    │
└──────┬───────────────────────┬───────────────────────────────────┘
       │                       │
┌──────▼──────┐    ┌───────────▼──────────────────────────────────┐
│  MCP SERVER │    │              SMART CONTRACTS                   │
│  7 AI tools │    │                                               │
│  stdio/SSE  │    │  AgentPilotRegistry.sol (X Layer :196)        │
│  Claude/GPT │    │  → logAction(), getRecentActions()            │
└─────────────┘    │                                               │
                   │  AutoDCAHook.sol (Uniswap V4, Arb Sepolia)   │
                   │  → createPlan(), executeDCA(), DCAReady       │
                   │                                               │
                   │  SimpleDCA.sol (Arbitrum Sepolia :421614)     │
                   │  → createPlan(), isPlanDue(), markExecuted()  │
                   └───────────────────────────────────────────────┘
```

---

## OnchainOS Skill Usage

AgentPilot uses the following OKX OnchainOS CLI modules across all 6 panels:

| Panel | OnchainOS Skills Used |
|---|---|
| Discover | `token search`, `token hot-tokens`, `signal list` (Smart Money/KOL/Whale) |
| Trade | `swap quote`, `swap execute`, `swap approve`, `swap check-approvals`, `swap chains`, `gateway gas`, `gateway simulate` |
| Protect | `token advanced-info`, `swap check-approvals` |
| Earn | `defi list`, `defi invest` |
| Monitor | `portfolio all-balances`, `portfolio total-value`, `market kline`, `market price` |
| Pay | `payment eip3009-sign`, `payment x402-pay`, `gateway broadcast` |

**MCP Server**: `onchainos-mcp` connected at `https://web3.okx.com/api/v1/onchainos-mcp`

---

## Uniswap AI Skills Usage

- **`pay-with-any-token`** — x402 payment challenges resolved via Uniswap swaps
- **`uniswap-v4-hooks`** — AutoDCAHook for automated DCA execution on every swap
- **`swap-integration`** — Uniswap Trading API as swap fallback alongside OKX DEX

---

## MCP Server (Skills Arena)

Located in `/mcp-server/`, exposes **7 tools** any Claude/GPT agent can call:

| Tool | Description |
|---|---|
| `agentpilot_search_token` | Search tokens on X Layer |
| `agentpilot_check_risk` | Run security scan on any token |
| `agentpilot_swap` | Execute a real DEX swap on X Layer |
| `agentpilot_check_balance` | Get wallet token balances |
| `agentpilot_defi_explore` | Browse DeFi yield products |
| `agentpilot_create_dca` | Create an on-chain DCA plan |
| `agentpilot_pay` | Send OKB payment via x402 |

---

## x402 Payment Flow (Agentic Payments)

AgentPilot implements **EIP-3009 USDT micropayments** — zero gas, off-chain signatures:

```
1. Agent hits premium endpoint → 402 Payment Required
2. Backend returns accepts[] array (USDT, EIP-3009, X Layer)
3. onchainos payment eip3009-sign signs USDT transfer off-chain
4. Agent retries with X-PAYMENT: base64(authorization + signature)
5. Backend verifies via OKX Payment API → unlocks endpoint
6. Response returned — no gas spent, instant settlement
```

Gated endpoints: Smart Money Signals, Token Risk Scan, DeFi Products, DeFi Invest

---

## Economy Loop

```
1. Agent scans DeFi products (pays x402 → $0.001 USDT, zero gas)
2. Agent finds highest APY product
3. Agent swaps OKB → deposit token (logs to registry)
4. Agent deposits into product (earns yield)
5. Yield funds future x402 payments
6. Loop repeats — fully autonomous
```

---

## Working Mechanics

### Token Selection Flow (Cross-Panel)
1. User sees trending tokens in Discover panel (5M/1H/4H/24H timeframes)
2. User clicks any token → Trade panel pre-fills TO address, Protect panel auto-scans risk
3. All panels focused on same token simultaneously

### Swap Flow
1. User inputs FROM/TO tokens + amount in Trade panel
2. Backend calls `onchainos swap quote` → best price across 500+ DEXs
3. Agent confirms → `onchainos swap execute` sends tx via OKX DEX
4. Registry logs the swap action on X Layer

### DCA Flow
1. User connects wallet → sets token pair + amount + interval
2. Wallet signs `createPlan()` on AutoDCAHook (Uniswap V4, Arb Sepolia)
3. Off-chain keeper checks `isPlanDue()` → triggers OKX DEX swap
4. `DCAReady` event emitted for keepers to pick up

### Risk Scan Flow
1. Auto-triggered when token selected from Discover panel
2. `onchainos token advanced-info` returns: rug risk, LP burn %, top holder %, bundle %
3. Safety score (0-100) displayed with color-coded threat level

---

## Deployment Addresses

| Contract | Network | Address |
|---|---|---|
| AgentPilotRegistry | X Layer (196) | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` |
| AutoDCAHook | Arbitrum Sepolia (421614) | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` |
| SimpleDCA | Arbitrum Sepolia (421614) | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` |

**Agentic Wallet**: `0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0`

Explorer: [OKX X Layer Explorer](https://www.oklink.com/xlayer/address/0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e)

---

## Local Setup

```bash
# Clone
git clone https://github.com/zaxcoraider/agentpilot
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

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, Wagmi v2, Viem, Ethers.js, Recharts |
| Backend | Node.js, Express, TypeScript, OKX OnchainOS CLI |
| Contracts | Solidity 0.8.20, Hardhat, X Layer + Arbitrum Sepolia |
| AI/MCP | @modelcontextprotocol/sdk, stdio + HTTP transport |
| Payments | x402 protocol, EIP-3009, USDT on X Layer (zero gas) |
| Wallet | Wagmi: MetaMask, OKX Wallet, Coinbase, WalletConnect, Rabby |

---

## Team

- **zaxcoraider** — Full-stack developer, smart contract engineer

---

## License

MIT
