use anchor_lang::prelude::*;

declare_id!("GirQCGWXDnhLC6KZxEGuFmY38nZMfVWTg7L8QgFU9Yhp");

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::RegisterVaultParams;

#[program]
pub mod mneti_vault_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    pub fn register_vault(ctx: Context<RegisterVault>, params: RegisterVaultParams) -> Result<()> {
        instructions::register_vault(ctx, params)
    }

    pub fn update_vault_status(
        ctx: Context<UpdateVaultStatus>,
        new_status_disc: u8,
        reason: String,
    ) -> Result<()> {
        instructions::update_vault_status(ctx, new_status_disc, reason)
    }

    pub fn deregister_vault(ctx: Context<DeregisterVault>) -> Result<()> {
        instructions::deregister_vault(ctx)
    }
}
