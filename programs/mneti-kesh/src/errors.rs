use anchor_lang::prelude::*;

#[error_code]
pub enum KeshError {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Wallet is frozen — contact compliance officer")]
    WalletFrozen,
    #[msg("Daily transaction limit exceeded")]
    DailyLimitExceeded,
    #[msg("Oracle price is stale")]
    StalePriceOracle,
    #[msg("Oracle rate is zero or invalid")]
    InvalidOracleRate,
    #[msg("Amount below minimum (KES 50)")]
    BelowMinimumAmount,
    #[msg("Amount is zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("M-Pesa reference already processed")]
    DuplicateMpesaReference,
    #[msg("M-Pesa reference invalid or too long")]
    InvalidMpesaReference,
    #[msg("Invalid parameter")]
    InvalidParameter,
}
