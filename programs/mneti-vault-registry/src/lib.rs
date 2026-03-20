// ─────────────────────────────────────────────────────────────
//  MNETI VAULT REGISTRY — lib.rs
//  Master registry for all vault types in the MNETI protocol
//
//  Vault types supported:
//  0 = Individual  — any Kenyan with M-Pesa
//  1 = Chama       — group savings (up to 50 members)
//  2 = SME         — business treasury (requires tier 1 KYC)
//  3 = Enterprise  — institutional (requires tier 2 KYC)
//  4 = NGO         — conditional grant disbursement
//
//  Vault statuses:
//  0 = PendingKyc  — awaiting KYC verification
//  1 = Active      — fully operational
//  2 = Suspended   — temporarily frozen by compliance
//  3 = Closed      — permanently deregistered
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

// KESH program ID — for cross-program WalletState reads
// Replace with real ID after: anchor keys sync
pub const KESH_PROGRAM_ID: Pubkey = pubkey!("7mRxU93YaGs9QaEhA2tXTpep4TCQ95LD7rDz5E4567of");

declare_id!("C8nAsftZ6RwaRsHu4TBZTgXvHMixTvzz1rLJzqsn5euF");

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

    /// Initialize the vault registry — call once at deployment
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    /// Register a new vault in the master registry
    /// vault_type_disc: 0=Individual, 1=Chama, 2=SME, 3=Enterprise, 4=NGO
    pub fn register_vault(
        ctx: Context<RegisterVault>,
        params: RegisterVaultParams,
    ) -> Result<()> {
        instructions::register_vault(ctx, params)
    }

    /// Update vault status (suspend, reactivate, close)
    /// new_status_disc: 0=PendingKyc, 1=Active, 2=Suspended, 3=Closed
    pub fn update_vault_status(
        ctx: Context<UpdateVaultStatus>,
        new_status_disc: u8,
        reason: String,
    ) -> Result<()> {
        instructions::update_vault_status(ctx, new_status_disc, reason)
    }

    /// Permanently deregister a vault (balance must be zero)
    pub fn deregister_vault(ctx: Context<DeregisterVault>) -> Result<()> {
        instructions::deregister_vault(ctx)
    }
}
