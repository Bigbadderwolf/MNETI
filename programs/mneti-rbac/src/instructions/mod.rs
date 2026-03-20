// ─────────────────────────────────────────────────────────────
//  MNETI RBAC — instructions/mod.rs
//  All instructions for role management
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::RbacError;
use crate::events::*;
use crate::state::*;

// ── INSTRUCTION 1: INITIALIZE ────────────────────────────────
/// Called once at deployment — creates the role registry
/// and automatically grants SuperAdmin to the caller
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let registry       = &mut ctx.accounts.role_registry;
    registry.authority = ctx.accounts.authority.key();
    registry.total_assignments = 0;
    registry.bump      = ctx.bumps.role_registry;

    // Auto-grant SuperAdmin to deployer
    let sa             = &mut ctx.accounts.super_admin_assignment;
    sa.wallet          = ctx.accounts.authority.key();
    sa.role            = Role::SuperAdmin;
    sa.role_disc       = ROLE_SUPER_ADMIN;
    sa.granted_by      = ctx.accounts.authority.key();
    sa.granted_at      = Clock::get()?.unix_timestamp;
    sa.expires_at      = None;  // SuperAdmin never expires
    sa.is_active       = true;
    sa.revoke_reason   = String::new();
    sa.bump            = ctx.bumps.super_admin_assignment;

    registry.total_assignments = 1;

    emit!(RegistryInitialized {
        authority: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    emit!(RoleGranted {
        wallet:     ctx.accounts.authority.key(),
        role:       ROLE_SUPER_ADMIN,
        granted_by: ctx.accounts.authority.key(),
        expires_at: None,
        timestamp:  Clock::get()?.unix_timestamp,
    });

    msg!("MNETI RBAC initialized. SuperAdmin: {}", ctx.accounts.authority.key());
    Ok(())
}

// ── INSTRUCTION 2: GRANT ROLE ────────────────────────────────
/// Grant a role to a wallet
/// Only SuperAdmin or ComplianceOfficer can call this
/// SuperAdmin role cannot be granted through this — use transfer_admin
pub fn grant_role(
    ctx: Context<GrantRole>,
    role_disc: u8,
    expires_at: Option<i64>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // Validate role discriminant
    require!(role_disc <= 9, RbacError::InvalidRole);
    require!(role_disc != ROLE_SUPER_ADMIN, RbacError::CannotGrantSuperAdmin);

    // Validate expiry is in the future if provided
    if let Some(expiry) = expires_at {
        require!(expiry > now, RbacError::InvalidExpiry);
    }

    // Verify caller has SuperAdmin or ComplianceOfficer role
    let caller_assignment = &ctx.accounts.caller_role_assignment;
    require!(
        caller_assignment.is_valid(now)
            && (caller_assignment.role_disc == ROLE_SUPER_ADMIN
                || caller_assignment.role_disc == ROLE_COMPLIANCE_OFFICER),
        RbacError::Unauthorized
    );

    let assignment        = &mut ctx.accounts.role_assignment;
    assignment.wallet     = ctx.accounts.target_wallet.key();
    assignment.role       = Role::from_discriminant(role_disc).ok_or(RbacError::InvalidRole)?;
    assignment.role_disc  = role_disc;
    assignment.granted_by = ctx.accounts.caller.key();
    assignment.granted_at = now;
    assignment.expires_at = expires_at;
    assignment.is_active  = true;
    assignment.revoke_reason = String::new();
    assignment.bump       = ctx.bumps.role_assignment;

    let registry = &mut ctx.accounts.role_registry;
    registry.total_assignments = registry.total_assignments
        .checked_add(1).ok_or(RbacError::Unauthorized)?;

    emit!(RoleGranted {
        wallet:     ctx.accounts.target_wallet.key(),
        role:       role_disc,
        granted_by: ctx.accounts.caller.key(),
        expires_at,
        timestamp:  now,
    });

    msg!("Role {} granted to {}", role_disc, ctx.accounts.target_wallet.key());
    Ok(())
}

// ── INSTRUCTION 3: REVOKE ROLE ───────────────────────────────
/// Revoke a role from a wallet
/// Only SuperAdmin or ComplianceOfficer can call this
/// SuperAdmin role cannot be revoked — use transfer_admin
pub fn revoke_role(
    ctx: Context<RevokeRole>,
    reason: String,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // Verify caller authority
    let caller_assignment = &ctx.accounts.caller_role_assignment;
    require!(
        caller_assignment.is_valid(now)
            && (caller_assignment.role_disc == ROLE_SUPER_ADMIN
                || caller_assignment.role_disc == ROLE_COMPLIANCE_OFFICER),
        RbacError::Unauthorized
    );

    let assignment = &mut ctx.accounts.role_assignment;
    require!(
        assignment.role_disc != ROLE_SUPER_ADMIN,
        RbacError::CannotRevokeAdmin
    );
    require!(assignment.is_active, RbacError::RoleInactive);

    assignment.is_active     = false;
    assignment.revoke_reason = reason.clone();

    let registry = &mut ctx.accounts.role_registry;
    registry.total_assignments = registry.total_assignments
        .saturating_sub(1);

    emit!(RoleRevoked {
        wallet:     assignment.wallet,
        role:       assignment.role_disc,
        revoked_by: ctx.accounts.caller.key(),
        reason,
        timestamp:  now,
    });

    msg!("Role {} revoked from {}", assignment.role_disc, assignment.wallet);
    Ok(())
}

// ── INSTRUCTION 4: TRANSFER ADMIN ────────────────────────────
/// Transfer SuperAdmin to a new wallet
/// Only current SuperAdmin can call this — irreversible until new admin acts
pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(
        ctx.accounts.new_admin.key() != ctx.accounts.current_admin.key(),
        RbacError::SameAdminWallet
    );

    // Deactivate old SuperAdmin assignment
    let old_assignment       = &mut ctx.accounts.old_admin_assignment;
    old_assignment.is_active = false;
    old_assignment.revoke_reason = "SuperAdmin transferred".to_string();

    // Create new SuperAdmin assignment
    let new_assignment        = &mut ctx.accounts.new_admin_assignment;
    new_assignment.wallet     = ctx.accounts.new_admin.key();
    new_assignment.role       = Role::SuperAdmin;
    new_assignment.role_disc  = ROLE_SUPER_ADMIN;
    new_assignment.granted_by = ctx.accounts.current_admin.key();
    new_assignment.granted_at = now;
    new_assignment.expires_at = None;
    new_assignment.is_active  = true;
    new_assignment.revoke_reason = String::new();
    new_assignment.bump       = ctx.bumps.new_admin_assignment;

    // Update registry authority
    let registry       = &mut ctx.accounts.role_registry;
    registry.authority = ctx.accounts.new_admin.key();

    emit!(AdminTransferred {
        old_admin: ctx.accounts.current_admin.key(),
        new_admin: ctx.accounts.new_admin.key(),
        timestamp: now,
    });

    msg!("SuperAdmin transferred to {}", ctx.accounts.new_admin.key());
    Ok(())
}

