// ═══════════════════════════════════════════════════════════════════════════════
// mneti-remittance — instructions/mod.rs
//
// All instruction handlers for the Remittance Corridor program.
//
// Sections:
//   0  Registry initialization
//   1  Corridor management — initialize, activate, deactivate
//   2  Order lifecycle — create (escrow USDC), execute (lock FX, mint KESH,
//                        trigger M-Pesa), cancel (refund), record_mpesa_payout
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

use crate::constants::*;
use crate::errors::RemittanceError;
use crate::events::*;
use crate::state::*;
use crate::utils::*;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 0 — REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct InitializeRemittanceRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = SZ_REMITTANCE_REGISTRY,
        seeds = [REMITTANCE_REGISTRY_SEED],
        bump
    )]
    pub registry: Box<Account<'info, RemittanceRegistry>>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_remittance_registry(
    ctx: Context<InitializeRemittanceRegistry>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let r   = &mut ctx.accounts.registry;
    r.authority            = ctx.accounts.authority.key();
    r.total_orders         = 0;
    r.total_completed      = 0;
    r.total_volume_usdc    = 0;
    r.total_volume_kesh    = 0;
    r.total_fees_collected = 0;
    r.created_at           = now;

    emit!(RemittanceRegistryInitialized {
        authority: r.authority,
        timestamp: now,
    });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CORRIDOR MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1A  Initialize Corridor ──────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeCorridorParams {
    pub corridor_id:     u8,
    pub name:            String,
    pub min_amount_kesh: u64,
    pub max_amount_kesh: u64,
}

#[derive(Accounts)]
#[instruction(p: InitializeCorridorParams)]
pub struct InitializeCorridor<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        constraint = registry.authority == authority.key() @ RemittanceError::Unauthorized,
    )]
    pub registry: Box<Account<'info, RemittanceRegistry>>,

    #[account(
        init,
        payer = authority,
        space = SZ_CORRIDOR,
        seeds = [CORRIDOR_SEED, &[p.corridor_id]],
        bump
    )]
    pub corridor: Box<Account<'info, Corridor>>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_corridor(
    ctx: Context<InitializeCorridor>,
    p: InitializeCorridorParams,
) -> Result<()> {
    require!(p.corridor_id <= 4,                         RemittanceError::InvalidCorridor);
    require!(p.name.len() <= MAX_CORRIDOR_NAME,          RemittanceError::Unauthorized);
    require!(p.min_amount_kesh < p.max_amount_kesh,      RemittanceError::BelowMinimumAmount);
    require!(p.min_amount_kesh >= MIN_REMITTANCE_KESH,   RemittanceError::BelowMinimumAmount);

    let now = Clock::get()?.unix_timestamp;
    let c   = &mut ctx.accounts.corridor;
    c.corridor_id      = p.corridor_id;
    c.name             = p.name.clone();
    c.is_active        = true;
    c.min_amount_kesh  = p.min_amount_kesh;
    c.max_amount_kesh  = p.max_amount_kesh;
    c.total_volume_kesh= 0;
    c.total_orders     = 0;
    c.created_at       = now;

    emit!(CorridorInitialized {
        corridor:    c.key(),
        corridor_id: c.corridor_id,
        name:        p.name,
        timestamp:   now,
    });
    Ok(())
}

// ─── 1B  Toggle Corridor Active / Inactive ────────────────────────────────────

#[derive(Accounts)]
pub struct ToggleCorridor<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(constraint = registry.authority == authority.key() @ RemittanceError::Unauthorized)]
    pub registry: Box<Account<'info, RemittanceRegistry>>,

    #[account(mut)]
    pub corridor: Box<Account<'info, Corridor>>,
}

pub fn activate_corridor(ctx: Context<ToggleCorridor>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.corridor.is_active = true;
    emit!(CorridorStatusChanged {
        corridor:    ctx.accounts.corridor.key(),
        corridor_id: ctx.accounts.corridor.corridor_id,
        is_active:   true,
        authority:   ctx.accounts.authority.key(),
        timestamp:   now,
    });
    Ok(())
}

