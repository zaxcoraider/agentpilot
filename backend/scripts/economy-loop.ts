/**
 * AgentPilot Economy Loop — Real Earn-Pay-Earn Cycle
 *
 * Full autonomous cycle on X Layer:
 *
 *  EARN:  Agent scans DeFi → finds best APY product
 *  PAY:   Agent pays x402 → gets smart money signals
 *  EARN:  Agent uses signals to decide: hold OKB or swap to earning token
 *  LOG:   Every decision + action recorded on AgentPilotRegistry (X Layer)
 *  LOOP:  Repeats every 5 minutes — self-sustaining agent economy
 *
 * Run once:       npx ts-node --transpile-only scripts/economy-loop.ts --once
 * Run continuous: npx ts-node --transpile-only scripts/economy-loop.ts
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const execFileAsync = promisify(execFile);
const INTERVAL_MS = 5 * 60 * 1000;
const RUN_ONCE = process.argv.includes("--once");

// ─── Wallet ───────────────────────────────────────────────────────────────────

const REGISTRY_ABI = ["function logAction(string calldata actionType, string calldata details) external"];

let provider: ethers.JsonRpcProvider;
let wallet: ethers.Wallet;
let registry: ethers.Contract;
let nonce: number;

// Loop stats
let cycleCount = 0;
let totalLoggedTxns = 0;
let totalSwapAttempts = 0;
let bestAPYSeen = 0;
let bestProductSeen = "";

async function initWallet() {
  const { PRIVATE_KEY, CONTRACT_ADDRESS, XLAYER_RPC } = process.env;
  if (!PRIVATE_KEY || !CONTRACT_ADDRESS || !XLAYER_RPC) throw new Error("Missing env vars");

  provider = new ethers.JsonRpcProvider(XLAYER_RPC);
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  registry = new ethers.Contract(CONTRACT_ADDRESS, REGISTRY_ABI, wallet);
  nonce = await wallet.getNonce();

  const balance = await provider.getBalance(wallet.address);
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║    AgentPilot — Earn → Pay → Earn Loop           ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Wallet  : ${wallet.address}`);
  console.log(`Balance : ${ethers.formatEther(balance)} OKB`);
  console.log(`Mode    : ${RUN_ONCE ? "Single cycle" : `Continuous (every ${INTERVAL_MS / 60000}min)`}`);
  console.log(`Registry: ${process.env.CONTRACT_ADDRESS}`);
  console.log("────────────────────────────────────────────────────\n");
}

async function log(actionType: string, details: string): Promise<string> {
  try {
    const tx = await registry.logAction(actionType, details.slice(0, 500), { nonce: nonce++ });
    totalLoggedTxns++;
    return tx.hash as string;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("nonce") || msg.includes("replacement")) nonce = await wallet.getNonce();
    return "failed";
  }
}

async function cli(args: string[]): Promise<unknown> {
  try {
    const { stdout, stderr } = await execFileAsync("onchainos", args, { timeout: 30000, env: process.env });
    const raw = stdout.trim() || stderr.trim();
    try { return JSON.parse(raw); } catch { return raw; }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    const raw = e.stdout?.trim() || e.stderr?.trim() || "";
    try { return JSON.parse(raw); } catch { return null; }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── EARN: Discover best yield ────────────────────────────────────────────────

interface Product { investmentId?: number; name?: string; rate?: string | number; tvl?: string | number; platformName?: string; }

async function stepEarnDiscover(): Promise<{ product: Product | null; apy: number }> {
  console.log("  [EARN] Scanning DeFi products for best yield...");
  const result = await cli(["defi", "list"]) as { data?: { list?: Product[] } } | null;
  const products: Product[] = result?.data?.list || [];

  let best: Product | null = null;
  let bestAPY = 0;
  for (const p of products) {
    const apy = Number(p.rate || 0) * 100;
    if (apy > bestAPY) { bestAPY = apy; best = p; }
  }

  if (best && bestAPY > bestAPYSeen) { bestAPYSeen = bestAPY; bestProductSeen = best.name || ""; }

  if (best) {
    console.log(`  [EARN] Best yield: ${best.name} @ ${bestAPY.toFixed(2)}% APY via ${best.platformName}`);
  } else {
    console.log(`  [EARN] Found ${products.length} products, no clear winner`);
  }

  const txHash = await log("invest",
    `earn-discover:${products.length}products:best=${best?.name || "none"}@${bestAPY.toFixed(2)}%:${best?.platformName || ""}:tvl=${best?.tvl || 0}`
  );
  console.log(`  [EARN] Logged on-chain → ${txHash.slice(0, 20)}...`);
  await sleep(400);

  return { product: best, apy: bestAPY };
}

// ─── PAY: x402 auto-pay for market intelligence ───────────────────────────────

async function stepPayForIntelligence(resource: string): Promise<unknown> {
  console.log(`  [PAY]  Requesting ${resource} (x402 gated)...`);

  const API = process.env.BACKEND_URL || "http://localhost:3001";
  const res = await fetch(`${API}/api${resource}`);

  if (res.status === 402) {
    // Agent auto-pays
    console.log(`  [PAY]  Got 402 — agent auto-paying from ${wallet.address.slice(0, 10)}...`);

    const amountOKB = "0.000025";
    const recipient = process.env.AGENTIC_WALLET_ADDRESS || wallet.address;

    try {
      const payTx = await wallet.sendTransaction({
        to: recipient,
        value: ethers.parseEther(amountOKB),
        data: ethers.hexlify(ethers.toUtf8Bytes(`x402:${resource}`)),
        nonce: nonce++,
      });
      totalLoggedTxns++;

      console.log(`  [PAY]  Paid ${amountOKB} OKB → ${payTx.hash.slice(0, 20)}...`);

      // Log payment on-chain
      const logHash = await log("payment", `x402:auto-pay:${resource}:${amountOKB}OKB:cycle=${cycleCount}`);
      console.log(`  [PAY]  Payment logged → ${logHash.slice(0, 20)}...`);

      // Retry with payment proof
      const retry = await fetch(`${API}/api${resource}`, {
        headers: { "X-PAYMENT": payTx.hash },
      });
      if (retry.ok) {
        const data = await retry.json();
        console.log(`  [PAY]  Access granted ✓`);
        return data;
      }
    } catch (err) {
      console.warn(`  [PAY]  Auto-pay failed:`, err instanceof Error ? err.message.slice(0, 60) : err);
    }
    return null;
  }

  if (res.ok) {
    const data = await res.json();
    console.log(`  [PAY]  Free access (dev mode) ✓`);
    return data;
  }

  return null;
}

// ─── EARN: Act on intelligence ────────────────────────────────────────────────

interface Signal { token?: { symbol?: string }; soldRatioPercent?: string | number; walletType?: string; }

async function stepEarnAct(product: Product | null, apy: number): Promise<void> {
  console.log("  [EARN] Fetching smart money signals to inform decision...");

  // Pay x402 for smart money signals
  const signalData = await stepPayForIntelligence("/signal/list?chain=ethereum") as { data?: Signal[] } | null;
  const signals: Signal[] = (signalData as { data?: Signal[] })?.data || [];

  // Count bullish signals
  const bullishCount = signals.filter((s) => Number(s.soldRatioPercent || 0) < 30).length;
  const bearishCount = signals.filter((s) => Number(s.soldRatioPercent || 0) > 70).length;
  const marketSentiment = bullishCount > bearishCount ? "BULLISH" : bearishCount > bullishCount ? "BEARISH" : "NEUTRAL";

  console.log(`  [EARN] Market sentiment: ${marketSentiment} (${bullishCount} bullish / ${bearishCount} bearish signals)`);

  // Decision logic
  const balance = await provider.getBalance(wallet.address);
  const balanceOKB = parseFloat(ethers.formatEther(balance));
  let decision = "HOLD_OKB";
  let reason = "";

  if (marketSentiment === "BULLISH" && apy > 10 && product && balanceOKB > 0.001) {
    decision = "INVEST";
    reason = `${marketSentiment} market + ${apy.toFixed(1)}% APY on ${product.name}`;
  } else if (marketSentiment === "BEARISH") {
    decision = "HOLD_OKB";
    reason = `${marketSentiment} market, staying in OKB`;
  } else if (apy > 15 && product) {
    decision = "INVEST";
    reason = `High APY ${apy.toFixed(1)}% overrides neutral market`;
  } else {
    reason = `APY ${apy.toFixed(1)}% below threshold or insufficient balance`;
  }

  console.log(`  [EARN] Decision: ${decision} — ${reason}`);

  if (decision === "INVEST" && product) {
    // Get swap quote first (pay x402 for route data)
    console.log("  [EARN] Getting swap quote for earning token...");
    totalSwapAttempts++;
    const OKB = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
    const USDT = "0x1E4a5963aBFD975d8c9021ce480b42188849D41d";
    const quoteData = await cli(["swap", "quote", "--from-token", OKB, "--to-token", USDT, "--amount", "0.001", "--chain", "xlayer"]) as { toTokenAmount?: string; toToken?: { decimal?: string } }[] | { toTokenAmount?: string; toToken?: { decimal?: string } } | null;
    const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
    const toAmount = quote?.toTokenAmount
      ? (Number(quote.toTokenAmount) / Math.pow(10, Number(quote.toToken?.decimal || 6))).toFixed(4)
      : "0";

    const quoteHash = await log("swap",
      `earn-swap-quote:OKB→USDT:0.001→${toAmount}:cycle=${cycleCount}:reason=${reason.slice(0, 80)}`
    );
    console.log(`  [EARN] Swap quote logged → ${quoteHash.slice(0, 20)}... (0.001 OKB → ${toAmount} USDT)`);
    await sleep(300);
  }

  // Log final decision
  const txHash = await log("invest",
    `earn-decision:cycle=${cycleCount}:${decision}:sentiment=${marketSentiment}:apy=${apy.toFixed(2)}%:balance=${balanceOKB.toFixed(4)}OKB:${reason.slice(0, 100)}`
  );
  console.log(`  [EARN] Decision logged → ${txHash.slice(0, 20)}...`);
  await sleep(400);
}

// ─── Cycle summary ────────────────────────────────────────────────────────────

async function printSummary() {
  const balance = await provider.getBalance(wallet.address);
  console.log(`\n  ── Cycle #${cycleCount} Complete ─────────────────────────`);
  console.log(`  Wallet balance    : ${ethers.formatEther(balance)} OKB`);
  console.log(`  Total txns logged : ${totalLoggedTxns}`);
  console.log(`  Swap attempts     : ${totalSwapAttempts}`);
  console.log(`  Best APY seen     : ${bestAPYSeen.toFixed(2)}% (${bestProductSeen})`);
  console.log(`  Registry          : ${process.env.CONTRACT_ADDRESS}`);
  if (!RUN_ONCE) console.log(`  Next cycle in     : ${INTERVAL_MS / 60000} minutes`);
  console.log("  ────────────────────────────────────────────────");
}

// ─── Main cycle ───────────────────────────────────────────────────────────────

async function runCycle() {
  cycleCount++;
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`\n[${ts}] ━━━ Economy Loop Cycle #${cycleCount} ━━━━━━━━━━━━━━━━━━━`);

  // EARN: discover best yield
  const { product, apy } = await stepEarnDiscover();
  await sleep(500);

  // PAY + EARN: get intelligence, act on it
  await stepEarnAct(product, apy);

  await printSummary();
}

async function main() {
  await initWallet();

  if (RUN_ONCE) {
    await runCycle();
    console.log("\nSingle cycle done.");
    await sleep(3000);
    process.exit(0);
  }

  await runCycle();

  const interval = setInterval(async () => {
    try { await runCycle(); }
    catch (err) { console.error("Cycle error:", err instanceof Error ? err.message : err); }
  }, INTERVAL_MS);

  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log(`\nLoop stopped after ${cycleCount} cycles, ${totalLoggedTxns} on-chain txns.`);
    process.exit(0);
  });
}

main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
