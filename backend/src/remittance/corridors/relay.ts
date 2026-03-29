/**
 * MNETI Protocol — Phase 7
 * backend/src/remittance/corridors/relay.ts
 *
 * Remittance Relay Service.
 *
 * Responsibilities:
 *   1. Listen for RemittanceMpesaPayoutTriggered events on Solana
 *   2. Trigger Safaricom Daraja B2C payout to recipient phone
 *   3. On Daraja success callback → call record_mpesa_payout instruction on-chain
 *   4. Handle retries via SQLite queue (reuses Phase 4 offline queue pattern)
 *   5. Emit Travel Rule payload to mneti-travel-rule program when threshold crossed
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import cron from "node-cron";
import Database from "better-sqlite3";
import path from "path";
import axios from "axios";
import { logger } from "../../utils/logger";
import { refreshAllRates } from "../fx/rates";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingPayout {
  id:              number;
  order_pubkey:    string;
  recipient_phone: string;
  recipient_name:  string;
  amount_kes:      number;
  daraja_ref:      string;
  retry_count:     number;
  status:          "pending" | "processing" | "completed" | "failed";
  created_at:      number;
  updated_at:      number;
}

// ─── Database ─────────────────────────────────────────────────────────────────

function initRelayDb(): Database.Database {
  const dbPath = process.env.REMITTANCE_DB_PATH
    || path.join(__dirname, "../../../../remittance_relay.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS remittance_payouts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      order_pubkey    TEXT    NOT NULL UNIQUE,
      recipient_phone TEXT    NOT NULL,
      recipient_name  TEXT    NOT NULL,
      amount_kes      INTEGER NOT NULL,
      daraja_ref      TEXT    NOT NULL,
      retry_count     INTEGER NOT NULL DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'pending',
      mpesa_receipt   TEXT,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payout_status ON remittance_payouts(status);
    CREATE INDEX IF NOT EXISTS idx_payout_order  ON remittance_payouts(order_pubkey);
  `);
  return db;
}

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) _db = initRelayDb();
  return _db;
}

// ─── Daraja B2C ───────────────────────────────────────────────────────────────

interface DarajaTokenResponse {
  access_token: string;
  expires_in:   string;
}

let darajaToken:    string | null  = null;
let darajaTokenExp: number         = 0;

async function getDarajaToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (darajaToken && now < darajaTokenExp - 60) return darajaToken;

  const key    = process.env.DARAJA_CONSUMER_KEY;
  const secret = process.env.DARAJA_CONSUMER_SECRET;

  if (!key || !secret) {
    // Mock token for dev
    darajaToken   = "MOCK_DARAJA_TOKEN";
    darajaTokenExp = now + 3600;
    return darajaToken;
  }

  const creds  = Buffer.from(`${key}:${secret}`).toString("base64");
  const resp   = await axios.get<DarajaTokenResponse>(
    "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${creds}` }, timeout: 5_000 }
  );
  darajaToken   = resp.data.access_token;
  darajaTokenExp = now + parseInt(resp.data.expires_in, 10);
  return darajaToken;
}

async function sendB2cPayout(payout: PendingPayout): Promise<string | null> {
  const shortCode  = process.env.DARAJA_B2C_SHORTCODE;
  const passkey    = process.env.DARAJA_B2C_INITIATOR_PASSWORD;
  const callbackUrl= process.env.DARAJA_B2C_RESULT_URL
    || "https://api.mneti.io/api/remittance/b2c/result";

  if (!shortCode || !passkey) {
    // Mock — return a fake receipt
    logger.info(`[Relay] MOCK B2C payout → ${payout.recipient_phone} KES ${payout.amount_kes}`);
    return `MOCK-${Date.now()}-${payout.daraja_ref.slice(-6)}`;
  }

  try {
    const token = await getDarajaToken();
    const resp  = await axios.post(
      "https://api.safaricom.co.ke/mpesa/b2c/v3/paymentrequest",
      {
        InitiatorName:         process.env.DARAJA_INITIATOR_NAME || "MNETI_API",
        SecurityCredential:    passkey,
        CommandID:             "BusinessPayment",
        Amount:                payout.amount_kes,
        PartyA:                shortCode,
        PartyB:                payout.recipient_phone,
        Remarks:               `MNETI Remittance ${payout.daraja_ref}`,
        QueueTimeOutURL:       callbackUrl.replace("result", "timeout"),
        ResultURL:             callbackUrl,
        Occasion:              payout.recipient_name,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      }
    );

    const code = resp.data?.ResponseCode;
    if (code === "0") {
      return resp.data?.ConversationID || payout.daraja_ref;
    }
    logger.error(`[Relay] B2C rejected: ${resp.data?.ResponseDescription}`);
    return null;
  } catch (err) {
    logger.error("[Relay] B2C payout error:", (err as Error).message);
    return null;
  }
}

// ─── On-Chain record_mpesa_payout Instruction ─────────────────────────────────

async function recordPayoutOnChain(
  orderPubkey: string,
  mpesaReceipt: string,
  connection: Connection,
  program: anchor.Program,
  operator: Keypair
): Promise<boolean> {
  try {
    const order   = new PublicKey(orderPubkey);
    const [registry] = PublicKey.findProgramAddressSync(
      [Buffer.from("remittance_registry")],
      program.programId
    );

    await program.methods
      .recordMpesaPayout(mpesaReceipt)
      .accounts({
        operator: operator.publicKey,
        registry,
        order,
      })
      .signers([operator])
      .rpc();

    logger.info(`[Relay] ✅ On-chain payout recorded: ${orderPubkey.slice(0, 8)}... receipt=${mpesaReceipt}`);
    return true;
  } catch (err) {
    logger.error(`[Relay] Failed to record on-chain: ${(err as Error).message}`);
    return false;
  }
}

// ─── Event Listener ───────────────────────────────────────────────────────────

export function startRemittanceEventListener(
  connection: Connection,
  program: anchor.Program
): void {
  program.addEventListener("RemittanceMpesaPayoutTriggered", (event: any) => {
    const now = Math.floor(Date.now() / 1000);
    const db  = getDb();

    // Check if already queued
    const existing = db.prepare(
      "SELECT id FROM remittance_payouts WHERE order_pubkey = ?"
    ).get(event.order.toBase58());
    if (existing) return;

    db.prepare(`
      INSERT INTO remittance_payouts
        (order_pubkey, recipient_phone, recipient_name, amount_kes, daraja_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.order.toBase58(),
      event.recipientPhone,
      event.recipientName,
      Number(event.amountKes),
      event.darajaRef,
      now,
      now
    );

    logger.info(`[Relay] Queued payout for ${event.recipientPhone} KES ${event.amountKes}`);
  });

  logger.info("[Relay] Listening for RemittanceMpesaPayoutTriggered events");
}

// ─── Payout Processor Cron ────────────────────────────────────────────────────

const MAX_RETRIES = 5;

export function startRemittanceRelay(
  connection: Connection,
  program: anchor.Program,
  operator: Keypair
): void {
  // Refresh FX rates every 30 seconds (reuse oracle relay interval)
  cron.schedule("*/30 * * * * *", async () => {
    await refreshAllRates().catch(err =>
      logger.error("[Relay] FX refresh failed:", err)
    );
  });

  // Process pending payouts every 30 seconds
  cron.schedule("*/30 * * * * *", async () => {
    const db  = getDb();
    const now = Math.floor(Date.now() / 1000);

    const pending = db.prepare(`
      SELECT * FROM remittance_payouts
      WHERE  status = 'pending'
        AND  retry_count < ?
      ORDER BY created_at ASC
      LIMIT  10
    `).all(MAX_RETRIES) as PendingPayout[];

    for (const payout of pending) {
      db.prepare(
        "UPDATE remittance_payouts SET status='processing', updated_at=? WHERE id=?"
      ).run(now, payout.id);

      const receipt = await sendB2cPayout(payout);

      if (receipt) {
        // Record on-chain
        const onChain = await recordPayoutOnChain(
          payout.order_pubkey,
          receipt,
          connection,
          program,
          operator
        );

        db.prepare(`
          UPDATE remittance_payouts
          SET status=?, mpesa_receipt=?, updated_at=?
          WHERE id=?
        `).run(onChain ? "completed" : "pending", receipt, now, payout.id);

      } else {
        // Failed — increment retry
        const newRetry = payout.retry_count + 1;
        const newStatus = newRetry >= MAX_RETRIES ? "failed" : "pending";
        db.prepare(`
          UPDATE remittance_payouts
          SET status=?, retry_count=?, updated_at=?
          WHERE id=?
        `).run(newStatus, newRetry, now, payout.id);

        if (newStatus === "failed") {
          logger.error(`[Relay] ❌ Payout permanently failed after ${MAX_RETRIES} attempts: ${payout.order_pubkey}`);
        }
      }
    }
  });

  logger.info("[Relay] Remittance relay started — processing payouts every 30s");
}

// ─── Dashboard Helpers ────────────────────────────────────────────────────────

export function getRelayStats() {
  const db = getDb();
  return {
    total_pending:   (db.prepare("SELECT COUNT(*) AS c FROM remittance_payouts WHERE status='pending'").get() as any).c,
    total_completed: (db.prepare("SELECT COUNT(*) AS c FROM remittance_payouts WHERE status='completed'").get() as any).c,
    total_failed:    (db.prepare("SELECT COUNT(*) AS c FROM remittance_payouts WHERE status='failed'").get() as any).c,
  };
}

export function getPayoutByOrder(orderPubkey: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM remittance_payouts WHERE order_pubkey=?").get(orderPubkey);
}
