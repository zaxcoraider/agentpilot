import { PrismaClient, AgentStatus, ActionType, DCAPlanStatus, AlertType, SubscriptionTier } from "@prisma/client";

const db = new PrismaClient();

const AGENT_WALLET = "0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0";
const TEST_USER_WALLET = "0xae5816be55e5c36fcb7f7ba61dcfefac70715c0c";

async function main() {
  console.log("Seeding database...");

  // ─── User ────────────────────────────────────────────────────────────────────

  const user = await db.user.upsert({
    where: { walletAddress: TEST_USER_WALLET },
    update: {},
    create: {
      walletAddress: TEST_USER_WALLET,
      email: "demo@agentpilot.xyz",
    },
  });
  console.log(`User: ${user.id}`);

  // ─── Agent ───────────────────────────────────────────────────────────────────

  const agent = await db.agent.upsert({
    where: { walletAddress: AGENT_WALLET },
    update: {},
    create: {
      userId: user.id,
      name: "AgentPilot Alpha",
      walletAddress: AGENT_WALLET,
      status: AgentStatus.ACTIVE,
    },
  });
  console.log(`Agent: ${agent.id}`);

  // ─── Actions (sample history) ─────────────────────────────────────────────

  const sampleActions = [
    {
      type: ActionType.SWAP,
      details: "swap:OKB→USDT:0.001:xlayer",
      txHash: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      cost: 0.000025,
      onChain: true,
    },
    {
      type: ActionType.PAYMENT,
      details: "x402:auto-pay:/signal/smart-money:0.000025OKB",
      txHash: "0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4",
      cost: 0.000025,
      onChain: true,
    },
    {
      type: ActionType.INVEST,
      details: "earn-discover:8products:best=USDT Lending@18.50%:iZUMi",
      cost: 0,
      onChain: true,
    },
    {
      type: ActionType.SCAN,
      details: "balance:0x60f48fcF696f77ca20fE0e06028fd25086a8F3D0",
      cost: 0,
      onChain: false,
    },
    {
      type: ActionType.SIGNAL,
      details: "signal:ethereum:bullish:4signals",
      cost: 0.000025,
      onChain: false,
    },
    {
      type: ActionType.SEARCH,
      details: "search:OKB:xlayer",
      cost: 0,
      onChain: false,
    },
  ];

  for (const action of sampleActions) {
    await db.action.create({
      data: { agentId: agent.id, ...action },
    });
  }
  console.log(`Actions: ${sampleActions.length} created`);

  // ─── DCA Plans ────────────────────────────────────────────────────────────

  const now = new Date();
  const dcaPlans = [
    {
      tokenIn: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      tokenOut: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
      amount: "0.001",
      intervalSecs: 3600,
      nextExecution: new Date(now.getTime() + 3600 * 1000),
      status: DCAPlanStatus.ACTIVE,
      planIdOnChain: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    },
    {
      tokenIn: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      tokenOut: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
      amount: "0.005",
      intervalSecs: 86400,
      nextExecution: new Date(now.getTime() + 86400 * 1000),
      status: DCAPlanStatus.PAUSED,
    },
  ];

  for (const plan of dcaPlans) {
    await db.dCAPlan.create({
      data: { agentId: agent.id, ...plan },
    });
  }
  console.log(`DCA Plans: ${dcaPlans.length} created`);

  // ─── Alerts ───────────────────────────────────────────────────────────────

  const alerts = [
    {
      type: AlertType.PRICE_BELOW,
      condition: { token: "OKB", threshold: 75, direction: "below", chain: "xlayer" },
      active: true,
    },
    {
      type: AlertType.LOW_BALANCE,
      condition: { threshold: 0.01, asset: "OKB", wallet: AGENT_WALLET },
      active: true,
    },
    {
      type: AlertType.DCA_EXECUTED,
      condition: { planId: "0x1234...abcd" },
      active: false,
    },
  ];

  for (const alert of alerts) {
    await db.alert.create({
      data: { agentId: agent.id, ...alert },
    });
  }
  console.log(`Alerts: ${alerts.length} created`);

  // ─── Subscription ─────────────────────────────────────────────────────────

  await db.subscription.upsert({
    where: { id: `sub_${user.id}` },
    update: {},
    create: {
      id: `sub_${user.id}`,
      userId: user.id,
      tier: SubscriptionTier.FREE,
      x402PaymentCount: 6,
      expiresAt: null,
    },
  });
  console.log("Subscription: FREE tier created");

  console.log("\nSeed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
