// ─────────────────────────────────────────────────────────────
//  MNETI KESH — instructions/mod.rs
//
//  WHAT CHANGED FROM PREVIOUS VERSION:
//  The MintKesh account context had a stack frame of 5760 bytes
//  which exceeded Solana's maximum of 4096 bytes.
//  Fix: Wrapped large accounts in Box<> which moves them from
//  the stack (limited) to the heap (unlimited), reducing
//  stack usage to well under 4096 bytes.
//
//  Accounts wrapped in Box<>:
//  - protocol_state   (large struct — 150+ bytes)
//  - kesh_mint        (SPL Mint account)
//  - wallet_state     (large struct — 100+ bytes)
//  - recipient_ata    (SPL TokenAccount)
//  - fee_collector_ata (SPL TokenAccount)
//  - bridge_deposit   (large struct — 100+ bytes)
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount};

use crate::constants::*;
use crate::errors::KeshError;
use crate::events::*;
use crate::state::*;

// ── INSTRUCTION 1: INITIALIZE ────────────────────────────────
// WORKFLOW:
// Called ONCE at deployment by the Rafiki team multisig
// 1. Creates the global ProtocolState PDA
// 2. Creates the KESH SPL token mint
// 3. Sets initial KES/USD rate and T-bill yield from SIX Financial
// 4. Emits PegUpdated event for off-chain indexers
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
        old_rate:        0,
        new_rate:        params.initial_kes_usd_rate,
        tbill_yield_bps: params.initial_tbill_yield_bps,
        source:          "INIT".to_string(),
        timestamp:       now,
    });

    msg!("MNETI KESH initialized. Mint: {}", ctx.accounts.kesh_mint.key());
    Ok(())
}

