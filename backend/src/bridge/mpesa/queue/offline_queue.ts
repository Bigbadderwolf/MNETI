// ─────────────────────────────────────────────────────────────
//  MNETI — Offline Transaction Queue
//  File: backend/src/bridge/mpesa/queue/offline_queue.ts
//
//  PURPOSE:
//  Kenya has patchy internet in rural areas (Turkana, Marsabit,
//  Wajir). This queue stores transactions locally in SQLite
//  when the Solana RPC or Daraja API is unreachable.
//  When connectivity is restored, transactions are processed
//  in order and users receive SMS confirmation.
//
//  QUEUE STATES:
//  pending    → waiting to be processed
//  processing → currently being submitted
//  completed  → successfully processed
//  failed     → max retries exceeded
// ─────────────────────────────────────────────────────────────

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs   from "fs";
import { logger } from "../../../utils/logger";
import dotenv from "dotenv";
dotenv.config();

const DB_PATH   = process.env.SQLITE_DB_PATH || "./data/mneti_queue.db";
const MAX_RETRY = parseInt(process.env.QUEUE_MAX_RETRIES || "5");

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ── DATABASE SETUP ────────────────────────────────────────────
let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS queued_transactions (
      id              TEXT PRIMARY KEY,
      tx_type         TEXT NOT NULL,
      phone_number    TEXT NOT NULL,
      amount_kes      REAL NOT NULL,
      wallet_address  TEXT NOT NULL,
      mpesa_ref       TEXT,
      solana_tx_sig   TEXT,
      country_code    TEXT NOT NULL DEFAULT 'KE',
      status          TEXT NOT NULL DEFAULT 'pending',
      retry_count     INTEGER NOT NULL DEFAULT 0,
      error_message   TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      processed_at    INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_status ON queued_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_created ON queued_transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_wallet ON queued_transactions(wallet_address);
  `);
  logger.info(`Offline queue database initialized: ${DB_PATH}`);
}

// ── TRANSACTION TYPES ─────────────────────────────────────────
export type TxType = "deposit" | "withdrawal" | "remittance";
export type TxStatus = "pending" | "processing" | "completed" | "failed";

export interface QueuedTransaction {
  id:             string;
  tx_type:        TxType;
  phone_number:   string;
  amount_kes:     number;
  wallet_address: string;
  mpesa_ref:      string | null;
  solana_tx_sig:  string | null;
  country_code:   string;
  status:         TxStatus;
  retry_count:    number;
  error_message:  string | null;
  created_at:     number;
  updated_at:     number;
  processed_at:   number | null;
}

// ── ENQUEUE ───────────────────────────────────────────────────
export function enqueue(
  txType:        TxType,
  phoneNumber:   string,
  amountKes:     number,
  walletAddress: string,
  countryCode:   string = "KE"
): string {
  const id  = uuidv4();
  const now = Date.now();

  getDb().prepare(`
    INSERT INTO queued_transactions
      (id, tx_type, phone_number, amount_kes, wallet_address, country_code, status, retry_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
  `).run(id, txType, phoneNumber, amountKes, walletAddress, countryCode, now, now);

  logger.info(`Queued ${txType}: phone=${phoneNumber} amount=KES${amountKes} id=${id}`);
  return id;
}

// ── GET PENDING ───────────────────────────────────────────────
export function getPendingTransactions(limit: number = 10): QueuedTransaction[] {
  return getDb().prepare(`
    SELECT * FROM queued_transactions
    WHERE status = 'pending' AND retry_count < ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(MAX_RETRY, limit) as QueuedTransaction[];
}

// ── UPDATE STATUS ─────────────────────────────────────────────
export function updateStatus(
  id:          string,
  status:      TxStatus,
  options: {
    mpesaRef?:     string;
    solanaTxSig?:  string;
    errorMessage?: string;
  } = {}
): void {
  const now = Date.now();
  getDb().prepare(`
    UPDATE queued_transactions
    SET status        = ?,
        mpesa_ref     = COALESCE(?, mpesa_ref),
        solana_tx_sig = COALESCE(?, solana_tx_sig),
        error_message = ?,
        updated_at    = ?,
        processed_at  = CASE WHEN ? = 'completed' THEN ? ELSE processed_at END,
        retry_count   = CASE WHEN ? = 'failed' THEN retry_count + 1 ELSE retry_count END
    WHERE id = ?
  `).run(
    status,
    options.mpesaRef    || null,
    options.solanaTxSig || null,
    options.errorMessage || null,
    now,
    status, now,
    status,
    id
  );
}

// ── GET TRANSACTION ───────────────────────────────────────────
export function getTransaction(id: string): QueuedTransaction | null {
  return getDb().prepare(
    "SELECT * FROM queued_transactions WHERE id = ?"
  ).get(id) as QueuedTransaction | null;
}

// ── GET BY WALLET ─────────────────────────────────────────────
export function getByWallet(walletAddress: string, limit: number = 50): QueuedTransaction[] {
  return getDb().prepare(`
    SELECT * FROM queued_transactions
    WHERE wallet_address = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(walletAddress, limit) as QueuedTransaction[];
}

// ── QUEUE STATS ───────────────────────────────────────────────
export function getQueueStats(): { pending: number; processing: number; completed: number; failed: number } {
  const rows = getDb().prepare(`
    SELECT status, COUNT(*) as count
    FROM queued_transactions
    GROUP BY status
  `).all() as { status: string; count: number }[];

  const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
  rows.forEach(r => { (stats as any)[r.status] = r.count; });
  return stats;
}

// ── CLEANUP OLD COMPLETED ─────────────────────────────────────
export function cleanupOldTransactions(daysOld: number = 30): void {
  const cutoff = Date.now() - (daysOld * 24 * 3600 * 1000);
  const result = getDb().prepare(`
    DELETE FROM queued_transactions
    WHERE status = 'completed' AND processed_at < ?
  `).run(cutoff);
  if (result.changes > 0) {
    logger.info(`Cleaned up ${result.changes} old completed transactions`);
  }
}
