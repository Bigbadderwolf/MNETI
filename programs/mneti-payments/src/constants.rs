// ═══════════════════════════════════════════════════════════════════════════════
// mneti-payments — constants.rs
// All PDA seeds, discriminants, limits, fees, and account space calculations
// for the Programmable Payments program.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PDA Seeds ────────────────────────────────────────────────────────────────
pub const PAYMENT_REGISTRY_SEED:   &[u8] = b"payment_registry";
pub const PAYROLL_SCHEDULE_SEED:   &[u8] = b"payroll_schedule";
pub const PAYROLL_RECIPIENT_SEED:  &[u8] = b"payroll_recipient";
pub const SUPPLIER_PAYMENT_SEED:   &[u8] = b"supplier_payment";
pub const SUPPLIER_ESCROW_SEED:    &[u8] = b"supplier_escrow";
pub const RECURRING_PAYMENT_SEED:  &[u8] = b"recurring_payment";
pub const COND_GRANT_SEED:         &[u8] = b"conditional_grant";
pub const COND_GRANT_ESCROW_SEED:  &[u8] = b"grant_escrow";
pub const INVOICE_NFT_SEED:        &[u8] = b"invoice_nft";

// ─── Payment Status Codes ─────────────────────────────────────────────────────
/// Deposit / schedule is live and operational
pub const STATUS_ACTIVE:            u8 = 0;
/// Temporarily suspended — no executions
pub const STATUS_PAUSED:            u8 = 1;
/// All executions completed — terminal state
pub const STATUS_COMPLETED:         u8 = 2;
/// Cancelled — escrow refunded — terminal state
pub const STATUS_CANCELLED:         u8 = 3;
/// Funds escrowed, waiting for oracle / date / multisig condition
pub const STATUS_PENDING_CONDITION: u8 = 4;

// ─── Supplier Payment Condition Types ────────────────────────────────────────
/// Release immediately — no condition
pub const COND_NONE:         u8 = 0;
/// Release when oracle KES/USD price >= condition_value
pub const COND_ORACLE_PRICE: u8 = 1;
/// Release on or after condition_value (unix timestamp)
pub const COND_DATE:         u8 = 2;
/// Release after M-of-N multisig approval (handled via separate approve_supplier_payment ix)
pub const COND_MULTISIG:     u8 = 3;

// ─── Payroll Intervals (seconds) ─────────────────────────────────────────────
pub const INTERVAL_WEEKLY:    i64 = 7  * 24 * 3_600;
pub const INTERVAL_BIWEEKLY:  i64 = 14 * 24 * 3_600;
pub const INTERVAL_MONTHLY:   i64 = 30 * 24 * 3_600;

// ─── String Length Limits ─────────────────────────────────────────────────────
pub const MAX_PAYROLL_NAME:        usize = 48;
pub const MAX_RECIPIENT_NAME:      usize = 48;
pub const MAX_SUPPLIER_NAME:       usize = 64;
pub const MAX_INVOICE_REF:         usize = 32;
pub const MAX_RECURRING_MEMO:      usize = 64;
pub const MAX_GRANT_NAME:          usize = 64;
pub const MAX_GRANT_CONDITION_DESC:usize = 128;
pub const MAX_INVOICE_MEMO:        usize = 128;

// ─── Cardinality Limits ───────────────────────────────────────────────────────
pub const MAX_PAYROLL_RECIPIENTS:  usize = 100;
pub const MAX_GRANT_CONDITIONS:    usize = 8;

// ─── Fee Schedule (basis points) ─────────────────────────────────────────────
/// 0.10 % per payroll disbursement
pub const FEE_PAYROLL_BPS:    u64 = 10;
/// 0.20 % per supplier payment release
pub const FEE_SUPPLIER_BPS:   u64 = 20;
/// 0.05 % per recurring execution
pub const FEE_RECURRING_BPS:  u64 = 5;
/// 2.00 % invoice financing fee (charged to issuer on advance)
pub const FEE_INVOICE_FIN_BPS:u64 = 200;

// ─── Amount Limits ────────────────────────────────────────────────────────────
/// Minimum payment amount — KES 50 = 5_000 KESH units (2 decimals)
pub const MIN_PAYMENT_AMOUNT: u64 = 5_000;

