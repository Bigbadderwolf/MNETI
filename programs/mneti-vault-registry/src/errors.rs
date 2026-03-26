use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Vault already exists for this owner and type")]
    VaultAlreadyExists,
    #[msg("Vault not found")]
    VaultNotFound,
    #[msg("Vault is not active")]
    VaultNotActive,
    #[msg("Vault is already closed")]
    VaultAlreadyClosed,
    #[msg("Invalid vault type")]
    InvalidVaultType,
    #[msg("Invalid parameter")]
    InvalidParameter,
}
