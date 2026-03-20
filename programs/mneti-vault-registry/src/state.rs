// ─────────────────────────────────────────────────────────────
//  MNETI VAULT REGISTRY — state.rs
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

// ── VAULT TYPE ────────────────────────────────────────────────
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VaultType {
    /// Individual savings — any Kenyan with M-Pesa
    Individual  = 0,
    /// Chama group savings — up to 50 members
    Chama       = 1,
    /// SME business treasury — registered business
    Sme         = 2,
    /// Enterprise institution — full KYC tier 2
    Enterprise  = 3,
    /// NGO or government disbursement vault
    Ngo         = 4,
}

impl VaultType {
    pub fn to_discriminant(&self) -> u8 {
        match self {
            VaultType::Individual  => 0,
            VaultType::Chama       => 1,
            VaultType::Sme         => 2,
            VaultType::Enterprise  => 3,
            VaultType::Ngo         => 4,
        }
    }

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

    /// Minimum compliance tier required to open this vault type
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

// ── VAULT STATUS ──────────────────────────────────────────────
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VaultStatus {
    /// Awaiting KYC verification before activation
    PendingKyc   = 0,
    /// Fully active — all operations permitted
    Active       = 1,
    /// Temporarily suspended by compliance officer
    Suspended    = 2,
    /// Permanently closed — no further operations
    Closed       = 3,
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

// ── REGISTRY STATE ────────────────────────────────────────────
/// Single global registry — master list of all vaults
#[account]
#[derive(Default)]
pub struct RegistryState {
    /// Protocol authority (Rafiki multisig)
    pub authority:            Pubkey,
    /// Total vaults ever registered
    pub total_vaults:         u64,
    /// Currently active vaults
    pub active_vaults:        u64,
    /// Breakdown by type
    pub individual_count:     u64,
    pub chama_count:          u64,
    pub sme_count:            u64,
    pub enterprise_count:     u64,
    pub ngo_count:            u64,
    /// Total KESH across all vaults (updated on deposit/withdraw)
    pub total_kesh_tvl:       u64,
    /// Registry initialized timestamp
    pub initialized_at:       i64,
    /// PDA bump
    pub bump:                 u8,
}

impl RegistryState {
    pub const LEN: usize = 8
        + 32   // authority
        + 8    // total_vaults
        + 8    // active_vaults
        + 8    // individual_count
        + 8    // chama_count
        + 8    // sme_count
        + 8    // enterprise_count
        + 8    // ngo_count
        + 8    // total_kesh_tvl
        + 8    // initialized_at
        + 1;   // bump
}

// ── VAULT ENTRY ───────────────────────────────────────────────
/// One entry per registered vault — the master registry record
#[account]
pub struct VaultEntry {
    /// Unique vault identifier (PDA of the vault itself — set in Phase 5)
    pub vault_id:             Pubkey,
    /// Owner wallet
    pub owner:                Pubkey,
    /// Human-readable vault name (e.g. "Mama Mboga Savings")
    pub vault_name:           String,
    /// Vault type
    pub vault_type:           VaultType,
    /// Vault type as u8 for easy PDA derivation
    pub vault_type_disc:      u8,
    /// Vault status
    pub vault_status:         VaultStatus,
    /// Status as u8 for event emission
    pub vault_status_disc:    u8,
    /// Compliance tier of the owner at registration
    pub compliance_tier:      u8,
    /// Current KESH balance (updated by vault programs via CPI)
    pub kesh_balance:         u64,
    /// Total KESH deposited lifetime
    pub total_deposited:      u64,
    /// Total KESH withdrawn lifetime
    pub total_withdrawn:      u64,
    /// Total yield earned lifetime
    pub total_yield_earned:   u64,
    /// Vault registration timestamp
    pub registered_at:        i64,
    /// Last activity timestamp
    pub last_activity_at:     i64,
    /// Status change reason (suspension/closure notes)
    pub status_reason:        String,
    /// PDA bump
    pub bump:                 u8,
}

impl VaultEntry {
    pub const LEN: usize = 8
        + 32          // vault_id
        + 32          // owner
        + 4 + 50      // vault_name (4 len + 50 chars)
        + 2           // vault_type enum
        + 1           // vault_type_disc
        + 2           // vault_status enum
        + 1           // vault_status_disc
        + 1           // compliance_tier
        + 8           // kesh_balance
        + 8           // total_deposited
        + 8           // total_withdrawn
        + 8           // total_yield_earned
        + 8           // registered_at
        + 8           // last_activity_at
        + 4 + 200     // status_reason (4 len + 200 chars)
        + 1;          // bump

    pub fn is_active(&self) -> bool {
        self.vault_status == VaultStatus::Active
    }
}

// ── INSTRUCTION PARAMS ────────────────────────────────────────
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RegisterVaultParams {
    pub vault_name:       String,
    pub vault_type_disc:  u8,
    pub vault_id:         Pubkey,
}
