use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::RbacError;
use crate::events::*;
use crate::state::*;

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let now      = Clock::get()?.unix_timestamp;
    let registry = &mut ctx.accounts.role_registry;
    registry.authority         = ctx.accounts.authority.key();
    registry.total_assignments = 1;
    registry.bump              = ctx.bumps.role_registry;

    let sa             = &mut ctx.accounts.super_admin_assignment;
    sa.wallet          = ctx.accounts.authority.key();
    sa.role            = Role::SuperAdmin;
    sa.role_disc       = ROLE_SUPER_ADMIN;
    sa.granted_by      = ctx.accounts.authority.key();
    sa.granted_at      = now;
    sa.expires_at      = None;
    sa.is_active       = true;
    sa.revoke_reason   = String::new();
    sa.bump            = ctx.bumps.super_admin_assignment;

    emit!(RegistryInitialized { authority: ctx.accounts.authority.key(), timestamp: now });
    emit!(RoleGranted {
        wallet: ctx.accounts.authority.key(), role: ROLE_SUPER_ADMIN,
        granted_by: ctx.accounts.authority.key(), expires_at: None, timestamp: now,
    });
    msg!("RBAC initialized. SuperAdmin: {}", ctx.accounts.authority.key());
    Ok(())
}

pub fn grant_role(ctx: Context<GrantRole>, role_disc: u8, expires_at: Option<i64>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(role_disc <= 9, RbacError::InvalidRole);
    require!(role_disc != ROLE_SUPER_ADMIN, RbacError::CannotGrantSuperAdmin);
    if let Some(expiry) = expires_at { require!(expiry > now, RbacError::InvalidExpiry); }

    let caller = &ctx.accounts.caller_role_assignment;
    require!(
        caller.is_valid(now) &&
        (caller.role_disc == ROLE_SUPER_ADMIN || caller.role_disc == ROLE_COMPLIANCE_OFFICER),
        RbacError::Unauthorized
    );

    let a         = &mut ctx.accounts.role_assignment;
    a.wallet      = ctx.accounts.target_wallet.key();
    a.role        = Role::from_discriminant(role_disc).ok_or(RbacError::InvalidRole)?;
    a.role_disc   = role_disc;
    a.granted_by  = ctx.accounts.caller.key();
    a.granted_at  = now;
    a.expires_at  = expires_at;
    a.is_active   = true;
    a.revoke_reason = String::new();
    a.bump        = ctx.bumps.role_assignment;

    ctx.accounts.role_registry.total_assignments =
        ctx.accounts.role_registry.total_assignments.saturating_add(1);

    emit!(RoleGranted {
        wallet: ctx.accounts.target_wallet.key(), role: role_disc,
        granted_by: ctx.accounts.caller.key(), expires_at, timestamp: now,
    });
    msg!("Role {} granted to {}", role_disc, ctx.accounts.target_wallet.key());
    Ok(())
}

pub fn revoke_role(ctx: Context<RevokeRole>, reason: String) -> Result<()> {
    let now    = Clock::get()?.unix_timestamp;
    let caller = &ctx.accounts.caller_role_assignment;
    require!(
        caller.is_valid(now) &&
        (caller.role_disc == ROLE_SUPER_ADMIN || caller.role_disc == ROLE_COMPLIANCE_OFFICER),
        RbacError::Unauthorized
    );

    let a = &mut ctx.accounts.role_assignment;
    require!(a.role_disc != ROLE_SUPER_ADMIN, RbacError::CannotRevokeAdmin);
    require!(a.is_active, RbacError::RoleInactive);

    a.is_active     = false;
    a.revoke_reason = reason.clone();
    ctx.accounts.role_registry.total_assignments =
        ctx.accounts.role_registry.total_assignments.saturating_sub(1);

    emit!(RoleRevoked {
        wallet: a.wallet, role: a.role_disc,
        revoked_by: ctx.accounts.caller.key(), reason, timestamp: now,
    });
    Ok(())
}

