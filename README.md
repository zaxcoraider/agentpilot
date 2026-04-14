# AgentPilot — The Autonomous DeFi Agent Cockpit for X Layer

> **OKX Build X Hackathon Season 2 · X Layer Arena + Skills Arena**

AgentPilot is a fully autonomous AI-powered DeFi management dashboard built on X Layer. It combines real-time on-chain data, OKX OnchainOS skills, a Uniswap V4 DCA hook, and an MCP server into a single cockpit — enabling any user or AI agent to discover, trade, protect, earn, monitor, and pay autonomously on X Layer.

**2,471+ on-chain transactions** logged to `AgentPilotRegistry.sol` on X Layer mainnet.

---

## Live Demo

- **Frontend**: [Deployed on Vercel]
- **Backend API**: [Deployed on Railway]
- **Agentic Wallet**: `0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0`
- **Registry Contract (X Layer)**: `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e`
- **SimpleDCA Contract (Arbitrum Sepolia)**: `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e`
- **Explorer**: [View Agent Activity on OKLink](https://www.oklink.com/xlayer/address/0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0)

---

## What AgentPilot Does

AgentPilot collapses the entire DeFi workflow into one autonomous agent dashboard:

| Panel | What It Does |
|---|---|
| **Discover** | Hot tokens, whale movements, smart money signals across ETH/SOL/BNB |
| **Trade** | AUTO SWAP (agent signs autonomously) + MY WALLET (user signs) + DCA (Uniswap V4) |
| **Protect** | Token risk scan — auto-triggered when selecting tokens from Discover |
| **Earn** | Browse top DeFi yield products, deposit via OKX OnchainOS |
| **Monitor** | Wallet balance, OKB price chart, on-chain action count, autonomous agent status |
| **Pay** | x402 EIP-3009 micropayments — agent pays for its own intelligence |

---

## Autonomous Agent

AgentPilot runs a **self-directed trading strategy** every 30 minutes:

```
1. Check agent wallet OKB balance (safety floor: 0.005 OKB)
2. Fetch OKX OnchainOS smart money signals + trending tokens on X Layer
3. Score each token: signal strength + trending rank
4. If best score ≥ 30 → swap 0.001 OKB into that token
5. Log decision + reasoning on-chain to AgentPilotRegistry.sol
6. Repeat
```

**Kill switch**: Monitor panel has a live **PAUSE / RESUME** toggle — stop the agent instantly without touching the server.

---

## Architecture

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
│  AutonomousAgent → 30-min cycle, signal-scored trading strategy  │
│  x402 Middleware → EIP-3009 USDT micropayment gate (production)  │
│  x402Agent → auto-pays 402s via onchainos payment eip3009-sign   │
│  Registry Service → logs every action on-chain (X Layer)         │
│  OnchainOS CLI → token, swap, defi, signal, market, portfolio    │
└──────┬───────────────────────┬───────────────────────────────────┘
       │                       │
┌──────▼──────┐    ┌───────────▼──────────────────────────────────┐
│  MCP SERVER │    │              SMART CONTRACTS                   │
│  7 AI tools │    │                                               │
│  stdio/SSE  │    │  AgentPilotRegistry.sol (X Layer :196)        │
│  Claude/GPT │    │  → logAction(), 2,471+ actions recorded       │
└─────────────┘    │                                               │
                   │  AutoDCAHook.sol (Uniswap V4, Arb Sepolia)   │
                   │  → createPlan(), executeDCA(), DCAReady       │
                   │                                               │
                   │  SimpleDCA.sol (Arbitrum Sepolia :421614)     │
                   │  → createPlan(), isPlanDue(), markExecuted()  │
                   └───────────────────────────────────────────────┘
```

---

## OnchainOS Skills Used

| Panel | OnchainOS Skills |
|---|---|
| Discover | `token search`, `token hot-tokens`, `signal list` |
| Trade | `swap quote`, `swap swap`, `swap approve`, `swap check-approvals`, `gateway gas` |
| Protect | `token advanced-info`, `swap check-approvals` |
| Earn | `defi list`, `defi invest` |
| Monitor | `portfolio all-balances`, `market kline` |
| Pay | `payment eip3009-sign` |
| Autonomous Agent | `signal list`, `token hot-tokens`, `portfolio token-balances`, `swap swap` |

**MCP Servers connected**: `onchainos-cli` (local), `onchainos-mcp` (HTTP at web3.okx.com)

---

## x402 Payment Flow

AgentPilot implements **EIP-3009 USDT micropayments** — zero gas, off-chain signatures:

```
1. Agent hits premium endpoint → 402 Payment Required
2. Backend returns accepts[] (USDT, EIP-3009, X Layer :196)
3. onchainos payment eip3009-sign signs USDT transfer off-chain
4. Agent retries with X-PAYMENT: base64(authorization + signature)
5. OKX Payment API verifies → endpoint unlocked
6. Response returned — zero gas, instant
```

**x402-gated endpoints** ($0.001 USDT each):

| Endpoint | Description |
|---|---|
| `GET /api/signal/smart-money` | Smart money signals |
| `GET /api/security/token-risk/:address` | Token risk scan |
| `GET /api/defi/products` | DeFi yield products |
| `POST /api/defi/invest` | DeFi invest tx builder |
| `POST /api/swap/agent-execute` | Autonomous swap execution |

---

## Economy Loop

```
User pays x402 to use agent features
         ↓
Agent earns micropayments in USDT
         ↓
Agent uses OKB balance to swap autonomously
         ↓
Autonomous strategy generates more activity
         ↓
More on-chain logs → Most Active Agent prize
         ↓
Loop repeats — self-sustaining agent economy
```

---

## MCP Server (Skills Arena)

Located in `/mcp-server/` — exposes **7 tools** any Claude/GPT agent can call:

| Tool | Description |
|---|---|
| `agentpilot_search_token` | Search tokens on X Layer |
| `agentpilot_check_risk` | Security scan any token |
| `agentpilot_swap` | Execute real DEX swap on X Layer |
| `agentpilot_check_balance` | Get wallet token balances |
| `agentpilot_defi_explore` | Browse DeFi yield products |
| `agentpilot_create_dca` | Create on-chain DCA plan |
| `agentpilot_pay` | Send OKB payment via x402 |

---

## Security

- **CORS**: Restricted to deployed frontend domain only
- **Rate limiting**: 1 agent swap per IP per 10 min, 5 max per day
- **Amount cap**: Agent swaps capped at 1 unit max
- **Admin key**: Pause/resume + manual payments require `ADMIN_KEY`
- **x402**: All premium endpoints payment-gated in production

---

## Deployment Addresses

| Contract | Network | Address |
|---|---|---|
| AgentPilotRegistry | X Layer Mainnet (196) | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` |
| AutoDCAHook | Arbitrum Sepolia (421614) | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` |
| SimpleDCA | Arbitrum Sepolia (421614) | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` |

**Agentic Wallet**: `0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0`

---

## Local Setup

```bash
# Clone
git clone https://github.com/zaxcoraider/agentpilot
cd agentpilot

# Install deps
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../mcp-server && npm install

# Configure env
cp .env.example .env
# Required: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE, PRIVATE_KEY, XLAYER_RPC
# Optional: DATABASE_URL (PostgreSQL), ADMIN_KEY

# Run backend (port 3001)
cd backend && npm run dev

# Run frontend (port 5173)
cd frontend && npm run dev
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, Wagmi v2, Ethers.js v6, Recharts |
| Backend | Node.js, Express, TypeScript, OKX OnchainOS CLI |
| Contracts | Solidity 0.8.20, Hardhat, X Layer + Arbitrum Sepolia |
| AI/MCP | @modelcontextprotocol/sdk, stdio transport |
| Payments | x402, EIP-3009, USDT on X Layer (zero gas) |
| Wallets | MetaMask, OKX Wallet, Coinbase, WalletConnect, Rabby |

---

## Team

**zaxcoraider** — Full-stack developer, smart contract engineer

---

## License

MIT
