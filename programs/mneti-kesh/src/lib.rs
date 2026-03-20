// ─────────────────────────────────────────────────────────────
//  MNETI KESH — lib.rs
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

declare_id!("7mRxU93YaGs9QaEhA2tXTpep4TCQ95LD7rDz5E4567of");

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

    /// Initialize KESH protocol and create the SPL token mint
    pub fn initialize(
        ctx: Context<Initialize>,
        params: InitializeParams,
    ) -> Result<()> {
        instructions::initialize(ctx, params)
    }

    /// Create per-wallet state account on first deposit
    pub fn init_wallet_state(ctx: Context<InitWalletState>) -> Result<()> {
        instructions::init_wallet_state(ctx)
    }

    /// Mint KESH after confirmed M-Pesa deposit (bridge operator only)
    pub fn mint_kesh(
        ctx: Context<MintKesh>,
        kes_amount: u64,
        mpesa_ref: String,
    ) -> Result<()> {
        instructions::mint_kesh(ctx, kes_amount, mpesa_ref)
    }

    /// Burn KESH — triggers M-Pesa B2C payout via backend event listener
    pub fn burn_kesh(
        ctx: Context<BurnKesh>,
        kesh_amount: u64,
    ) -> Result<()> {
        instructions::burn_kesh(ctx, kesh_amount)
    }

    /// Update KES/USD peg rate and T-bill yield from SIX Financial oracle
    pub fn update_peg(
        ctx: Context<UpdatePeg>,
        new_kes_usd_rate: u64,
        new_tbill_yield_bps: u16,
    ) -> Result<()> {
        instructions::update_peg(ctx, new_kes_usd_rate, new_tbill_yield_bps)
    }

    /// Emergency pause — halts all minting and burning
    pub fn pause(ctx: Context<PauseProtocol>, reason: String) -> Result<()> {
        instructions::pause(ctx, reason)
    }

    /// Resume normal operations after pause
    pub fn unpause(ctx: Context<PauseProtocol>) -> Result<()> {
        instructions::unpause(ctx)
    }
}
