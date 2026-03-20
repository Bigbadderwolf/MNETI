// ─────────────────────────────────────────────────────────────
//  MNETI VAULT REGISTRY — errors.rs
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("Unauthorized — caller does not have required role")]
    Unauthorized,

    #[msg("Vault already registered for this owner and type")]
    VaultAlreadyExists,

    #[msg("Vault not found in registry")]
    VaultNotFound,

    #[msg("Vault is not active — cannot perform this operation")]
    VaultNotActive,

    #[msg("Vault is already closed — cannot reopen")]
    VaultAlreadyClosed,

    #[msg("Invalid vault type discriminant")]
    InvalidVaultType,

    #[msg("Wallet has insufficient compliance tier for this vault type")]
    InsufficientComplianceTier,

    #[msg("Registry is not initialized")]
    NotInitialized,

    #[msg("Invalid parameter provided")]
    InvalidParameter,
}