pub fn deactivate_corridor(ctx: Context<ToggleCorridor>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.corridor.is_active = false;
    emit!(CorridorStatusChanged {
        corridor:    ctx.accounts.corridor.key(),
        corridor_id: ctx.accounts.corridor.corridor_id,
        is_active:   false,
        authority:   ctx.accounts.authority.key(),
        timestamp:   now,
    });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — ORDER LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 2A  Create Remittance Order (escrow USDC) ───────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateRemittanceOrderParams {
    pub sender_name:       String,
    pub recipient_name:    String,
    /// M-Pesa phone of beneficiary (2547XXXXXXXX)
    pub recipient_phone:   String,
    pub memo:              String,
    pub corridor_id:       u8,
    /// Gross USDC amount to send (6 decimals) — fee deducted from this
    pub source_amount_usdc:u64,
    /// IPFS CID of ECIES-encrypted IVMS101 payload.
    /// Required when dest_amount_kesh >= TRAVEL_RULE_THRESHOLD_KESH.
    /// Pass empty string when below threshold.
    pub travel_rule_ref:   String,
    /// Monotonic nonce — increment per sender to allow multiple open orders
    pub nonce:             u64,
}

#[derive(Accounts)]
#[instruction(p: CreateRemittanceOrderParams)]
pub struct CreateRemittanceOrder<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(
        constraint = corridor.corridor_id == p.corridor_id @ RemittanceError::InvalidCorridor,
        constraint = corridor.is_active                    @ RemittanceError::CorridorInactive,
    )]
    pub corridor: Box<Account<'info, Corridor>>,

    /// CHECK: beneficiary Solana wallet (may be default Pubkey if M-Pesa only)
    pub beneficiary_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = sender,
        space = SZ_REMITTANCE_ORDER,
        seeds = [REMITTANCE_ORDER_SEED, sender.key().as_ref(), &p.nonce.to_le_bytes()],
        bump
    )]
    pub order: Box<Account<'info, RemittanceOrder>>,

    /// Sender's USDC ATA — funds drawn from here into escrow
    #[account(
        mut,
        constraint = sender_usdc.owner == sender.key()     @ RemittanceError::Unauthorized,
        constraint = sender_usdc.mint  == usdc_mint.key()  @ RemittanceError::Unauthorized,
    )]
    pub sender_usdc: Box<Account<'info, TokenAccount>>,

    /// Escrow ATA — owned by the order PDA, holds USDC until execution
    #[account(
        mut,
        seeds = [ORDER_ESCROW_SEED, order.key().as_ref()],
        bump,
        constraint = order_escrow.mint == usdc_mint.key() @ RemittanceError::Unauthorized,
    )]
    pub order_escrow: Box<Account<'info, TokenAccount>>,

    pub usdc_mint:     Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_remittance_order(
    ctx: Context<CreateRemittanceOrder>,
    p: CreateRemittanceOrderParams,
) -> Result<()> {
    // ── Validation ────────────────────────────────────────────────────────────
    require!(!p.sender_name.is_empty()    && p.sender_name.len()    <= MAX_SENDER_NAME,    RemittanceError::MissingSenderName);
    require!(!p.recipient_name.is_empty() && p.recipient_name.len() <= MAX_RECIPIENT_NAME, RemittanceError::MissingRecipientName);
    require!(p.memo.len()                 <= MAX_MEMO,                                     RemittanceError::Unauthorized);
    require!(p.travel_rule_ref.len()      <= MAX_TR_REF,                                   RemittanceError::TravelRuleRefEmpty);
    validate_phone(&p.recipient_phone)?;
    require!(p.source_amount_usdc > 0, RemittanceError::BelowMinimumAmount);

    // ── Fee deduction ─────────────────────────────────────────────────────────
    let (net_usdc, fee_usdc) = deduct_remittance_fee(p.source_amount_usdc)?;

    // ── Escrow USDC from sender ───────────────────────────────────────────────
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.sender_usdc.to_account_info(),
                to:        ctx.accounts.order_escrow.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        ),
        p.source_amount_usdc,
    )?;

    // ── Estimated KESH (informational — locked at execution) ──────────────────
    // We can't read the oracle here without passing the account, so estimated_kesh
    // is emitted as 0 — the frontend computes the estimate off-chain.
    let estimated_kesh: u64 = 0;

    let tr_required = p.travel_rule_ref.is_empty()
        && estimated_kesh >= TRAVEL_RULE_THRESHOLD_KESH;
    // Note: actual TR check is enforced at execute_order when real FX rate is known.

    let now = Clock::get()?.unix_timestamp;
    let ord = &mut ctx.accounts.order;
    ord.sender                = ctx.accounts.sender.key();
    ord.beneficiary_wallet    = ctx.accounts.beneficiary_wallet.key();
    ord.sender_name           = p.sender_name;
    ord.recipient_name        = p.recipient_name;
    ord.recipient_phone       = p.recipient_phone.clone();
    ord.memo                  = p.memo;
    ord.corridor_id           = p.corridor_id;
    ord.source_amount_usdc    = p.source_amount_usdc;
    ord.net_source_usdc       = net_usdc;
    ord.dest_amount_kesh      = 0; // computed at execute_order
    ord.fee_usdc              = fee_usdc;
    ord.fx_rate_scaled        = 0; // locked at execute_order
    ord.status                = ORDER_STATUS_PENDING;
    ord.created_at            = now;
    ord.executed_at           = 0;
    ord.travel_rule_ref       = p.travel_rule_ref;
    ord.mpesa_receipt         = String::new();
    ord.mpesa_payout_triggered= false;
    ord.nonce                 = p.nonce;

    emit!(RemittanceOrderCreated {
        order:                ord.key(),
        sender:               ord.sender,
        corridor_id:          ord.corridor_id,
        source_amount_usdc:   ord.source_amount_usdc,
        estimated_kesh,
        recipient_phone:      p.recipient_phone,
        travel_rule_required: tr_required,
        timestamp:            now,
    });
    Ok(())
}

