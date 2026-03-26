// ═══════════════════════════════════════════════════════════════════════════════
// mneti-payments — utils.rs
// Shared utility functions: arithmetic guards, fee calculation,
// oracle feed parsing, travel rule threshold check.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::PaymentError;

// ─── Arithmetic Helpers ───────────────────────────────────────────────────────

pub fn safe_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or_else(|| error!(PaymentError::MathOverflow))
}

pub fn safe_sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or_else(|| error!(PaymentError::MathOverflow))
}

pub fn safe_mul(a: u64, b: u64) -> Result<u64> {
    a.checked_mul(b).ok_or_else(|| error!(PaymentError::MathOverflow))
}

// ─── Fee Calculation ──────────────────────────────────────────────────────────

/// Returns (net_amount, fee_amount).
/// fee = gross * fee_bps / 10_000
/// net = gross - fee
pub fn deduct_fee(gross: u64, fee_bps: u64) -> Result<(u64, u64)> {
    let fee = safe_mul(gross, fee_bps)?
        .checked_div(10_000)
        .ok_or_else(|| error!(PaymentError::MathOverflow))?;
    let net = safe_sub(gross, fee)?;
    Ok((net, fee))
}

// ─── Amount Validation ────────────────────────────────────────────────────────

pub fn require_min_amount(amount: u64) -> Result<()> {
    require!(amount >= MIN_PAYMENT_AMOUNT, PaymentError::BelowMinimumAmount);
    Ok(())
}

// ─── Travel Rule Gate ─────────────────────────────────────────────────────────

/// Returns true when a payment amount crosses the FATF Travel Rule threshold.
/// At that point the calling instruction MUST check that travel_rule_ref is Some.
pub fn requires_travel_rule(amount_kesh: u64) -> bool {
    amount_kesh >= TRAVEL_RULE_THRESHOLD_KESH
}

// ─── Oracle Feed Parser ───────────────────────────────────────────────────────
/// Parses a raw mneti-oracle PriceFeed account to extract the best available price.
///
/// PriceFeed on-chain layout (matches programs/mneti-oracle/src/state.rs):
///   [0  .. 8 ]  Anchor discriminator (8 bytes)
///   [8  .. 16]  last_update_ts  (i64 little-endian)
///   [16 .. 24]  six_price       (u64 little-endian)  — SIX Financial primary
///   [24 .. 32]  pyth_price      (u64 little-endian)  — Pyth Network fallback
///   [32]        circuit_breaker_active  (bool, 1 byte)
///
/// Returns the best available price:
///   - six_price if > 0
///   - pyth_price if six_price == 0 and pyth_price > 0
///   - Error if both are 0 or data is stale / circuit broken
pub fn parse_oracle_price(data: &[u8], now: i64) -> Result<u64> {
    require!(
        data.len() >= 33,
        PaymentError::StaleOraclePrice
    );

    // Read last_update_ts
    let last_ts = i64::from_le_bytes(
        data[8..16]
            .try_into()
            .map_err(|_| error!(PaymentError::StaleOraclePrice))?,
    );
    let age = now.saturating_sub(last_ts);
    require!(age <= MAX_ORACLE_AGE_SECS, PaymentError::StaleOraclePrice);

    // Check circuit breaker flag
    let circuit_breaker = data[32] != 0;
    require!(!circuit_breaker, PaymentError::OracleCircuitBreaker);

    // Read prices
    let six_price = u64::from_le_bytes(
        data[16..24]
            .try_into()
            .map_err(|_| error!(PaymentError::StaleOraclePrice))?,
    );
    let pyth_price = u64::from_le_bytes(
        data[24..32]
            .try_into()
            .map_err(|_| error!(PaymentError::StaleOraclePrice))?,
    );

    let price = if six_price > 0 { six_price } else { pyth_price };
    require!(price > 0, PaymentError::StaleOraclePrice);
    Ok(price)
}
