use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ProtocolState {
    pub authority:               Pubkey,
    pub kesh_mint:               Pubkey,
    pub fee_collector:           Pubkey,
    pub kes_usd_rate:            u64,
    pub tbill_yield_bps:         u16,
    pub total_kesh_supply:       u64,
    pub total_kes_collateral:    u64,
    pub last_oracle_update:      i64,
    pub last_yield_distribution: i64,
    pub is_paused:               bool,
    pub fee_bps:                 u16,
    pub total_fees_collected:    u64,
    pub bump:                    u8,
}

impl ProtocolState {
    pub const LEN: usize = 8
        + 32 + 32 + 32
        + 8 + 2 + 8 + 8 + 8 + 8
        + 1 + 2 + 8 + 1;
}

#[account]
#[derive(Default)]
pub struct WalletState {
    pub wallet:                  Pubkey,
    pub compliance_tier:         u8,
    pub is_kyc_verified:         bool,
    pub kyc_valid_until:         i64,
    pub is_frozen:               bool,
    pub daily_volume_usd_cents:  u64,
    pub last_volume_reset:       i64,
    pub lifetime_kesh_received:  u64,
    pub lifetime_kesh_sent:      u64,
    pub first_tx_at:             i64,
    pub last_tx_at:              i64,
    pub bump:                    u8,
}

impl WalletState {
    pub const LEN: usize = 8
        + 32 + 1 + 1 + 8 + 1
        + 8 + 8 + 8 + 8 + 8 + 8 + 1;

    pub fn reset_daily_volume_if_needed(&mut self, now: i64) {
        if now - self.last_volume_reset >= crate::constants::SECONDS_IN_DAY {
            self.daily_volume_usd_cents = 0;
            self.last_volume_reset      = now;
        }
    }

    pub fn daily_limit_usd_cents(&self) -> u64 {
        match self.compliance_tier {
            0 => crate::constants::TIER0_DAILY_LIMIT_USD_CENTS,
            1 => crate::constants::TIER1_DAILY_LIMIT_USD_CENTS,
            2 => crate::constants::TIER2_DAILY_LIMIT_USD_CENTS,
            _ => crate::constants::TIER0_DAILY_LIMIT_USD_CENTS,
        }
    }
}

#[account]
pub struct BridgeDeposit {
    pub mpesa_ref:    String,
    pub wallet:       Pubkey,
    pub kes_amount:   u64,
    pub kesh_minted:  u64,
    pub fee_charged:  u64,
    pub rate_at_mint: u64,
    pub operator:     Pubkey,
    pub created_at:   i64,
    pub bump:         u8,
}

impl BridgeDeposit {
    pub const LEN: usize = 8
        + (4 + 20) + 32
        + 8 + 8 + 8 + 8
        + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub fee_bps:                 u16,
    pub fee_collector:           Pubkey,
    pub initial_kes_usd_rate:    u64,
    pub initial_tbill_yield_bps: u16,
}
