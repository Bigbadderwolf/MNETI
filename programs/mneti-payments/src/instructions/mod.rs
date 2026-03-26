// ═══════════════════════════════════════════════════════════════════════════════
// mneti-payments — instructions/mod.rs
//
// All instruction handlers for the Programmable Payments program.
// Sections:
//   0  Registry initialization
//   1  Payroll — create schedule, add/deactivate recipient, execute payment,
//                finalize run, pause/resume schedule
//   2  Supplier Payments — create (escrow), approve (multisig), execute, cancel
//   3  Recurring Payments — create, execute, pause, resume, cancel
//   4  Conditional Grants — create, deposit, satisfy condition, disburse
//   5  Invoice NFT — issue, finance, repay
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

use crate::constants::*;
use crate::errors::PaymentError;
use crate::events::*;
use crate::state::*;
use crate::utils::*;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 0 — PAYMENT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct InitializePaymentRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = SZ_PAYMENT_REGISTRY,
        seeds = [PAYMENT_REGISTRY_SEED],
        bump
    )]
    pub registry: Box<Account<'info, PaymentRegistry>>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_payment_registry(ctx: Context<InitializePaymentRegistry>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let r   = &mut ctx.accounts.registry;
    r.authority                  = ctx.accounts.authority.key();
    r.total_payroll_runs         = 0;
    r.total_supplier_payments    = 0;
    r.total_recurring_executions = 0;
    r.total_grants_disbursed     = 0;
    r.total_volume_kesh          = 0;
    r.created_at                 = now;
    emit!(PaymentRegistryInitialized { authority: r.authority, timestamp: now });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — PAYROLL
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1A  Create Payroll Schedule ──────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreatePayrollScheduleParams {
    pub name:              String,
    pub interval_seconds:  i64,
    /// If 0, first run is scheduled at now + interval_seconds
    pub first_run_ts:      i64,
}

#[derive(Accounts)]
#[instruction(p: CreatePayrollScheduleParams)]
pub struct CreatePayrollSchedule<'info> {
    #[account(mut)]
    pub employer: Signer<'info>,

    /// CHECK: SME or Enterprise vault PDA — only its pubkey is stored.
    /// The vault holds the KESH.  The token transfer is authorised by the
    /// employer signer who must also be a registered vault signer.
    pub funding_vault: UncheckedAccount<'info>,

    #[account(
        init,
        payer = employer,
        space = SZ_PAYROLL_SCHEDULE,
        seeds = [PAYROLL_SCHEDULE_SEED, employer.key().as_ref(), p.name.as_bytes()],
        bump
    )]
    pub schedule: Box<Account<'info, PayrollSchedule>>,

    pub system_program: Program<'info, System>,
}

pub fn create_payroll_schedule(
    ctx: Context<CreatePayrollSchedule>,
    p: CreatePayrollScheduleParams,
) -> Result<()> {
    require!(p.name.len() <= MAX_PAYROLL_NAME, PaymentError::Unauthorized);
    require!(p.interval_seconds > 0,           PaymentError::InvalidInterval);

    let now = Clock::get()?.unix_timestamp;
    let s   = &mut ctx.accounts.schedule;
    s.employer            = ctx.accounts.employer.key();
    s.funding_vault       = ctx.accounts.funding_vault.key();
    s.name                = p.name.clone();
    s.status              = STATUS_ACTIVE;
    s.interval_seconds    = p.interval_seconds;
    s.next_run_ts         = if p.first_run_ts > 0 { p.first_run_ts } else { now + p.interval_seconds };
    s.last_run_ts         = 0;
    s.total_disbursed_kesh= 0;
    s.recipient_count     = 0;
    s.run_count           = 0;
    s.created_at          = now;

    emit!(PayrollScheduleCreated {
        schedule:         s.key(),
        employer:         s.employer,
        funding_vault:    s.funding_vault,
        name:             p.name,
        interval_seconds: s.interval_seconds,
        first_run_ts:     s.next_run_ts,
        timestamp:        now,
    });
    Ok(())
}

// ─── 1B  Add Payroll Recipient ────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AddPayrollRecipientParams {
    pub name:              String,
    pub amount_per_period: u64,
}

#[derive(Accounts)]
#[instruction(p: AddPayrollRecipientParams)]
pub struct AddPayrollRecipient<'info> {
    #[account(mut)]
    pub employer: Signer<'info>,

    #[account(
        mut,
        constraint = schedule.employer == employer.key()    @ PaymentError::Unauthorized,
        constraint = schedule.is_active()                   @ PaymentError::SchedulePaused,
        constraint = (schedule.recipient_count as usize) < MAX_PAYROLL_RECIPIENTS @ PaymentError::TooManyRecipients,
    )]
    pub schedule: Box<Account<'info, PayrollSchedule>>,

    /// CHECK: Employee wallet — just stored; not a signer
    pub recipient_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = employer,
        space = SZ_PAYROLL_RECIPIENT,
        seeds = [PAYROLL_RECIPIENT_SEED, schedule.key().as_ref(), recipient_wallet.key().as_ref()],
        bump
    )]
    pub recipient: Box<Account<'info, PayrollRecipient>>,

    pub system_program: Program<'info, System>,
}

