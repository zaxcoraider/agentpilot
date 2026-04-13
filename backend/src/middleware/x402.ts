import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { ethers } from "ethers";
import { logAction } from "../services/registry";

// USDT on X Layer mainnet (ERC-20, 6 decimals)
const USDT_XLAYER = process.env.USDT_ADDRESS || "0x1E4a5963aBFD975d8c9021ce480b42188849D41d";
// $0.001 USDT = 1000 units (6 decimals)
const DEFAULT_PRICE = "1000";

/** Build OKX API auth headers (HMAC SHA256) */
function okxHeaders(method: string, path: string, body = ""): Record<string, string> {
  const timestamp = new Date().toISOString();
  const message = timestamp + method.toUpperCase() + path + body;
  const sign = crypto
    .createHmac("sha256", process.env.OKX_SECRET_KEY || "")
    .update(message)
    .digest("base64");

  return {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": process.env.OKX_API_KEY || "",
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": process.env.OKX_PASSPHRASE || "",
  };
}

/** Verify payment — checks on-chain tx OR OKX Payment API */
async function verifyPayment(payment: string, resource: string): Promise<boolean> {
  // If payment looks like a tx hash (0x + 64 hex chars), verify on-chain
  if (/^0x[0-9a-fA-F]{64}$/.test(payment)) {
    return verifyOnChainTx(payment, resource);
  }

  // Otherwise try OKX Payment API
  const path = "/api/v5/dex/payment/verify";
  const body = JSON.stringify({ payment, resource, network: "eip155:196" });
  try {
    const response = await fetch(`https://web3.okx.com${path}`, {
      method: "POST",
      headers: okxHeaders("POST", path, body),
      body,
    });
    const data = (await response.json()) as { code: string };
    return data.code === "0";
  } catch {
    return process.env.NODE_ENV === "development";
  }
}

/** Verify an on-chain OKB payment tx */
async function verifyOnChainTx(txHash: string, resource: string): Promise<boolean> {
  const { XLAYER_RPC, AGENTIC_WALLET_ADDRESS } = process.env;
  if (!XLAYER_RPC || !AGENTIC_WALLET_ADDRESS) return false;

  try {
    const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
    const receipt = await provider.getTransactionReceipt(txHash);
    const tx = await provider.getTransaction(txHash);
    if (!receipt || !tx) return false;

    // Verify: paid to our wallet, has value, recent (within 5 min)
    const toAddress = tx.to?.toLowerCase();
    const ourAddress = AGENTIC_WALLET_ADDRESS.toLowerCase();
    const hasValue = tx.value > 0n;
    const block = await provider.getBlock(receipt.blockNumber);
    const age = Date.now() / 1000 - (block?.timestamp || 0);
    const isRecent = age < 300; // 5 minutes

    const valid = toAddress === ourAddress && hasValue && isRecent;
    console.log(`[x402] on-chain verify: to=${toAddress?.slice(0,10)} value=${ethers.formatEther(tx.value)}OKB age=${age.toFixed(0)}s valid=${valid}`);
    return valid;
  } catch (err) {
    console.warn("[x402] on-chain verify error:", (err as Error).message);
    return false;
  }
}

/**
 * x402 payment middleware.
 * Gates an endpoint behind a micropayment.
 *
 * Flow:
 * 1. No X-PAYMENT header → return 402 with payment requirements
 * 2. X-PAYMENT present → verify with OKX API
 * 3. Valid → log to registry, call next()
 * 4. Invalid → return 402
 */
export function x402(price: string = DEFAULT_PRICE) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // In development, skip payment gate entirely so features are testable locally
    if (process.env.NODE_ENV === "development") {
      next();
      return;
    }

    const recipient = process.env.AGENTIC_WALLET_ADDRESS || "";
    const payment = req.headers["x-payment"] as string | undefined;

    if (!payment) {
      res.status(402).json({
        version: "x402/v1",
        error: "Payment required",
        accepts: [
          {
            scheme: "exact",
            network: "eip155:196",
            maxAmountRequired: price,
            resource: req.path,
            description: `AgentPilot — ${req.path.replace("/api/", "").replace(/\//g, " ")}`,
            mimeType: "application/json",
            payTo: recipient,
            maxTimeoutSeconds: 300,
            asset: USDT_XLAYER,
            extra: {
              name: "USDT",
              decimals: 6,
              humanReadable: `$${(parseInt(price) / 1_000_000).toFixed(4)}`,
            },
          },
        ],
      });
      return;
    }

    const valid = await verifyPayment(payment, req.path);

    if (!valid) {
      res.status(402).json({
        version: "x402/v1",
        error: "Invalid or expired payment credential",
      });
      return;
    }

    // Payment verified — log to registry and proceed
    logAction("payment", `x402:${req.path}:${price}units`);
    next();
  };
}