// ─── 2B  Execute Remittance Order (lock FX, mint KESH, trigger M-Pesa) ────────
/// Called by the protocol operator after verifying KYC and AML on the order.
/// Reads the live KES/USD rate from mneti-oracle, computes destination KESH,
/// mints KESH to beneficiary wallet (if set), and emits the M-Pesa payout event.

#[derive(Accounts)]
pub struct ExecuteRemittanceOrder<'info> {
    /// Protocol operator — must be registered relay authority
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        constraint = registry.authority == operator.key() @ RemittanceError::Unauthorized,
    )]
    pub registry: Box<Account<'info, RemittanceRegistry>>,

    #[account(mut)]
    pub corridor: Box<Account<'info, Corridor>>,

    #[account(
        mut,
        constraint = order.status == ORDER_STATUS_PENDING @ RemittanceError::OrderNotPending,
        constraint = order.corridor_id == corridor.corridor_id @ RemittanceError::InvalidCorridor,
    )]
    pub order: Box<Account<'info, RemittanceOrder>>,

    /// CHECK: mneti-oracle PriceFeed account for KES/USD (feed index 0)
    /// Parsed manually via read_kes_usd_oracle()
    pub kes_usd_oracle: UncheckedAccount<'info>,

    /// Escrow ATA holding the sender's USDC — split into fee + protocol pool
    #[account(
        mut,
        seeds = [ORDER_ESCROW_SEED, order.key().as_ref()],
        bump,
    )]
    pub order_escrow: Box<Account<'info, TokenAccount>>,

    /// Protocol USDC fee collector ATA
    #[account(
        mut,
        constraint = protocol_fee_usdc.mint == order_escrow.mint @ RemittanceError::Unauthorized,
    )]
    pub protocol_fee_usdc: Box<Account<'info, TokenAccount>>,

    /// Protocol USDC liquidity pool (net USDC after fee — held for FX settlement)
    #[account(
        mut,
        seeds = [LIQUIDITY_POOL_SEED, &[order.corridor_id]],
        bump,
        constraint = liquidity_pool.mint == order_escrow.mint @ RemittanceError::Unauthorized,
    )]
    pub liquidity_pool: Box<Account<'info, TokenAccount>>,

    /// KESH mint — protocol mint authority signs via PDA
    #[account(mut)]
    pub kesh_mint: Box<Account<'info, Mint>>,

    /// Mint authority PDA for KESH (from mneti-kesh program)
    /// CHECK: validated by the token CPI — must be correct PDA
    pub kesh_mint_authority: UncheckedAccount<'info>,

    /// Beneficiary KESH ATA — receives minted KESH
    /// Pass protocol's own ATA when beneficiary_wallet == Pubkey::default()
    #[account(mut)]
    pub beneficiary_kesh_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn execute_remittance_order(
    ctx: Context<ExecuteRemittanceOrder>,
    kesh_mint_authority_bump: u8,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // ── Read oracle FX rate ───────────────────────────────────────────────────
    let oracle_data  = ctx.accounts.kes_usd_oracle.try_borrow_data()?;
    let fx_rate      = read_kes_usd_oracle(&oracle_data, now)?;
    drop(oracle_data);

    // ── Compute destination KESH ──────────────────────────────────────────────
    let net_usdc = ctx.accounts.order.net_source_usdc;
    let dest_kesh = RemittanceOrder::compute_kesh(net_usdc, fx_rate)
        .ok_or(RemittanceError::MathOverflow)?;
    require!(dest_kesh > 0, RemittanceError::ZeroDestinationAmount);

    // ── Validate corridor amount limits ───────────────────────────────────────
    require!(
        ctx.accounts.corridor.validate_amount(dest_kesh),
        if dest_kesh < ctx.accounts.corridor.min_amount_kesh {
            RemittanceError::BelowMinimumAmount
        } else {
            RemittanceError::ExceedsMaximumAmount
        }
    );

    // ── Travel Rule enforcement ───────────────────────────────────────────────
    if dest_kesh >= TRAVEL_RULE_THRESHOLD_KESH {
        require!(
            !ctx.accounts.order.travel_rule_ref.is_empty(),
            RemittanceError::TravelRuleRefRequired
        );
    }

    let order_key    = ctx.accounts.order.key();
    let escrow_seeds: &[&[u8]] = &[ORDER_ESCROW_SEED, order_key.as_ref()];
    let (_, escrow_bump) = Pubkey::find_program_address(escrow_seeds, ctx.program_id);
    let escrow_signer: &[&[&[u8]]] = &[&[ORDER_ESCROW_SEED, order_key.as_ref(), &[escrow_bump]]];

    // ── Transfer fee USDC → protocol fee collector ────────────────────────────
    let fee = ctx.accounts.order.fee_usdc;
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.order_escrow.to_account_info(),
                    to:        ctx.accounts.protocol_fee_usdc.to_account_info(),
                    authority: ctx.accounts.order_escrow.to_account_info(),
                },
                escrow_signer,
            ),
            fee,
        )?;
    }

    // ── Transfer net USDC → liquidity pool ───────────────────────────────────
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.order_escrow.to_account_info(),
                to:        ctx.accounts.liquidity_pool.to_account_info(),
                authority: ctx.accounts.order_escrow.to_account_info(),
            },
            escrow_signer,
        ),
        net_usdc,
    )?;

    // ── Mint KESH to beneficiary wallet ───────────────────────────────────────
    // KESH mint authority PDA seed: ["mint_authority"] (matches mneti-kesh program)
    let mint_auth_seeds: &[&[&[u8]]] = &[&[b"mint_authority", &[kesh_mint_authority_bump]]];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::MintTo {
                mint:      ctx.accounts.kesh_mint.to_account_info(),
                to:        ctx.accounts.beneficiary_kesh_ata.to_account_info(),
                authority: ctx.accounts.kesh_mint_authority.to_account_info(),
            },
            mint_auth_seeds,
        ),
        dest_kesh,
    )?;

    // ── Update order state ────────────────────────────────────────────────────
    let order = &mut ctx.accounts.order;
    order.dest_amount_kesh = dest_kesh;
    order.fx_rate_scaled   = fx_rate;
    order.status           = ORDER_STATUS_COMPLETED;
    order.executed_at      = now;

    // ── Update corridor stats ─────────────────────────────────────────────────
    let corridor = &mut ctx.accounts.corridor;
    corridor.total_volume_kesh = safe_add(corridor.total_volume_kesh, dest_kesh)?;
    corridor.total_orders      = safe_add(corridor.total_orders, 1)?;

    // ── Update registry stats ─────────────────────────────────────────────────
    let registry = &mut ctx.accounts.registry;
    registry.total_completed      = safe_add(registry.total_completed, 1)?;
    registry.total_volume_usdc    = safe_add(registry.total_volume_usdc, order.source_amount_usdc)?;
    registry.total_volume_kesh    = safe_add(registry.total_volume_kesh, dest_kesh)?;
    registry.total_fees_collected = safe_add(registry.total_fees_collected, fee)?;

    // ── Emit KESH minted event ────────────────────────────────────────────────
    emit!(RemittanceKeshMinted {
        order:              order_key,
        sender:             order.sender,
        beneficiary_wallet: order.beneficiary_wallet,
        amount_kesh:        dest_kesh,
        timestamp:          now,
    });

    // ── Emit M-Pesa payout trigger event (picked up by off-chain relay) ───────
    let daraja_ref = make_daraja_ref(order.nonce, now);
    emit!(RemittanceMpesaPayoutTriggered {
        order:           order_key,
        sender:          order.sender,
        recipient_phone: order.recipient_phone.clone(),
        recipient_name:  order.recipient_name.clone(),
        // amount_kes = KESH units ÷ 100 (2 decimals → whole KES)
        amount_kes:      dest_kesh / 100,
        daraja_ref:      daraja_ref.clone(),
        timestamp:       now,
    });

    emit!(RemittanceOrderCompleted {
        order:              order_key,
        sender:             order.sender,
        corridor_id:        order.corridor_id,
        source_amount_usdc: order.source_amount_usdc,
        dest_amount_kesh:   dest_kesh,
        fee_usdc:           fee,
        fx_rate_scaled:     fx_rate,
        travel_rule_ref:    if order.travel_rule_ref.is_empty() {
            None
        } else {
            Some(order.travel_rule_ref.clone())
        },
        timestamp: now,
    });
    Ok(())
}

