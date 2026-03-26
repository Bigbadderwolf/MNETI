use anchor_lang::prelude::*;

#[error_code]
pub enum OracleError {
    #[msg("Unauthorized — not the approved relay operator")]
    Unauthorized,
    #[msg("Feed not found")]
    FeedNotFound,
    #[msg("Feed already initialized")]
    FeedAlreadyExists,
    #[msg("Price is zero or invalid")]
    InvalidPrice,
    #[msg("Price is stale — exceeds 60 second max age")]
    StalePrice,
    #[msg("Price deviation > 0.5% between SIX and Pyth")]
    PriceDeviationTooLarge,
    #[msg("Circuit breaker is active")]
    CircuitBreakerActive,
    #[msg("Invalid feed type")]
    InvalidFeedType,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
