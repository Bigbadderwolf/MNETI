// ─────────────────────────────────────────────────────────────
//  MNETI — Offline Queue Processor
//  File: backend/src/bridge/mpesa/queue/processor.ts
//
//  Runs every 30 seconds. Picks up pending queued transactions
//  and processes them when Solana connectivity is restored.
// ─────────────────────────────────────────────────────────────

import cron   from "node-cron";
import { logger } from "../../../utils/logger";
import {
  getPendingTransactions,
  updateStatus,
  getQueueStats,
} from "./offline_queue";
import { mintKesh, initWalletStateIfNeeded } from "../../solana/kesh_bridge";
import { initiateB2cPayout }                from "../b2c/payout";

const RETRY_INTERVAL = parseInt(process.env.QUEUE_RETRY_INTERVAL_SECONDS || "30");

// ── PROCESS ONE TRANSACTION ───────────────────────────────────
async function processTransaction(tx: any): Promise<void> {
  updateStatus(tx.id, "processing");

  try {
    if (tx.tx_type === "deposit") {
      // Retry minting KESH
      await initWalletStateIfNeeded(tx.wallet_address);
      const sig = await mintKesh({
        recipientWallet: tx.wallet_address,
        kesAmount:       Math.round(tx.amount_kes * 100),
        mpesaRef:        tx.mpesa_ref || `queued-${tx.id}`,
        queueId:         tx.id,
      });
      logger.info(`✅ Queue: deposit processed tx=${sig} id=${tx.id}`);

    } else if (tx.tx_type === "withdrawal") {
      // Retry B2C payout
      const response = await initiateB2cPayout({
        phoneNumber:   tx.phone_number,
        amountKes:     tx.amount_kes,
        occasion:      "KESH Withdrawal",
        remarks:       "MNETI KESH Redemption",
        walletAddress: tx.wallet_address,
        burnTxSig:     tx.solana_tx_sig || "",
      });

      if (response.ResponseCode === "0") {
        updateStatus(tx.id, "completed");
        logger.info(`✅ Queue: withdrawal processed id=${tx.id}`);
      } else {
        throw new Error(`B2C failed: ${response.ResponseDescription}`);
      }
    }
  } catch (error: any) {
    logger.warn(`Queue: transaction failed (retry ${tx.retry_count + 1}): ${error.message}`);
    updateStatus(tx.id, "failed", { errorMessage: error.message });
  }
}

// ── MAIN PROCESSING LOOP ──────────────────────────────────────
async function processQueue(): Promise<void> {
  const pending = getPendingTransactions(10);

  if (pending.length === 0) return;

  logger.info(`Queue: processing ${pending.length} pending transactions`);

  for (const tx of pending) {
    await processTransaction(tx);
    // Small delay between transactions to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  const stats = getQueueStats();
  logger.info(`Queue stats: pending=${stats.pending} completed=${stats.completed} failed=${stats.failed}`);
}

// ── START QUEUE PROCESSOR ─────────────────────────────────────
export function startQueueProcessor(): void {
  logger.info(`Queue processor starting — interval: ${RETRY_INTERVAL}s`);

  // Run immediately on start
  processQueue().catch(e => logger.error(`Queue error: ${e.message}`));

  // Then run on schedule
  cron.schedule(`*/${RETRY_INTERVAL} * * * * *`, () => {
    processQueue().catch(e => logger.error(`Queue error: ${e.message}`));
  });
}