// ─── 2C  Cancel Remittance Order (refund USDC to sender) ─────────────────────

#[derive(Accounts)]
pub struct CancelRemittanceOrder<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    #[account(
        mut,
        constraint = order.sender == sender.key()             @ RemittanceError::Unauthorized,
        constraint = order.status == ORDER_STATUS_PENDING     @ RemittanceError::OrderNotPending,
    )]
    pub order: Box<Account<'info, RemittanceOrder>>,

    #[account(
        mut,
        seeds = [ORDER_ESCROW_SEED, order.key().as_ref()],
        bump,
    )]
    pub order_escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = sender_usdc.owner == sender.key()     @ RemittanceError::Unauthorized,
        constraint = sender_usdc.mint  == order_escrow.mint @ RemittanceError::Unauthorized,
    )]
    pub sender_usdc: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn cancel_remittance_order(
    ctx: Context<CancelRemittanceOrder>,
    cancel_reason: String,
) -> Result<()> {
    let refund   = ctx.accounts.order.source_amount_usdc;
    let order_key = ctx.accounts.order.key();

    let (_, bump) = Pubkey::find_program_address(
        &[ORDER_ESCROW_SEED, order_key.as_ref()],
        ctx.program_id,
    );
    let signer_seeds: &[&[&[u8]]] = &[&[ORDER_ESCROW_SEED, order_key.as_ref(), &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.order_escrow.to_account_info(),
                to:        ctx.accounts.sender_usdc.to_account_info(),
                authority: ctx.accounts.order_escrow.to_account_info(),
            },
            signer_seeds,
        ),
        refund,
    )?;

    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.order.status = ORDER_STATUS_CANCELLED;

    emit!(RemittanceOrderCancelled {
        order:         order_key,
        sender:        ctx.accounts.sender.key(),
        refund_usdc:   refund,
        cancel_reason,
        timestamp:     now,
    });
    Ok(())
}

