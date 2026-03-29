// ═══════════════════════════════════════════════════════════════════════════════
// mneti-remittance — constants.rs
//
// Constants for the Pan-African Remittance Corridor program.
//
// Supported corridors (Phase 7):
//   UK  → Kenya  (GBP source, KESH destination)
//   US  → Kenya  (USD source, KESH destination)
//   UAE → Kenya  (AED source, KESH destination)
//   KE  → KE     (KESH domestic, zero FX — still uses this program for compliance)
//
// Token flow:
//   1. Sender deposits USDC (or corridor stablecoin) into a remittance order escrow
//   2. Protocol reads SIX Financial FX rate (via mneti-oracle) to price the swap
//   3. Protocol mints equivalent KESH to beneficiary (or queues M-Pesa B2C payout)
//   4. 0.30% flat fee collected from the USDC side
//   5. If amount >= Travel Rule threshold, a TR payload reference is required
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PDA Seeds ────────────────────────────────────────────────────────────────
pub const REMITTANCE_REGISTRY_SEED: &[u8] = b"remittance_registry";
pub const CORRIDOR_SEED:            &[u8] = b"corridor";
pub const REMITTANCE_ORDER_SEED:    &[u8] = b"remittance_order";
pub const ORDER_ESCROW_SEED:        &[u8] = b"order_escrow";
pub const LIQUIDITY_POOL_SEED:      &[u8] = b"liquidity_pool";

// ─── Corridor Identifiers ─────────────────────────────────────────────────────
/// ISO 4217 currency codes used as corridor discriminants
pub const CORRIDOR_UK_GBP:  u8 = 0;   // GBP → KES
pub const CORRIDOR_US_USD:  u8 = 1;   // USD → KES
pub const CORRIDOR_UAE_AED: u8 = 2;   // AED → KES
pub const CORRIDOR_KE_KES:  u8 = 3;   // KES → KES (domestic)
pub const CORRIDOR_EU_EUR:  u8 = 4;   // EUR → KES (Phase 8 extension slot)

// ─── Order Status ─────────────────────────────────────────────────────────────
pub const ORDER_STATUS_PENDING:    u8 = 0;  // created, funds escrowed, awaiting execution
pub const ORDER_STATUS_PROCESSING: u8 = 1;  // FX rate locked, swap in progress
pub const ORDER_STATUS_COMPLETED:  u8 = 2;  // KESH minted / M-Pesa payout queued
pub const ORDER_STATUS_CANCELLED:  u8 = 3;  // refunded to sender
pub const ORDER_STATUS_FAILED:     u8 = 4;  // execution failed — funds returnable

// ─── Fee Structure ────────────────────────────────────────────────────────────
/// 0.30% flat fee on the source amount (30 bps)
pub const REMITTANCE_FEE_BPS: u64 = 30;

/// Minimum remittance: USD 5 equivalent
/// At KES/USD = 130 → KES 650 → 65_000 KESH units
pub const MIN_REMITTANCE_KESH: u64 = 65_000;

/// Maximum single remittance: USD 50,000 equivalent
/// At KES/USD = 130 → KES 6,500,000 → 650_000_000 KESH units
pub const MAX_REMITTANCE_KESH: u64 = 650_000_000;

// ─── FATF Travel Rule Threshold ───────────────────────────────────────────────
/// USD 1,000 equivalent → KES 130,000 → 13_000_000 KESH units (2 decimals)
/// Must match mneti-travel-rule constants.rs
pub const TRAVEL_RULE_THRESHOLD_KESH: u64 = 13_000_000;

// ─── Oracle Integration ───────────────────────────────────────────────────────
/// Max age of FX rate oracle data before rejecting it
pub const MAX_ORACLE_AGE_SECS: i64 = 120;
/// mneti-oracle feed 0 = KES/USD price (used for all corridors via cross-rate)
pub const KES_USD_FEED_INDEX: u8 = 0;
/// mneti-oracle feed 2 = XAU/USD (not used in Phase 7 — reserved)
pub const XAU_USD_FEED_INDEX: u8 = 2;

/// Oracle price scale factor: SIX Financial reports KES/USD × 1_000_000
/// e.g. KES/USD = 130.50 → oracle value = 130_500_000
pub const ORACLE_PRICE_SCALE: u64 = 1_000_000;

// ─── String Length Limits ─────────────────────────────────────────────────────
pub const MAX_CORRIDOR_NAME:    usize = 32;   // e.g. "UK → Kenya (GBP/KES)"
pub const MAX_SENDER_NAME:      usize = 64;   // KYC verified sender name
pub const MAX_RECIPIENT_NAME:   usize = 64;   // beneficiary full name
pub const MAX_RECIPIENT_PHONE:  usize = 16;   // M-Pesa phone (2547XXXXXXXX)
pub const MAX_MEMO:             usize = 128;  // optional message to recipient
pub const MAX_TR_REF:           usize = 64;   // Travel Rule IPFS CID reference
pub const MAX_MPESA_REF:        usize = 32;   // Safaricom M-Pesa receipt number

// ─── Liquidity Pool ───────────────────────────────────────────────────────────
/// Target liquidity utilisation before rebalance is triggered (80%)
pub const POOL_REBALANCE_THRESHOLD_BPS: u64 = 8_000;

// ─── Account Space (bytes) ────────────────────────────────────────────────────

pub const SZ_REMITTANCE_REGISTRY: usize = 8
    + 32   // authority
    + 8    // total_orders
    + 8    // total_completed
    + 8    // total_volume_usdc    (USDC units, 6 decimals)
    + 8    // total_volume_kesh    (KESH units, 2 decimals)
    + 8    // total_fees_collected (USDC units)
    + 8    // created_at
    + 32;  // reserved

pub const SZ_CORRIDOR: usize = 8
    + 1                            // corridor_id
    + (4 + MAX_CORRIDOR_NAME)      // name
    + 1                            // is_active
    + 8                            // min_amount_kesh
    + 8                            // max_amount_kesh
    + 8                            // total_volume_kesh
    + 8                            // total_orders
    + 8                            // created_at
    + 32;                          // reserved

pub const SZ_REMITTANCE_ORDER: usize = 8
    + 32                           // sender (wallet)
    + 32                           // beneficiary_wallet (Solana — may be zero if M-Pesa only)
    + (4 + MAX_SENDER_NAME)        // sender_name   (KYC verified — stored for audit)
    + (4 + MAX_RECIPIENT_NAME)     // recipient_name
    + (4 + MAX_RECIPIENT_PHONE)    // recipient_phone (M-Pesa)
    + (4 + MAX_MEMO)               // memo
    + 1                            // corridor_id
    + 8                            // source_amount_usdc   (USDC units, 6 decimals)
    + 8                            // dest_amount_kesh     (KESH units, 2 decimals)
    + 8                            // fee_usdc
    + 8                            // fx_rate_scaled       (KES per USD × ORACLE_PRICE_SCALE)
    + 1                            // status
    + 8                            // created_at
    + 8                            // executed_at
    + (4 + MAX_TR_REF)             // travel_rule_ref  (empty if below threshold)
    + (4 + MAX_MPESA_REF)          // mpesa_receipt    (populated after B2C payout)
    + 1                            // mpesa_payout_triggered
    + 32;                          // reserved
