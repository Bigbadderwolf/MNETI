use anchor_lang::prelude::*;
use crate::constants::TWAP_BUFFER_SIZE;

#[account]
#[derive(Default)]
pub struct OracleRegistry {
    pub authority:       Pubkey,
    pub relay_operator:  Pubkey,
    pub total_feeds:     u8,
    pub is_paused:       bool,
    pub initialized_at:  i64,
    pub bump:            u8,
}

impl OracleRegistry {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 1 + 8 + 1;
}

#[account]
pub struct PriceFeed {
    pub feed_type:              u8,
    pub six_price:              u64,
    pub six_confidence:         u64,
    pub six_last_update:        i64,
    pub six_update_count:       u64,
    pub pyth_price:             u64,
    pub pyth_confidence:        u64,
    pub pyth_last_update:       i64,
    pub pyth_is_active_source:  bool,
    pub twap_buffer:            [u64; 10],
    pub twap_index:             u8,
    pub twap:                   u64,
    pub circuit_breaker_active: bool,
    pub last_deviation_bps:     u64,
    pub circuit_breaker_at:     i64,
    pub initialized_at:         i64,
    pub bump:                   u8,
}

impl PriceFeed {
    pub const LEN: usize = 8
        + 1 + 8 + 8 + 8 + 8
        + 8 + 8 + 8 + 1
        + (8 * 10) + 1 + 8
        + 1 + 8 + 8 + 8 + 1;

    pub fn update_twap(&mut self, new_price: u64) {
        let idx = (self.twap_index as usize) % TWAP_BUFFER_SIZE;
        self.twap_buffer[idx] = new_price;
        self.twap_index = self.twap_index.wrapping_add(1);
        let mut sum: u128 = 0;
        let mut count: u64 = 0;
        for &p in self.twap_buffer.iter() {
            if p > 0 { sum += p as u128; count += 1; }
        }
        if count > 0 { self.twap = (sum / count as u128) as u64; }
    }

    pub fn get_best_price(&self, now: i64) -> (u64, bool) {
        let six_fresh  = now - self.six_last_update  <= crate::constants::MAX_PRICE_AGE_SECONDS;
        let pyth_fresh = now - self.pyth_last_update <= crate::constants::MAX_PRICE_AGE_SECONDS;
        if six_fresh && !self.circuit_breaker_active { (self.six_price, false) }
        else if pyth_fresh                           { (self.pyth_price, true) }
        else if self.twap > 0                        { (self.twap, true) }
        else                                         { (0, true) }
    }

    pub fn deviation_bps(&self) -> u64 {
        if self.six_price == 0 || self.pyth_price == 0 { return 0; }
        let diff = if self.six_price > self.pyth_price
            { self.six_price - self.pyth_price } else { self.pyth_price - self.six_price };
        diff.saturating_mul(crate::constants::BPS_DENOMINATOR)
            .saturating_div(self.six_price)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitRegistryParams { pub relay_operator: Pubkey }

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SubmitPriceParams {
    pub price:      u64,
    pub confidence: u64,
    pub timestamp:  i64,
}
