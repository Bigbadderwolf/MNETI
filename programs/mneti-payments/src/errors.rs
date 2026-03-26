// ═══════════════════════════════════════════════════════════════════════════════
// mneti-payments — errors.rs
// All error codes for the Programmable Payments program.
// Each error maps to a specific failure mode — no catch-all codes.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

#[error_code]
pub enum PaymentError {
    // ── Access Control ────────────────────────────────────────────────────────
    #[msg("Unauthorized: signer is not the employer, payer, or authority for this account")]
    Unauthorized,

    #[msg("Wallet is frozen by the compliance program — no payments permitted")]
    WalletFrozen,

    // ── Schedule / Payment State ──────────────────────────────────────────────
    #[msg("Payroll schedule is paused — resume before executing payments")]
    SchedulePaused,

    #[msg("Payment has already been cancelled and cannot be reactivated")]
    PaymentCancelled,

    #[msg("Payment has already been fully completed")]
    PaymentAlreadyCompleted,

    // ── Payroll ───────────────────────────────────────────────────────────────
    #[msg("Payroll is not yet due — next_run_ts has not been reached")]
    PayrollNotDue,

    #[msg("Payroll recipient list is at capacity — maximum 100 recipients per schedule")]
    TooManyRecipients,

    #[msg("This wallet is already registered as a recipient on this payroll schedule")]
    RecipientAlreadyExists,

    #[msg("Recipient not found on this schedule or has been deactivated")]
    RecipientNotFound,

    #[msg("Payroll interval must be greater than zero seconds")]
    InvalidInterval,

    // ── Supplier Payments ─────────────────────────────────────────────────────
    #[msg("Payment condition is not yet satisfied — cannot release funds")]
    ConditionNotMet,

    #[msg("Oracle price data is stale — cannot evaluate oracle price condition")]
    StaleOraclePrice,

    #[msg("Oracle circuit breaker is active — conditional payments suspended")]
    OracleCircuitBreaker,

    #[msg("Escrow account balance does not match the expected payment amount")]
    EscrowBalanceMismatch,

    #[msg("Multisig approval count has not reached the required threshold")]
    MultisigThresholdNotReached,

    #[msg("This signer has already approved this payment")]
    AlreadyApproved,

    // ── Recurring Payments ────────────────────────────────────────────────────
    #[msg("Recurring payment is not yet due — next_execution_ts has not been reached")]
    RecurringNotDue,

    #[msg("Recurring payment has reached its maximum execution count and is now complete")]
    MaxExecutionsReached,

    // ── Conditional Grants ────────────────────────────────────────────────────
    #[msg("Grant vault has expired — no further disbursements are permitted")]
    GrantExpired,

    #[msg("Disbursement amount exceeds the currently unlocked grant balance")]
    GrantOverdisbursement,

    #[msg("Grant condition index is out of range")]
    GrantConditionOutOfRange,

    #[msg("This grant condition is already marked as satisfied")]
    GrantConditionAlreadySatisfied,

    // ── Invoice NFT ───────────────────────────────────────────────────────────
    #[msg("Invoice has already been paid")]
    InvoiceAlreadyPaid,

    #[msg("Invoice has already been financed")]
    InvoiceAlreadyFinanced,

    #[msg("Invoice due date must be in the future")]
    InvalidDueDate,

    #[msg("Invoice is not financed — repayment must go directly to the issuer")]
    InvoiceNotFinanced,

    // ── Amount Validation ─────────────────────────────────────────────────────
    #[msg("Amount is below the minimum payment threshold (KES 50 = 5,000 KESH units)")]
    BelowMinimumAmount,

    #[msg("Insufficient balance in the funding vault to cover this payment")]
    InsufficientFunds,

    // ── Travel Rule ───────────────────────────────────────────────────────────
    #[msg("Transfer amount exceeds FATF threshold (KES 130,000) — a travel_rule_ref must be provided")]
    TravelRuleRefRequired,

    #[msg("travel_rule_ref string must not be empty when provided")]
    TravelRuleRefEmpty,

    // ── Arithmetic ────────────────────────────────────────────────────────────
    #[msg("Arithmetic overflow in payment calculation — values too large")]
    MathOverflow,
}
