// ─────────────────────────────────────────────────────────────
//  MNETI Backend - Demo Version (Bypass Crank Errors)
//  Basic HTTP server for demo purposes
// ─────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { logger } from "./utils/logger";
import { mpesaRouter } from "./routes/mpesa";
import { healthRouter } from "./routes/health";

const PORT = parseInt(process.env.PORT || "4000");
const app = express();

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
app.use("/api/mpesa", mpesaRouter);
app.use("/api", healthRouter);

// Simple health endpoint for demo
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

// ── START SERVER ────────────────────────────────────────────────
async function startServices(): Promise<void> {
  logger.info("════════════════════════════════════════");
  logger.info("  MNETI Backend — Demo Version");
  logger.info("  HTTP Server Only (Crank Services Disabled)");
  logger.info("════════════════════════════════════════");

  // Start HTTP server
  app.listen(PORT, () => {
    logger.info(`HTTP server running on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);
    logger.info(`M-Pesa deposit: POST http://localhost:${PORT}/api/mpesa/deposit`);
    logger.info(`M-Pesa callback: POST http://localhost:${PORT}/api/mpesa/callback`);
  });

  logger.info("Demo backend started successfully!");
}

startServices().catch(e => {
  logger.error(`Fatal startup error: ${e.message}`);
  process.exit(1);
});

export default app;
