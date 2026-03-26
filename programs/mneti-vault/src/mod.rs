use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use crate::constants::*;
use crate::errors::VaultError;
use crate::events::*;
use crate::state::*;
use crate::utils::*;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — INDIVIDUAL VAULT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Create Individual Vault ──────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateIndividualVaultParams {
    pub kyc_tier: u8,
}

#[derive(Accounts)]
pub struct CreateIndividualVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = INDIVIDUAL_VAULT_SIZE,
        seeds = [INDIVIDUAL_VAULT_SEED, owner.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, IndividualVault>>,

    pub system_program: Program<'info, System>,
}

pub fn create_individual_vault(
    ctx: Context<CreateIndividualVault>,
    params: CreateIndividualVaultParams,
) -> Result<()> {
    require!(params.kyc_tier >= MIN_KYC_TIER_INDIVIDUAL, VaultError::InsufficientKycTier);
    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    vault.owner = ctx.accounts.owner.key();
    vault.vault_id = vault.key();
    vault.vault_type = VAULT_TYPE_INDIVIDUAL;
    vault.status = VaultStatus::Active;
    vault.balance_kesh = 0;
    vault.total_deposited = 0;
    vault.total_withdrawn = 0;
    vault.accrued_yield = 0;
    vault.last_yield_ts = now;
    vault.created_at = now;
    vault.updated_at = now;
    vault.kyc_tier = params.kyc_tier;
    vault.savings_goals = Vec::new();

    emit!(VaultCreated {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        vault_type: VAULT_TYPE_INDIVIDUAL,
        timestamp: now,
    });
    Ok(())
}

// ─── Individual Deposit ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct IndividualDeposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [INDIVIDUAL_VAULT_SEED, owner.key().as_ref()],
        bump,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, IndividualVault>>,

    #[account(
        mut,
        constraint = depositor_token_account.owner == owner.key(),
        constraint = depositor_token_account.mint == kesh_mint.key(),
    )]
    pub depositor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
        constraint = vault_escrow.mint == kesh_mint.key(),
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    pub kesh_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn individual_deposit(ctx: Context<IndividualDeposit>, amount: u64) -> Result<()> {
    check_min_amount(amount)?;
    let vault = &mut ctx.accounts.vault;
    require!(
        safe_add(vault.balance_kesh, amount)? <= MAX_INDIVIDUAL_BALANCE,
        VaultError::MaxBalanceExceeded
    );

    // Transfer KESH from owner ATA → vault escrow
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                to: ctx.accounts.vault_escrow.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    vault.balance_kesh = safe_add(vault.balance_kesh, amount)?;
    vault.total_deposited = safe_add(vault.total_deposited, amount)?;
    vault.updated_at = now;

    emit!(VaultDeposit {
        vault: vault.key(),
        depositor: ctx.accounts.owner.key(),
        vault_type: VAULT_TYPE_INDIVIDUAL,
        amount,
        new_balance: vault.balance_kesh,
        timestamp: now,
    });
    Ok(())
}

// ─── Individual Withdrawal ────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct IndividualWithdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [INDIVIDUAL_VAULT_SEED, owner.key().as_ref()],
        bump,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, IndividualVault>>,

    #[account(
        mut,
        constraint = recipient_token_account.owner == owner.key(),
        constraint = recipient_token_account.mint == kesh_mint.key(),
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
        constraint = vault_escrow.mint == kesh_mint.key(),
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    pub kesh_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn individual_withdraw(ctx: Context<IndividualWithdraw>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(vault.balance_kesh >= amount, VaultError::InsufficientBalance);
    require!(amount > 0, VaultError::BelowMinimumAmount);

    let vault_key = vault.key();
    let escrow_seeds: &[&[u8]] = &[VAULT_ESCROW_SEED, vault_key.as_ref()];
    let (_, bump) = Pubkey::find_program_address(escrow_seeds, ctx.program_id);
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_ESCROW_SEED, vault_key.as_ref(), &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_escrow.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.vault_escrow.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    vault.balance_kesh = safe_sub(vault.balance_kesh, amount)?;
    vault.total_withdrawn = safe_add(vault.total_withdrawn, amount)?;
    vault.updated_at = now;

    emit!(VaultWithdrawal {
        vault: vault.key(),
        recipient: ctx.accounts.owner.key(),
        vault_type: VAULT_TYPE_INDIVIDUAL,
        amount,
        new_balance: vault.balance_kesh,
        timestamp: now,
    });
    Ok(())
}

// ─── Harvest Individual Yield ─────────────────────────────────────────────────

