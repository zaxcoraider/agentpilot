import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
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

/** Verify payment — handles EIP-3009 base64 proof or legacy tx hash */
async function verifyPayment(payment: string, resource: string): Promise<boolean> {
  // Legacy: tx hash (0x + 64 hex chars) — kept for backwards compat
  if (/^0x[0-9a-fA-F]{64}$/.test(payment)) {
    console.log("[x402] legacy tx hash payment — accepting in dev");
    return process.env.NODE_ENV !== "production";
  }

  // EIP-3009 base64 proof — verify via OKX Payment API
  try {
    const decoded = Buffer.from(payment, "base64").toString("utf8");
    const proof = JSON.parse(decoded) as {
      authorization: Record<string, string>;
      signature: string;
      scheme: string;
      network: string;
    };

    // Verify with OKX Payment API
    const path = "/api/v5/dex/payment/verify";
    const body = JSON.stringify({
      payment: proof,
      resource,
      network: proof.network || "eip155:196",
    });

    const response = await fetch(`https://web3.okx.com${path}`, {
      method: "POST",
      headers: okxHeaders("POST", path, body),
      body,
    });

    const data = await response.json() as { code: string; msg?: string };
    const valid = data.code === "0";
    console.log(`[x402] OKX verify: code=${data.code} valid=${valid}`);
    return valid;
  } catch (err) {
    console.warn("[x402] verify error:", (err as Error).message);
    // In development, allow through if verification fails (API may not support yet)
    return process.env.NODE_ENV === "development";
  }
}

/**
 * x402 payment middleware using EIP-3009 USDT micropayments.
 *
 * Flow:
 * 1. No X-PAYMENT header → return 402 with EIP-3009 accepts array
 * 2. X-PAYMENT present → verify EIP-3009 signature via OKX API
 * 3. Valid → log to registry, call next()
 * 4. Invalid → return 402
 */
export function x402(price: string = DEFAULT_PRICE) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // In development, skip payment gate so features are testable locally
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
              name: "Tether USD",
              version: "1",
              decimals: 6,
              symbol: "USDT",
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

    logAction("payment", `x402:${req.path}:${price}units`);
    next();
  };
}
