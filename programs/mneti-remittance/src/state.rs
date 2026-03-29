// ═══════════════════════════════════════════════════════════════════════════════
// mneti-remittance — state.rs
// All Anchor account structs for the Remittance Corridor program.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;
use crate::constants::*;

// ─── Remittance Registry (global singleton) ───────────────────────────────────
/// One per deployment. Protocol authority controls corridor activation.
#[account]
pub struct RemittanceRegistry {
    pub authority:              Pubkey,
    /// Monotonically increasing count of all orders ever created
    pub total_orders:           u64,
    pub total_completed:        u64,
    /// Cumulative USDC source volume (6 decimals)
    pub total_volume_usdc:      u64,
    /// Cumulative KESH destination volume (2 decimals)
    pub total_volume_kesh:      u64,
    /// Cumulative protocol fees collected in USDC (6 decimals)
    pub total_fees_collected:   u64,
    pub created_at:             i64,
}

// ─── Corridor Configuration ───────────────────────────────────────────────────
/// One PDA per supported corridor (UK→KE, US→KE, UAE→KE, KE→KE).
/// Seeds: [CORRIDOR_SEED, &[corridor_id]]
#[account]
pub struct Corridor {
    pub corridor_id:        u8,
    /// Human-readable name e.g. "UK → Kenya (GBP/KES)"
    pub name:               String,
    pub is_active:          bool,
    /// Minimum order size in KESH units
    pub min_amount_kesh:    u64,
    /// Maximum order size in KESH units
    pub max_amount_kesh:    u64,
    pub total_volume_kesh:  u64,
    pub total_orders:       u64,
    pub created_at:         i64,
}

impl Corridor {
    pub fn validate_amount(&self, amount_kesh: u64) -> bool {
        amount_kesh >= self.min_amount_kesh && amount_kesh <= self.max_amount_kesh
    }
}

// ─── Remittance Order ─────────────────────────────────────────────────────────
/// Represents one cross-border transfer request.
/// Seeds: [REMITTANCE_ORDER_SEED, sender.key(), &order_nonce.to_le_bytes()]
///
/// Lifecycle:
///   create_order      → status = PENDING    (USDC escrowed)
///   execute_order     → status = PROCESSING → COMPLETED
///                       (FX locked, KESH minted, M-Pesa payout triggered)
///   cancel_order      → status = CANCELLED  (USDC refunded)
///
/// Two settlement paths:
///   Path A — Beneficiary has a Solana wallet: KESH minted directly to wallet
///   Path B — Beneficiary has M-Pesa only: event emitted, off-chain relay sends B2C
///   Both paths can coexist (wallet + M-Pesa payout)
#[account]
pub struct RemittanceOrder {
    /// Sender's Solana wallet — signs the transaction
    pub sender:                  Pubkey,
    /// Beneficiary Solana wallet — receives KESH on Path A
    /// May be Pubkey::default() when beneficiary is M-Pesa only
    pub beneficiary_wallet:      Pubkey,
    /// KYC-verified sender full name — required for FATF audit trail
    pub sender_name:             String,
    /// Beneficiary full legal name — required for Travel Rule
    pub recipient_name:          String,
    /// M-Pesa phone number in 2547XXXXXXXX format
    pub recipient_phone:         String,
    /// Optional message to the recipient (e.g. "School fees — Term 2")
    pub memo:                    String,
    /// Corridor identifier (CORRIDOR_UK_GBP / US_USD / UAE_AED / KE_KES)
    pub corridor_id:             u8,
    /// USDC amount deposited by sender (6 decimals, before fee deduction)
    pub source_amount_usdc:      u64,
    /// Net USDC after fee: source_amount_usdc - fee_usdc
    pub net_source_usdc:         u64,
    /// KESH to be delivered to beneficiary (computed at execution time)
    pub dest_amount_kesh:        u64,
    /// Protocol fee in USDC (source_amount_usdc × REMITTANCE_FEE_BPS / 10_000)
    pub fee_usdc:                u64,
    /// FX rate at execution time (KES per USD × ORACLE_PRICE_SCALE)
    /// e.g. KES/USD = 130.50 → fx_rate_scaled = 130_500_000
    /// 0 until execute_order is called
    pub fx_rate_scaled:          u64,
    pub status:                  u8,
    pub created_at:              i64,
    /// Unix timestamp when execute_order was called (0 until then)
    pub executed_at:             i64,
    /// IPFS CID of ECIES-encrypted IVMS101 payload (empty if below TR threshold)
    pub travel_rule_ref:         String,
    /// Safaricom M-Pesa receipt number (populated by relay after B2C confirmation)
    pub mpesa_receipt:           String,
    /// True after the off-chain relay calls record_mpesa_payout
    pub mpesa_payout_triggered:  bool,
    /// Monotonic nonce used in PDA derivation — allows multiple orders per sender
    pub nonce:                   u64,
}

impl RemittanceOrder {
    pub fn is_pending(&self)   -> bool { self.status == ORDER_STATUS_PENDING }
    pub fn is_completed(&self) -> bool { self.status == ORDER_STATUS_COMPLETED }
    pub fn is_cancelled(&self) -> bool { self.status == ORDER_STATUS_CANCELLED }

    /// Returns true when a Travel Rule payload reference must accompany execution
    pub fn needs_travel_rule(&self) -> bool {
        self.dest_amount_kesh >= TRAVEL_RULE_THRESHOLD_KESH
    }

    /// Compute destination KESH from net USDC and oracle FX rate.
    /// formula: kesh = (net_usdc × fx_rate_scaled) / (ORACLE_PRICE_SCALE × 10_000)
    /// USDC has 6 decimals, KESH has 2 decimals.
    /// net_usdc (6 dec) × rate (KES/USD scaled) → intermediate value
    /// → divide by ORACLE_PRICE_SCALE to get KES with 6 dec
    /// → divide by 10_000 to convert to KES with 2 dec
    pub fn compute_kesh(net_usdc: u64, fx_rate_scaled: u64) -> Option<u64> {
        let intermediate = (net_usdc as u128)
            .checked_mul(fx_rate_scaled as u128)?;
        // ORACLE_PRICE_SCALE = 1_000_000, adjustment factor 6→2 dec = 10_000
        let divisor: u128 = (ORACLE_PRICE_SCALE as u128) * 10_000;
        let kesh = intermediate.checked_div(divisor)?;
        Some(kesh as u64)
    }
}
