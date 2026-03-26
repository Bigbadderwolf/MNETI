use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount};

use crate::constants::*;
use crate::errors::KeshError;
use crate::events::*;
use crate::state::*;

pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(params.fee_bps <= 1000, KeshError::InvalidParameter);
    require!(params.initial_kes_usd_rate > 0, KeshError::InvalidOracleRate);
    let now   = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.protocol_state;
    state.authority               = ctx.accounts.authority.key();
    state.kesh_mint               = ctx.accounts.kesh_mint.key();
    state.fee_collector           = params.fee_collector;
    state.kes_usd_rate            = params.initial_kes_usd_rate;
    state.tbill_yield_bps         = params.initial_tbill_yield_bps;
    state.total_kesh_supply       = 0;
    state.total_kes_collateral    = 0;
    state.last_oracle_update      = now;
    state.last_yield_distribution = now;
    state.is_paused               = false;
    state.fee_bps                 = params.fee_bps;
    state.total_fees_collected    = 0;
    state.bump                    = ctx.bumps.protocol_state;
    emit!(PegUpdated {
        old_rate: 0, new_rate: params.initial_kes_usd_rate,
        tbill_yield_bps: params.initial_tbill_yield_bps,
        source: "INIT".to_string(), timestamp: now,
    });
    msg!("KESH initialized. Mint: {}", ctx.accounts.kesh_mint.key());
    Ok(())
}

pub fn init_wallet_state(ctx: Context<InitWalletState>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let ws  = &mut ctx.accounts.wallet_state;
    ws.wallet                 = ctx.accounts.wallet.key();
    ws.compliance_tier        = 0;
    ws.is_kyc_verified        = false;
    ws.kyc_valid_until        = 0;
    ws.is_frozen              = false;
    ws.daily_volume_usd_cents = 0;
    ws.last_volume_reset      = now;
    ws.lifetime_kesh_received = 0;
    ws.lifetime_kesh_sent     = 0;
    ws.first_tx_at            = 0;
    ws.last_tx_at             = 0;
    ws.bump                   = ctx.bumps.wallet_state;
    msg!("Wallet state initialized: {}", ctx.accounts.wallet.key());
    Ok(())
}

pub fn mint_kesh(ctx: Context<MintKesh>, kes_amount: u64, mpesa_ref: String) -> Result<()> {
    let now   = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.protocol_state;
    let ws    = &mut ctx.accounts.wallet_state;
    require!(!state.is_paused, KeshError::ProtocolPaused);
    require!(kes_amount >= MIN_DEPOSIT_KES, KeshError::BelowMinimumAmount);
    require!(!ws.is_frozen, KeshError::WalletFrozen);
    require!(mpesa_ref.len() > 0 && mpesa_ref.len() <= 20, KeshError::InvalidMpesaReference);
    require!(now - state.last_oracle_update <= MAX_ORACLE_AGE_SECONDS, KeshError::StalePriceOracle);
    let fee = kes_amount
        .checked_mul(state.fee_bps as u64).ok_or(KeshError::ArithmeticOverflow)?
        .checked_div(BPS_DENOMINATOR).ok_or(KeshError::ArithmeticOverflow)?;
    let kesh_to_mint = kes_amount.checked_sub(fee).ok_or(KeshError::ArithmeticOverflow)?;
    ws.reset_daily_volume_if_needed(now);
    let usd_cents = kes_amount
        .checked_mul(100_000_000).ok_or(KeshError::ArithmeticOverflow)?
        .checked_div(state.kes_usd_rate).ok_or(KeshError::ArithmeticOverflow)?;
    require!(
        ws.daily_volume_usd_cents.checked_add(usd_cents).ok_or(KeshError::ArithmeticOverflow)?
            <= ws.daily_limit_usd_cents(),
        KeshError::DailyLimitExceeded
    );
    let seeds  = &[MINT_AUTHORITY_SEED, &[ctx.bumps.mint_authority]];
    let signer = &[&seeds[..]];
    token::mint_to(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo { mint: ctx.accounts.kesh_mint.to_account_info(),
            to: ctx.accounts.recipient_ata.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info() }, signer), kesh_to_mint)?;
    if fee > 0 {
        token::mint_to(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo { mint: ctx.accounts.kesh_mint.to_account_info(),
                to: ctx.accounts.fee_collector_ata.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info() }, signer), fee)?;
    }
    state.total_kesh_supply    = state.total_kesh_supply.checked_add(kes_amount).ok_or(KeshError::ArithmeticOverflow)?;
    state.total_kes_collateral = state.total_kes_collateral.checked_add(kes_amount).ok_or(KeshError::ArithmeticOverflow)?;
    state.total_fees_collected = state.total_fees_collected.checked_add(fee).ok_or(KeshError::ArithmeticOverflow)?;
    ws.daily_volume_usd_cents  = ws.daily_volume_usd_cents.checked_add(usd_cents).ok_or(KeshError::ArithmeticOverflow)?;
    ws.lifetime_kesh_received  = ws.lifetime_kesh_received.checked_add(kesh_to_mint).ok_or(KeshError::ArithmeticOverflow)?;
    ws.last_tx_at = now;
    if ws.first_tx_at == 0 { ws.first_tx_at = now; }
    let deposit = &mut ctx.accounts.bridge_deposit;
    deposit.mpesa_ref    = mpesa_ref.clone();
    deposit.wallet       = ctx.accounts.recipient.key();
    deposit.kes_amount   = kes_amount;
    deposit.kesh_minted  = kesh_to_mint;
    deposit.fee_charged  = fee;
    deposit.rate_at_mint = state.kes_usd_rate;
    deposit.operator     = ctx.accounts.operator.key();
    deposit.created_at   = now;
    deposit.bump         = ctx.bumps.bridge_deposit;
    emit!(KeshMinted { wallet: ctx.accounts.recipient.key(), mpesa_ref,
        kes_amount, kesh_minted: kesh_to_mint, rate_used: state.kes_usd_rate,
        fee_charged: fee, timestamp: now });
    msg!("Minted {} KESH for {} KES", kesh_to_mint, kes_amount);
    Ok(())
}

