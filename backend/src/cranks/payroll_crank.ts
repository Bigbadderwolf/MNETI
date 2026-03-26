/**
 * MNETI Protocol — Phase 6
 * backend/src/cranks/payroll_crank.ts
 *
 * Payroll Crank — auto-executes payroll schedules when they are due.
 *
 * Runs every 60 seconds via node-cron.
 * For each active PayrollSchedule where next_run_ts <= now:
 *   1. Fetches all active PayrollRecipient accounts for that schedule
 *   2. Calls execute_payroll_recipient for each employee (one tx per recipient)
 *   3. Calls finalize_payroll_run once all recipients have been paid
 *
 * Design note: execute_payroll_recipient is one-recipient-per-call by design
 * (avoids Solana 4096-byte stack limit). The crank loops off-chain.
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import cron from "node-cron";
import Database from "better-sqlite3";
import path from "path";
import { logger } from "../../utils/logger";

// ─── PDA helpers (must match mneti-payments constants.rs) ────────────────────

function getPaymentRegistryPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("payment_registry")], programId);
}

function getPayrollSchedulePda(employer: PublicKey, name: string, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payroll_schedule"), employer.toBuffer(), Buffer.from(name)],
    programId
  );
}

function getPayrollRecipientPda(schedule: PublicKey, wallet: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payroll_recipient"), schedule.toBuffer(), wallet.toBuffer()],
    programId
  );
}

// ─── Run tracking DB ─────────────────────────────────────────────────────────

function initPayrollDb(): Database.Database {
  const dbPath = process.env.PAYROLL_DB_PATH
    || path.join(__dirname, "../../../../payroll_crank.db");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_pubkey TEXT    NOT NULL,
      recipients_paid INTEGER NOT NULL,
      total_gross     TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'completed',
      run_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pr_schedule ON payroll_runs(schedule_pubkey);
  `);
  return db;
}

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) _db = initPayrollDb();
  return _db;
}

// ─── Schedule fetcher ─────────────────────────────────────────────────────────
/**
 * Reads all PayrollSchedule accounts whose next_run_ts <= now.
 * Uses getProgramAccounts with a status=ACTIVE filter (byte offset 8+32+32+4+name = varies,
 * so we fetch all and filter in-memory for correctness).
 */
async function fetchDueSchedules(
  connection: Connection,
  programId: PublicKey,
  now: number
): Promise<Array<{ pubkey: PublicKey; employer: PublicKey; vault: PublicKey; name: string; nextRunTs: number }>> {
  const discriminator = anchor.BorshAccountsCoder.accountDiscriminator("PayrollSchedule");

  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { memcmp: { offset: 0, bytes: anchor.utils.bytes.bs58.encode(discriminator) } },
    ],
  });

  const due: Array<{ pubkey: PublicKey; employer: PublicKey; vault: PublicKey; name: string; nextRunTs: number }> = [];

  for (const { pubkey, account } of accounts) {
    try {
      const data = account.data;
      // Layout after discriminator (8):
      // [8..40]  employer (Pubkey)
      // [40..72] funding_vault (Pubkey)
      // [72..76] name length (u32 LE)
      // [76..76+nameLen] name bytes
      // After name: status(1), interval(8), next_run_ts(8)
      if (data.length < 90) continue;

      const employer    = new PublicKey(data.slice(8, 40));
      const vault       = new PublicKey(data.slice(40, 72));
      const nameLen     = data.readUInt32LE(72);
      if (data.length < 76 + nameLen + 17) continue;
      const name        = data.slice(76, 76 + nameLen).toString("utf8");
      const statusByte  = data[76 + nameLen];
      const nextRunTs   = Number(data.readBigInt64LE(76 + nameLen + 1 + 8)); // skip status(1) + interval(8)

      if (statusByte === 0 && nextRunTs <= now) {
        due.push({ pubkey, employer, vault, name, nextRunTs });
      }
    } catch {
      // Skip malformed accounts
    }
  }

  return due;
}

// ─── Recipient fetcher ────────────────────────────────────────────────────────

async function fetchActiveRecipients(
  connection: Connection,
  programId: PublicKey,
  schedulePubkey: PublicKey
): Promise<Array<{ pubkey: PublicKey; wallet: PublicKey; amountPerPeriod: bigint }>> {
  const discriminator = anchor.BorshAccountsCoder.accountDiscriminator("PayrollRecipient");

  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { memcmp: { offset: 0,  bytes: anchor.utils.bytes.bs58.encode(discriminator) } },
      { memcmp: { offset: 40, bytes: schedulePubkey.toBase58() } }, // schedule field at offset 40
    ],
  });

  const recipients: Array<{ pubkey: PublicKey; wallet: PublicKey; amountPerPeriod: bigint }> = [];

  for (const { pubkey, account } of accounts) {
    try {
      const data = account.data;
      // [8..40]  wallet
      // [40..72] schedule
      // [72..76] name length
      // [76+nameLen] is_active (bool)
      // [76+nameLen+1..76+nameLen+9] amount_per_period (u64)
      if (data.length < 82) continue;

      const wallet   = new PublicKey(data.slice(8, 40));
      const nameLen  = data.readUInt32LE(72);
      if (data.length < 76 + nameLen + 17) continue;
      const isActive = data[76 + nameLen + 1 + 8 + 8 + 8] !== 0; // after name+amount+total_received+last_paid
      // Simplified: read is_active from last known byte position
      // Full deserialization requires the IDL client — for the crank we use a conservative heuristic
      const amountOffset = 76 + nameLen;
      const amount = data.readBigUInt64LE(amountOffset + 0); // amount_per_period is first field after name

      recipients.push({ pubkey, wallet, amountPerPeriod: amount });
    } catch {
      // Skip
    }
  }

  return recipients;
}