pub fn add_payroll_recipient(
    ctx: Context<AddPayrollRecipient>,
    p: AddPayrollRecipientParams,
) -> Result<()> {
    require!(p.name.len() <= MAX_RECIPIENT_NAME, PaymentError::Unauthorized);
    require_min_amount(p.amount_per_period)?;

    let now = Clock::get()?.unix_timestamp;
    let r   = &mut ctx.accounts.recipient;
    r.wallet            = ctx.accounts.recipient_wallet.key();
    r.schedule          = ctx.accounts.schedule.key();
    r.name              = p.name.clone();
    r.amount_per_period = p.amount_per_period;
    r.total_received    = 0;
    r.last_paid_ts      = 0;
    r.is_active         = true;

    ctx.accounts.schedule.recipient_count = ctx.accounts.schedule.recipient_count
        .checked_add(1).ok_or(PaymentError::MathOverflow)?;

    emit!(PayrollRecipientAdded {
        schedule:          ctx.accounts.schedule.key(),
        recipient_wallet:  r.wallet,
        name:              p.name,
        amount_per_period: r.amount_per_period,
        timestamp:         now,
    });
    Ok(())
}

// ─── 1C  Deactivate Payroll Recipient ─────────────────────────────────────────

#[derive(Accounts)]
pub struct DeactivatePayrollRecipient<'info> {
    #[account(mut)]
    pub employer: Signer<'info>,

    #[account(constraint = schedule.employer == employer.key() @ PaymentError::Unauthorized)]
    pub schedule: Box<Account<'info, PayrollSchedule>>,

    #[account(
        mut,
        constraint = recipient.schedule == schedule.key() @ PaymentError::RecipientNotFound,
        constraint = recipient.is_active                  @ PaymentError::RecipientNotFound,
    )]
    pub recipient: Box<Account<'info, PayrollRecipient>>,
}

pub fn deactivate_payroll_recipient(ctx: Context<DeactivatePayrollRecipient>) -> Result<()> {
    ctx.accounts.recipient.is_active = false;
    emit!(PayrollRecipientDeactivated {
        schedule:         ctx.accounts.schedule.key(),
        recipient_wallet: ctx.accounts.recipient.wallet,
        timestamp:        Clock::get()?.unix_timestamp,
    });
    Ok(())
}

// ─── 1D  Execute Payroll (one recipient per call) ─────────────────────────────
/// Design rationale: Paying all 100 recipients in one instruction would exceed
/// the Solana 4096-byte stack and 1.4M compute limits.  Instead the employer
/// iterates off-chain: for each active recipient, call execute_payroll_recipient,
/// then call finalize_payroll_run once at the end.

#[derive(Accounts)]
pub struct ExecutePayrollRecipient<'info> {
    #[account(mut)]
    pub employer: Signer<'info>,

    #[account(
        mut,
        constraint = schedule.employer == employer.key() @ PaymentError::Unauthorized,
        constraint = schedule.is_active()                @ PaymentError::SchedulePaused,
        constraint = schedule.is_due(Clock::get().unwrap().unix_timestamp) @ PaymentError::PayrollNotDue,
    )]
    pub schedule: Box<Account<'info, PayrollSchedule>>,

    #[account(
        mut,
        constraint = recipient.schedule == schedule.key() @ PaymentError::RecipientNotFound,
        constraint = recipient.is_active                  @ PaymentError::RecipientNotFound,
    )]
    pub recipient: Box<Account<'info, PayrollRecipient>>,

    /// KESH token account belonging to the funding vault — employer must have authority
    #[account(
        mut,
        constraint = vault_token_account.mint == kesh_mint.key() @ PaymentError::Unauthorized,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    /// Recipient's KESH ATA
    #[account(
        mut,
        constraint = recipient_token_account.owner == recipient.wallet @ PaymentError::Unauthorized,
        constraint = recipient_token_account.mint  == kesh_mint.key()  @ PaymentError::Unauthorized,
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    /// Protocol fee collector KESH ATA
    #[account(
        mut,
        constraint = fee_collector.mint == kesh_mint.key() @ PaymentError::Unauthorized,
    )]
    pub fee_collector: Box<Account<'info, TokenAccount>>,

    pub kesh_mint:      Box<Account<'info, Mint>>,
    pub token_program:  Program<'info, Token>,
}

pub fn execute_payroll_recipient(ctx: Context<ExecutePayrollRecipient>) -> Result<()> {
    let gross = ctx.accounts.recipient.amount_per_period;
    require!(
        ctx.accounts.vault_token_account.amount >= gross,
        PaymentError::InsufficientFunds
    );

    let (net, fee) = deduct_fee(gross, FEE_PAYROLL_BPS)?;

    // Transfer net KESH → employee
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.vault_token_account.to_account_info(),
                to:        ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.employer.to_account_info(),
            },
        ),
        net,
    )?;

    // Transfer fee → protocol fee collector
    if fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.vault_token_account.to_account_info(),
                    to:        ctx.accounts.fee_collector.to_account_info(),
                    authority: ctx.accounts.employer.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.recipient.total_received   = safe_add(ctx.accounts.recipient.total_received, net)?;
    ctx.accounts.recipient.last_paid_ts     = now;
    ctx.accounts.schedule.total_disbursed_kesh =
        safe_add(ctx.accounts.schedule.total_disbursed_kesh, gross)?;

    emit!(PayrollSinglePayment {
        schedule:         ctx.accounts.schedule.key(),
        recipient_wallet: ctx.accounts.recipient.wallet,
        net_amount:       net,
        fee_amount:       fee,
        timestamp:        now,
    });
    Ok(())
}

// ─── 1E  Finalize Payroll Run (call once after all recipients paid) ────────────

