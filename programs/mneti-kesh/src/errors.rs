// ─────────────────────────────────────────────────────────────
//  MNETI KESH — errors.rs
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

#[error_code]
pub enum KeshError {
    #[msg("Protocol is paused — no minting or burning allowed")]
    ProtocolPaused,

    #[msg("Unauthorized — caller does not have the required role")]
    Unauthorized,

    #[msg("Wallet is frozen — contact MNETI compliance officer")]
    WalletFrozen,

    #[msg("Daily transaction limit exceeded for your compliance tier")]
    DailyLimitExceeded,

    #[msg("Oracle price is stale — SIX Financial has not updated recently")]
    StalePriceOracle,

    #[msg("Oracle rate is zero or invalid")]
    InvalidOracleRate,

    #[msg("Amount is below the minimum allowed (KES 50)")]
    BelowMinimumAmount,

    #[msg("Amount is zero — must be greater than zero")]
    ZeroAmount,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("This M-Pesa reference has already been processed")]
    DuplicateMpesaReference,

    #[msg("M-Pesa reference is invalid or too long (max 20 chars)")]
    InvalidMpesaReference,

    #[msg("Invalid parameter provided")]
    InvalidParameter,
}
