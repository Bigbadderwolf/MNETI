// ─────────────────────────────────────────────────────────────
//  MNETI Backend - Minimal Demo Version
//  Basic HTTP server for demo purposes - no complex imports
// ─────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const PORT = parseInt(process.env.PORT || "4000");
const app = express();

// Simple logger
const logger = {
  info: (msg: string) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
  warn: (msg: string) => console.log(`[${new Date().toISOString()}] [WARN] ${msg}`),
  error: (msg: string) => console.log(`[${new Date().toISOString()}] [ERROR] ${msg}`)
};

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ── ROUTES ────────────────────────────────────────────────────

// Health endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.4.0-demo",
    services: {
      backend: "running",
      mpesa: "available",
      oracle: "disabled",
      cranks: "disabled"
    }
  });
});

// MPesa endpoints (mock for demo)
app.post("/api/mpesa/deposit", (req, res) => {
  const { phoneNumber, amountKes, walletAddress } = req.body;
  logger.info(`Mock MPesa deposit: ${phoneNumber} -> KES ${amountKes} -> ${walletAddress}`);
  res.json({
    success: true,
    message: "STK push initiated (demo mode)",
    checkoutRequestID: "demo_" + Date.now()
  });
});

app.post("/api/mpesa/callback", (req, res) => {
  logger.info("Mock MPesa callback received", req.body);
  res.json({ ResultCode: 0, ResultDesc: "Success" });
});

app.get("/api/mpesa/queue", (_req, res) => {
  res.json({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  });
});

// ── START SERVER ────────────────────────────────────────────────
async function startServices(): Promise<void> {
  logger.info("════════════════════════════════════════");
  logger.info("  MNETI Backend — Minimal Demo Version");
  logger.info("  HTTP Server Ready for Testnet Demo");
  logger.info("════════════════════════════════════════");

  // Start HTTP server
  app.listen(PORT, () => {
    logger.info(`✅ HTTP server running on port ${PORT}`);
    logger.info(`✅ Health check: http://localhost:${PORT}/api/health`);
    logger.info(`✅ M-Pesa deposit: POST http://localhost:${PORT}/api/mpesa/deposit`);
    logger.info(`✅ M-Pesa callback: POST http://localhost:${PORT}/api/mpesa/callback`);
    logger.info("🚀 Demo backend ready!");
  });
}

startServices().catch(e => {
  logger.error(`Fatal startup error: ${e.message}`);
  process.exit(1);
});

export default app;
