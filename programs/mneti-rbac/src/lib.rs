use anchor_lang::prelude::*;

declare_id!("6YxDrhp2pwSTmPWdPuCobwTvtrB3YuivKRdc1A7ypFLB");

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod mneti_rbac {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    pub fn grant_role(ctx: Context<GrantRole>, role_disc: u8, expires_at: Option<i64>) -> Result<()> {
        instructions::grant_role(ctx, role_disc, expires_at)
    }

    pub fn revoke_role(ctx: Context<RevokeRole>, reason: String) -> Result<()> {
        instructions::revoke_role(ctx, reason)
    }

    pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
        instructions::transfer_admin(ctx)
    }
}