#[derive(Accounts)]
pub struct FinalizePayrollRun<'info> {
    #[account(mut)]
    pub employer: Signer<'info>,

    #[account(
        mut,
        constraint = schedule.employer == employer.key() @ PaymentError::Unauthorized,
        constraint = schedule.is_active()                @ PaymentError::SchedulePaused,
        constraint = schedule.is_due(Clock::get().unwrap().unix_timestamp) @ PaymentError::PayrollNotDue,
    )]
    pub schedule: Box<Account<'info, PayrollSchedule>>,

    #[account(mut)]
    pub registry: Box<Account<'info, PaymentRegistry>>,
}

pub fn finalize_payroll_run(
    ctx: Context<FinalizePayrollRun>,
    recipients_paid:  u32,
    total_gross_kesh: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let s   = &mut ctx.accounts.schedule;
    s.last_run_ts  = now;
    s.next_run_ts  = safe_add(now as u64, s.interval_seconds as u64)? as i64;
    s.run_count    = s.run_count.checked_add(1).ok_or(PaymentError::MathOverflow)?;

    let total_fee = deduct_fee(total_gross_kesh, FEE_PAYROLL_BPS)?.1;

    let r = &mut ctx.accounts.registry;
    r.total_payroll_runs = safe_add(r.total_payroll_runs, 1)?;
    r.total_volume_kesh  = safe_add(r.total_volume_kesh, total_gross_kesh)?;

    emit!(PayrollRunFinalized {
        schedule:         s.key(),
        employer:         ctx.accounts.employer.key(),
        recipients_paid,
        total_gross_kesh,
        total_fee_kesh:   total_fee,
        next_run_ts:      s.next_run_ts,
        run_count:        s.run_count,
        timestamp:        now,
    });
    Ok(())
}

// ─── 1F  Pause / Resume Payroll Schedule ──────────────────────────────────────

#[derive(Accounts)]
pub struct PausePayrollSchedule<'info> {
    #[account(mut)]
    pub employer: Signer<'info>,
    #[account(
        mut,
        constraint = schedule.employer == employer.key() @ PaymentError::Unauthorized,
    )]
    pub schedule: Box<Account<'info, PayrollSchedule>>,
}

pub fn pause_payroll_schedule(ctx: Context<PausePayrollSchedule>) -> Result<()> {
    ctx.accounts.schedule.status = STATUS_PAUSED;
    Ok(())
}

pub fn resume_payroll_schedule(ctx: Context<PausePayrollSchedule>) -> Result<()> {
    ctx.accounts.schedule.status = STATUS_ACTIVE;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — SUPPLIER PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 2A  Create Supplier Payment (escrow funds) ───────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateSupplierPaymentParams {
    pub supplier_name:       String,
    pub invoice_ref:         String,
    pub amount_kesh:         u64,
    pub condition_type:      u8,
    /// Meaning depends on condition_type:
    ///   COND_NONE         → ignored (pass 0)
    ///   COND_ORACLE_PRICE → minimum KES/USD price (in oracle feed units)
    ///   COND_DATE         → unix timestamp on/after which funds release
    ///   COND_MULTISIG     → required number of approvals
    pub condition_value:     u64,
}

#[derive(Accounts)]
#[instruction(p: CreateSupplierPaymentParams)]
pub struct CreateSupplierPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: supplier wallet — stored for payout; not a signer
    pub supplier_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = SZ_SUPPLIER_PAYMENT,
        seeds = [SUPPLIER_PAYMENT_SEED, payer.key().as_ref(), p.invoice_ref.as_bytes()],
        bump
    )]
    pub payment: Box<Account<'info, SupplierPayment>>,

    /// Payer's KESH ATA — funds drawn from here into escrow
    #[account(
        mut,
        constraint = payer_token_account.owner == payer.key()      @ PaymentError::Unauthorized,
        constraint = payer_token_account.mint  == kesh_mint.key()  @ PaymentError::Unauthorized,
    )]
    pub payer_token_account: Box<Account<'info, TokenAccount>>,

    /// Dedicated escrow ATA — owned by the payment PDA
    #[account(
        mut,
        seeds = [SUPPLIER_ESCROW_SEED, payment.key().as_ref()],
        bump,
        constraint = escrow.mint == kesh_mint.key() @ PaymentError::Unauthorized,
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    pub kesh_mint:     Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_supplier_payment(
    ctx: Context<CreateSupplierPayment>,
    p: CreateSupplierPaymentParams,
) -> Result<()> {
    require!(p.supplier_name.len() <= MAX_SUPPLIER_NAME, PaymentError::Unauthorized);
    require!(p.invoice_ref.len()   <= MAX_INVOICE_REF,   PaymentError::Unauthorized);
    require_min_amount(p.amount_kesh)?;

    // Immediately move funds into escrow
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.payer_token_account.to_account_info(),
                to:        ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        p.amount_kesh,
    )?;

    let now    = Clock::get()?.unix_timestamp;
    let status = if p.condition_type == COND_NONE {
        STATUS_ACTIVE
    } else {
        STATUS_PENDING_CONDITION
    };

    let pay = &mut ctx.accounts.payment;
    pay.payer              = ctx.accounts.payer.key();
    pay.supplier_wallet    = ctx.accounts.supplier_wallet.key();
    pay.supplier_name      = p.supplier_name.clone();
    pay.invoice_ref        = p.invoice_ref;
    pay.amount_kesh        = p.amount_kesh;
    pay.condition_type     = p.condition_type;
    pay.condition_value    = p.condition_value;
    pay.multisig_approvals = 0;
    pay.status             = status;
    pay.created_at         = now;
    pay.executed_at        = 0;
    pay.escrowed_amount    = p.amount_kesh;

    emit!(SupplierPaymentCreated {
        payment:         pay.key(),
        payer:           pay.payer,
        supplier_wallet: pay.supplier_wallet,
        supplier_name:   p.supplier_name,
        invoice_ref:     pay.invoice_ref.clone(),
        amount_kesh:     pay.amount_kesh,
        condition_type:  pay.condition_type,
        condition_value: pay.condition_value,
        timestamp:       now,
    });
    emit!(SupplierPaymentFundsEscrowed {
        payment:     pay.key(),
        amount_kesh: p.amount_kesh,
        timestamp:   now,
    });
    Ok(())
}

