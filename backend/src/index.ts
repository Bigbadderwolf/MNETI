// ─────────────────────────────────────────────────────────────
//  MNETI Backend — Main Entry Point
//  Phase 1+2+3+4 integrated backend service
//
//  Services started:
//  1. Express HTTP server (M-Pesa webhooks + API)
//  2. Oracle relay (SIX Financial → Solana every 30s)
//  3. Offline queue processor (retry failed transactions)
//  4. Solana burn event listener (triggers B2C payouts)
// ─────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { logger } from "./utils/logger";
import { mpesaRouter } from "./routes/mpesa";
import { healthRouter } from "./routes/health";
import { startOracleRelay } from "./oracle/relay/runner";
import { startQueueProcessor } from "./bridge/mpesa/queue/processor";
import { listenForBurnEvents } from "./bridge/solana/kesh_bridge";
import { initiateB2cPayout } from "./bridge/mpesa/b2c/payout";
import { enqueue } from "./bridge/mpesa/queue/offline_queue";
import { startYieldCrank } from "./cranks/yield_crank";

import paymentsRoutes from "./routes/payments";
import complianceRoutes from "./routes/compliance";
import { startPayrollCrank } from "./cranks/payroll_crank";

import remittanceRoutes from "./routes/remittance";
import { startRemittanceRelay, startRemittanceEventListener } from "./remittance/corridors/relay";

// Solana imports for demo setup
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";



const PORT = parseInt(process.env.PORT || "4000");
const app = express();

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/payments", paymentsRoutes);
app.use("/api/compliance", complianceRoutes);

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ── ROUTES ────────────────────────────────────────────────────
app.use("/api/mpesa", mpesaRouter);
app.use("/api", healthRouter);
app.use("/api/payments", paymentsRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/remittance", remittanceRoutes);


// ── START ALL SERVICES ────────────────────────────────────────
async function startServices(): Promise<void> {
  logger.info("════════════════════════════════════════");
  logger.info("  MNETI Backend — Phase 1+2+3+4");
  logger.info("  M-Pesa Bridge + Oracle + Queue");
  logger.info("════════════════════════════════════════");

  // Initialize Solana connection for demo
  const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com");
  const operatorKeypair = Keypair.generate(); // Demo keypair
  const keshMint = new PublicKey("AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR"); // Devnet KESH mint
  const feeCollectorAta = new PublicKey("11111111111111111111111111111111"); // Placeholder

  // 1. Start HTTP server
  app.listen(PORT, () => {
    logger.info(`HTTP server running on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/api/health`);
    logger.info(`M-Pesa deposit: POST http://localhost:${PORT}/api/mpesa/deposit`);
    logger.info(`M-Pesa callback: POST http://localhost:${PORT}/api/mpesa/callback`);
  });

  // 2. Start oracle relay (SIX Financial price feeds)
  try {
    await startOracleRelay();
    logger.info("Oracle relay started");
  } catch (e: any) {
    logger.warn(`Oracle relay failed to start: ${e.message} — continuing without oracle`);
  }

  // 3. Start offline queue processor
  startQueueProcessor();
  startYieldCrank();

  // 4. Start cranks with demo variables
  try {
    // Note: These will fail if programs aren't deployed, but won't crash the server
    startPayrollCrank(connection, null as any, operatorKeypair, keshMint, feeCollectorAta);
    startRemittanceEventListener(connection, null as any);
    logger.info("Crank services started (demo mode)");
  } catch (e: any) {
    logger.warn(`Crank services failed: ${e.message} — continuing without cranks`);
  }

  logger.info("Offline queue processor started");


  // 4. Listen for KESH burn events → trigger B2C payouts
  listenForBurnEvents(async (walletAddress, keshBurned, kesToRelease) => {
    logger.info(`Burn event: wallet=${walletAddress} kesh=${keshBurned} kes=${kesToRelease}`);

    // Look up phone number from wallet state
    // In production: query WalletState PDA for registered phone
    // For now: B2C payout requires phone from request context
    logger.info(`B2C payout needed for: ${walletAddress} — KES ${kesToRelease / 100}`);

    // Queue the withdrawal for manual processing if phone not found
    enqueue("withdrawal", "unknown", kesToRelease / 100, walletAddress);
  });

  logger.info("All services started. MNETI Backend is running.");
}

startServices().catch(e => {
  logger.error(`Fatal startup error: ${e.message}`);
  process.exit(1);
});

export default app;
