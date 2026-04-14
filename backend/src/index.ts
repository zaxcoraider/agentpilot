import { config } from "dotenv";
import { resolve } from "path";
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
import analyticsRoutes from "./routes/analytics";
import { getPaymentStats } from "./services/x402Agent";
import { db } from "./services/db";
import { startAutonomousAgent } from "./services/autonomousAgent";

const app = express();
const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(",").map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl/Postman in dev) only in development
    if (!origin) return cb(null, process.env.NODE_ENV !== "production");
    cb(null, ALLOWED_ORIGINS.includes(origin));
  },
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
app.use("/api", analyticsRoutes);

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
