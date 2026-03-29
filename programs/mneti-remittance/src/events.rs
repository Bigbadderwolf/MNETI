// ═══════════════════════════════════════════════════════════════════════════════
// mneti-remittance — events.rs
// All on-chain events emitted by the Remittance Corridor program.
// Indexed by the backend relay to trigger M-Pesa B2C payouts and
// update the compliance dashboard.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

// ─── Registry / Setup Events ──────────────────────────────────────────────────

#[event]
pub struct RemittanceRegistryInitialized {
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct CorridorInitialized {
    pub corridor:    Pubkey,
    pub corridor_id: u8,
    pub name:        String,
    pub timestamp:   i64,
}

#[event]
pub struct CorridorStatusChanged {
    pub corridor:    Pubkey,
    pub corridor_id: u8,
    pub is_active:   bool,
    pub authority:   Pubkey,
    pub timestamp:   i64,
}

// ─── Order Lifecycle Events ───────────────────────────────────────────────────

/// Emitted when a sender creates an order and escrows USDC
#[event]
pub struct RemittanceOrderCreated {
    /// PDA of the RemittanceOrder account
    pub order:                Pubkey,
    pub sender:               Pubkey,
    pub corridor_id:          u8,
    pub source_amount_usdc:   u64,
    /// Estimated destination amount before FX lock (informational)
    pub estimated_kesh:       u64,
    pub recipient_phone:      String,
    /// True when amount >= TRAVEL_RULE_THRESHOLD_KESH
    pub travel_rule_required: bool,
    pub timestamp:            i64,
}

/// Emitted when the FX rate is locked and the swap amount is fixed
#[event]
pub struct RemittanceRateLocked {
    pub order:             Pubkey,
    pub fx_rate_scaled:    u64,
    pub dest_amount_kesh:  u64,
    pub fee_usdc:          u64,
    pub timestamp:         i64,
}

/// Emitted when KESH is minted to the beneficiary Solana wallet
#[event]
pub struct RemittanceKeshMinted {
    pub order:              Pubkey,
    pub sender:             Pubkey,
    pub beneficiary_wallet: Pubkey,
    pub amount_kesh:        u64,
    pub timestamp:          i64,
}

/// Emitted to trigger the off-chain M-Pesa B2C payout relay
/// The backend listens for this event and calls Safaricom Daraja B2C
#[event]
pub struct RemittanceMpesaPayoutTriggered {
    pub order:            Pubkey,
    pub sender:           Pubkey,
    pub recipient_phone:  String,
    pub recipient_name:   String,
    /// Amount in KES (KESH units ÷ 100 = KES)
    pub amount_kes:       u64,
    /// Unique ref passed to Daraja for matching the callback
    pub daraja_ref:       String,
    pub timestamp:        i64,
}

/// Emitted after off-chain relay confirms M-Pesa receipt
#[event]
pub struct RemittanceMpesaConfirmed {
    pub order:          Pubkey,
    pub mpesa_receipt:  String,
    pub timestamp:      i64,
}

/// Emitted when an order is fully completed (KESH minted + payout confirmed)
#[event]
pub struct RemittanceOrderCompleted {
    pub order:              Pubkey,
    pub sender:             Pubkey,
    pub corridor_id:        u8,
    pub source_amount_usdc: u64,
    pub dest_amount_kesh:   u64,
    pub fee_usdc:           u64,
    pub fx_rate_scaled:     u64,
    pub travel_rule_ref:    Option<String>,
    pub timestamp:          i64,
}

/// Emitted when a sender cancels a pending order (before execution)
#[event]
pub struct RemittanceOrderCancelled {
    pub order:            Pubkey,
    pub sender:           Pubkey,
    pub refund_usdc:      u64,
    pub cancel_reason:    String,
    pub timestamp:        i64,
}