#[derive(Accounts)]
pub struct HarvestIndividualYield<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [INDIVIDUAL_VAULT_SEED, owner.key().as_ref()],
        bump,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, IndividualVault>>,

    /// CHECK: mneti-oracle PriceFeed account for T-bill yield (feed 1).
    /// Parsed manually via parse_oracle_feed() — not deserialized as Anchor account.
    pub tbill_oracle: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = recipient_token_account.owner == owner.key(),
        constraint = recipient_token_account.mint == kesh_mint.key(),
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = fee_collector_token_account.mint == kesh_mint.key(),
    )]
    pub fee_collector_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
        constraint = vault_escrow.mint == kesh_mint.key(),
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    pub kesh_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn harvest_individual_yield(ctx: Context<HarvestIndividualYield>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;

    // Parse oracle to get T-bill yield bps
    let oracle_data = ctx.accounts.tbill_oracle.try_borrow_data()?;
    let tbill_yield_bps = parse_oracle_feed(&oracle_data, now)?;

    let gross_yield = vault.compute_pending_yield(now, tbill_yield_bps);
    require!(gross_yield > 0, VaultError::NoYieldAccrued);

    let (net_yield, fee) = apply_yield_fee(gross_yield)?;

    // Update vault state
    vault.accrued_yield = safe_add(vault.accrued_yield, net_yield)?;
    vault.last_yield_ts = now;
    vault.updated_at = now;

    // The yield is "virtual" in the vault's accrued_yield counter.
    // Actual KESH transfer out requires calling individual_withdraw_yield (Phase 6).
    // For Phase 5 we track accrued_yield on-chain — the crank will distribute.

    emit!(YieldHarvested {
        vault: vault.key(),
        vault_type: VAULT_TYPE_INDIVIDUAL,
        yield_amount: net_yield,
        fee_amount: fee,
        tbill_yield_bps,
        timestamp: now,
    });
    Ok(())
}

// ─── Add Savings Goal ─────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AddSavingsGoalParams {
    pub name: String,
    pub target_amount: u64,
}

#[derive(Accounts)]
pub struct AddSavingsGoal<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [INDIVIDUAL_VAULT_SEED, owner.key().as_ref()],
        bump,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
    )]
    pub vault: Box<Account<'info, IndividualVault>>,
}

pub fn add_savings_goal(ctx: Context<AddSavingsGoal>, params: AddSavingsGoalParams) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    require!(vault.savings_goals.len() < MAX_SAVINGS_GOALS, VaultError::TooManySavingsGoals);
    require!(params.name.len() <= MAX_GOAL_NAME_LEN, VaultError::TooManySavingsGoals);
    require!(params.target_amount > 0, VaultError::BelowMinimumAmount);

    let now = Clock::get()?.unix_timestamp;
    let goal_index = vault.savings_goals.len() as u8;

    vault.savings_goals.push(SavingsGoal {
        name: params.name,
        target_amount: params.target_amount,
        current_amount: 0,
        completed: false,
    });
    vault.updated_at = now;

    emit!(SavingsGoalCreated {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        goal_index,
        target_amount: params.target_amount,
        timestamp: now,
    });
    Ok(())
}

// ─── Close Individual Vault ───────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CloseIndividualVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [INDIVIDUAL_VAULT_SEED, owner.key().as_ref()],
        bump,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
        close = owner
    )]
    pub vault: Box<Account<'info, IndividualVault>>,
}

pub fn close_individual_vault(ctx: Context<CloseIndividualVault>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    require!(vault.balance_kesh == 0, VaultError::VaultNotEmpty);
    let now = Clock::get()?.unix_timestamp;

    emit!(VaultClosed {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        vault_type: VAULT_TYPE_INDIVIDUAL,
        timestamp: now,
    });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — CHAMA VAULT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Create Chama Vault ───────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateChamaVaultParams {
    pub name: String,
    pub description: String,
    pub contribution_interval_seconds: i64,
    pub contribution_amount: u64,
    pub governance_threshold_pct: u8,
}

#[derive(Accounts)]
#[instruction(params: CreateChamaVaultParams)]
pub struct CreateChamaVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = CHAMA_VAULT_SIZE,
        seeds = [CHAMA_VAULT_SEED, creator.key().as_ref(), params.name.as_bytes()],
        bump
    )]
    pub vault: Box<Account<'info, ChamaVault>>,

    /// Creator is automatically the first member
    #[account(
        init,
        payer = creator,
        space = CHAMA_MEMBER_SIZE,
        seeds = [CHAMA_MEMBER_SEED, vault.key().as_ref(), creator.key().as_ref()],
        bump
    )]
    pub creator_member: Box<Account<'info, ChamaMember>>,

    pub system_program: Program<'info, System>,
}

