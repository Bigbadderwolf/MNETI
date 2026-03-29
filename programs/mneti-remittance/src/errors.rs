// ═══════════════════════════════════════════════════════════════════════════════
// mneti-remittance — errors.rs
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

#[error_code]
pub enum RemittanceError {
    // ── Access ────────────────────────────────────────────────────────────────
    #[msg("Unauthorized: signer is not the order creator or protocol authority")]
    Unauthorized,

    #[msg("Wallet is frozen by the compliance program — remittance not permitted")]
    WalletFrozen,

    // ── Corridor ──────────────────────────────────────────────────────────────
    #[msg("Corridor is not active — this remittance route is currently suspended")]
    CorridorInactive,

    #[msg("Invalid corridor identifier — must be 0–4")]
    InvalidCorridor,

    // ── Order State ───────────────────────────────────────────────────────────
    #[msg("Order is not in PENDING status — cannot process")]
    OrderNotPending,

    #[msg("Order has already been completed")]
    OrderAlreadyCompleted,

    #[msg("Order has been cancelled — cannot execute")]
    OrderCancelled,

    #[msg("Order has already failed — create a new order")]
    OrderFailed,

    // ── Amount Validation ─────────────────────────────────────────────────────
    #[msg("Source amount is below the minimum remittance threshold (USD 5 equivalent)")]
    BelowMinimumAmount,

    #[msg("Source amount exceeds the maximum single remittance limit (USD 50,000 equivalent)")]
    ExceedsMaximumAmount,

    // ── FX / Oracle ───────────────────────────────────────────────────────────
    #[msg("KES/USD oracle price data is stale — cannot lock FX rate")]
    StaleOraclePrice,

    #[msg("Oracle circuit breaker is active — FX rate unavailable")]
    OracleCircuitBreaker,

    #[msg("Computed destination KESH amount is zero — check FX rate and source amount")]
    ZeroDestinationAmount,

    #[msg("FX rate has moved beyond slippage tolerance since order was created")]
    SlippageExceeded,

    // ── Liquidity ─────────────────────────────────────────────────────────────
    #[msg("Insufficient KESH liquidity in the corridor pool to fill this order")]
    InsufficientLiquidity,

    // ── Travel Rule ───────────────────────────────────────────────────────────
    #[msg("Transfer amount exceeds FATF threshold (KES 130,000) — travel_rule_ref is required")]
    TravelRuleRefRequired,

    #[msg("travel_rule_ref must not be empty when provided")]
    TravelRuleRefEmpty,

    // ── Recipient Data ────────────────────────────────────────────────────────
    #[msg("Recipient phone number must be provided for M-Pesa payout")]
    MissingRecipientPhone,

    #[msg("Recipient phone number format is invalid — expected 2547XXXXXXXX (12 digits)")]
    InvalidPhoneFormat,

    #[msg("M-Pesa payout has already been triggered for this order")]
    MpesaAlreadyTriggered,

    // ── Name Fields ───────────────────────────────────────────────────────────
    #[msg("Sender name must not be empty — required for KYC audit trail")]
    MissingSenderName,

    #[msg("Recipient name must not be empty — required for FATF compliance")]
    MissingRecipientName,

    // ── Arithmetic ────────────────────────────────────────────────────────────
    #[msg("Arithmetic overflow in remittance calculation")]
    MathOverflow,
}
