use anchor_lang::prelude::*;

declare_id!("AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR");

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::InitializeParams;

#[program]
pub mod mneti_kesh {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize(ctx, params)
    }

    pub fn init_wallet_state(ctx: Context<InitWalletState>) -> Result<()> {
        instructions::init_wallet_state(ctx)
    }

    pub fn mint_kesh(ctx: Context<MintKesh>, kes_amount: u64, mpesa_ref: String) -> Result<()> {
        instructions::mint_kesh(ctx, kes_amount, mpesa_ref)
    }

    pub fn burn_kesh(ctx: Context<BurnKesh>, kesh_amount: u64) -> Result<()> {
        instructions::burn_kesh(ctx, kesh_amount)
    }

    pub fn update_peg(ctx: Context<UpdatePeg>, new_kes_usd_rate: u64, new_tbill_yield_bps: u16) -> Result<()> {
        instructions::update_peg(ctx, new_kes_usd_rate, new_tbill_yield_bps)
    }

    pub fn pause(ctx: Context<PauseProtocol>, reason: String) -> Result<()> {
        instructions::pause(ctx, reason)
    }

    pub fn unpause(ctx: Context<PauseProtocol>) -> Result<()> {
        instructions::unpause(ctx)
    }
}
