// ═══════════════════════════════════════════════════════════════════════════════
// mneti-travel-rule — lib.rs
// Program entry point for the FATF Travel Rule compliance program.
// Deployment order: 8th (after mneti-payments)
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("TRL6mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod mneti_travel_rule {
    use super::*;

    // ── Registry ───────────────────────────────────────────────────────────────
    pub fn initialize_vasp_registry(
        ctx: Context<InitializeVaspRegistry>,
    ) -> Result<()> {
        instructions::initialize_vasp_registry(ctx)
    }

    // ── VASP Management ────────────────────────────────────────────────────────
    pub fn register_vasp(
        ctx: Context<RegisterVasp>,
        params: RegisterVaspParams,
    ) -> Result<()> {
        instructions::register_vasp(ctx, params)
    }

    pub fn update_vasp(
        ctx: Context<UpdateVasp>,
        params: UpdateVaspParams,
    ) -> Result<()> {
        instructions::update_vasp(ctx, params)
    }

    pub fn deactivate_vasp(ctx: Context<ToggleVasp>) -> Result<()> {
        instructions::deactivate_vasp(ctx)
    }

    pub fn reactivate_vasp(ctx: Context<ToggleVasp>) -> Result<()> {
        instructions::reactivate_vasp(ctx)
    }

    // ── Payload Lifecycle ──────────────────────────────────────────────────────
    pub fn submit_tr_payload(
        ctx: Context<SubmitTrPayload>,
        transfer_amount_kesh: u64,
        params: SubmitTrPayloadParams,
    ) -> Result<()> {
        instructions::submit_tr_payload(ctx, transfer_amount_kesh, params)
    }

    pub fn acknowledge_tr_payload(
        ctx: Context<AcknowledgeTrPayload>,
    ) -> Result<()> {
        instructions::acknowledge_tr_payload(ctx)
    }

    pub fn reject_tr_payload(
        ctx: Context<RejectTrPayload>,
        rejection_reason: String,
    ) -> Result<()> {
        instructions::reject_tr_payload(ctx, rejection_reason)
    }
}
