use anchor_lang::prelude::*;

#[event]
pub struct CredentialIssued {
    pub wallet:          Pubkey,
    pub compliance_tier: u8,
    pub kyc_valid_until: i64,
    pub identity_hash:   [u8; 32],
    pub timestamp:       i64,
}

#[event]
pub struct CredentialRevoked {
    pub wallet:     Pubkey,
    pub reason:     String,
    pub revoked_by: Pubkey,
    pub timestamp:  i64,
}

#[event]
pub struct WalletFrozen {
    pub wallet:     Pubkey,
    pub reason:     String,
    pub frozen_by:  Pubkey,
    pub timestamp:  i64,
}

#[event]
pub struct WalletUnfrozen {
    pub wallet:      Pubkey,
    pub unfrozen_by: Pubkey,
    pub timestamp:   i64,
}

#[event]
pub struct CreditScoreIssued {
    pub wallet:              Pubkey,
    pub credit_score:        u16,
    pub income_band:         u8,
    pub payment_reliability: u8,
    pub savings_rate_band:   u8,
    pub months_of_history:   u8,
    pub credit_limit_kesh:   u64,
    pub timestamp:           i64,
}

#[event]
pub struct TierUpgraded {
    pub wallet:    Pubkey,
    pub old_tier:  u8,
    pub new_tier:  u8,
    pub timestamp: i64,
}

#[event]
pub struct RegistryInitialized {
    pub authority: Pubkey,
    pub timestamp: i64,
}
