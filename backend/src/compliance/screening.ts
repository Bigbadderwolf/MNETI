/**
 * MNETI Protocol — Phase 6
 * backend/src/compliance/aml/screening.ts
 *
 * AML (Anti-Money Laundering) screening engine.
 *
 * Called as a synchronous gate before:
 *   - M-Pesa STK push deposit (Phase 4 bridge)
 *   - Supplier payment creation
 *   - Recurring payment creation
 *   - Remittance initiation (Phase 7)
 *
 * Checks performed:
 *   1. OFAC SDN list (US Treasury — sanctions)
 *   2. UN Consolidated Sanctions list
 *   3. Chainalysis KYT (Know Your Transaction) — mock when API key absent
 *   4. Structuring detection — multiple sub-threshold txns in rolling 24h window
 *   5. Velocity breach — total 24h volume exceeds per-wallet limit
 */

import axios from "axios";
import Database from "better-sqlite3";
import path from "path";
import { logger } from "../../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "supplier_payment"
  | "recurring_payment"
  | "remittance"
  | "payroll";

export interface ScreeningRequest {
  /** Solana wallet public key (base58) */
  wallet: string;
  /** Amount in KESH units (2 decimals — e.g. KES 500 = 50_000n) */
  amount_kesh: bigint;
  /** M-Pesa phone number (2547XXXXXXXX) — used for name-matching when present */
  phone?: string;
  transaction_type: TransactionType;
  /** Counterparty wallet for supplier / remittance flows */
  counterparty_wallet?: string;
}

export interface ScreeningResult {
  wallet:            string;
  passed:            boolean;
  risk_score:        number;   // 0–100
  flags:             AmlFlag[];
  screened_at:       number;   // unix timestamp
  requires_review:   boolean;  // true = send to compliance officer queue
  chainalysis_ref?:  string;   // Chainalysis request ID for audit trail
}

export interface AmlFlag {
  type:     AmlFlagType;
  severity: "low" | "medium" | "high" | "critical";
  detail:   string;
}

export type AmlFlagType =
  | "ofac_hit"
  | "un_sanctions_hit"
  | "chainalysis_high_risk"
  | "structuring_suspected"
  | "velocity_breach"
  | "pep_match";

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Auto-block: score >= this value blocks the transaction entirely */
const SCORE_BLOCK  = 80;
/** Review queue: score >= this value (and < SCORE_BLOCK) flags for human review */
const SCORE_REVIEW = 50;

/** FATF Travel Rule threshold in KESH units — KES 130,000 */
const TR_THRESHOLD_KESH = 13_000_000n;
/** Structuring: ≥ 3 sub-threshold transactions in a rolling 24h window */
const STRUCT_COUNT  = 3;
const WINDOW_SECS   = 24 * 3_600;
/** Velocity: total 24h volume per wallet */
const VELOCITY_LIMIT_KESH = 50_000_000n; // KES 500,000

// ─── Database ─────────────────────────────────────────────────────────────────

