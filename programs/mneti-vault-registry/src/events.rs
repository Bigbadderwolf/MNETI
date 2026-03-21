use anchor_lang::prelude::*;

#[event]
pub struct VaultRegistered {
    pub vault_id:   Pubkey,
    pub owner:      Pubkey,
    pub vault_type: u8,
    pub vault_name: String,
    pub timestamp:  i64,
}

#[event]
pub struct VaultStatusUpdated {
    pub vault_id:   Pubkey,
    pub old_status: u8,
    pub new_status: u8,
    pub updated_by: Pubkey,
    pub reason:     String,
    pub timestamp:  i64,
}

#[event]
pub struct VaultDeregistered {
    pub vault_id:   Pubkey,
    pub owner:      Pubkey,
    pub closed_by:  Pubkey,
    pub timestamp:  i64,
}

#[event]
pub struct RegistryInitialized {
    pub authority:  Pubkey,
    pub timestamp:  i64,
}
