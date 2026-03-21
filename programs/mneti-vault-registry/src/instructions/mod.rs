use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::RegistryError;
use crate::events::*;
use crate::state::*;

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let now      = Clock::get()?.unix_timestamp;
    let registry = &mut ctx.accounts.registry_state;
    registry.authority        = ctx.accounts.authority.key();
    registry.total_vaults     = 0;
    registry.active_vaults    = 0;
    registry.individual_count = 0;
    registry.chama_count      = 0;
    registry.sme_count        = 0;
    registry.enterprise_count = 0;
    registry.ngo_count        = 0;
    registry.total_kesh_tvl   = 0;
    registry.initialized_at   = now;
    registry.bump             = ctx.bumps.registry_state;

    emit!(RegistryInitialized { authority: ctx.accounts.authority.key(), timestamp: now });
    msg!("Vault Registry initialized");
    Ok(())
}

pub fn register_vault(ctx: Context<RegisterVault>, params: RegisterVaultParams) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let vault_type = VaultType::from_discriminant(params.vault_type_disc)
        .ok_or(RegistryError::InvalidVaultType)?;
    require!(params.vault_name.len() > 0 && params.vault_name.len() <= 50,
        RegistryError::InvalidParameter);

    let entry                  = &mut ctx.accounts.vault_entry;
    entry.vault_id             = params.vault_id;
    entry.owner                = ctx.accounts.owner.key();
    entry.vault_name           = params.vault_name.clone();
    entry.vault_type_disc      = params.vault_type_disc;
    entry.vault_status         = VaultStatus::Active;
    entry.vault_status_disc    = VaultStatus::Active.to_discriminant();
    entry.compliance_tier      = 0;
    entry.kesh_balance         = 0;
    entry.total_deposited      = 0;
    entry.total_withdrawn      = 0;
    entry.total_yield_earned   = 0;
    entry.registered_at        = now;
    entry.last_activity_at     = now;
    entry.status_reason        = String::new();
    entry.bump                 = ctx.bumps.vault_entry;

    // Store vault_type after using it for count updates
    entry.vault_type = vault_type.clone();

    let registry = &mut ctx.accounts.registry_state;
    registry.total_vaults  = registry.total_vaults.saturating_add(1);
    registry.active_vaults = registry.active_vaults.saturating_add(1);
    match vault_type {
        VaultType::Individual  => registry.individual_count  = registry.individual_count.saturating_add(1),
        VaultType::Chama       => registry.chama_count       = registry.chama_count.saturating_add(1),
        VaultType::Sme         => registry.sme_count         = registry.sme_count.saturating_add(1),
        VaultType::Enterprise  => registry.enterprise_count  = registry.enterprise_count.saturating_add(1),
        VaultType::Ngo         => registry.ngo_count         = registry.ngo_count.saturating_add(1),
    }

    emit!(VaultRegistered {
        vault_id: params.vault_id, owner: ctx.accounts.owner.key(),
        vault_type: params.vault_type_disc, vault_name: params.vault_name, timestamp: now,
    });
    msg!("Vault registered: type {}", params.vault_type_disc);
    Ok(())
}

pub fn update_vault_status(
    ctx: Context<UpdateVaultStatus>,
    new_status_disc: u8,
    reason: String,
) -> Result<()> {
    let now   = Clock::get()?.unix_timestamp;
    let entry = &mut ctx.accounts.vault_entry;
    require!(entry.vault_status != VaultStatus::Closed, RegistryError::VaultAlreadyClosed);

    let old_status_disc = entry.vault_status_disc;
    let new_status      = match new_status_disc {
        0 => VaultStatus::PendingKyc,
        1 => VaultStatus::Active,
        2 => VaultStatus::Suspended,
        3 => VaultStatus::Closed,
        _ => return err!(RegistryError::InvalidParameter),
    };

    let registry = &mut ctx.accounts.registry_state;
    if new_status == VaultStatus::Active && entry.vault_status != VaultStatus::Active {
        registry.active_vaults = registry.active_vaults.saturating_add(1);
    } else if new_status != VaultStatus::Active && entry.vault_status == VaultStatus::Active {
        registry.active_vaults = registry.active_vaults.saturating_sub(1);
    }

    entry.vault_status      = new_status;
    entry.vault_status_disc = new_status_disc;
    entry.status_reason     = reason.clone();
    entry.last_activity_at  = now;

    emit!(VaultStatusUpdated {
        vault_id: entry.vault_id, old_status: old_status_disc,
        new_status: new_status_disc, updated_by: ctx.accounts.authority.key(),
        reason, timestamp: now,
    });
    Ok(())
}

pub fn deregister_vault(ctx: Context<DeregisterVault>) -> Result<()> {
    let now   = Clock::get()?.unix_timestamp;
    let entry = &mut ctx.accounts.vault_entry;
    require!(entry.vault_status != VaultStatus::Closed, RegistryError::VaultAlreadyClosed);
    require!(entry.kesh_balance == 0, RegistryError::VaultNotActive);

    let registry = &mut ctx.accounts.registry_state;
    if entry.vault_status == VaultStatus::Active {
        registry.active_vaults = registry.active_vaults.saturating_sub(1);
    }
    entry.vault_status      = VaultStatus::Closed;
    entry.vault_status_disc = VaultStatus::Closed.to_discriminant();
    entry.status_reason     = "Deregistered by owner".to_string();
    entry.last_activity_at  = now;

    emit!(VaultDeregistered {
        vault_id: entry.vault_id, owner: entry.owner,
        closed_by: ctx.accounts.caller.key(), timestamp: now,
    });
    Ok(())
}

// ── ACCOUNT CONTEXTS ─────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(init, payer = authority, space = RegistryState::LEN,
        seeds = [REGISTRY_STATE_SEED], bump)]
    pub registry_state: Account<'info, RegistryState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: RegisterVaultParams)]
pub struct RegisterVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [REGISTRY_STATE_SEED], bump = registry_state.bump)]
    pub registry_state: Account<'info, RegistryState>,

    #[account(init, payer = owner, space = VaultEntry::LEN,
        seeds = [VAULT_ENTRY_SEED, owner.key().as_ref(), &[params.vault_type_disc]], bump)]
    pub vault_entry: Account<'info, VaultEntry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateVaultStatus<'info> {
    pub authority: Signer<'info>,

    /// CHECK: vault owner
    pub vault_owner: UncheckedAccount<'info>,

    #[account(mut, seeds = [REGISTRY_STATE_SEED], bump = registry_state.bump)]
    pub registry_state: Account<'info, RegistryState>,

    #[account(mut, seeds = [VAULT_ENTRY_SEED, vault_owner.key().as_ref(),
        &[vault_entry.vault_type_disc]], bump = vault_entry.bump)]
    pub vault_entry: Account<'info, VaultEntry>,
}

#[derive(Accounts)]
pub struct DeregisterVault<'info> {
    pub caller: Signer<'info>,

    /// CHECK: vault owner
    pub vault_owner: UncheckedAccount<'info>,

    #[account(mut, seeds = [REGISTRY_STATE_SEED], bump = registry_state.bump)]
    pub registry_state: Account<'info, RegistryState>,

    #[account(mut,
        seeds = [VAULT_ENTRY_SEED, vault_owner.key().as_ref(), &[vault_entry.vault_type_disc]],
        bump  = vault_entry.bump,
        constraint = vault_entry.owner == caller.key()
            || registry_state.authority == caller.key()
            @ RegistryError::Unauthorized)]
    pub vault_entry: Account<'info, VaultEntry>,

    pub system_program: Program<'info, System>,
}