pub fn create_chama_vault(ctx: Context<CreateChamaVault>, params: CreateChamaVaultParams) -> Result<()> {
    require!(params.name.len() <= MAX_CHAMA_NAME_LEN, VaultError::ChamaFull);
    require!(params.description.len() <= MAX_CHAMA_DESCRIPTION_LEN, VaultError::ChamaFull);
    require!(params.governance_threshold_pct > 0 && params.governance_threshold_pct <= 100, VaultError::InvalidThreshold);

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    vault.creator = ctx.accounts.creator.key();
    vault.vault_id = vault.key();
    vault.name = params.name;
    vault.description = params.description;
    vault.status = VaultStatus::Active;
    vault.balance_kesh = 0;
    vault.total_deposited = 0;
    vault.accrued_yield = 0;
    vault.last_yield_ts = now;
    vault.created_at = now;
    vault.contribution_interval_seconds = params.contribution_interval_seconds;
    vault.contribution_amount = params.contribution_amount;
    vault.member_count = 1;
    vault.proposal_count = 0;
    vault.rotation_index = 0;
    vault.governance_threshold_pct = params.governance_threshold_pct;

    // Initialize creator as first member
    let member = &mut ctx.accounts.creator_member;
    member.wallet = ctx.accounts.creator.key();
    member.chama_vault = vault.key();
    member.total_contributed = 0;
    member.joined_at = now;
    member.last_contribution_ts = 0;
    member.rotation_position = 0;
    member.is_active = true;
    member.has_received_rotation = false;
    member.vote_bitmap = 0;

    emit!(VaultCreated {
        vault: vault.key(),
        owner: ctx.accounts.creator.key(),
        vault_type: VAULT_TYPE_CHAMA,
        timestamp: now,
    });
    emit!(ChamaMemberAdded {
        chama_vault: vault.key(),
        new_member: ctx.accounts.creator.key(),
        member_count: 1,
        timestamp: now,
    });
    Ok(())
}

// ─── Add Chama Member ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct AddChamaMember<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,   // creator or governance-approved

    #[account(
        mut,
        constraint = vault.creator == authority.key() @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
        constraint = vault.member_count < MAX_CHAMA_MEMBERS as u32 @ VaultError::ChamaFull,
    )]
    pub vault: Box<Account<'info, ChamaVault>>,

    /// CHECK: New member wallet — just storing the pubkey
    pub new_member_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = CHAMA_MEMBER_SIZE,
        seeds = [CHAMA_MEMBER_SEED, vault.key().as_ref(), new_member_wallet.key().as_ref()],
        bump
    )]
    pub member_account: Box<Account<'info, ChamaMember>>,

    pub system_program: Program<'info, System>,
}

pub fn add_chama_member(ctx: Context<AddChamaMember>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    let rotation_pos = vault.member_count as u8;

    let member = &mut ctx.accounts.member_account;
    member.wallet = ctx.accounts.new_member_wallet.key();
    member.chama_vault = vault.key();
    member.total_contributed = 0;
    member.joined_at = now;
    member.last_contribution_ts = 0;
    member.rotation_position = rotation_pos;
    member.is_active = true;
    member.has_received_rotation = false;
    member.vote_bitmap = 0;

    vault.member_count = safe_add(vault.member_count as u64, 1)? as u32;

    emit!(ChamaMemberAdded {
        chama_vault: vault.key(),
        new_member: ctx.accounts.new_member_wallet.key(),
        member_count: vault.member_count,
        timestamp: now,
    });
    Ok(())
}

// ─── Chama Contribution ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ChamaContribute<'info> {
    #[account(mut)]
    pub member_wallet: Signer<'info>,

    #[account(
        mut,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, ChamaVault>>,

    #[account(
        mut,
        seeds = [CHAMA_MEMBER_SEED, vault.key().as_ref(), member_wallet.key().as_ref()],
        bump,
        constraint = member.wallet == member_wallet.key() @ VaultError::Unauthorized,
        constraint = member.is_active @ VaultError::MemberInactive,
    )]
    pub member: Box<Account<'info, ChamaMember>>,

    #[account(
        mut,
        constraint = contributor_token_account.owner == member_wallet.key(),
        constraint = contributor_token_account.mint == kesh_mint.key(),
    )]
    pub contributor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
        constraint = vault_escrow.mint == kesh_mint.key(),
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    pub kesh_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn chama_contribute(ctx: Context<ChamaContribute>, amount: u64) -> Result<()> {
    check_min_amount(amount)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.contributor_token_account.to_account_info(),
                to: ctx.accounts.vault_escrow.to_account_info(),
                authority: ctx.accounts.member_wallet.to_account_info(),
            },
        ),
        amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.vault.balance_kesh = safe_add(ctx.accounts.vault.balance_kesh, amount)?;
    ctx.accounts.vault.total_deposited = safe_add(ctx.accounts.vault.total_deposited, amount)?;
    ctx.accounts.member.total_contributed = safe_add(ctx.accounts.member.total_contributed, amount)?;
    ctx.accounts.member.last_contribution_ts = now;

    emit!(ChamaContribution {
        chama_vault: ctx.accounts.vault.key(),
        member: ctx.accounts.member_wallet.key(),
        amount,
        new_vault_balance: ctx.accounts.vault.balance_kesh,
        timestamp: now,
    });
    Ok(())
}