// ─── 2D  Record M-Pesa Payout (called by relay after Daraja B2C confirmation) ─
/// The off-chain M-Pesa relay calls this instruction after receiving the
/// Safaricom B2C success callback to anchor the receipt on-chain.

#[derive(Accounts)]
pub struct RecordMpesaPayout<'info> {
    /// Protocol operator — must be registry authority
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        constraint = registry.authority == operator.key() @ RemittanceError::Unauthorized,
    )]
    pub registry: Box<Account<'info, RemittanceRegistry>>,

    #[account(
        mut,
        constraint = order.status == ORDER_STATUS_COMPLETED  @ RemittanceError::OrderAlreadyCompleted,
        constraint = !order.mpesa_payout_triggered           @ RemittanceError::MpesaAlreadyTriggered,
    )]
    pub order: Box<Account<'info, RemittanceOrder>>,
}

pub fn record_mpesa_payout(
    ctx: Context<RecordMpesaPayout>,
    mpesa_receipt: String,
) -> Result<()> {
    require!(mpesa_receipt.len() <= MAX_MPESA_REF, RemittanceError::Unauthorized);

    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.order.mpesa_receipt          = mpesa_receipt.clone();
    ctx.accounts.order.mpesa_payout_triggered = true;

    emit!(RemittanceMpesaConfirmed {
        order:         ctx.accounts.order.key(),
        mpesa_receipt,
        timestamp:     now,
    });
    Ok(())
}
