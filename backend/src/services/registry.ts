import { ethers } from "ethers";

const ABI = [
  "function logAction(string calldata actionType, string calldata details) external",
];

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let contractAddress: string | null = null;
let nonce: number | null = null;
let busy = false;
const queue: Array<{ actionType: string; details: string }> = [];

function init(): boolean {
  const { PRIVATE_KEY, CONTRACT_ADDRESS, XLAYER_RPC } = process.env;
  if (!PRIVATE_KEY || !CONTRACT_ADDRESS || !XLAYER_RPC) return false;

  if (!provider) {
    provider = new ethers.JsonRpcProvider(XLAYER_RPC);
    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    contractAddress = CONTRACT_ADDRESS;
  }
  return true;
}

async function processQueue() {
  if (busy || queue.length === 0) return;
  busy = true;

  try {
    if (!init() || !wallet || !contractAddress) { busy = false; return; }

    const contract = new ethers.Contract(contractAddress, ABI, wallet);

    // Sync nonce once, then track locally to avoid conflicts
    if (nonce === null) {
      nonce = await wallet.getNonce();
    }

    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        const tx = await contract.logAction(
          item.actionType,
          item.details.slice(0, 500),
          { nonce: nonce! }
        );
        nonce!++;
        console.log(`[registry] logged "${item.actionType}" tx: ${tx.hash}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Reset nonce on nonce errors so we resync next cycle
        if (msg.includes("nonce") || msg.includes("replacement") || msg.includes("NONCE")) {
          nonce = null;
        }
        console.warn(`[registry] log failed: ${msg}`);
      }
    }
  } finally {
    busy = false;
  }
}

/**
 * Log an action to AgentPilotRegistry.sol on X Layer.
 * Non-blocking — queued to avoid nonce conflicts, never throws.
 */
export function logAction(actionType: string, details: string): void {
  queue.push({ actionType, details });
  // Run async without awaiting
  processQueue().catch(() => { busy = false; });
}