pub fn transfer_admin(ctx: Context<TransferAdmin>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.new_admin.key() != ctx.accounts.current_admin.key(),
        RbacError::SameAdminWallet
    );

    let old              = &mut ctx.accounts.old_admin_assignment;
    old.is_active        = false;
    old.revoke_reason    = "SuperAdmin transferred".to_string();

    let new_a            = &mut ctx.accounts.new_admin_assignment;
    new_a.wallet         = ctx.accounts.new_admin.key();
    new_a.role           = Role::SuperAdmin;
    new_a.role_disc      = ROLE_SUPER_ADMIN;
    new_a.granted_by     = ctx.accounts.current_admin.key();
    new_a.granted_at     = now;
    new_a.expires_at     = None;
    new_a.is_active      = true;
    new_a.revoke_reason  = String::new();
    new_a.bump           = ctx.bumps.new_admin_assignment;

    ctx.accounts.role_registry.authority = ctx.accounts.new_admin.key();

    emit!(AdminTransferred {
        old_admin: ctx.accounts.current_admin.key(),
        new_admin: ctx.accounts.new_admin.key(),
        timestamp: now,
    });
    Ok(())
}

// ── ACCOUNT CONTEXTS ─────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(init, payer = authority, space = RoleRegistry::LEN,
        seeds = [ROLE_REGISTRY_SEED], bump)]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(init, payer = authority, space = RoleAssignment::LEN,
        seeds = [ROLE_ASSIGNMENT_SEED, authority.key().as_ref(), &[ROLE_SUPER_ADMIN]], bump)]
    pub super_admin_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(role_disc: u8)]
pub struct GrantRole<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: target wallet
    pub target_wallet: UncheckedAccount<'info>,

    #[account(mut, seeds = [ROLE_REGISTRY_SEED], bump = role_registry.bump)]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(seeds = [ROLE_ASSIGNMENT_SEED, caller.key().as_ref(),
        &[caller_role_assignment.role_disc]], bump = caller_role_assignment.bump)]
    pub caller_role_assignment: Account<'info, RoleAssignment>,

    #[account(init, payer = caller, space = RoleAssignment::LEN,
        seeds = [ROLE_ASSIGNMENT_SEED, target_wallet.key().as_ref(), &[role_disc]], bump)]
    pub role_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeRole<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: wallet whose role is revoked
    pub target_wallet: UncheckedAccount<'info>,

    #[account(mut, seeds = [ROLE_REGISTRY_SEED], bump = role_registry.bump)]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(seeds = [ROLE_ASSIGNMENT_SEED, caller.key().as_ref(),
        &[caller_role_assignment.role_disc]], bump = caller_role_assignment.bump)]
    pub caller_role_assignment: Account<'info, RoleAssignment>,

    #[account(mut, seeds = [ROLE_ASSIGNMENT_SEED, target_wallet.key().as_ref(),
        &[role_assignment.role_disc]], bump = role_assignment.bump)]
    pub role_assignment: Account<'info, RoleAssignment>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(constraint = current_admin.key() == role_registry.authority
        @ crate::errors::RbacError::Unauthorized)]
    pub current_admin: Signer<'info>,

    /// CHECK: new admin wallet
    pub new_admin: UncheckedAccount<'info>,

    #[account(mut, seeds = [ROLE_REGISTRY_SEED], bump = role_registry.bump)]
    pub role_registry: Account<'info, RoleRegistry>,

    #[account(mut, seeds = [ROLE_ASSIGNMENT_SEED, current_admin.key().as_ref(),
        &[ROLE_SUPER_ADMIN]], bump = old_admin_assignment.bump)]
    pub old_admin_assignment: Account<'info, RoleAssignment>,

    #[account(init, payer = current_admin, space = RoleAssignment::LEN,
        seeds = [ROLE_ASSIGNMENT_SEED, new_admin.key().as_ref(), &[ROLE_SUPER_ADMIN]], bump)]
    pub new_admin_assignment: Account<'info, RoleAssignment>,

    pub system_program: Program<'info, System>,
}