// ─── 2B  Approve Supplier Payment (multisig path) ────────────────────────────

#[derive(Accounts)]
pub struct ApproveSupplierPayment<'info> {
    #[account(mut)]
    pub approver: Signer<'info>,

    #[account(
        mut,
        constraint = payment.is_live()                    @ PaymentError::PaymentCancelled,
        constraint = payment.condition_type == COND_MULTISIG @ PaymentError::ConditionNotMet,
    )]
    pub payment: Box<Account<'info, SupplierPayment>>,
}

pub fn approve_supplier_payment(ctx: Context<ApproveSupplierPayment>) -> Result<()> {
    let pay = &mut ctx.accounts.payment;
    pay.multisig_approvals = pay.multisig_approvals
        .checked_add(1).ok_or(PaymentError::MathOverflow)?;

    let now = Clock::get()?.unix_timestamp;
    emit!(SupplierPaymentApproved {
        payment:          pay.key(),
        approver:         ctx.accounts.approver.key(),
        approvals_so_far: pay.multisig_approvals,
        threshold:        pay.condition_value as u8,
        timestamp:        now,
    });
    Ok(())
}

// ─── 2C  Execute Supplier Payment (release escrow to supplier) ────────────────

#[derive(Accounts)]
pub struct ExecuteSupplierPayment<'info> {
    /// Any party can trigger execution once condition is met
    #[account(mut)]
    pub executor: Signer<'info>,

    #[account(
        mut,
        constraint = payment.is_live() @ PaymentError::PaymentCancelled,
    )]
    pub payment: Box<Account<'info, SupplierPayment>>,

    /// CHECK: mneti-oracle PriceFeed account (feed 0 = KES/USD).
    /// Only used when condition_type == COND_ORACLE_PRICE.
    /// Pass any pubkey (e.g. System program) for other condition types —
    /// the handler ignores it.
    pub oracle_feed: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [SUPPLIER_ESCROW_SEED, payment.key().as_ref()],
        bump,
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = supplier_token_account.owner == payment.supplier_wallet @ PaymentError::Unauthorized,
        constraint = supplier_token_account.mint  == escrow.mint             @ PaymentError::Unauthorized,
    )]
    pub supplier_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = fee_collector.mint == escrow.mint @ PaymentError::Unauthorized,
    )]
    pub fee_collector: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub registry: Box<Account<'info, PaymentRegistry>>,

    pub token_program: Program<'info, Token>,
}

pub fn execute_supplier_payment(
    ctx: Context<ExecuteSupplierPayment>,
    travel_rule_ref: Option<String>,
) -> Result<()> {
    let now     = Clock::get()?.unix_timestamp;
    let payment = &ctx.accounts.payment;

    // ── Evaluate condition ──────────────────────────────────────────────────
    let oracle_price = if payment.condition_type == COND_ORACLE_PRICE {
        let data = ctx.accounts.oracle_feed.try_borrow_data()?;
        parse_oracle_price(&data, now)?
    } else {
        0u64
    };
    require!(payment.condition_met(now, oracle_price), PaymentError::ConditionNotMet);

    // ── Travel Rule gate ────────────────────────────────────────────────────
    if requires_travel_rule(payment.amount_kesh) {
        let r = travel_rule_ref.as_deref().unwrap_or("");
        require!(!r.is_empty(), PaymentError::TravelRuleRefRequired);
    }

    let gross       = payment.escrowed_amount;
    let (net, fee)  = deduct_fee(gross, FEE_SUPPLIER_BPS)?;
    let payment_key = payment.key();

    // Build PDA signer for escrow
    let (_, bump) = Pubkey::find_program_address(
        &[SUPPLIER_ESCROW_SEED, payment_key.as_ref()],
        ctx.program_id,
    );
    let signer_seeds: &[&[&[u8]]] = &[&[
        SUPPLIER_ESCROW_SEED,
        payment_key.as_ref(),
        &[bump],
    ]];

    // Transfer net → supplier
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.escrow.to_account_info(),
                to:        ctx.accounts.supplier_token_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer_seeds,
        ),
        net,
    )?;

    // Transfer fee → collector
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.escrow.to_account_info(),
                    to:        ctx.accounts.fee_collector.to_account_info(),
                    authority: ctx.accounts.escrow.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;
    }

    let payment = &mut ctx.accounts.payment;
    payment.status          = STATUS_COMPLETED;
    payment.executed_at     = now;
    payment.escrowed_amount = 0;

    let r = &mut ctx.accounts.registry;
    r.total_supplier_payments = safe_add(r.total_supplier_payments, 1)?;
    r.total_volume_kesh       = safe_add(r.total_volume_kesh, gross)?;

    emit!(SupplierPaymentExecuted {
        payment:         payment_key,
        payer:           payment.payer,
        supplier_wallet: payment.supplier_wallet,
        net_amount:      net,
        fee_amount:      fee,
        travel_rule_ref,
        timestamp:       now,
    });
    Ok(())
}

