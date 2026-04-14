import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
config({ path: resolve(__dirname, "../../.env") });
import express from "express";
import cors from "cors";

import discoverRoutes from "./routes/discover";
import tradeRoutes from "./routes/trade";
import protectRoutes from "./routes/protect";
import earnRoutes from "./routes/earn";
import monitorRoutes from "./routes/monitor";
import payRoutes from "./routes/pay";
import dcaRoutes from "./routes/dca";
import agentRoutes from "./routes/agent";
import analyticsRoutes from "./routes/analytics";
import { getPaymentStats } from "./services/x402Agent";
import { db } from "./services/db";
import { startAutonomousAgent } from "./services/autonomousAgent";

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: open to all origins (hackathon demo) or restrict via ALLOWED_ORIGINS env var
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim()) : null;
app.use(cors({
  origin: ALLOWED_ORIGINS
    ? (origin, cb) => { cb(null, !origin || ALLOWED_ORIGINS.includes(origin)); }
    : true, // allow all origins when ALLOWED_ORIGINS not set
  credentials: true,
}));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "AgentPilot API", version: "1.0.0" });
});

// x402 agent payment stats
app.get("/api/pay/stats", (_req, res) => {
  res.json({ ok: true, data: getPaymentStats() });
});

// Modules
app.use("/api", discoverRoutes);
app.use("/api", tradeRoutes);
app.use("/api", protectRoutes);
app.use("/api", earnRoutes);
app.use("/api", monitorRoutes);
app.use("/api", payRoutes);
app.use("/api", dcaRoutes);
app.use("/api", agentRoutes);
app.use("/api", analyticsRoutes);

// Serve frontend static files (built frontend/dist copied to backend/public)
const frontendDist = resolve(__dirname, "../public");
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — all non-API routes serve index.html
  app.get(/^(?!\/api|\/health).*/, (_req, res) => {
    res.sendFile(resolve(frontendDist, "index.html"));
  });
  console.log("[server] Serving frontend from", frontendDist);
}

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err.message);
  res.status(500).json({ ok: false, error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`AgentPilot API running on http://localhost:${PORT}`);
  console.log(`Contract: ${process.env.CONTRACT_ADDRESS || "not deployed yet"}`);
  startAutonomousAgent();
});

// Prevent unhandled rejections from crashing the server
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.message);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  try { await db.$disconnect(); } catch { /* DB not configured */ }
  server.close(() => process.exit(0));
});
process.on("SIGTERM", async () => {
  try { await db.$disconnect(); } catch { /* DB not configured */ }
  server.close(() => process.exit(0));
});