// ─── Create Chama Proposal ────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateProposalParams {
    pub proposal_type: u8,
    pub amount: u64,
    pub target_wallet: Pubkey,
}

#[derive(Accounts)]
pub struct CreateChamaProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,

    #[account(
        mut,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, ChamaVault>>,

    #[account(
        seeds = [CHAMA_MEMBER_SEED, vault.key().as_ref(), proposer.key().as_ref()],
        bump,
        constraint = member.wallet == proposer.key() @ VaultError::NotMember,
        constraint = member.is_active @ VaultError::MemberInactive,
    )]
    pub member: Box<Account<'info, ChamaMember>>,

    #[account(
        init,
        payer = proposer,
        space = CHAMA_PROPOSAL_SIZE,
        seeds = [CHAMA_PROPOSAL_SEED, vault.key().as_ref(), &vault.proposal_count.to_le_bytes()],
        bump
    )]
    pub proposal: Box<Account<'info, ChamaProposal>>,

    pub system_program: Program<'info, System>,
}

pub fn create_chama_proposal(ctx: Context<CreateChamaProposal>, params: CreateProposalParams) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    let proposal_index = vault.proposal_count;

    let proposal = &mut ctx.accounts.proposal;
    proposal.chama_vault = vault.key();
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.proposal_index = proposal_index;
    proposal.proposal_type = params.proposal_type;
    proposal.amount = params.amount;
    proposal.target_wallet = params.target_wallet;
    proposal.created_at = now;
    proposal.expires_at = now + PROPOSAL_EXPIRY_SECONDS;
    proposal.votes_for = 0;
    proposal.votes_against = 0;
    proposal.executed = false;
    proposal.cancelled = false;

    vault.proposal_count = vault.proposal_count.checked_add(1).ok_or(VaultError::MathOverflow)?;

    emit!(ChamaProposalCreated {
        chama_vault: vault.key(),
        proposer: ctx.accounts.proposer.key(),
        proposal_index,
        proposal_type: params.proposal_type,
        amount: params.amount,
        expires_at: proposal.expires_at,
        timestamp: now,
    });
    Ok(())
}

// ─── Vote on Chama Proposal ───────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(proposal_index: u32)]
pub struct VoteChamaProposal<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    pub vault: Box<Account<'info, ChamaVault>>,

    #[account(
        seeds = [CHAMA_MEMBER_SEED, vault.key().as_ref(), voter.key().as_ref()],
        bump,
        constraint = member.wallet == voter.key() @ VaultError::NotMember,
        constraint = member.is_active @ VaultError::MemberInactive,
    )]
    pub member: Box<Account<'info, ChamaMember>>,

    #[account(
        mut,
        seeds = [CHAMA_PROPOSAL_SEED, vault.key().as_ref(), &proposal_index.to_le_bytes()],
        bump,
        constraint = proposal.chama_vault == vault.key() @ VaultError::ProposalNotFound,
    )]
    pub proposal: Box<Account<'info, ChamaProposal>>,
}

pub fn vote_chama_proposal(ctx: Context<VoteChamaProposal>, proposal_index: u32, vote_for: bool) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let proposal = &mut ctx.accounts.proposal;

    require!(proposal.is_active(), VaultError::ProposalAlreadyExecuted);
    require!(!proposal.is_expired(now), VaultError::ProposalExpired);

    // Check vote bitmap — bit at proposal_index % 64
    let bit = 1u64 << (proposal_index % 64);
    let member = &mut ctx.accounts.member;
    require!(member.vote_bitmap & bit == 0, VaultError::AlreadyVoted);
    member.vote_bitmap |= bit;

    if vote_for {
        proposal.votes_for = proposal.votes_for.checked_add(1).ok_or(VaultError::MathOverflow)?;
    } else {
        proposal.votes_against = proposal.votes_against.checked_add(1).ok_or(VaultError::MathOverflow)?;
    }

    emit!(ChamaProposalVoted {
        chama_vault: ctx.accounts.vault.key(),
        proposal_index,
        voter: ctx.accounts.voter.key(),
        vote: vote_for,
        votes_for: proposal.votes_for,
        votes_against: proposal.votes_against,
        timestamp: now,
    });
    Ok(())
}