// ─── 2D  Cancel Supplier Payment (refund escrow) ──────────────────────────────

#[derive(Accounts)]
pub struct CancelSupplierPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = payment.payer   == payer.key() @ PaymentError::Unauthorized,
        constraint = payment.is_live()               @ PaymentError::PaymentCancelled,
    )]
    pub payment: Box<Account<'info, SupplierPayment>>,

    #[account(
        mut,
        seeds = [SUPPLIER_ESCROW_SEED, payment.key().as_ref()],
        bump,
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = payer_token_account.owner == payer.key()    @ PaymentError::Unauthorized,
        constraint = payer_token_account.mint  == escrow.mint    @ PaymentError::Unauthorized,
    )]
    pub payer_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn cancel_supplier_payment(ctx: Context<CancelSupplierPayment>) -> Result<()> {
    let refund      = ctx.accounts.payment.escrowed_amount;
    let payment_key = ctx.accounts.payment.key();

    let (_, bump) = Pubkey::find_program_address(
        &[SUPPLIER_ESCROW_SEED, payment_key.as_ref()],
        ctx.program_id,
    );
    let signer_seeds: &[&[&[u8]]] = &[&[
        SUPPLIER_ESCROW_SEED,
        payment_key.as_ref(),
        &[bump],
    ]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.escrow.to_account_info(),
                to:        ctx.accounts.payer_token_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            },
            signer_seeds,
        ),
        refund,
    )?;

    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.payment.status          = STATUS_CANCELLED;
    ctx.accounts.payment.escrowed_amount = 0;

    emit!(SupplierPaymentCancelled {
        payment:       payment_key,
        payer:         ctx.accounts.payer.key(),
        refunded_to:   ctx.accounts.payer_token_account.owner,
        refund_amount: refund,
        timestamp:     now,
    });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — RECURRING PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 3A  Create Recurring Payment ─────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateRecurringPaymentParams {
    pub memo:                 String,
    pub amount_per_execution: u64,
    pub interval_seconds:     i64,
    /// 0 = unlimited
    pub max_executions:       u32,
    /// If 0, first execution is scheduled at now + interval_seconds
    pub first_execution_ts:   i64,
}

#[derive(Accounts)]
#[instruction(p: CreateRecurringPaymentParams)]
pub struct CreateRecurringPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: recipient wallet
    pub recipient: UncheckedAccount<'info>,

    #[account(
        init,
        payer = payer,
        space = SZ_RECURRING_PAYMENT,
        seeds = [RECURRING_PAYMENT_SEED, payer.key().as_ref(), recipient.key().as_ref()],
        bump
    )]
    pub payment: Box<Account<'info, RecurringPayment>>,

    pub system_program: Program<'info, System>,
}

pub fn create_recurring_payment(
    ctx: Context<CreateRecurringPayment>,
    p: CreateRecurringPaymentParams,
) -> Result<()> {
    require!(p.memo.len()           <= MAX_RECURRING_MEMO, PaymentError::Unauthorized);
    require!(p.interval_seconds     > 0,                   PaymentError::InvalidInterval);
    require_min_amount(p.amount_per_execution)?;

    let now = Clock::get()?.unix_timestamp;
    let pay = &mut ctx.accounts.payment;
    pay.payer                = ctx.accounts.payer.key();
    pay.recipient            = ctx.accounts.recipient.key();
    pay.memo                 = p.memo.clone();
    pay.amount_per_execution = p.amount_per_execution;
    pay.interval_seconds     = p.interval_seconds;
    pay.next_execution_ts    = if p.first_execution_ts > 0 {
        p.first_execution_ts
    } else {
        now + p.interval_seconds
    };
    pay.last_execution_ts    = 0;
    pay.execution_count      = 0;
    pay.max_executions       = p.max_executions;
    pay.status               = STATUS_ACTIVE;
    pay.created_at           = now;
    pay.total_paid           = 0;

    emit!(RecurringPaymentCreated {
        payment:               pay.key(),
        payer:                 pay.payer,
        recipient:             pay.recipient,
        memo:                  p.memo,
        amount_per_execution:  pay.amount_per_execution,
        interval_seconds:      pay.interval_seconds,
        max_executions:        pay.max_executions,
        timestamp:             now,
    });
    Ok(())
}

// ─── 3B  Execute Recurring Payment ────────────────────────────────────────────

