// ═══════════════════════════════════════════════════════════════════════════════
// mneti-remittance — lib.rs
// Program entry point. Deployment order: 9th (after mneti-travel-rule)
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("REM7mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod mneti_remittance {
    use super::*;

    // ── Registry ───────────────────────────────────────────────────────────────
    pub fn initialize_remittance_registry(
        ctx: Context<InitializeRemittanceRegistry>,
    ) -> Result<()> {
        instructions::initialize_remittance_registry(ctx)
    }

    // ── Corridors ──────────────────────────────────────────────────────────────
    pub fn initialize_corridor(
        ctx: Context<InitializeCorridor>,
        params: InitializeCorridorParams,
    ) -> Result<()> {
        instructions::initialize_corridor(ctx, params)
    }

    pub fn activate_corridor(ctx: Context<ToggleCorridor>) -> Result<()> {
        instructions::activate_corridor(ctx)
    }

    pub fn deactivate_corridor(ctx: Context<ToggleCorridor>) -> Result<()> {
        instructions::deactivate_corridor(ctx)
    }

    // ── Order Lifecycle ────────────────────────────────────────────────────────
    pub fn create_remittance_order(
        ctx: Context<CreateRemittanceOrder>,
        params: CreateRemittanceOrderParams,
    ) -> Result<()> {
        instructions::create_remittance_order(ctx, params)
    }

    pub fn execute_remittance_order(
        ctx: Context<ExecuteRemittanceOrder>,
        kesh_mint_authority_bump: u8,
    ) -> Result<()> {
        instructions::execute_remittance_order(ctx, kesh_mint_authority_bump)
    }

    pub fn cancel_remittance_order(
        ctx: Context<CancelRemittanceOrder>,
        cancel_reason: String,
    ) -> Result<()> {
        instructions::cancel_remittance_order(ctx, cancel_reason)
    }

    pub fn record_mpesa_payout(
        ctx: Context<RecordMpesaPayout>,
        mpesa_receipt: String,
    ) -> Result<()> {
        instructions::record_mpesa_payout(ctx, mpesa_receipt)
    }
}
