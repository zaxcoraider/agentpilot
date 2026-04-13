/**
 * ActionLogger — unified action recording
 *
 * On-chain (AgentPilotRegistry.sol) → only for critical actions: swaps, payments
 * Database (PostgreSQL via Prisma)   → everything: analytics, history, reads
 */

// ActionType enum — kept local so it works without Prisma client generated
export enum ActionType {
  SWAP = "SWAP",
  PAYMENT = "PAYMENT",
  INVEST = "INVEST",
  DCA_EXECUTE = "DCA_EXECUTE",
  SCAN = "SCAN",
  SEARCH = "SEARCH",
  SIGNAL = "SIGNAL",
}
import { db } from "./db";
import { logAction as logOnChain } from "./registry";

// Action types that get written to the blockchain
const ON_CHAIN_TYPES = new Set<ActionType>([
  ActionType.SWAP,
  ActionType.PAYMENT,
  ActionType.INVEST,
  ActionType.DCA_EXECUTE,
]);

/**
 * Record an action to DB always, on-chain only for critical types.
 * Non-blocking — never throws to caller.
 */
export function recordAction(
  agentId: string,
  type: ActionType,
  details: string,
  opts: { txHash?: string; cost?: number } = {}
): void {
  const shouldLogOnChain = ON_CHAIN_TYPES.has(type);

  // DB write (always)
  db.action.create({
    data: {
      agentId,
      type,
      details: details.slice(0, 500),
      txHash: opts.txHash ?? null,
      cost: opts.cost ?? 0,
      onChain: shouldLogOnChain,
    },
  }).catch((err) => {
    console.warn(`[db] action record failed: ${(err as Error).message}`);
  });

  // On-chain write (critical only)
  if (shouldLogOnChain) {
    logOnChain(type.toLowerCase(), details);
  }
}

/**
 * Get the default agent ID for the configured agent wallet.
 * Creates the agent+user record if it doesn't exist yet.
 */
let _cachedAgentId: string | null = null;

export async function getAgentId(): Promise<string | null> {
  if (_cachedAgentId) return _cachedAgentId;

  const { PRIVATE_KEY } = process.env;
  if (!PRIVATE_KEY) return null;

  try {
    const { ethers } = await import("ethers");
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    const agentAddress = wallet.address;

    // Upsert user
    const user = await db.user.upsert({
      where: { walletAddress: agentAddress },
      update: {},
      create: { walletAddress: agentAddress },
    });

    // Upsert agent
    const agent = await db.agent.upsert({
      where: { walletAddress: agentAddress },
      update: {},
      create: {
        userId: user.id,
        name: "AgentPilot",
        walletAddress: agentAddress,
      },
    });

    _cachedAgentId = agent.id;
    return agent.id;
  } catch (err) {
    console.warn(`[db] getAgentId failed: ${(err as Error).message}`);
    return null;
  }
}