#[derive(Accounts)]
pub struct ExecuteRecurringPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = payment.payer == payer.key()                                    @ PaymentError::Unauthorized,
        constraint = payment.is_active()                                             @ PaymentError::PaymentCancelled,
        constraint = payment.is_due(Clock::get().unwrap().unix_timestamp)            @ PaymentError::RecurringNotDue,
        constraint = payment.remaining()                                             @ PaymentError::MaxExecutionsReached,
    )]
    pub payment: Box<Account<'info, RecurringPayment>>,

    #[account(
        mut,
        constraint = payer_token_account.owner == payer.key()     @ PaymentError::Unauthorized,
        constraint = payer_token_account.mint  == kesh_mint.key() @ PaymentError::Unauthorized,
    )]
    pub payer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = recipient_token_account.owner == payment.recipient @ PaymentError::Unauthorized,
        constraint = recipient_token_account.mint  == kesh_mint.key()   @ PaymentError::Unauthorized,
    )]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = fee_collector.mint == kesh_mint.key() @ PaymentError::Unauthorized,
    )]
    pub fee_collector: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub registry: Box<Account<'info, PaymentRegistry>>,

    pub kesh_mint:     Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn execute_recurring_payment(ctx: Context<ExecuteRecurringPayment>) -> Result<()> {
    let gross       = ctx.accounts.payment.amount_per_execution;
    let (net, fee)  = deduct_fee(gross, FEE_RECURRING_BPS)?;

    require!(
        ctx.accounts.payer_token_account.amount >= gross,
        PaymentError::InsufficientFunds
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.payer_token_account.to_account_info(),
                to:        ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        ),
        net,
    )?;

    if fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.payer_token_account.to_account_info(),
                    to:        ctx.accounts.fee_collector.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    let now = Clock::get()?.unix_timestamp;
    let pay = &mut ctx.accounts.payment;
    pay.last_execution_ts = now;
    pay.next_execution_ts = safe_add(now as u64, pay.interval_seconds as u64)? as i64;
    pay.execution_count   = pay.execution_count.checked_add(1).ok_or(PaymentError::MathOverflow)?;
    pay.total_paid        = safe_add(pay.total_paid, net)?;

    // Auto-complete when max reached
    if pay.max_executions > 0 && pay.execution_count >= pay.max_executions {
        pay.status = STATUS_COMPLETED;
    }

    let r = &mut ctx.accounts.registry;
    r.total_recurring_executions = safe_add(r.total_recurring_executions, 1)?;
    r.total_volume_kesh          = safe_add(r.total_volume_kesh, gross)?;

    emit!(RecurringPaymentExecuted {
        payment:           pay.key(),
        payer:             pay.payer,
        recipient:         pay.recipient,
        net_amount:        net,
        fee_amount:        fee,
        execution_count:   pay.execution_count,
        next_execution_ts: pay.next_execution_ts,
        timestamp:         now,
    });
    Ok(())
}

// ─── 3C  Pause / Resume / Cancel Recurring Payment ────────────────────────────

#[derive(Accounts)]
pub struct MutateRecurringPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        constraint = payment.payer == payer.key() @ PaymentError::Unauthorized,
    )]
    pub payment: Box<Account<'info, RecurringPayment>>,
}

pub fn pause_recurring_payment(ctx: Context<MutateRecurringPayment>) -> Result<()> {
    ctx.accounts.payment.status = STATUS_PAUSED;
    let now = Clock::get()?.unix_timestamp;
    emit!(RecurringPaymentPaused { payment: ctx.accounts.payment.key(), paused_by: ctx.accounts.payer.key(), timestamp: now });
    Ok(())
}

pub fn resume_recurring_payment(ctx: Context<MutateRecurringPayment>) -> Result<()> {
    ctx.accounts.payment.status = STATUS_ACTIVE;
    let now = Clock::get()?.unix_timestamp;
    emit!(RecurringPaymentResumed { payment: ctx.accounts.payment.key(), resumed_by: ctx.accounts.payer.key(), timestamp: now });
    Ok(())
}

pub fn cancel_recurring_payment(ctx: Context<MutateRecurringPayment>) -> Result<()> {
    ctx.accounts.payment.status = STATUS_CANCELLED;
    let now = Clock::get()?.unix_timestamp;
    emit!(RecurringPaymentCancelled { payment: ctx.accounts.payment.key(), cancelled_by: ctx.accounts.payer.key(), timestamp: now });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — CONDITIONAL GRANTS (NGO / Government)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 4A  Create Conditional Grant ─────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateConditionalGrantParams {
    pub grant_name:         String,
    pub total_amount:       u64,
    /// 0 = no expiry
    pub expiry_ts:          i64,
    /// Plain-language condition descriptions.  Vec length ≤ MAX_GRANT_CONDITIONS.
    pub condition_descs:    Vec<String>,
}

#[derive(Accounts)]
#[instruction(p: CreateConditionalGrantParams)]
pub struct CreateConditionalGrant<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = SZ_COND_GRANT,
        seeds = [COND_GRANT_SEED, authority.key().as_ref(), p.grant_name.as_bytes()],
        bump
    )]
    pub grant: Box<Account<'info, ConditionalGrant>>,

    #[account(
        mut,
        constraint = authority_token_account.owner == authority.key()    @ PaymentError::Unauthorized,
        constraint = authority_token_account.mint  == kesh_mint.key()    @ PaymentError::Unauthorized,
    )]
    pub authority_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [COND_GRANT_ESCROW_SEED, grant.key().as_ref()],
        bump,
        constraint = grant_escrow.mint == kesh_mint.key() @ PaymentError::Unauthorized,
    )]
    pub grant_escrow: Box<Account<'info, TokenAccount>>,

    pub kesh_mint:      Box<Account<'info, Mint>>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn create_conditional_grant(
    ctx: Context<CreateConditionalGrant>,
    p: CreateConditionalGrantParams,
) -> Result<()> {
    require!(p.grant_name.len()        <= MAX_GRANT_NAME,       PaymentError::Unauthorized);
    require!(p.condition_descs.len()   <= MAX_GRANT_CONDITIONS, PaymentError::Unauthorized);
    require_min_amount(p.total_amount)?;

    // Lock all funds in escrow at creation
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.authority_token_account.to_account_info(),
                to:        ctx.accounts.grant_escrow.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        p.total_amount,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let conditions: Vec<GrantCondition> = p.condition_descs.iter().map(|d| GrantCondition {
        description:  d.clone(),
        satisfied:    false,
        satisfied_at: 0,
    }).collect();

    let g = &mut ctx.accounts.grant;
    g.authority        = ctx.accounts.authority.key();
    g.grant_name       = p.grant_name.clone();
    g.total_amount     = p.total_amount;
    g.disbursed_amount = 0;
    // All funds locked until conditions satisfied
    g.locked_amount    = p.total_amount;
    g.status           = STATUS_ACTIVE;
    g.expiry_ts        = p.expiry_ts;
    g.recipient_count  = 0;
    g.created_at       = now;
    g.conditions       = conditions;

    emit!(ConditionalGrantCreated {
        grant:        g.key(),
        authority:    g.authority,
        grant_name:   p.grant_name,
        total_amount: g.total_amount,
        expiry_ts:    g.expiry_ts,
        timestamp:    now,
    });
    emit!(GrantFundsDeposited {
        grant:       g.key(),
        depositor:   ctx.accounts.authority.key(),
        amount_kesh: p.total_amount,
        timestamp:   now,
    });
    Ok(())
}

