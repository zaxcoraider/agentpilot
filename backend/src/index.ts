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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
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
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await db.$disconnect();
  server.close(() => process.exit(0));
});
process.on("SIGTERM", async () => {
  await db.$disconnect();
  server.close(() => process.exit(0));
});
