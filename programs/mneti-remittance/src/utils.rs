// ═══════════════════════════════════════════════════════════════════════════════
// mneti-remittance — utils.rs
// Arithmetic helpers, oracle parsing, phone validation, fee calculation.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::RemittanceError;

// ─── Arithmetic Helpers ───────────────────────────────────────────────────────

pub fn safe_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or_else(|| error!(RemittanceError::MathOverflow))
}

pub fn safe_sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or_else(|| error!(RemittanceError::MathOverflow))
}

// ─── Fee Computation ──────────────────────────────────────────────────────────
/// Returns (net_amount, fee_amount).
/// fee = gross × REMITTANCE_FEE_BPS / 10_000
pub fn deduct_remittance_fee(gross_usdc: u64) -> Result<(u64, u64)> {
    let fee = (gross_usdc as u128)
        .checked_mul(REMITTANCE_FEE_BPS as u128)
        .and_then(|v| v.checked_div(10_000))
        .ok_or_else(|| error!(RemittanceError::MathOverflow))? as u64;
    let net = safe_sub(gross_usdc, fee)?;
    Ok((net, fee))
}

// ─── Phone Validation ─────────────────────────────────────────────────────────
/// Validates Safaricom M-Pesa format: 2547XXXXXXXX (12 digits, starts with 2547)
pub fn validate_phone(phone: &str) -> Result<()> {
    require!(
        phone.len() == 12
            && phone.starts_with("2547")
            && phone.chars().all(|c| c.is_ascii_digit()),
        RemittanceError::InvalidPhoneFormat
    );
    Ok(())
}

// ─── Oracle Feed Parser ───────────────────────────────────────────────────────
/// Reads the KES/USD price from a mneti-oracle PriceFeed account.
///
/// PriceFeed layout (matches programs/mneti-oracle/src/state.rs):
///   [0  ..8 ]  Anchor discriminator
///   [8  ..16]  last_update_ts  (i64 LE)
///   [16 ..24]  six_price       (u64 LE)  — SIX Financial primary
///   [24 ..32]  pyth_price      (u64 LE)  — Pyth Network fallback
///   [32]       circuit_breaker_active (bool)
///
/// Returns the best available price (six_price if > 0, else pyth_price).
/// Price unit: KES per USD × ORACLE_PRICE_SCALE (1_000_000)
pub fn read_kes_usd_oracle(data: &[u8], now: i64) -> Result<u64> {
    require!(data.len() >= 33, RemittanceError::StaleOraclePrice);

    let last_ts = i64::from_le_bytes(
        data[8..16].try_into().map_err(|_| error!(RemittanceError::StaleOraclePrice))?
    );
    require!(
        now.saturating_sub(last_ts) <= MAX_ORACLE_AGE_SECS,
        RemittanceError::StaleOraclePrice
    );

    let circuit_breaker = data[32] != 0;
    require!(!circuit_breaker, RemittanceError::OracleCircuitBreaker);

    let six_price = u64::from_le_bytes(
        data[16..24].try_into().map_err(|_| error!(RemittanceError::StaleOraclePrice))?
    );
    let pyth_price = u64::from_le_bytes(
        data[24..32].try_into().map_err(|_| error!(RemittanceError::StaleOraclePrice))?
    );

    let price = if six_price > 0 { six_price } else { pyth_price };
    require!(price > 0, RemittanceError::StaleOraclePrice);
    Ok(price)
}

// ─── Travel Rule Gate ─────────────────────────────────────────────────────────
pub fn requires_travel_rule(dest_kesh: u64) -> bool {
    dest_kesh >= TRAVEL_RULE_THRESHOLD_KESH
}

// ─── Daraja Reference Generator ───────────────────────────────────────────────
/// Generates a unique reference for the M-Pesa B2C call.
/// Format: "MNETI-<order_nonce>-<timestamp_secs>"
pub fn make_daraja_ref(nonce: u64, ts: i64) -> String {
    // Anchor programs cannot use format! with dynamic allocation cheaply,
    // so we build a fixed-width reference manually.
    // Max output: "MNETI-" (6) + 20 digits + "-" + 10 digits = 37 chars, fits MAX_MPESA_REF
    let mut buf = [b'0'; 37];
    let prefix = b"MNETI-";
    buf[..6].copy_from_slice(prefix);
    // Write nonce digits (right-justified in 10 chars)
    let mut n = nonce;
    for i in (6..16).rev() {
        buf[i] = b'0' + (n % 10) as u8;
        n /= 10;
    }
    buf[16] = b'-';
    // Write timestamp digits
    let mut t = ts.unsigned_abs();
    for i in (17..27).rev() {
        buf[i] = b'0' + (t % 10) as u8;
        t /= 10;
    }
    String::from_utf8_lossy(&buf[..27]).into_owned()
}