// ─── 4B  Satisfy Grant Condition ──────────────────────────────────────────────

#[derive(Accounts)]
pub struct SatisfyGrantCondition<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = grant.authority == authority.key() @ PaymentError::Unauthorized,
        constraint = grant.is_active()                  @ PaymentError::PaymentCancelled,
    )]
    pub grant: Box<Account<'info, ConditionalGrant>>,
}

pub fn satisfy_grant_condition(
    ctx: Context<SatisfyGrantCondition>,
    condition_index: u8,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.grant.is_expired(now), PaymentError::GrantExpired);

    let idx = condition_index as usize;
    require!(idx < ctx.accounts.grant.conditions.len(),    PaymentError::GrantConditionOutOfRange);
    require!(!ctx.accounts.grant.conditions[idx].satisfied, PaymentError::GrantConditionAlreadySatisfied);

    ctx.accounts.grant.conditions[idx].satisfied    = true;
    ctx.accounts.grant.conditions[idx].satisfied_at = now;

    // Unlock the tranche for this condition
    let unlock = ctx.accounts.grant.per_condition_unlock();
    ctx.accounts.grant.locked_amount =
        ctx.accounts.grant.locked_amount.saturating_sub(unlock);

    emit!(GrantConditionSatisfied {
        grant:           ctx.accounts.grant.key(),
        condition_index,
        unlocked_amount: unlock,
        timestamp:       now,
    });
    Ok(())
}

// ─── 4C  Disburse Conditional Grant ───────────────────────────────────────────

#[derive(Accounts)]
pub struct DisburseConditionalGrant<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = grant.authority == authority.key() @ PaymentError::Unauthorized,
        constraint = grant.is_active()                  @ PaymentError::PaymentCancelled,
    )]
    pub grant: Box<Account<'info, ConditionalGrant>>,

    #[account(
        mut,
        seeds = [COND_GRANT_ESCROW_SEED, grant.key().as_ref()],
        bump,
    )]
    pub grant_escrow: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub registry: Box<Account<'info, PaymentRegistry>>,

    pub token_program: Program<'info, Token>,
}

pub fn disburse_conditional_grant(
    ctx: Context<DisburseConditionalGrant>,
    amount: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let g   = &ctx.accounts.grant;
    require!(!g.is_expired(now), PaymentError::GrantExpired);
    require!(g.available() >= amount, PaymentError::GrantOverdisbursement);

    let grant_key = g.key();
    let (_, bump) = Pubkey::find_program_address(
        &[COND_GRANT_ESCROW_SEED, grant_key.as_ref()],
        ctx.program_id,
    );
    let signer_seeds: &[&[&[u8]]] = &[&[
        COND_GRANT_ESCROW_SEED,
        grant_key.as_ref(),
        &[bump],
    ]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.grant_escrow.to_account_info(),
                to:        ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.grant_escrow.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    let g = &mut ctx.accounts.grant;
    g.disbursed_amount = safe_add(g.disbursed_amount, amount)?;
    g.recipient_count  = g.recipient_count.checked_add(1).ok_or(PaymentError::MathOverflow)?;

    let r = &mut ctx.accounts.registry;
    r.total_grants_disbursed = safe_add(r.total_grants_disbursed, amount)?;
    r.total_volume_kesh      = safe_add(r.total_volume_kesh, amount)?;

    emit!(ConditionalGrantDisbursed {
        grant:       grant_key,
        authority:   ctx.accounts.authority.key(),
        recipient:   ctx.accounts.recipient_token_account.owner,
        amount_kesh: amount,
        timestamp:   now,
    });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — INVOICE NFT FINANCING
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 5A  Issue Invoice NFT ────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct IssueInvoiceNftParams {
    pub memo:        String,
    pub face_value:  u64,
    pub due_date:    i64,
}

#[derive(Accounts)]
#[instruction(p: IssueInvoiceNftParams)]
pub struct IssueInvoiceNft<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,

    /// CHECK: debtor wallet — buyer who will repay the invoice
    pub debtor: UncheckedAccount<'info>,

    #[account(
        init,
        payer = issuer,
        space = SZ_INVOICE_NFT,
        seeds = [
            INVOICE_NFT_SEED,
            issuer.key().as_ref(),
            debtor.key().as_ref(),
            &p.due_date.to_le_bytes(),
        ],
        bump
    )]
    pub invoice: Box<Account<'info, InvoiceNft>>,

    pub system_program: Program<'info, System>,
}