// ─── Oracle Integration ───────────────────────────────────────────────────────
/// Maximum age of oracle price data before we reject it (seconds)
pub const MAX_ORACLE_AGE_SECS: i64 = 120;
/// Feed index 0 = KES/USD  (matches mneti-oracle constants)
pub const FEED_KES_USD: u8 = 0;

// ─── Travel Rule Gate ─────────────────────────────────────────────────────────
/// FATF threshold: transfers ≥ USD 1,000.
/// At KES/USD = 130 → KES 130,000 → 13_000_000 KESH units (2 decimals).
/// When a payment crosses this threshold the ix requires a travel_rule_ref.
pub const TRAVEL_RULE_THRESHOLD_KESH: u64 = 13_000_000;

// ─── Account Space (bytes) ────────────────────────────────────────────────────
// Formula: 8 (discriminator) + sum of field sizes
// Strings stored as 4-byte length prefix + data bytes.
// All accounts use Box<> in instruction contexts to stay under 4096-byte stack.

pub const SZ_PAYMENT_REGISTRY: usize = 8
    + 32  // authority
    + 8   // total_payroll_runs
    + 8   // total_supplier_payments
    + 8   // total_recurring_executions
    + 8   // total_grants_disbursed
    + 8   // total_volume_kesh
    + 8   // created_at
    + 32; // reserved padding

pub const SZ_PAYROLL_SCHEDULE: usize = 8
    + 32                       // employer
    + 32                       // funding_vault
    + (4 + MAX_PAYROLL_NAME)   // name
    + 1                        // status
    + 8                        // interval_seconds
    + 8                        // next_run_ts
    + 8                        // last_run_ts
    + 8                        // total_disbursed_kesh
    + 4                        // recipient_count
    + 4                        // run_count
    + 8                        // created_at
    + 32;                      // reserved

pub const SZ_PAYROLL_RECIPIENT: usize = 8
    + 32                         // wallet
    + 32                         // schedule
    + (4 + MAX_RECIPIENT_NAME)   // name
    + 8                          // amount_per_period
    + 8                          // total_received
    + 8                          // last_paid_ts
    + 1                          // is_active
    + 16;                        // reserved

pub const SZ_SUPPLIER_PAYMENT: usize = 8
    + 32                       // payer
    + 32                       // supplier_wallet
    + (4 + MAX_SUPPLIER_NAME)  // supplier_name
    + (4 + MAX_INVOICE_REF)    // invoice_ref
    + 8                        // amount_kesh
    + 1                        // condition_type
    + 8                        // condition_value
    + 1                        // multisig_approvals (for COND_MULTISIG)
    + 1                        // multisig_threshold
    + 1                        // status
    + 8                        // created_at
    + 8                        // executed_at (0 if pending)
    + 8                        // escrowed_amount
    + 32;                      // reserved

pub const SZ_RECURRING_PAYMENT: usize = 8
    + 32                        // payer
    + 32                        // recipient
    + (4 + MAX_RECURRING_MEMO)  // memo
    + 8                         // amount_per_execution
    + 8                         // interval_seconds
    + 8                         // next_execution_ts
    + 8                         // last_execution_ts
    + 4                         // execution_count
    + 4                         // max_executions  (0 = unlimited)
    + 1                         // status
    + 8                         // created_at
    + 8                         // total_paid
    + 16;                       // reserved

pub const SZ_COND_GRANT: usize = 8
    + 32                             // authority
    + (4 + MAX_GRANT_NAME)           // grant_name
    + 8                              // total_amount
    + 8                              // disbursed_amount
    + 8                              // locked_amount
    + 1                              // status
    + 8                              // expiry_ts  (0 = no expiry)
    + 4                              // recipient_count
    + 8                              // created_at
    // conditions vec: 4-byte length + MAX_GRANT_CONDITIONS × (4 + MAX_GRANT_CONDITION_DESC + 1 + 8)
    + 4 + MAX_GRANT_CONDITIONS * (4 + MAX_GRANT_CONDITION_DESC + 1 + 8)
    + 64;                            // reserved

pub const SZ_INVOICE_NFT: usize = 8
    + 32                       // issuer
    + 32                       // debtor
    + (4 + MAX_INVOICE_MEMO)   // memo
    + 8                        // face_value
    + 8                        // financed_amount  (0 if not financed)
    + 8                        // due_date
    + 1                        // paid
    + 1                        // financed
    + 8                        // created_at
    + 16;                      // reserved
