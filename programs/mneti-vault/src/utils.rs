use anchor_lang::prelude::*;
use crate::errors::VaultError;
use crate::constants::*;

/// Apply fee to a yield amount — returns (net_yield, fee_amount)
pub fn apply_yield_fee(gross_yield: u64) -> Result<(u64, u64)> {
    let fee = gross_yield
        .checked_mul(YIELD_HARVEST_FEE_BPS)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(VaultError::MathOverflow)?;
    let net = gross_yield.checked_sub(fee).ok_or(VaultError::MathOverflow)?;
    Ok((net, fee))
}

/// Validate that the oracle price account is fresh enough for vault ops
/// The oracle PriceFeed account layout mirrors mneti-oracle state.rs:
///   offset 0:  8  bytes discriminator
///   offset 8:  8  bytes last_update_ts (i64, slot-based clock)
///   offset 16: 8  bytes six_price (u64)   — we use feed 1 (T-bill yield bps)
///   offset 24: 8  bytes pyth_price (u64)
///   offset 32: 1  byte  circuit_breaker_active (bool)
pub fn parse_oracle_feed(
    data: &[u8],
    now: i64,
) -> Result<u64> {
    // Minimum size check: discriminator(8) + last_update_ts(8) + six_price(8) + pyth_price(8) + circuit_breaker(1)
    require!(data.len() >= 33, VaultError::StaleYieldOracle);

    let last_update_ts = i64::from_le_bytes(
        data[8..16].try_into().map_err(|_| VaultError::StaleYieldOracle)?
    );
    let age = now.saturating_sub(last_update_ts);
    require!(age <= MAX_ORACLE_AGE_SECONDS, VaultError::StaleYieldOracle);

    let circuit_breaker_active = data[32] != 0;
    require!(!circuit_breaker_active, VaultError::OracleCircuitBreaker);

    // Read best available price: prefer six_price, fall back to pyth_price
    let six_price = u64::from_le_bytes(
        data[16..24].try_into().map_err(|_| VaultError::StaleYieldOracle)?
    );
    let pyth_price = u64::from_le_bytes(
        data[24..32].try_into().map_err(|_| VaultError::StaleYieldOracle)?
    );

    let yield_bps = if six_price > 0 { six_price } else { pyth_price };
    require!(yield_bps > 0, VaultError::StaleYieldOracle);
    Ok(yield_bps)
}

/// Validate amount is above minimum deposit
pub fn check_min_amount(amount: u64) -> Result<()> {
    require!(amount >= MIN_DEPOSIT_AMOUNT, VaultError::BelowMinimumAmount);
    Ok(())
}

/// Safe addition with overflow guard
pub fn safe_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or_else(|| error!(VaultError::MathOverflow))
}

/// Safe subtraction with underflow guard
pub fn safe_sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or_else(|| error!(VaultError::MathOverflow))
}