pub fn issue_invoice_nft(
    ctx: Context<IssueInvoiceNft>,
    p: IssueInvoiceNftParams,
) -> Result<()> {
    require!(p.memo.len()  <= MAX_INVOICE_MEMO, PaymentError::Unauthorized);
    require_min_amount(p.face_value)?;
    let now = Clock::get()?.unix_timestamp;
    require!(p.due_date > now, PaymentError::InvalidDueDate);

    let inv           = &mut ctx.accounts.invoice;
    inv.issuer        = ctx.accounts.issuer.key();
    inv.debtor        = ctx.accounts.debtor.key();
    inv.memo          = p.memo.clone();
    inv.face_value    = p.face_value;
    inv.financed_amount = 0;
    inv.financer      = Pubkey::default();
    inv.due_date      = p.due_date;
    inv.paid          = false;
    inv.financed      = false;
    inv.created_at    = now;

    emit!(InvoiceNftIssued {
        invoice:    inv.key(),
        issuer:     inv.issuer,
        debtor:     inv.debtor,
        memo:       p.memo,
        face_value: inv.face_value,
        due_date:   inv.due_date,
        timestamp:  now,
    });
    Ok(())
}

// ─── 5B  Finance Invoice (financer pays issuer, holds claim over debtor) ──────

#[derive(Accounts)]
pub struct FinanceInvoice<'info> {
    #[account(mut)]
    pub financer: Signer<'info>,

    #[account(
        mut,
        constraint = !invoice.paid      @ PaymentError::InvoiceAlreadyPaid,
        constraint = !invoice.financed  @ PaymentError::InvoiceAlreadyFinanced,
    )]
    pub invoice: Box<Account<'info, InvoiceNft>>,

    /// Financer pays from their KESH ATA
    #[account(
        mut,
        constraint = financer_token_account.owner == financer.key()    @ PaymentError::Unauthorized,
        constraint = financer_token_account.mint  == kesh_mint.key()   @ PaymentError::Unauthorized,
    )]
    pub financer_token_account: Box<Account<'info, TokenAccount>>,

    /// Issuer receives the advance (face_value − financing_fee)
    #[account(
        mut,
        constraint = issuer_token_account.owner == invoice.issuer  @ PaymentError::Unauthorized,
        constraint = issuer_token_account.mint  == kesh_mint.key() @ PaymentError::Unauthorized,
    )]
    pub issuer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = fee_collector.mint == kesh_mint.key() @ PaymentError::Unauthorized,
    )]
    pub fee_collector: Box<Account<'info, TokenAccount>>,

    pub kesh_mint:     Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn finance_invoice(ctx: Context<FinanceInvoice>) -> Result<()> {
    let face        = ctx.accounts.invoice.face_value;
    let fee         = ctx.accounts.invoice.financing_fee();
    let advance     = ctx.accounts.invoice.advance_amount();

    require!(
        ctx.accounts.financer_token_account.amount >= face,
        PaymentError::InsufficientFunds
    );

    // Advance → issuer
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.financer_token_account.to_account_info(),
                to:        ctx.accounts.issuer_token_account.to_account_info(),
                authority: ctx.accounts.financer.to_account_info(),
            },
        ),
        advance,
    )?;

    // Fee → protocol collector
    if fee > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.financer_token_account.to_account_info(),
                    to:        ctx.accounts.fee_collector.to_account_info(),
                    authority: ctx.accounts.financer.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    let now              = Clock::get()?.unix_timestamp;
    let inv              = &mut ctx.accounts.invoice;
    inv.financed         = true;
    inv.financed_amount  = advance;
    inv.financer         = ctx.accounts.financer.key();

    emit!(InvoiceFinanced {
        invoice:        inv.key(),
        financer:       ctx.accounts.financer.key(),
        advance_amount: advance,
        financing_fee:  fee,
        timestamp:      now,
    });
    Ok(())
}

// ─── 5C  Repay Invoice (debtor pays face value back) ─────────────────────────
/// If invoice is financed, payment goes to the financer.
/// If not financed, payment goes directly to the issuer.

#[derive(Accounts)]
pub struct RepayInvoice<'info> {
    #[account(mut)]
    pub debtor: Signer<'info>,

    #[account(
        mut,
        constraint = invoice.debtor == debtor.key() @ PaymentError::Unauthorized,
        constraint = !invoice.paid                  @ PaymentError::InvoiceAlreadyPaid,
    )]
    pub invoice: Box<Account<'info, InvoiceNft>>,

    #[account(
        mut,
        constraint = debtor_token_account.owner == debtor.key()    @ PaymentError::Unauthorized,
        constraint = debtor_token_account.mint  == kesh_mint.key() @ PaymentError::Unauthorized,
    )]
    pub debtor_token_account: Box<Account<'info, TokenAccount>>,

    /// Must be financer ATA if invoice is financed, issuer ATA otherwise.
    /// Enforced off-chain by the SDK — on-chain we trust the caller to pass correctly.
    #[account(mut)]
    pub recipient_token_account: Box<Account<'info, TokenAccount>>,

    pub kesh_mint:     Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

pub fn repay_invoice(ctx: Context<RepayInvoice>) -> Result<()> {
    let face = ctx.accounts.invoice.face_value;
    require!(
        ctx.accounts.debtor_token_account.amount >= face,
        PaymentError::InsufficientFunds
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.debtor_token_account.to_account_info(),
                to:        ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.debtor.to_account_info(),
            },
        ),
        face,
    )?;

    let now                    = Clock::get()?.unix_timestamp;
    ctx.accounts.invoice.paid  = true;

    emit!(InvoiceRepaid {
        invoice:   ctx.accounts.invoice.key(),
        debtor:    ctx.accounts.debtor.key(),
        amount:    face,
        timestamp: now,
    });
    Ok(())
}
