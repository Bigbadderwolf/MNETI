use anchor_lang::prelude::*;

#[event]
pub struct PriceUpdated {
    pub feed_type:  u8,
    pub old_price:  u64,
    pub new_price:  u64,
    pub confidence: u64,
    pub new_twap:   u64,
    pub source:     String,
    pub timestamp:  i64,
}

#[event]
pub struct FallbackActivated {
    pub feed_type:  u8,
    pub reason:     String,
    pub pyth_price: u64,
    pub timestamp:  i64,
}

#[event]
pub struct CircuitBreakerTriggered {
    pub feed_type:     u8,
    pub six_price:     u64,
    pub pyth_price:    u64,
    pub deviation_bps: u64,
    pub timestamp:     i64,
}

#[event]
pub struct CircuitBreakerReset {
    pub feed_type: u8,
    pub reset_by:  Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct FeedInitialized {
    pub feed_type: u8,
    pub relay:     Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct OracleRegistryInitialized {
    pub authority: Pubkey,
    pub timestamp: i64,
}