// ─── Execute Chama Proposal ───────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(proposal_index: u32)]
pub struct ExecuteChamaProposal<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,

    #[account(
        mut,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, ChamaVault>>,

    #[account(
        seeds = [CHAMA_MEMBER_SEED, vault.key().as_ref(), executor.key().as_ref()],
        bump,
        constraint = member.wallet == executor.key() @ VaultError::NotMember,
        constraint = member.is_active @ VaultError::MemberInactive,
    )]
    pub member: Box<Account<'info, ChamaMember>>,

    #[account(
        mut,
        seeds = [CHAMA_PROPOSAL_SEED, vault.key().as_ref(), &proposal_index.to_le_bytes()],
        bump,
    )]
    pub proposal: Box<Account<'info, ChamaProposal>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn execute_chama_proposal(ctx: Context<ExecuteChamaProposal>, proposal_index: u32) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let vault = &ctx.accounts.vault;
    let proposal = &ctx.accounts.proposal;

    require!(proposal.is_active(), VaultError::ProposalAlreadyExecuted);
    require!(!proposal.is_expired(now), VaultError::ProposalExpired);
    require!(
        proposal.passes(vault.member_count, vault.governance_threshold_pct),
        VaultError::InsufficientVotes
    );

    let amount = proposal.amount;
    let proposal_type = proposal.proposal_type;
    let vault_key = vault.key();

    // For WITHDRAW or LOAN proposals: transfer KESH from escrow to recipient
    if proposal_type == PROPOSAL_TYPE_WITHDRAW || proposal_type == PROPOSAL_TYPE_LOAN {
        require!(vault.balance_kesh >= amount, VaultError::InsufficientBalance);
        let escrow_seeds: &[&[u8]] = &[VAULT_ESCROW_SEED, vault_key.as_ref()];
        let (_, bump) = Pubkey::find_program_address(escrow_seeds, ctx.program_id);
        let signer_seeds: &[&[&[u8]]] = &[&[VAULT_ESCROW_SEED, vault_key.as_ref(), &[bump]]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_escrow.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.vault_escrow.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        let vault_mut = &mut ctx.accounts.vault;
        vault_mut.balance_kesh = safe_sub(vault_mut.balance_kesh, amount)?;
    }

    ctx.accounts.proposal.executed = true;

    emit!(ChamaProposalExecuted {
        chama_vault: vault_key,
        proposal_index,
        proposal_type,
        executor: ctx.accounts.executor.key(),
        timestamp: now,
    });
    Ok(())
}

// ─── Chama Rotation Payout ────────────────────────────────────────────────────
/// Pays the current rotation member their turn from the chama pool.
/// Rotates to the next member after payout.

#[derive(Accounts)]
pub struct ChamaRotationPayout<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        constraint = vault.creator == creator.key() @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, ChamaVault>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    /// The member receiving the rotation payout
    #[account(mut)]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn chama_rotation_payout(ctx: Context<ChamaRotationPayout>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    require!(vault.balance_kesh >= amount, VaultError::InsufficientBalance);

    let vault_key = vault.key();
    let escrow_seeds: &[&[u8]] = &[VAULT_ESCROW_SEED, vault_key.as_ref()];
    let (_, bump) = Pubkey::find_program_address(escrow_seeds, ctx.program_id);
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_ESCROW_SEED, vault_key.as_ref(), &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_escrow.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.vault_escrow.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    vault.balance_kesh = safe_sub(vault.balance_kesh, amount)?;
    let current_rotation = vault.rotation_index;
    vault.rotation_index = vault.rotation_index.checked_add(1).ok_or(VaultError::MathOverflow)?;
    // Reset cycle when all members have received
    if vault.rotation_index >= vault.member_count {
        vault.rotation_index = 0;
    }

    emit!(crate::events::ChamaRotationPayout {
        chama_vault: vault_key,
        recipient: ctx.accounts.recipient_token_account.owner,
        amount,
        rotation_index: current_rotation,
        timestamp: now,
    });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — SME VAULT
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateSmeVaultParams {
    pub business_name: String,
    pub multisig_threshold: u8,
    pub additional_signers: Vec<Pubkey>,
}

#[derive(Accounts)]
#[instruction(params: CreateSmeVaultParams)]
pub struct CreateSmeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = SME_VAULT_SIZE,
        seeds = [SME_VAULT_SEED, owner.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, SmeVault>>,

    pub system_program: Program<'info, System>,
}

