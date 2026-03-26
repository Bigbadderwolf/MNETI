use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VaultType {
    Individual  = 0,
    Chama       = 1,
    Sme         = 2,
    Enterprise  = 3,
    Ngo         = 4,
}

impl VaultType {
    pub fn from_discriminant(d: u8) -> Option<Self> {
        match d {
            0 => Some(VaultType::Individual),
            1 => Some(VaultType::Chama),
            2 => Some(VaultType::Sme),
            3 => Some(VaultType::Enterprise),
            4 => Some(VaultType::Ngo),
            _ => None,
        }
    }
    pub fn required_compliance_tier(&self) -> u8 {
        match self {
            VaultType::Individual  => 0,
            VaultType::Chama       => 0,
            VaultType::Sme         => 1,
            VaultType::Enterprise  => 2,
            VaultType::Ngo         => 1,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VaultStatus {
    PendingKyc  = 0,
    Active      = 1,
    Suspended   = 2,
    Closed      = 3,
}

impl VaultStatus {
    pub fn to_discriminant(&self) -> u8 {
        match self {
            VaultStatus::PendingKyc => 0,
            VaultStatus::Active     => 1,
            VaultStatus::Suspended  => 2,
            VaultStatus::Closed     => 3,
        }
    }
}

#[account]
#[derive(Default)]
pub struct RegistryState {
    pub authority:        Pubkey,
    pub total_vaults:     u64,
    pub active_vaults:    u64,
    pub individual_count: u64,
    pub chama_count:      u64,
    pub sme_count:        u64,
    pub enterprise_count: u64,
    pub ngo_count:        u64,
    pub total_kesh_tvl:   u64,
    pub initialized_at:   i64,
    pub bump:             u8,
}

impl RegistryState {
    pub const LEN: usize = 8
        + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1;
}

#[account]
pub struct VaultEntry {
    pub vault_id:          Pubkey,
    pub owner:             Pubkey,
    pub vault_name:        String,
    pub vault_type:        VaultType,
    pub vault_type_disc:   u8,
    pub vault_status:      VaultStatus,
    pub vault_status_disc: u8,
    pub compliance_tier:   u8,
    pub kesh_balance:      u64,
    pub total_deposited:   u64,
    pub total_withdrawn:   u64,
    pub total_yield_earned: u64,
    pub registered_at:     i64,
    pub last_activity_at:  i64,
    pub status_reason:     String,
    pub bump:              u8,
}

impl VaultEntry {
    pub const LEN: usize = 8
        + 32 + 32 + (4 + 50) + 2 + 1 + 2 + 1 + 1
        + 8 + 8 + 8 + 8 + 8 + 8
        + (4 + 200) + 1;

    pub fn is_active(&self) -> bool {
        self.vault_status == VaultStatus::Active
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterVaultParams {
    pub vault_name:      String,
    pub vault_type_disc: u8,
    pub vault_id:        Pubkey,
}