pub fn burn_kesh(ctx: Context<BurnKesh>, kesh_amount: u64) -> Result<()> {
    let now   = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.protocol_state;
    let ws    = &mut ctx.accounts.wallet_state;
    require!(!state.is_paused, KeshError::ProtocolPaused);
    require!(kesh_amount > 0, KeshError::ZeroAmount);
    require!(!ws.is_frozen, KeshError::WalletFrozen);
    let fee = kesh_amount
        .checked_mul(state.fee_bps as u64).ok_or(KeshError::ArithmeticOverflow)?
        .checked_div(BPS_DENOMINATOR).ok_or(KeshError::ArithmeticOverflow)?;
    let kes_to_release = kesh_amount.checked_sub(fee).ok_or(KeshError::ArithmeticOverflow)?;
    token::burn(CpiContext::new(ctx.accounts.token_program.to_account_info(),
        Burn { mint: ctx.accounts.kesh_mint.to_account_info(),
            from: ctx.accounts.sender_ata.to_account_info(),
            authority: ctx.accounts.sender.to_account_info() }), kesh_amount)?;
    state.total_kesh_supply    = state.total_kesh_supply.checked_sub(kesh_amount).ok_or(KeshError::ArithmeticOverflow)?;
    state.total_kes_collateral = state.total_kes_collateral.checked_sub(kes_to_release).ok_or(KeshError::ArithmeticOverflow)?;
    ws.lifetime_kesh_sent      = ws.lifetime_kesh_sent.checked_add(kesh_amount).ok_or(KeshError::ArithmeticOverflow)?;
    ws.last_tx_at = now;
    emit!(KeshBurned { wallet: ctx.accounts.sender.key(), kesh_burned: kesh_amount,
        kes_to_release, fee_charged: fee, timestamp: now });
    msg!("Burned {} KESH — releasing {} KES", kesh_amount, kes_to_release);
    Ok(())
}

pub fn update_peg(ctx: Context<UpdatePeg>, new_kes_usd_rate: u64, new_tbill_yield_bps: u16) -> Result<()> {
    require!(new_kes_usd_rate > 0, KeshError::InvalidOracleRate);
    require!(new_tbill_yield_bps <= 5000, KeshError::InvalidParameter);
    let state    = &mut ctx.accounts.protocol_state;
    let old_rate = state.kes_usd_rate;
    let now      = Clock::get()?.unix_timestamp;
    state.kes_usd_rate       = new_kes_usd_rate;
    state.tbill_yield_bps    = new_tbill_yield_bps;
    state.last_oracle_update = now;
    emit!(PegUpdated { old_rate, new_rate: new_kes_usd_rate,
        tbill_yield_bps: new_tbill_yield_bps, source: "SIX".to_string(), timestamp: now });
    Ok(())
}