pub fn create_sme_vault(ctx: Context<CreateSmeVault>, params: CreateSmeVaultParams) -> Result<()> {
    require!(params.business_name.len() <= MAX_SME_NAME_LEN, VaultError::Unauthorized);
    require!(params.additional_signers.len() < MAX_SME_SIGNERS, VaultError::TooManySigners);
    require!(
        params.multisig_threshold >= SME_MULTISIG_THRESHOLD_MIN
            && params.multisig_threshold <= (params.additional_signers.len() as u8 + 1),
        VaultError::InvalidThreshold
    );

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    vault.owner = ctx.accounts.owner.key();
    vault.vault_id = vault.key();
    vault.business_name = params.business_name;
    vault.status = VaultStatus::Active;
    vault.balance_kesh = 0;
    vault.payroll_reserve = 0;
    vault.tax_reserve = 0;
    vault.operating_balance = 0;
    vault.total_deposited = 0;
    vault.accrued_yield = 0;
    vault.last_yield_ts = now;
    vault.created_at = now;
    vault.multisig_threshold = params.multisig_threshold;

    // Owner is first signer
    let mut signers = vec![ctx.accounts.owner.key()];
    signers.extend_from_slice(&params.additional_signers);
    vault.signers = signers;
    vault.allocation_targets = Vec::new();

    emit!(VaultCreated {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        vault_type: VAULT_TYPE_SME,
        timestamp: now,
    });
    Ok(())
}

// ─── SME Deposit ──────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SmeDeposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = vault.is_signer(&signer.key()) @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, SmeVault>>,

    #[account(
        mut,
        constraint = depositor_token_account.owner == signer.key(),
        constraint = depositor_token_account.mint == kesh_mint.key(),
    )]
    pub depositor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
        constraint = vault_escrow.mint == kesh_mint.key(),
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    pub kesh_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn sme_deposit(ctx: Context<SmeDeposit>, amount: u64) -> Result<()> {
    check_min_amount(amount)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                to: ctx.accounts.vault_escrow.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    vault.balance_kesh = safe_add(vault.balance_kesh, amount)?;
    vault.operating_balance = safe_add(vault.operating_balance, amount)?;
    vault.total_deposited = safe_add(vault.total_deposited, amount)?;

    emit!(VaultDeposit {
        vault: vault.key(),
        depositor: ctx.accounts.signer.key(),
        vault_type: VAULT_TYPE_SME,
        amount,
        new_balance: vault.balance_kesh,
        timestamp: now,
    });
    Ok(())
}

// ─── Set SME Payroll Reserve ──────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SetPayrollReserve<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, SmeVault>>,
}

pub fn set_payroll_reserve(ctx: Context<SetPayrollReserve>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let total_reserved = safe_add(amount, vault.tax_reserve)?;
    require!(total_reserved <= vault.balance_kesh, VaultError::PayrollReserveOverflow);
    vault.payroll_reserve = amount;
    vault.operating_balance = safe_sub(vault.balance_kesh, total_reserved)?;

    let now = Clock::get()?.unix_timestamp;
    emit!(PayrollReserveSet {
        vault: vault.key(),
        authority: ctx.accounts.owner.key(),
        reserve_amount: amount,
        timestamp: now,
    });
    Ok(())
}

// ─── Set SME Tax Reserve ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SetTaxReserve<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = vault.owner == owner.key() @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, SmeVault>>,
}

pub fn set_tax_reserve(ctx: Context<SetTaxReserve>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let total_reserved = safe_add(vault.payroll_reserve, amount)?;
    require!(total_reserved <= vault.balance_kesh, VaultError::TaxReserveOverflow);
    vault.tax_reserve = amount;
    vault.operating_balance = safe_sub(vault.balance_kesh, total_reserved)?;

    let now = Clock::get()?.unix_timestamp;
    emit!(TaxReserveSet {
        vault: vault.key(),
        authority: ctx.accounts.owner.key(),
        reserve_amount: amount,
        timestamp: now,
    });
    Ok(())
}

// ─── SME Withdrawal ───────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SmeWithdraw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = vault.is_signer(&signer.key()) @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, SmeVault>>,

    #[account(mut)]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn sme_withdraw(ctx: Context<SmeWithdraw>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    // Only withdraw from operating_balance — payroll and tax reserves are protected
    require!(vault.operating_balance >= amount, VaultError::InsufficientBalance);

    let vault_key = vault.key();
    let escrow_seeds: &[&[u8]] = &[VAULT_ESCROW_SEED, vault_key.as_ref()];
    let (_, bump) = Pubkey::find_program_address(escrow_seeds, ctx.program_id);
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_ESCROW_SEED, vault_key.as_ref(), &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_escrow.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.vault_escrow.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    vault.balance_kesh = safe_sub(vault.balance_kesh, amount)?;
    vault.operating_balance = safe_sub(vault.operating_balance, amount)?;

    let now = Clock::get()?.unix_timestamp;
    emit!(VaultWithdrawal {
        vault: vault_key,
        recipient: ctx.accounts.recipient_token_account.owner,
        vault_type: VAULT_TYPE_SME,
        amount,
        new_balance: vault.balance_kesh,
        timestamp: now,
    });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — ENTERPRISE VAULT
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateEnterpriseVaultParams {
    pub entity_name: String,
    pub multisig_threshold: u8,
    pub signers: Vec<Pubkey>,
}

