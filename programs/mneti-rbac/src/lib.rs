// ─────────────────────────────────────────────────────────────
//  MNETI RBAC — lib.rs
//  Role-Based Access Control program
//  Defines and enforces all protocol roles across MNETI
//
//  Roles defined:
//  0 = SuperAdmin         — full system control
//  1 = ComplianceOfficer  — freeze wallets, revoke credentials
//  2 = OracleOperator     — submit price updates
//  3 = BridgeOperator     — mint/burn KESH (M-Pesa backend)
//  4 = Auditor            — read-only regulatory access
//  5 = Custodian          — manage collateral
//  6 = SmeOwner           — manage SME vault
//  7 = ChamaMember        — participate in group savings
//  8 = NgoDisbursement    — trigger conditional grants
//  9 = Individual         — basic user
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

// Program ID placeholder — replaced by: anchor keys sync
declare_id!("33qcPinr2tuap9Yfj9xK8rmosps28wDUzVwntr3bhFEg");

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod mneti_rbac {
    use super::*;

    /// Initialize role registry and grant SuperAdmin to deployer
    /// Call this first — before any other MNETI program
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    /// Grant a role to a wallet (SuperAdmin or ComplianceOfficer only)
    /// role_disc: 1–9 (cannot grant SuperAdmin=0 through this)
    /// expires_at: optional Unix timestamp for time-limited roles
    pub fn grant_role(
        ctx: Context<GrantRole>,
        role_disc: u8,
        expires_at: Option<i64>,
    ) -> Result<()> {
        instructions::grant_role(ctx, role_disc, expires_at)
    }

    /// Revoke a role from a wallet (SuperAdmin or ComplianceOfficer only)
    /// reason: human-readable explanation for audit trail
    pub fn revoke_role(
        ctx: Context<RevokeRole>,
        reason: String,
    ) -> Result<()> {
        instructions::revoke_role(ctx, reason)
    }

    /// Transfer SuperAdmin to a new wallet (current SuperAdmin only)
    /// This deactivates the current SuperAdmin assignment and creates a new one
    pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
        instructions::transfer_admin(ctx)
    }
}
