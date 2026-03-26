// ═══════════════════════════════════════════════════════════════════════════════
// mneti-payments — state.rs
// All Anchor account structs for the Programmable Payments program.
// Each struct has impl methods used by instruction handlers.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;
use crate::constants::*;

// ─── Payment Registry (global singleton) ──────────────────────────────────────
/// One instance per deployment. Tracks aggregate protocol statistics.
/// Initialized once by the protocol authority.
#[account]
pub struct PaymentRegistry {
    /// Protocol authority — can pause/resume registry operations
    pub authority:                   Pubkey,
    /// Total number of completed payroll runs across all schedules
    pub total_payroll_runs:          u64,
    /// Total number of supplier payments executed (condition met + funds released)
    pub total_supplier_payments:     u64,
    /// Total number of recurring payment executions
    pub total_recurring_executions:  u64,
    /// Total KESH disbursed via conditional grants
    pub total_grants_disbursed:      u64,
    /// Cumulative KESH volume processed through all payment types
    pub total_volume_kesh:           u64,
    pub created_at:                  i64,
}

// ─── Payroll Schedule ─────────────────────────────────────────────────────────
/// Represents one payroll cycle (e.g. "MNETI Weekly Payroll").
/// The employer calls execute_payroll_recipient once per active recipient,
/// then calls finalize_payroll_run to advance next_run_ts.
#[account]
pub struct PayrollSchedule {
    /// Employer wallet — controls this schedule
    pub employer:             Pubkey,
    /// SME or Enterprise vault PDA that holds the KESH to be disbursed
    pub funding_vault:        Pubkey,
    pub name:                 String,
    pub status:               u8,       // STATUS_ACTIVE | STATUS_PAUSED
    /// Gap between runs in seconds (INTERVAL_WEEKLY / BIWEEKLY / MONTHLY)
    pub interval_seconds:     i64,
    /// Unix timestamp at which the next run becomes executable
    pub next_run_ts:          i64,
    /// Unix timestamp of the most recently completed run (0 if never run)
    pub last_run_ts:          i64,
    /// Cumulative gross KESH disbursed across all runs
    pub total_disbursed_kesh: u64,
    /// Number of currently registered recipients (active + inactive)
    pub recipient_count:      u32,
    /// Number of times finalize_payroll_run has been called
    pub run_count:            u32,
    pub created_at:           i64,
}

impl PayrollSchedule {
    pub fn is_active(&self) -> bool { self.status == STATUS_ACTIVE }
    pub fn is_due(&self, now: i64) -> bool { now >= self.next_run_ts }
}

// ─── Payroll Recipient ────────────────────────────────────────────────────────
/// One PDA per employee per schedule.
/// Seeds: [PAYROLL_RECIPIENT_SEED, schedule.key(), wallet.key()]
#[account]
pub struct PayrollRecipient {
    pub wallet:            Pubkey,
    pub schedule:          Pubkey,
    /// Employee display name — stored on-chain for audit trail
    pub name:              String,
    /// Gross KESH per payroll period before fee deduction
    pub amount_per_period: u64,
    /// Cumulative net KESH credited to this employee
    pub total_received:    u64,
    /// Unix timestamp of the last payment to this employee
    pub last_paid_ts:      i64,
    /// False when employer calls deactivate_payroll_recipient
    pub is_active:         bool,
}

// ─── Supplier Payment ─────────────────────────────────────────────────────────
/// Represents a single purchase order / invoice payment.
/// KESH is escrowed at creation and released when the condition is satisfied.
#[account]
pub struct SupplierPayment {
    pub payer:              Pubkey,
    pub supplier_wallet:    Pubkey,
    pub supplier_name:      String,
    /// Buyer's internal invoice reference number (e.g. "INV-2026-001")
    pub invoice_ref:        String,
    /// Gross KESH amount (fee deducted at execution)
    pub amount_kesh:        u64,
    /// COND_NONE | COND_ORACLE_PRICE | COND_DATE | COND_MULTISIG
    pub condition_type:     u8,
    /// For COND_ORACLE_PRICE: minimum price (scaled, matches oracle feed units)
    /// For COND_DATE:         unix timestamp on/after which funds release
    /// For COND_MULTISIG:     required number of approvals (stored as u64)
    pub condition_value:    u64,
    /// For COND_MULTISIG: running count of approvals received
    pub multisig_approvals: u8,
    pub status:             u8,
    pub created_at:         i64,
    /// 0 until executed
    pub executed_at:        i64,
    /// Tracks escrow — decremented to 0 on execute or cancel
    pub escrowed_amount:    u64,
}

impl SupplierPayment {
    pub fn is_live(&self) -> bool {
        self.status == STATUS_ACTIVE || self.status == STATUS_PENDING_CONDITION
    }