// ── INSTRUCTION 2: INIT WALLET STATE ─────────────────────────
// WORKFLOW:
// Called automatically by the M-Pesa bridge backend when a new
// user makes their first deposit
// 1. Creates a WalletState PDA unique to this wallet address
// 2. Sets default values — tier 0, unverified, not frozen
// 3. Initializes daily volume counter for compliance tracking
pub fn init_wallet_state(ctx: Context<InitWalletState>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let ws  = &mut ctx.accounts.wallet_state;

    ws.wallet                 = ctx.accounts.wallet.key();
    ws.compliance_tier        = 0;       // starts as basic individual
    ws.is_kyc_verified        = false;   // Phase 3 ZK proof will set this to true
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

// ── INSTRUCTION 3: MINT KESH ─────────────────────────────────
// WORKFLOW:
// Called by the M-Pesa bridge backend AFTER Daraja API confirms payment
// 1. Backend receives M-Pesa webhook from Safaricom
// 2. Backend calls this instruction with KES amount + M-Pesa reference
// 3. Program checks: not paused, amount >= KES 50, wallet not frozen
// 4. Program checks: oracle price is fresh (updated within 60 seconds)
// 5. Program checks: daily limit not exceeded for compliance tier
// 6. Calculates fee (0.30%) and KESH to mint (amount - fee)
// 7. Mints KESH to recipient's associated token account
// 8. Mints fee to fee collector's associated token account
// 9. Creates immutable BridgeDeposit record (audit trail)
// 10. Emits KeshMinted event — dashboard and AML monitor pick this up
pub fn mint_kesh(
    ctx: Context<MintKesh>,
    kes_amount: u64,
    mpesa_ref: String,
) -> Result<()> {
    let now   = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.protocol_state;
    let ws    = &mut ctx.accounts.wallet_state;

    // ── Safety checks ───────────────────────────────────────
    require!(!state.is_paused, KeshError::ProtocolPaused);
    require!(kes_amount >= MIN_DEPOSIT_KES, KeshError::BelowMinimumAmount);
    require!(!ws.is_frozen, KeshError::WalletFrozen);
    require!(mpesa_ref.len() > 0 && mpesa_ref.len() <= 20, KeshError::InvalidMpesaReference);

    // Oracle must have been updated within last 60 seconds
    require!(
        now - state.last_oracle_update <= MAX_ORACLE_AGE_SECONDS,
        KeshError::StalePriceOracle
    );

    // ── Fee calculation ─────────────────────────────────────
    // fee = kes_amount × 30 / 10000 (0.30%)
    let fee = kes_amount
        .checked_mul(state.fee_bps as u64).ok_or(KeshError::ArithmeticOverflow)?
        .checked_div(BPS_DENOMINATOR).ok_or(KeshError::ArithmeticOverflow)?;

    let kesh_to_mint = kes_amount
        .checked_sub(fee).ok_or(KeshError::ArithmeticOverflow)?;

    // ── Daily limit check ───────────────────────────────────
    // Reset counter if 24 hours have passed
    ws.reset_daily_volume_if_needed(now);

    // Convert KES to USD cents for tier limit comparison
    // kes_usd_rate is stored as rate × 1_000_000
    let usd_cents = kes_amount
        .checked_mul(100_000_000).ok_or(KeshError::ArithmeticOverflow)?
        .checked_div(state.kes_usd_rate).ok_or(KeshError::ArithmeticOverflow)?;

    require!(
        ws.daily_volume_usd_cents
            .checked_add(usd_cents).ok_or(KeshError::ArithmeticOverflow)?
            <= ws.daily_limit_usd_cents(),
        KeshError::DailyLimitExceeded
    );

    // ── Mint KESH to recipient ──────────────────────────────
    // Only the mint_authority PDA can sign mint instructions
    // This PDA is controlled exclusively by this program
    let seeds  = &[MINT_AUTHORITY_SEED, &[ctx.bumps.mint_authority]];
    let signer = &[&seeds[..]];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint:      ctx.accounts.kesh_mint.to_account_info(),
                to:        ctx.accounts.recipient_ata.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer,
        ),
        kesh_to_mint,
    )?;

    // ── Mint fee to fee collector ───────────────────────────
    if fee > 0 {
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint:      ctx.accounts.kesh_mint.to_account_info(),
                    to:        ctx.accounts.fee_collector_ata.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer,
            ),
            fee,
        )?;
    }

    // ── Update protocol state ───────────────────────────────
    state.total_kesh_supply = state.total_kesh_supply
        .checked_add(kes_amount).ok_or(KeshError::ArithmeticOverflow)?;
    state.total_kes_collateral = state.total_kes_collateral
        .checked_add(kes_amount).ok_or(KeshError::ArithmeticOverflow)?;
    state.total_fees_collected = state.total_fees_collected
        .checked_add(fee).ok_or(KeshError::ArithmeticOverflow)?;

    // ── Update wallet state ─────────────────────────────────
    ws.daily_volume_usd_cents = ws.daily_volume_usd_cents
        .checked_add(usd_cents).ok_or(KeshError::ArithmeticOverflow)?;
    ws.lifetime_kesh_received = ws.lifetime_kesh_received
        .checked_add(kesh_to_mint).ok_or(KeshError::ArithmeticOverflow)?;
    ws.last_tx_at = now;
    if ws.first_tx_at == 0 { ws.first_tx_at = now; }

    // ── Write immutable audit record ────────────────────────
    // One BridgeDeposit PDA per M-Pesa reference
    // Prevents replay attacks — same reference can never be used twice
    let deposit          = &mut ctx.accounts.bridge_deposit;
    deposit.mpesa_ref    = mpesa_ref.clone();
    deposit.wallet       = ctx.accounts.recipient.key();
    deposit.kes_amount   = kes_amount;
    deposit.kesh_minted  = kesh_to_mint;
    deposit.fee_charged  = fee;
    deposit.rate_at_mint = state.kes_usd_rate;
    deposit.operator     = ctx.accounts.operator.key();
    deposit.created_at   = now;
    deposit.bump         = ctx.bumps.bridge_deposit;

    // ── Emit event ──────────────────────────────────────────
    // Backend listens for this to update dashboard
    // AML monitor picks this up for KYT scoring
    emit!(KeshMinted {
        wallet:      ctx.accounts.recipient.key(),
        mpesa_ref,
        kes_amount,
        kesh_minted: kesh_to_mint,
        rate_used:   state.kes_usd_rate,
        fee_charged: fee,
        timestamp:   now,
    });

    msg!("Minted {} KESH for {} KES (fee: {})", kesh_to_mint, kes_amount, fee);
    Ok(())
}