pub fn pause(ctx: Context<PauseProtocol>, reason: String) -> Result<()> {
    ctx.accounts.protocol_state.is_paused = true;
    emit!(ProtocolPaused { paused_by: ctx.accounts.authority.key(),
        reason, timestamp: Clock::get()?.unix_timestamp });
    Ok(())
}

pub fn unpause(ctx: Context<PauseProtocol>) -> Result<()> {
    ctx.accounts.protocol_state.is_paused = false;
    emit!(ProtocolUnpaused { unpaused_by: ctx.accounts.authority.key(),
        timestamp: Clock::get()?.unix_timestamp });
    Ok(())
}

// ── ACCOUNT CONTEXTS ─────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = ProtocolState::LEN,
        seeds = [PROTOCOL_STATE_SEED], bump)]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(init, payer = authority, mint::decimals = 2,
        mint::authority = mint_authority, seeds = [b"kesh_mint"], bump)]
    pub kesh_mint: Account<'info, Mint>,
    /// CHECK: PDA mint authority
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitWalletState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: target wallet
    pub wallet: UncheckedAccount<'info>,
    #[account(init, payer = payer, space = WalletState::LEN,
        seeds = [WALLET_STATE_SEED, wallet.key().as_ref()], bump)]
    pub wallet_state: Account<'info, WalletState>,
    pub system_program: Program<'info, System>,
}

// Box<> on large accounts — fixes 4096 byte stack frame limit
#[derive(Accounts)]
#[instruction(kes_amount: u64, mpesa_ref: String)]
pub struct MintKesh<'info> {
    #[account(mut)]
    pub operator: Box<Signer<'info>>,
    /// CHECK: recipient wallet
    pub recipient: Box<UncheckedAccount<'info>>,
    /// CHECK: fee collector wallet
    pub fee_collector: Box<UncheckedAccount<'info>>,
    #[account(mut, seeds = [PROTOCOL_STATE_SEED], bump = protocol_state.bump)]
    pub protocol_state: Box<Account<'info, ProtocolState>>,
    #[account(mut, seeds = [b"kesh_mint"], bump)]
    pub kesh_mint: Box<Account<'info, Mint>>,
    /// CHECK: PDA mint authority
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: Box<UncheckedAccount<'info>>,
    #[account(mut, seeds = [WALLET_STATE_SEED, recipient.key().as_ref()],
        bump = wallet_state.bump)]
    pub wallet_state: Box<Account<'info, WalletState>>,
    #[account(init_if_needed, payer = operator,
        associated_token::mint = kesh_mint, associated_token::authority = recipient)]
    pub recipient_ata: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = operator,
        associated_token::mint = kesh_mint, associated_token::authority = fee_collector)]
    pub fee_collector_ata: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = operator, space = BridgeDeposit::LEN,
        seeds = [BRIDGE_DEPOSIT_SEED, mpesa_ref.as_bytes()], bump)]
    pub bridge_deposit: Box<Account<'info, BridgeDeposit>>,
    pub token_program:            Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program:           Program<'info, System>,
    pub rent:                     Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BurnKesh<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(mut, seeds = [PROTOCOL_STATE_SEED], bump = protocol_state.bump)]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(mut, seeds = [b"kesh_mint"], bump)]
    pub kesh_mint: Account<'info, Mint>,
    #[account(mut, seeds = [WALLET_STATE_SEED, sender.key().as_ref()],
        bump = wallet_state.bump)]
    pub wallet_state: Account<'info, WalletState>,
    #[account(mut, associated_token::mint = kesh_mint, associated_token::authority = sender)]
    pub sender_ata: Account<'info, TokenAccount>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePeg<'info> {
    pub oracle_operator: Signer<'info>,
    #[account(mut, seeds = [PROTOCOL_STATE_SEED], bump = protocol_state.bump)]
    pub protocol_state: Account<'info, ProtocolState>,
}


#[derive(Accounts)]
pub struct PauseProtocol<'info> {
    #[account(constraint = authority.key() == protocol_state.authority
        @ KeshError::Unauthorized)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [PROTOCOL_STATE_SEED], bump = protocol_state.bump)]
    pub protocol_state: Account<'info, ProtocolState>,
}