// ─────────────────────────────────────────────────────────────
//  ACCOUNT CONTEXTS
// ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer  = authority,
        space  = RoleRegistry::LEN,
        seeds  = [ROLE_REGISTRY_SEED],
        bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    /// SuperAdmin role assignment — created at init
    #[account(
        init,
        payer  = authority,
        space  = RoleAssignment::LEN,
        seeds  = [
            ROLE_ASSIGNMENT_SEED,
            authority.key().as_ref(),
            &[ROLE_SUPER_ADMIN]
        ],
        bump
    )]
    pub super_admin_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(role_disc: u8)]
pub struct GrantRole<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: The wallet receiving the role
    pub target_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [ROLE_REGISTRY_SEED],
        bump  = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    /// Caller's role assignment — proves they have authority to grant roles
    #[account(
        seeds = [
            ROLE_ASSIGNMENT_SEED,
            caller.key().as_ref(),
            &[caller_role_assignment.role_disc]
        ],
        bump  = caller_role_assignment.bump
    )]
    pub caller_role_assignment: Account<'info, RoleAssignment>,

    /// New role assignment being created
    #[account(
        init,
        payer  = caller,
        space  = RoleAssignment::LEN,
        seeds  = [
            ROLE_ASSIGNMENT_SEED,
            target_wallet.key().as_ref(),
            &[role_disc]
        ],
        bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeRole<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: Wallet whose role is being revoked
    pub target_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [ROLE_REGISTRY_SEED],
        bump  = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    /// Caller's role assignment — proves authority
    #[account(
        seeds = [
            ROLE_ASSIGNMENT_SEED,
            caller.key().as_ref(),
            &[caller_role_assignment.role_disc]
        ],
        bump  = caller_role_assignment.bump
    )]
    pub caller_role_assignment: Account<'info, RoleAssignment>,

    /// Role assignment being revoked
    #[account(
        mut,
        seeds = [
            ROLE_ASSIGNMENT_SEED,
            target_wallet.key().as_ref(),
            &[role_assignment.role_disc]
        ],
        bump  = role_assignment.bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    /// Must be current SuperAdmin
    #[account(
        constraint = current_admin.key() == role_registry.authority
            @ crate::errors::RbacError::Unauthorized
    )]
    pub current_admin: Signer<'info>,

    /// CHECK: New admin wallet
    pub new_admin: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [ROLE_REGISTRY_SEED],
        bump  = role_registry.bump
    )]
    pub role_registry: Account<'info, RoleRegistry>,

    /// Current admin's SuperAdmin assignment — will be deactivated
    #[account(
        mut,
        seeds = [
            ROLE_ASSIGNMENT_SEED,
            current_admin.key().as_ref(),
            &[ROLE_SUPER_ADMIN]
        ],
        bump  = old_admin_assignment.bump
    )]
    pub old_admin_assignment: Account<'info, RoleAssignment>,

    /// New admin's SuperAdmin assignment — will be created
    #[account(
        init,
        payer  = current_admin,
        space  = RoleAssignment::LEN,
        seeds  = [
            ROLE_ASSIGNMENT_SEED,
            new_admin.key().as_ref(),
            &[ROLE_SUPER_ADMIN]
        ],
        bump
    )]
    pub new_admin_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}