#[derive(Accounts)]
pub struct CreateEnterpriseVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = ENTERPRISE_VAULT_SIZE,
        seeds = [ENTERPRISE_VAULT_SEED, owner.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, EnterpriseVault>>,

    pub system_program: Program<'info, System>,
}

pub fn create_enterprise_vault(ctx: Context<CreateEnterpriseVault>, params: CreateEnterpriseVaultParams) -> Result<()> {
    require!(params.entity_name.len() <= MAX_ENTERPRISE_NAME_LEN, VaultError::Unauthorized);
    require!(params.signers.len() <= MAX_ENTERPRISE_SIGNERS, VaultError::TooManySigners);
    require!(
        params.multisig_threshold >= ENTERPRISE_MULTISIG_THRESHOLD_MIN
            && params.multisig_threshold <= params.signers.len() as u8,
        VaultError::InvalidThreshold
    );

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    vault.owner = ctx.accounts.owner.key();
    vault.vault_id = vault.key();
    vault.entity_name = params.entity_name;
    vault.status = VaultStatus::Active;
    vault.balance_kesh = 0;
    vault.total_deposited = 0;
    vault.accrued_yield = 0;
    vault.last_yield_ts = now;
    vault.created_at = now;
    vault.reporting_period_start = now;
    vault.multisig_threshold = params.multisig_threshold;
    vault.signers = params.signers;
    vault.period_snapshots = Vec::new();

    emit!(VaultCreated {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        vault_type: VAULT_TYPE_ENTERPRISE,
        timestamp: now,
    });
    Ok(())
}

// ─── Enterprise Deposit ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct EnterpriseDeposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = vault.is_signer(&signer.key()) @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, EnterpriseVault>>,

    #[account(
        mut,
        constraint = depositor_token_account.owner == signer.key(),
        constraint = depositor_token_account.mint == kesh_mint.key(),
    )]
    pub depositor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    pub kesh_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn enterprise_deposit(ctx: Context<EnterpriseDeposit>, amount: u64) -> Result<()> {
    check_min_amount(amount)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                to: ctx.accounts.vault_escrow.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
            },
        ),
        amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    vault.balance_kesh = safe_add(vault.balance_kesh, amount)?;
    vault.total_deposited = safe_add(vault.total_deposited, amount)?;

    emit!(VaultDeposit {
        vault: vault.key(),
        depositor: ctx.accounts.signer.key(),
        vault_type: VAULT_TYPE_ENTERPRISE,
        amount,
        new_balance: vault.balance_kesh,
        timestamp: now,
    });
    Ok(())
}

// ─── Enterprise Snapshot (Regulatory Reporting) ───────────────────────────────

#[derive(Accounts)]
pub struct EnterpriseSnapshot<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = vault.is_signer(&signer.key()) @ VaultError::Unauthorized,
    )]
    pub vault: Box<Account<'info, EnterpriseVault>>,
}

