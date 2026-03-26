// ═══════════════════════════════════════════════════════════════════════════════
// mneti-payments — events.rs
// All on-chain Anchor events emitted by the Programmable Payments program.
// These are indexed by off-chain listeners and the compliance dashboard.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

// ─── Registry ─────────────────────────────────────────────────────────────────

#[event]
pub struct PaymentRegistryInitialized {
    /// Protocol authority that initialized the registry
    pub authority: Pubkey,
    pub timestamp: i64,
}

// ─── Payroll Events ───────────────────────────────────────────────────────────

#[event]
pub struct PayrollScheduleCreated {
    /// PDA of the new payroll schedule
    pub schedule:          Pubkey,
    /// Employer wallet that owns the schedule
    pub employer:          Pubkey,
    /// SME or Enterprise vault that funds disbursements
    pub funding_vault:     Pubkey,
    pub name:              String,
    /// Interval in seconds between payroll runs
    pub interval_seconds:  i64,
    /// Unix timestamp of the first scheduled run
    pub first_run_ts:      i64,
    pub timestamp:         i64,
}

#[event]
pub struct PayrollRecipientAdded {
    pub schedule:          Pubkey,
    pub recipient_wallet:  Pubkey,
    pub name:              String,
    pub amount_per_period: u64,
    pub timestamp:         i64,
}

#[event]
pub struct PayrollRecipientDeactivated {
    pub schedule:         Pubkey,
    pub recipient_wallet: Pubkey,
    pub timestamp:        i64,
}

/// Emitted once per individual employee payment within a payroll run
#[event]
pub struct PayrollSinglePayment {
    pub schedule:         Pubkey,
    pub recipient_wallet: Pubkey,
    /// Net amount credited to the employee (gross minus fee)
    pub net_amount:       u64,
    /// Fee sent to the protocol fee collector
    pub fee_amount:       u64,
    pub timestamp:        i64,
}

/// Emitted once when the employer calls finalize_payroll_run
#[event]
pub struct PayrollRunFinalized {
    pub schedule:           Pubkey,
    pub employer:           Pubkey,
    pub recipients_paid:    u32,
    pub total_gross_kesh:   u64,
    pub total_fee_kesh:     u64,
    pub next_run_ts:        i64,
    pub run_count:          u32,
    pub timestamp:          i64,
}

// ─── Supplier Payment Events ──────────────────────────────────────────────────

#[event]
pub struct SupplierPaymentCreated {
    pub payment:          Pubkey,
    pub payer:            Pubkey,
    pub supplier_wallet:  Pubkey,
    pub supplier_name:    String,
    pub invoice_ref:      String,
    pub amount_kesh:      u64,
    /// 0=none, 1=oracle_price, 2=date, 3=multisig
    pub condition_type:   u8,
    /// Condition threshold: price (scaled) or unix timestamp
    pub condition_value:  u64,
    pub timestamp:        i64,
}

#[event]
pub struct SupplierPaymentFundsEscrowed {
    pub payment:     Pubkey,
    pub amount_kesh: u64,
    pub timestamp:   i64,
}

#[event]
pub struct SupplierPaymentApproved {
    /// One multisig signer approved — not yet executed
    pub payment:           Pubkey,
    pub approver:          Pubkey,
    pub approvals_so_far:  u8,
    pub threshold:         u8,
    pub timestamp:         i64,
}

#[event]
pub struct SupplierPaymentExecuted {
    pub payment:          Pubkey,
    pub payer:            Pubkey,
    pub supplier_wallet:  Pubkey,
    /// Net KESH credited to supplier
    pub net_amount:       u64,
    /// Protocol fee collected
    pub fee_amount:       u64,
    /// Populated when amount >= TRAVEL_RULE_THRESHOLD_KESH
    pub travel_rule_ref:  Option<String>,
    pub timestamp:        i64,
}

#[event]
pub struct SupplierPaymentCancelled {
    pub payment:         Pubkey,
    pub payer:           Pubkey,
    /// Escrowed funds returned to this account
    pub refunded_to:     Pubkey,
    pub refund_amount:   u64,
    pub timestamp:       i64,
}

// ─── Recurring Payment Events ─────────────────────────────────────────────────

#[event]
pub struct RecurringPaymentCreated {
    pub payment:               Pubkey,
    pub payer:                 Pubkey,
    pub recipient:             Pubkey,
    pub memo:                  String,
    pub amount_per_execution:  u64,
    pub interval_seconds:      i64,
    /// 0 = unlimited
    pub max_executions:        u32,
    pub timestamp:             i64,
}

#[event]
pub struct RecurringPaymentExecuted {
    pub payment:            Pubkey,
    pub payer:              Pubkey,
    pub recipient:          Pubkey,
    pub net_amount:         u64,
    pub fee_amount:         u64,
    pub execution_count:    u32,
    pub next_execution_ts:  i64,
    pub timestamp:          i64,
}

#[event]
pub struct RecurringPaymentPaused {
    pub payment:   Pubkey,
    pub paused_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RecurringPaymentResumed {
    pub payment:    Pubkey,
    pub resumed_by: Pubkey,
    pub timestamp:  i64,
}

#[event]
pub struct RecurringPaymentCancelled {
    pub payment:      Pubkey,
    pub cancelled_by: Pubkey,
    pub timestamp:    i64,
}

// ─── Conditional Grant Events ─────────────────────────────────────────────────

#[event]
pub struct ConditionalGrantCreated {
    pub grant:        Pubkey,
    pub authority:    Pubkey,
    pub grant_name:   String,
    pub total_amount: u64,
    /// 0 = no expiry
    pub expiry_ts:    i64,
    pub timestamp:    i64,
}

#[event]
pub struct GrantFundsDeposited {
    pub grant:       Pubkey,
    pub depositor:   Pubkey,
    pub amount_kesh: u64,
    pub timestamp:   i64,
}

#[event]
pub struct GrantConditionSatisfied {
    pub grant:           Pubkey,
    pub condition_index: u8,
    pub unlocked_amount: u64,
    pub timestamp:       i64,
}

#[event]
pub struct ConditionalGrantDisbursed {
    pub grant:       Pubkey,
    pub authority:   Pubkey,
    pub recipient:   Pubkey,
    pub amount_kesh: u64,
    pub timestamp:   i64,
}

// ─── Invoice NFT Events ───────────────────────────────────────────────────────

#[event]
pub struct InvoiceNftIssued {
    pub invoice:    Pubkey,
    pub issuer:     Pubkey,
    pub debtor:     Pubkey,
    pub memo:       String,
    pub face_value: u64,
    pub due_date:   i64,
    pub timestamp:  i64,
}

#[event]
pub struct InvoiceFinanced {
    pub invoice:          Pubkey,
    pub financer:         Pubkey,
    /// Advance paid to issuer (face_value minus financing fee)
    pub advance_amount:   u64,
    pub financing_fee:    u64,
    pub timestamp:        i64,
}

#[event]
pub struct InvoiceRepaid {
    pub invoice:    Pubkey,
    pub debtor:     Pubkey,
    /// Full face_value paid
    pub amount:     u64,
    pub timestamp:  i64,
}