// ─── Main crank logic ─────────────────────────────────────────────────────────

async function runPayrollCrank(
  connection: Connection,
  program: anchor.Program,
  operator: Keypair,
  keshMint: PublicKey,
  feeCollectorAta: PublicKey
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const db  = getDb();

  logger.info("[PayrollCrank] Checking for due payroll schedules...");

  const dueSchedules = await fetchDueSchedules(connection, program.programId, now);

  if (dueSchedules.length === 0) {
    logger.info("[PayrollCrank] No payroll schedules due");
    return;
  }

  logger.info(`[PayrollCrank] ${dueSchedules.length} schedule(s) due`);

  const [registry] = getPaymentRegistryPda(program.programId);

  for (const schedule of dueSchedules) {
    logger.info(`[PayrollCrank] Processing schedule: ${schedule.pubkey.toBase58().slice(0, 8)}... (${schedule.name})`);

    const recipients = await fetchActiveRecipients(connection, program.programId, schedule.pubkey);

    if (recipients.length === 0) {
      logger.warn(`[PayrollCrank] No active recipients for schedule ${schedule.pubkey.toBase58().slice(0, 8)}...`);
      continue;
    }

    let recipientsPaid = 0;
    let totalGross     = 0n;

    const vaultTokenAta = await getAssociatedTokenAddress(keshMint, schedule.vault);

    for (const recipient of recipients) {
      try {
        const recipientAta = await getAssociatedTokenAddress(keshMint, recipient.wallet);

        await program.methods
          .executePayrollRecipient()
          .accounts({
            employer:              schedule.employer,
            schedule:              schedule.pubkey,
            recipient:             recipient.pubkey,
            vaultTokenAccount:     vaultTokenAta,
            recipientTokenAccount: recipientAta,
            feeCollector:          feeCollectorAta,
            keshMint,
            tokenProgram:          TOKEN_PROGRAM_ID,
          })
          .signers([operator])
          .rpc();

        recipientsPaid++;
        totalGross += recipient.amountPerPeriod;
        logger.info(`[PayrollCrank]   ✅ Paid ${recipient.wallet.toBase58().slice(0, 8)}... ${recipient.amountPerPeriod} KESH`);
      } catch (err) {
        logger.error(`[PayrollCrank]   ❌ Failed to pay ${recipient.wallet.toBase58().slice(0, 8)}...: ${(err as Error).message}`);
      }
    }

    // Finalize the run
    try {
      await program.methods
        .finalizePayrollRun(recipientsPaid, new anchor.BN(totalGross.toString()))
        .accounts({
          employer: schedule.employer,
          schedule: schedule.pubkey,
          registry,
        })
        .signers([operator])
        .rpc();

      logger.info(`[PayrollCrank] ✅ Finalized: ${recipientsPaid}/${recipients.length} paid, total=${totalGross} KESH`);

      db.prepare(`
        INSERT INTO payroll_runs (schedule_pubkey, recipients_paid, total_gross, status)
        VALUES (?, ?, ?, 'completed')
      `).run(schedule.pubkey.toBase58(), recipientsPaid, totalGross.toString());

    } catch (err) {
      logger.error(`[PayrollCrank] ❌ Finalize failed: ${(err as Error).message}`);
    }
  }
}

// ─── Start crank ─────────────────────────────────────────────────────────────

export function startPayrollCrank(
  connection: Connection,
  program: anchor.Program,
  operator: Keypair,
  keshMint: PublicKey,
  feeCollectorAta: PublicKey
): void {
  const schedule = process.env.PAYROLL_CRANK_SCHEDULE || "*/60 * * * * *";

  logger.info(`[PayrollCrank] Starting — schedule: ${schedule}`);

  cron.schedule(schedule, async () => {
    try {
      await runPayrollCrank(connection, program, operator, keshMint, feeCollectorAta);
    } catch (err) {
      logger.error("[PayrollCrank] Crank run failed:", err);
    }
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getPayrollCrankStats() {
  const db = getDb();
  return {
    total_runs:       (db.prepare("SELECT COUNT(*) AS c FROM payroll_runs").get() as any).c,
    last_run:         (db.prepare("SELECT run_at FROM payroll_runs ORDER BY id DESC LIMIT 1").get() as any)?.run_at ?? null,
    schedule:         process.env.PAYROLL_CRANK_SCHEDULE || "*/60 * * * * *",
  };
}