pub fn enterprise_snapshot(ctx: Context<EnterpriseSnapshot>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    if vault.period_snapshots.len() >= MAX_REPORTING_PERIODS {
        vault.period_snapshots.remove(0); // rolling window
    }
    vault.period_snapshots.push(vault.balance_kesh);
    vault.reporting_period_start = Clock::get()?.unix_timestamp;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — NGO GRANT VAULT
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateNgoVaultParams {
    pub organization_name: String,
    pub grant_expiry: i64,          // unix timestamp; 0 = no expiry
    pub milestones: Vec<u64>,       // unlock amounts per milestone
    pub donor_notes: String,
}

#[derive(Accounts)]
pub struct CreateNgoVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = NGO_VAULT_SIZE,
        seeds = [NGO_VAULT_SEED, authority.key().as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, NgoVault>>,

    pub system_program: Program<'info, System>,
}

pub fn create_ngo_vault(ctx: Context<CreateNgoVault>, params: CreateNgoVaultParams) -> Result<()> {
    require!(params.organization_name.len() <= MAX_NGO_NAME_LEN, VaultError::Unauthorized);
    require!(params.milestones.len() <= MAX_MILESTONES, VaultError::TooManyMilestones);
    require!(params.donor_notes.len() <= MAX_DONOR_NOTES_LEN, VaultError::Unauthorized);

    let now = Clock::get()?.unix_timestamp;

    // Compute total locked for milestones
    let locked: u64 = params.milestones.iter().sum();

    let milestones: Vec<GrantMilestone> = params.milestones
        .iter()
        .map(|&amount| GrantMilestone { unlock_amount: amount, completed: false, completed_at: 0 })
        .collect();

    let vault = &mut ctx.accounts.vault;
    vault.authority = ctx.accounts.authority.key();
    vault.vault_id = vault.key();
    vault.organization_name = params.organization_name;
    vault.status = VaultStatus::Active;
    vault.balance_kesh = 0;
    vault.disbursed_total = 0;
    vault.locked_for_milestones = 0; // no funds deposited yet
    vault.total_received = 0;
    vault.created_at = now;
    vault.grant_expiry = params.grant_expiry;
    vault.milestones = milestones;
    vault.donor_notes = params.donor_notes;

    emit!(VaultCreated {
        vault: vault.key(),
        owner: ctx.accounts.authority.key(),
        vault_type: VAULT_TYPE_NGO,
        timestamp: now,
    });
    Ok(())
}

// ─── NGO Deposit ──────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct NgoDeposit<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,

    #[account(
        mut,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, NgoVault>>,

    #[account(
        mut,
        constraint = donor_token_account.owner == donor.key(),
        constraint = donor_token_account.mint == kesh_mint.key(),
    )]
    pub donor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    pub kesh_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn ngo_deposit(ctx: Context<NgoDeposit>, amount: u64) -> Result<()> {
    check_min_amount(amount)?;
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.vault.is_expired(now), VaultError::GrantExpired);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.donor_token_account.to_account_info(),
                to: ctx.accounts.vault_escrow.to_account_info(),
                authority: ctx.accounts.donor.to_account_info(),
            },
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.balance_kesh = safe_add(vault.balance_kesh, amount)?;
    vault.total_received = safe_add(vault.total_received, amount)?;
    // Lock all newly deposited funds against milestones until unlocked
    let unlocked_milestones: u64 = vault.milestones.iter()
        .filter(|m| m.completed)
        .map(|m| m.unlock_amount)
        .sum();
    let pending_milestones: u64 = vault.milestones.iter()
        .filter(|m| !m.completed)
        .map(|m| m.unlock_amount)
        .sum();
    vault.locked_for_milestones = pending_milestones.min(vault.balance_kesh);

    emit!(VaultDeposit {
        vault: vault.key(),
        depositor: ctx.accounts.donor.key(),
        vault_type: VAULT_TYPE_NGO,
        amount,
        new_balance: vault.balance_kesh,
        timestamp: now,
    });
    Ok(())
}

// ─── Complete Milestone ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CompleteMilestone<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = vault.authority == authority.key() @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, NgoVault>>,
}

pub fn complete_milestone(ctx: Context<CompleteMilestone>, milestone_index: u8) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let idx = milestone_index as usize;
    require!(idx < vault.milestones.len(), VaultError::MilestoneAlreadyCompleted);
    require!(!vault.milestones[idx].completed, VaultError::MilestoneAlreadyCompleted);

    let now = Clock::get()?.unix_timestamp;
    let unlocked_amount = vault.milestones[idx].unlock_amount;

    vault.milestones[idx].completed = true;
    vault.milestones[idx].completed_at = now;
    vault.locked_for_milestones = vault.locked_for_milestones.saturating_sub(unlocked_amount);

    emit!(MilestoneCompleted {
        vault: vault.key(),
        milestone_index,
        unlocked_amount,
        timestamp: now,
    });
    Ok(())
}

// ─── NGO Disburse ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct NgoDisbure<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = vault.authority == authority.key() @ VaultError::Unauthorized,
        constraint = vault.is_operational() @ VaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, NgoVault>>,

    #[account(mut)]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_ESCROW_SEED, vault.key().as_ref()],
        bump,
    )]
    pub vault_escrow: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn ngo_disburse(ctx: Context<NgoDisbure>, amount: u64, milestone_index: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let vault = &ctx.accounts.vault;
    require!(!vault.is_expired(now), VaultError::GrantExpired);
    require!(vault.unlocked_balance() >= amount, VaultError::DisbursementExceedsUnlocked);

    let vault_key = vault.key();
    let escrow_seeds: &[&[u8]] = &[VAULT_ESCROW_SEED, vault_key.as_ref()];
    let (_, bump) = Pubkey::find_program_address(escrow_seeds, ctx.program_id);
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_ESCROW_SEED, vault_key.as_ref(), &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_escrow.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.vault_escrow.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.balance_kesh = safe_sub(vault.balance_kesh, amount)?;
    vault.disbursed_total = safe_add(vault.disbursed_total, amount)?;

    emit!(GrantDisbursed {
        vault: vault_key,
        authority: ctx.accounts.authority.key(),
        recipient: ctx.accounts.recipient_token_account.owner,
        amount,
        milestone_index,
        timestamp: now,
    });
    Ok(())
}