    /// Evaluates whether the release condition is met.
    /// `oracle_price` is only used when condition_type == COND_ORACLE_PRICE.
    pub fn condition_met(&self, now: i64, oracle_price: u64) -> bool {
        match self.condition_type {
            COND_NONE         => true,
            COND_ORACLE_PRICE => oracle_price >= self.condition_value,
            COND_DATE         => now >= self.condition_value as i64,
            COND_MULTISIG     => self.multisig_approvals as u64 >= self.condition_value,
            _                 => false,
        }
    }
}

// ─── Recurring Payment ────────────────────────────────────────────────────────
/// Represents an auto-debit instruction (bill, subscription, standing order).
/// The payer calls execute_recurring_payment each time next_execution_ts is reached.
#[account]
pub struct RecurringPayment {
    pub payer:                Pubkey,
    pub recipient:            Pubkey,
    /// Human-readable memo (e.g. "Monthly Rent — Plot 14B")
    pub memo:                 String,
    /// Gross KESH per execution before fee
    pub amount_per_execution: u64,
    pub interval_seconds:     i64,
    pub next_execution_ts:    i64,
    pub last_execution_ts:    i64,
    pub execution_count:      u32,
    /// 0 means unlimited (runs until cancelled)
    pub max_executions:       u32,
    pub status:               u8,
    pub created_at:           i64,
    pub total_paid:           u64,
}

impl RecurringPayment {
    pub fn is_active(&self) -> bool  { self.status == STATUS_ACTIVE }
    pub fn is_due(&self, now: i64) -> bool { now >= self.next_execution_ts }
    pub fn remaining(&self) -> bool {
        self.max_executions == 0 || self.execution_count < self.max_executions
    }
}

// ─── Conditional Grant ────────────────────────────────────────────────────────
/// NGO / Government grant disbursement vault.
/// Funds are escrowed on creation. Each condition satisfied unlocks a
/// proportional tranche for disbursement.

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct GrantCondition {
    /// Plain-language description stored on-chain for transparency
    pub description:  String,
    pub satisfied:    bool,
    pub satisfied_at: i64,
}

#[account]
pub struct ConditionalGrant {
    pub authority:         Pubkey,
    pub grant_name:        String,
    /// Total KESH loaded into the grant escrow
    pub total_amount:      u64,
    /// Cumulative KESH released to recipients so far
    pub disbursed_amount:  u64,
    /// Funds still locked pending unsatisfied conditions
    pub locked_amount:     u64,
    pub status:            u8,
    /// 0 = no expiry; otherwise unix timestamp after which no disbursement allowed
    pub expiry_ts:         i64,
    pub recipient_count:   u32,
    pub created_at:        i64,
    pub conditions:        Vec<GrantCondition>,
}

impl ConditionalGrant {
    pub fn is_active(&self) -> bool  { self.status == STATUS_ACTIVE }
    pub fn is_expired(&self, now: i64) -> bool {
        self.expiry_ts > 0 && now > self.expiry_ts
    }
    /// KESH that has been unlocked by satisfied conditions and not yet disbursed
    pub fn available(&self) -> u64 {
        self.total_amount
            .saturating_sub(self.disbursed_amount)
            .saturating_sub(self.locked_amount)
    }
    /// Amount unlocked per condition: total ÷ number of conditions
    pub fn per_condition_unlock(&self) -> u64 {
        if self.conditions.is_empty() { return 0; }
        self.total_amount / self.conditions.len() as u64
    }
}

// ─── Invoice NFT ──────────────────────────────────────────────────────────────
/// Represents a trade receivable (accounts receivable) as an on-chain record.
/// The issuer (seller) can get an immediate advance from a third-party financer.
/// The debtor (buyer) repays the full face value by the due date.
#[account]
pub struct InvoiceNft {
    /// Seller / service provider — created the invoice
    pub issuer:           Pubkey,
    /// Buyer — obligated to pay face_value by due_date
    pub debtor:           Pubkey,
    pub memo:             String,
    /// Full invoice value in KESH (2 decimals)
    pub face_value:       u64,
    /// Advance received by issuer from financer (face_value - financing_fee)
    /// 0 if not yet financed
    pub financed_amount:  u64,
    /// Financer wallet — receives repayment from debtor
    /// Zero if not financed (repayment goes to issuer)
    pub financer:         Pubkey,
    /// Unix timestamp — payment deadline
    pub due_date:         i64,
    pub paid:             bool,
    pub financed:         bool,
    pub created_at:       i64,
}

impl InvoiceNft {
    pub fn is_overdue(&self, now: i64) -> bool {
        !self.paid && now > self.due_date
    }
    /// Financing fee = face_value × FEE_INVOICE_FIN_BPS / 10_000
    pub fn financing_fee(&self) -> u64 {
        self.face_value
            .saturating_mul(FEE_INVOICE_FIN_BPS)
            / 10_000
    }
    /// Advance paid to issuer when financed
    pub fn advance_amount(&self) -> u64 {
        self.face_value.saturating_sub(self.financing_fee())
    }
}