// ── INSTRUCTION 4: BURN KESH ─────────────────────────────────
// WORKFLOW:
// Called by the USER when they want to withdraw KES to M-Pesa
// 1. User submits burn transaction from their wallet
// 2. Program checks: not paused, amount > 0, wallet not frozen
// 3. Calculates fee (0.30%) and KES to release (amount - fee)
// 4. Burns KESH from user's associated token account
// 5. Emits KeshBurned event
// 6. Backend listens for KeshBurned event
// 7. Backend calls Daraja B2C API to send KES to user's M-Pesa
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

    let kes_to_release = kesh_amount
        .checked_sub(fee).ok_or(KeshError::ArithmeticOverflow)?;

    // Burn KESH — user must sign this transaction
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint:      ctx.accounts.kesh_mint.to_account_info(),
                from:      ctx.accounts.sender_ata.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        ),
        kesh_amount,
    )?;

    // Update supply tracking
    state.total_kesh_supply = state.total_kesh_supply
        .checked_sub(kesh_amount).ok_or(KeshError::ArithmeticOverflow)?;
    state.total_kes_collateral = state.total_kes_collateral
        .checked_sub(kes_to_release).ok_or(KeshError::ArithmeticOverflow)?;

    ws.lifetime_kesh_sent = ws.lifetime_kesh_sent
        .checked_add(kesh_amount).ok_or(KeshError::ArithmeticOverflow)?;
    ws.last_tx_at = now;

    // Backend listens for this event and triggers M-Pesa B2C payout
    emit!(KeshBurned {
        wallet:         ctx.accounts.sender.key(),
        kesh_burned:    kesh_amount,
        kes_to_release,
        fee_charged:    fee,
        timestamp:      now,
    });

    msg!("Burned {} KESH — releasing {} KES via M-Pesa", kesh_amount, kes_to_release);
    Ok(())
}

// ── INSTRUCTION 5: UPDATE PEG ────────────────────────────────
// WORKFLOW:
// Called every 30 seconds by the SIX Financial oracle relay backend
// 1. Backend polls SIX Financial API for live KES/USD rate
// 2. Backend polls SIX Financial API for current T-bill yield
// 3. Backend signs and submits this instruction
// 4. Program validates rate is non-zero and yield is reasonable
// 5. Updates ProtocolState with fresh values
// 6. Updates last_oracle_update timestamp (keeps oracle fresh)
// 7. Emits PegUpdated event
// If this is not called within 60 seconds, mint_kesh will reject
// new deposits until the oracle is refreshed (circuit breaker)
pub fn update_peg(
    ctx: Context<UpdatePeg>,
    new_kes_usd_rate: u64,
    new_tbill_yield_bps: u16,
) -> Result<()> {
    require!(new_kes_usd_rate > 0, KeshError::InvalidOracleRate);
    require!(new_tbill_yield_bps <= 5000, KeshError::InvalidParameter); // max 50% yield cap

    let state    = &mut ctx.accounts.protocol_state;
    let old_rate = state.kes_usd_rate;
    let now      = Clock::get()?.unix_timestamp;

    state.kes_usd_rate       = new_kes_usd_rate;
    state.tbill_yield_bps    = new_tbill_yield_bps;
    state.last_oracle_update = now;

    emit!(PegUpdated {
        old_rate,
        new_rate:        new_kes_usd_rate,
        tbill_yield_bps: new_tbill_yield_bps,
        source:          "SIX".to_string(),
        timestamp:       now,
    });

    msg!("Peg updated: {} → {} KES/USD (×1M)", old_rate, new_kes_usd_rate);
    Ok(())
}

// ── INSTRUCTION 6: PAUSE ─────────────────────────────────────
// WORKFLOW:
// Emergency circuit breaker — only protocol authority can call
// Triggered when:
// - Oracle price deviation > 0.5% between SIX and Pyth
// - Suspicious minting activity detected by AML monitor
// - Security incident reported
// While paused: ALL mint_kesh and burn_kesh calls will fail
pub fn pause(ctx: Context<PauseProtocol>, reason: String) -> Result<()> {
    ctx.accounts.protocol_state.is_paused = true;
    emit!(ProtocolPaused {
        paused_by: ctx.accounts.authority.key(),
        reason,
        timestamp: Clock::get()?.unix_timestamp,
    });
    msg!("⚠️  Protocol PAUSED");
    Ok(())
}