function initDb(): Database.Database {
  const dbPath = process.env.AML_DB_PATH
    || path.join(__dirname, "../../../../aml_screening.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS aml_screenings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet          TEXT    NOT NULL,
      passed          INTEGER NOT NULL,
      risk_score      INTEGER NOT NULL,
      flags           TEXT    NOT NULL,
      tx_type         TEXT    NOT NULL,
      amount_kesh     TEXT    NOT NULL,
      requires_review INTEGER NOT NULL,
      chainalysis_ref TEXT,
      screened_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS aml_alerts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet       TEXT    NOT NULL,
      flag_type    TEXT    NOT NULL,
      severity     TEXT    NOT NULL,
      detail       TEXT    NOT NULL,
      resolved     INTEGER NOT NULL DEFAULT 0,
      resolved_by  TEXT,
      resolved_at  INTEGER,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scr_wallet ON aml_screenings(wallet);
    CREATE INDEX IF NOT EXISTS idx_scr_time   ON aml_screenings(screened_at);
    CREATE INDEX IF NOT EXISTS idx_alt_wallet ON aml_alerts(wallet);
    CREATE INDEX IF NOT EXISTS idx_alt_open   ON aml_alerts(resolved);
  `);

  return db;
}

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) _db = initDb();
  return _db;
}

// ─── Blocked wallet list (mock OFAC / UN) ────────────────────────────────────
// In production these are sourced from a compliance data provider API.
const BLOCKED_WALLETS = new Set<string>([
  "BLOCKED_TEST_WALLET_OFAC_1",
  "BLOCKED_TEST_WALLET_UN_2",
]);

// ─── Check 1: OFAC / UN Sanctions ────────────────────────────────────────────
async function checkSanctions(wallet: string, phone?: string): Promise<AmlFlag[]> {
  const flags: AmlFlag[] = [];

  // Local blocklist (always checked)
  if (BLOCKED_WALLETS.has(wallet)) {
    flags.push({
      type:     "ofac_hit",
      severity: "critical",
      detail:   `Wallet ${wallet.slice(0, 8)}... matched OFAC SDN blocklist`,
    });
    return flags; // no need to continue if hard-blocked
  }

  // Live sanctions API (ComplyAdvantage or similar) — only if key present
  const apiKey = process.env.SANCTIONS_API_KEY;
  if (apiKey && phone) {
    try {
      const resp = await axios.post(
        "https://api.complyadvantage.com/searches",
        {
          search_term: phone,
          fuzziness:   0.6,
          filters:     { types: ["sanction", "pep"] },
        },
        { headers: { Authorization: `Token ${apiKey}` }, timeout: 4_000 }
      );

      const hits: number = resp.data?.data?.hits ?? 0;
      if (hits > 0) {
        const isPep = resp.data?.data?.hits_details?.some(
          (h: any) => h.doc?.types?.includes("pep")
        );
        flags.push({
          type:     isPep ? "pep_match" : "ofac_hit",
          severity: "critical",
          detail:   `Phone ${phone} matched ${hits} sanctions / PEP record(s)`,
        });
      }
    } catch (err) {
      logger.warn("[AML] Sanctions API unavailable — skipping live check");
    }
  }

  return flags;
}

// ─── Check 2: Chainalysis KYT ────────────────────────────────────────────────
async function checkChainalysis(wallet: string): Promise<{ flags: AmlFlag[]; ref?: string }> {
  const apiKey = process.env.CHAINALYSIS_API_KEY;
  if (!apiKey) {
    // Mock mode — all wallets pass
    return { flags: [] };
  }

  try {
    const resp = await axios.get(
      `https://api.chainalysis.com/api/risk/v2/entities/${wallet}`,
      { headers: { Token: apiKey }, timeout: 5_000 }
    );

    const risk:   string = resp.data?.risk        ?? "Unknown";
    const ref:    string = resp.data?.requestId   ?? "";
    const flags:  AmlFlag[] = [];

    if (risk === "High" || risk === "Severe") {
      flags.push({
        type:     "chainalysis_high_risk",
        severity: risk === "Severe" ? "critical" : "high",
        detail:   `Chainalysis KYT risk rating: ${risk}`,
      });
    }

    return { flags, ref };
  } catch (err) {
    logger.warn("[AML] Chainalysis KYT unavailable:", (err as Error).message);
    return { flags: [] };
  }
}

// ─── Check 3: Structuring Detection ──────────────────────────────────────────
/**
 * Detects potential structuring (layering) — the practice of making multiple
 * sub-threshold transactions to avoid the FATF Travel Rule trigger.
 */
function checkStructuring(wallet: string, amountKesh: bigint): AmlFlag[] {
  if (amountKesh >= TR_THRESHOLD_KESH) return []; // over-threshold txns are already screened

  const db         = getDb();
  const windowStart = Math.floor(Date.now() / 1000) - WINDOW_SECS;

  const row = db.prepare(`
    SELECT COUNT(*)           AS cnt,
           SUM(CAST(amount_kesh AS REAL)) AS total
    FROM   aml_screenings
    WHERE  wallet     = ?
      AND  screened_at > ?
      AND  CAST(amount_kesh AS INTEGER) < ?
      AND  passed = 1
  `).get(wallet, windowStart, TR_THRESHOLD_KESH.toString()) as any;

  if (row.cnt >= STRUCT_COUNT) {
    return [{
      type:     "structuring_suspected",
      severity: "high",
      detail:   `${row.cnt} sub-threshold transactions in 24 h ` +
                `totalling KES ${(row.total / 100).toFixed(2)} — possible structuring`,
    }];
  }
  return [];
}

// ─── Check 4: Velocity Breach ─────────────────────────────────────────────────
function checkVelocity(wallet: string, amountKesh: bigint): AmlFlag[] {
  const db         = getDb();
  const windowStart = Math.floor(Date.now() / 1000) - WINDOW_SECS;

  const row = db.prepare(`
    SELECT SUM(CAST(amount_kesh AS INTEGER)) AS total_24h
    FROM   aml_screenings
    WHERE  wallet = ? AND screened_at > ? AND passed = 1
  `).get(wallet, windowStart) as any;

  const total = BigInt(row?.total_24h ?? 0) + amountKesh;
  if (total > VELOCITY_LIMIT_KESH) {
    return [{
      type:     "velocity_breach",
      severity: "medium",
      detail:   `24 h wallet volume KES ${(Number(total) / 100).toFixed(2)} ` +
                `exceeds limit KES ${(Number(VELOCITY_LIMIT_KESH) / 100).toFixed(2)}`,
    }];
  }
  return [];
}

