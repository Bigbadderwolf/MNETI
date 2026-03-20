// ─────────────────────────────────────────────────────────────
//  MNETI RBAC — events.rs
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

#[event]
pub struct RoleGranted {
    pub wallet:      Pubkey,
    pub role:        u8,
    pub granted_by:  Pubkey,
    pub expires_at:  Option<i64>,
    pub timestamp:   i64,
}

#[event]
pub struct RoleRevoked {
    pub wallet:      Pubkey,
    pub role:        u8,
    pub revoked_by:  Pubkey,
    pub reason:      String,
    pub timestamp:   i64,
}

#[event]
pub struct AdminTransferred {
    pub old_admin:   Pubkey,
    pub new_admin:   Pubkey,
    pub timestamp:   i64,
}

#[event]
pub struct RegistryInitialized {
    pub authority:   Pubkey,
    pub timestamp:   i64,
}