// ── INSTRUCTION 7: UNPAUSE ───────────────────────────────────
// WORKFLOW:
// Resumes normal operations after incident is resolved
// Only protocol authority can call
pub fn unpause(ctx: Context<PauseProtocol>) -> Result<()> {
    ctx.accounts.protocol_state.is_paused = false;
    emit!(ProtocolUnpaused {
        unpaused_by: ctx.accounts.authority.key(),
        timestamp:   Clock::get()?.unix_timestamp,
    });
    msg!("✅ Protocol UNPAUSED");
    Ok(())
}

// ─────────────────────────────────────────────────────────────
//  ACCOUNT CONTEXTS
//  These tell Solana exactly which accounts each instruction
//  needs — Anchor validates all constraints before execution
// ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = ProtocolState::LEN,
        seeds = [PROTOCOL_STATE_SEED],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer           = authority,
        mint::decimals  = 2,
        mint::authority = mint_authority,
        seeds           = [b"kesh_mint"],
        bump
    )]
    pub kesh_mint: Account<'info, Mint>,

    /// CHECK: PDA acting as mint authority — no data stored here
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

    /// CHECK: target wallet to create state for
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = WalletState::LEN,
        seeds = [WALLET_STATE_SEED, wallet.key().as_ref()],
        bump
    )]
    pub wallet_state: Account<'info, WalletState>,

    pub system_program: Program<'info, System>,
}

// ── MINTKESH — Box<> used on large accounts to stay under ────
// ── Solana's 4096 byte stack frame limit ─────────────────────
#[derive(Accounts)]
#[instruction(kes_amount: u64, mpesa_ref: String)]
pub struct MintKesh<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    /// CHECK: recipient wallet
    pub recipient: UncheckedAccount<'info>,

    /// CHECK: fee collector wallet
    pub fee_collector: UncheckedAccount<'info>,

    // Box<> moves this from stack → heap (reduces stack frame size)
    #[account(
        mut,
        seeds = [PROTOCOL_STATE_SEED],
        bump  = protocol_state.bump
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    // Box<> — SPL Mint accounts are large
    #[account(mut, seeds = [b"kesh_mint"], bump)]
    pub kesh_mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA mint authority
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    // Box<> — WalletState is large
    #[account(
        mut,
        seeds = [WALLET_STATE_SEED, recipient.key().as_ref()],
        bump  = wallet_state.bump
    )]
    pub wallet_state: Box<Account<'info, WalletState>>,

    // Box<> — SPL TokenAccount is large
    #[account(
        init_if_needed,
        payer                       = operator,
        associated_token::mint      = kesh_mint,
        associated_token::authority = recipient,
    )]
    pub recipient_ata: Box<Account<'info, TokenAccount>>,

    // Box<> — SPL TokenAccount is large
    #[account(
        init_if_needed,
        payer                       = operator,
        associated_token::mint      = kesh_mint,
        associated_token::authority = fee_collector,
    )]
    pub fee_collector_ata: Box<Account<'info, TokenAccount>>,

    // Box<> — BridgeDeposit is large
    #[account(
        init,
        payer = operator,
        space = BridgeDeposit::LEN,
        seeds = [BRIDGE_DEPOSIT_SEED, mpesa_ref.as_bytes()],
        bump
    )]
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

    #[account(
        mut,
        seeds = [PROTOCOL_STATE_SEED],
        bump  = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(mut, seeds = [b"kesh_mint"], bump)]
    pub kesh_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [WALLET_STATE_SEED, sender.key().as_ref()],
        bump  = wallet_state.bump
    )]
    pub wallet_state: Account<'info, WalletState>,

    #[account(
        mut,
        associated_token::mint      = kesh_mint,
        associated_token::authority = sender,
    )]
    pub sender_ata: Account<'info, TokenAccount>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePeg<'info> {
    // Any wallet can call this for now
    // Phase 2 will add RBAC check for OracleOperator role
    pub oracle_operator: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_STATE_SEED],
        bump  = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

#[derive(Accounts)]
pub struct PauseProtocol<'info> {
    // Only the protocol authority (Rafiki multisig) can pause
    #[account(
        constraint = authority.key() == protocol_state.authority
            @ KeshError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_STATE_SEED],
        bump  = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}