// ─── Risk Score ───────────────────────────────────────────────────────────────
function scoreFromFlags(flags: AmlFlag[]): number {
  const weights = { critical: 100, high: 60, medium: 30, low: 10 } as const;
  return flags.reduce((acc, f) => Math.max(acc, weights[f.severity] ?? 0), 0);
}

// ─── Main Screening Gate ──────────────────────────────────────────────────────
export async function screenTransaction(
  req: ScreeningRequest
): Promise<ScreeningResult> {
  const now  = Math.floor(Date.now() / 1000);
  const db   = getDb();

  // Run async checks in parallel
  const [sanctionFlags, kytResult] = await Promise.all([
    checkSanctions(req.wallet, req.phone),
    checkChainalysis(req.wallet),
  ]);

  // Run synchronous checks
  const structFlags   = checkStructuring(req.wallet, req.amount_kesh);
  const velocityFlags = checkVelocity(req.wallet, req.amount_kesh);

  const allFlags: AmlFlag[] = [
    ...sanctionFlags,
    ...kytResult.flags,
    ...structFlags,
    ...velocityFlags,
  ];

  const riskScore     = scoreFromFlags(allFlags);
  const passed        = riskScore < SCORE_BLOCK;
  const requiresReview = riskScore >= SCORE_REVIEW && riskScore < SCORE_BLOCK;

  const result: ScreeningResult = {
    wallet:          req.wallet,
    passed,
    risk_score:      riskScore,
    flags:           allFlags,
    screened_at:     now,
    requires_review: requiresReview,
    chainalysis_ref: kytResult.ref,
  };

  // Persist
  db.prepare(`
    INSERT INTO aml_screenings
      (wallet, passed, risk_score, flags, tx_type, amount_kesh, requires_review, chainalysis_ref, screened_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    req.wallet,
    passed ? 1 : 0,
    riskScore,
    JSON.stringify(allFlags),
    req.transaction_type,
    req.amount_kesh.toString(),
    requiresReview ? 1 : 0,
    kytResult.ref ?? null,
    now
  );

  // Raise alerts for severe flags
  for (const flag of allFlags) {
    if (flag.severity === "high" || flag.severity === "critical") {
      db.prepare(`
        INSERT INTO aml_alerts (wallet, flag_type, severity, detail, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.wallet, flag.type, flag.severity, flag.detail, now);
      logger.warn(
        `[AML] 🚨 ${flag.severity.toUpperCase()} — ` +
        `wallet=${req.wallet.slice(0, 8)}... type=${flag.type}: ${flag.detail}`
      );
    }
  }

  const status = !passed ? "BLOCKED" : requiresReview ? "REVIEW" : "PASS";
  logger.info(`[AML] ${status} wallet=${req.wallet.slice(0, 8)}... score=${riskScore} flags=${allFlags.length}`);

  return result;
}

// ─── Dashboard / Admin Helpers ────────────────────────────────────────────────

export function getAmlStats() {
  const db = getDb();
  return {
    total_screened:        (db.prepare("SELECT COUNT(*) AS c FROM aml_screenings").get() as any).c,
    total_blocked:         (db.prepare("SELECT COUNT(*) AS c FROM aml_screenings WHERE passed=0").get() as any).c,
    total_pending_review:  (db.prepare("SELECT COUNT(*) AS c FROM aml_screenings WHERE requires_review=1").get() as any).c,
    open_alerts:           (db.prepare("SELECT COUNT(*) AS c FROM aml_alerts WHERE resolved=0").get() as any).c,
  };
}

export function getWalletHistory(wallet: string, limit = 20) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM aml_screenings WHERE wallet=? ORDER BY screened_at DESC LIMIT ?")
    .all(wallet, limit);
}

export function getOpenAlerts(limit = 100) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM aml_alerts WHERE resolved=0 ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}

export function resolveAlert(alertId: number, resolvedBy: string): void {
  const db  = getDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "UPDATE aml_alerts SET resolved=1, resolved_by=?, resolved_at=? WHERE id=?"
  ).run(resolvedBy, now, alertId);
}
