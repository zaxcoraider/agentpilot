# AgentPilot

**Autonomous DeFi agent dashboard powered by OKX OnchainOS on X Layer**

Live: [agentpilot-nu.vercel.app](https://agentpilot-nu.vercel.app)  
API: [agentpilot-production-34c7.up.railway.app](https://agentpilot-production-34c7.up.railway.app)  
Built for [OKX Build X Hackathon Season 2](https://www.okx.com/web3/build/hackathon)

---

## What is AgentPilot?

AgentPilot is an all-in-one autonomous DeFi cockpit that puts two AI-driven trading agents in a single terminal-style dashboard. It is built around the four OKX OnchainOS pillars:

| Pillar | Implementation |
|---|---|
| **Agentic Wallet** | OKX TEE-secured wallet executes swaps autonomously — no private key exposed |
| **AI Toolkit** | Claude Haiku analyses live whale signals and decides BUY/HOLD/WAIT every cycle |
| **Trade** | OKX DEX Aggregator V6 — swap, quote, approve, DCA via Uniswap V4 hook |
| **Payment** | x402 protocol + EIP-3009 USDT micropayments gate premium API endpoints |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND  (Vercel)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Discover │ │  Trade   │ │ Protect  │ │   Earn   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐ ┌────────────────────────────────────┐        │
│  │ Monitor  │ │         Agent (Dual-Agent)          │        │
│  └──────────┘ └────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                          │ /api/* (proxied via vercel.json)
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND  (Railway)                        │
│  Express + TypeScript                                        │
│  ┌──────────────────┐  ┌──────────────────────────────┐     │
│  │  OKX DEX API V6  │  │  OKLink X Layer Explorer API │     │
│  │  - Aggregator    │  │  - Transaction history       │     │
│  │  - Market data   │  │  - Token transfers           │     │
│  │  - Balances      │  └──────────────────────────────┘     │
│  └──────────────────┘                                        │
│  ┌─────────────────────────────────────────────────┐        │
│  │              DUAL AGENT ENGINE                  │        │
│  │                                                 │        │
│  │  TEE Agent (OKX Agentic Wallet)                 │        │
│  │  ├─ Claude Haiku analyses whale signals         │        │
│  │  ├─ Auto-executes BUY via TEE wallet            │        │
│  │  └─ Autonomous DCA with configurable intervals  │        │
│  │                                                 │        │
│  │  PK Agent (Private Key Wallet)                  │        │
│  │  ├─ Follows TEE agent signals (larger position) │        │
│  │  ├─ Portfolio rebalancing (OKB >80% → sell 25%) │        │
│  │  └─ Autonomous DCA scheduler (15s polling)      │        │
│  └─────────────────────────────────────────────────┘        │
│  ┌──────────────────┐  ┌──────────────────────────────┐     │
│  │  x402 Middleware │  │  AgentPilotRegistry (on-chain)│     │
│  │  EIP-3009 USDT   │  │  Every action logged to       │     │
│  │  micropayments   │  │  X Layer mainnet              │     │
│  └──────────────────┘  └──────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────────┐
│                      CONTRACTS                               │
│  X Layer Mainnet                                            │
│  └─ AgentPilotRegistry.sol  0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e  │
│                                                             │
│  Arbitrum Sepolia                                           │
│  ├─ AutoDCAHook.sol (Uniswap V4)  0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e  │
│  └─ SimpleDCA.sol               0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e  │
└─────────────────────────────────────────────────────────────┘
```

---

## Panels

### ◈ Discover
- Hot tokens across **X Layer, ETH, SOL, BNB, BASE** with 5M / 1H / 4H / 24H timeframes
- Token search by name, symbol, or address
- Smart Money signals — whale wallet accumulation scoring
- Click any token → auto-fills Trade and Protect panels

### ⇄ Trade
- **AUTO SWAP** — backend signs with agent private key, executes on X Layer
- **MY WALLET** — MetaMask / OKX Wallet signs, you hold the key
- **DCA** — recurring swap plans via Uniswap V4 AutoDCAHook (Arb Sepolia)
- Real-time quotes from OKX DEX Aggregator V6

### ⚿ Protect
- Token security scan via OKX `token/advanced-info` API
- Safety score ring (0–100), top 10 holder %, LP burn %, bundle detection
- Approval checker — see unlimited approvals on your wallet

### ◎ Earn
- DeFi product browser (Aave, Compound, Lido, Yearn, Venus, PancakeSwap …)
- APR rates, TVL, supported chains
- One-click invest flow via OKX DeFi API

### ◉ Monitor
- Connected wallet balance + OKB price chart (24H candles)
- **Real X Layer transaction history** via OKLink API — SEND/RECV labels, token amounts, clickable tx hashes
- Total on-chain action count (live from RPC)
- Autonomous agent status — last decision, pause/resume

### ⬡ Agent (Dual-Agent)
**TEE Agent** — `0xae5816be55e5c36fcb7f7ba61dcfefac70715c0c`
- Claude Haiku AI analyses whale signals → BUY / HOLD / WAIT
- Executes via OKX TEE-secured agentic wallet (no private key)
- Autonomous DCA with configurable pair + interval

**PK Agent** — `0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0`
- FOLLOW_TEE: copies TEE trades with 20% OKB position
- REBALANCE: sells 25% OKB when portfolio > 80% concentrated
- Autonomous DCA scheduler (15s polling loop)

---

## Key Addresses

### Wallets
| Wallet | Address | Chain |
|---|---|---|
| OKX Agentic (TEE) | `0xae5816be55e5c36fcb7f7ba61dcfefac70715c0c` | X Layer |
| Agent / PK Wallet | `0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0` | X Layer |

### Contracts
| Contract | Address | Chain |
|---|---|---|
| AgentPilotRegistry | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` | X Layer Mainnet |
| AutoDCAHook (Uniswap V4) | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` | Arbitrum Sepolia |
| SimpleDCA | `0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e` | Arbitrum Sepolia |

### Token Addresses (X Layer Mainnet)
| Token | Address |
|---|---|
| OKB (native) | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` |
| USDT | `0x1E4a5963aBFD975d8c9021ce480b42188849D41d` |
| USDC | `0x74b7f16337b8972027f6196a17a631ac6de26d22` |
| WBTC | `0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1` |
| WETH | `0x5a77f1443d16ee5761d310e38b62f77f726bC71c` |

---

## MCP Server (Skills Arena)

AgentPilot ships a 7-tool MCP server for Claude Desktop and any MCP client:

| Tool | Description |
|---|---|
| `search_token` | Search tokens by name/symbol/address |
| `check_risk` | Scan token security risk score |
| `swap` | Execute a swap via OKX DEX Aggregator |
| `check_balance` | Get wallet token balances |
| `defi_explore` | Browse DeFi yield products |
| `create_dca` | Create an autonomous DCA plan |
| `pay` | Send OKB payment via x402 |

### Connect (stdio)
```json
{
  "mcpServers": {
    "agentpilot": {
      "command": "node",
      "args": ["path/to/agentpilot/mcp-server/dist/index.js"]
    }
  }
}
```

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS, Wagmi v2, Recharts |
| Backend | Node.js 20, Express, TypeScript |
| Blockchain | ethers.js v6, X Layer Mainnet (chainId 196) |
| AI | Claude Haiku `claude-haiku-4-5-20251001` (rule-based fallback if no key) |
| OKX APIs | DEX Aggregator V6, Market V6, Balance V6, OKLink X Layer Explorer |
| Contracts | Solidity 0.8.20, Hardhat |
| Payment | x402 protocol, EIP-3009 USDT zero-gas micropayments |
| Deploy | Railway (backend + full-stack Docker), Vercel (frontend) |

---

## Local Development

### Prerequisites
- Node.js 20+
- `onchainos` CLI (Windows) — `onchainos wallet login` for TEE wallet

### Setup
```bash
git clone https://github.com/zaxcoraider/agentpilot
cd agentpilot

# Install all deps
cd backend  && npm install
cd ../frontend && npm install
```

### Environment (`.env` at repo root)
```env
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=

PRIVATE_KEY=              # PK wallet private key
EVM_PRIVATE_KEY=          # Same key (used by pkAgent + agentWallet fallback)
AGENTIC_WALLET=0xae5816be55e5c36fcb7f7ba61dcfefac70715c0c
AGENTIC_WALLET_ADDRESS=0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0
PK_WALLET_ADDRESS=0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0

ANTHROPIC_API_KEY=        # Optional — falls back to rule-based signal engine

XLAYER_RPC=https://rpc.xlayer.tech
CONTRACT_ADDRESS=0xF8139F3ff5c6a902ad0E18e0A3Bf49eA81eA107e
USDT_ADDRESS=0x1E4a5963aBFD975d8c9021ce480b42188849D41d
ADMIN_KEY=your-admin-key
NODE_ENV=development
```

### Run
```bash
# Terminal 1
cd backend && npm run dev     # http://localhost:3001

# Terminal 2
cd frontend && npm run dev    # http://localhost:5173
```

---

## Deploy

### Railway (Backend)
1. Connect GitHub repo, set root directory to `/`
2. Railway uses `Dockerfile` at repo root (builds frontend + backend together)
3. Add all env vars in Railway → Variables

### Vercel (Frontend)
- Vercel auto-detects `frontend/` Vite project
- API calls proxied to Railway via `frontend/vercel.json` rewrites
- No env vars needed (all addresses are hardcoded with fallbacks)

---

## On-Chain Activity

The agent wallet has logged **1,900+ transactions** on X Layer mainnet.

[View on OKLink →](https://www.oklink.com/xlayer/address/0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0)

---

## Roadmap

AgentPilot v1 is a working demo. Here is what comes next.

### Phase 1 — Foundation *(current)*
- Six-module dashboard live on X Layer mainnet
- All OKX OnchainOS skills integrated
- AgentPilotRegistry.sol for on-chain action logging
- x402 micropayment gating for premium endpoints
- Uniswap V4 Auto-DCA hook deployed
- MCP server packaged for Claude Code / Cursor / any MCP client

### Phase 2 — Multi-Agent & Auth
- Sign-In with Ethereum + email magic links
- Multi-agent support — create and manage up to 5 agents per account
- PostgreSQL for persistent storage, Redis for session management
- Alert engine — Telegram / email on price thresholds, security flags, wallet drops
- Per-agent spending limits and emergency kill switches

### Phase 3 — Real-Time Intelligence
- Replace polling with full WebSocket streaming (prices, signals, agent actions)
- Real-time P&L calculation across all agents
- Public API with OpenAPI docs and TypeScript SDK
- Tiered pricing: Free · Pro · Enterprise — all paid via x402 on X Layer

### Phase 4 — Agent Marketplace
- Developers publish and monetize pre-built agent strategies
- One-click install: yield optimizer, meme sniper, cross-DEX arb bot, and more
- Strategy creators earn revenue via x402 micropayments, automatically settled
- Composable agent pipelines — one agent's output feeds another agent's input

### Phase 5 — Cross-Chain Expansion
- Expand beyond X Layer: Ethereum, Base, Arbitrum, Solana
- Unified cross-chain command center — discover, trade, earn across any supported network
- Smart routing selects the best chain per operation (gas, liquidity, speed)
- Consolidated cross-chain portfolio and P&L

### Phase 6 — Enterprise & Institutional
- Role-based access control, compliance audit trails, white-label deployment
- OKX Agent Trade Kit integration — CEX + DEX in one continuous environment
- KYA (Know Your Agent) — link autonomous actions back to human accountability
- Fleet management for 50+ agents at institutional scale

---

## Built With

**OKX Build X Hackathon Season 2** — X Layer Arena + Skills Arena
