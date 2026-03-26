// ═══════════════════════════════════════════════════════════════════════════════
// mneti-payments — lib.rs
// Program entry point.  Declares all public instructions.
// Deployment order: 7th (after mneti-vault)
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("PAY6mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod mneti_payments {
    use super::*;

    // ── Registry ───────────────────────────────────────────────────────────────
    pub fn initialize_payment_registry(
        ctx: Context<InitializePaymentRegistry>,
    ) -> Result<()> {
        instructions::initialize_payment_registry(ctx)
    }

    // ── Payroll ────────────────────────────────────────────────────────────────
    pub fn create_payroll_schedule(
        ctx: Context<CreatePayrollSchedule>,
        params: CreatePayrollScheduleParams,
    ) -> Result<()> {
        instructions::create_payroll_schedule(ctx, params)
    }

    pub fn add_payroll_recipient(
        ctx: Context<AddPayrollRecipient>,
        params: AddPayrollRecipientParams,
    ) -> Result<()> {
        instructions::add_payroll_recipient(ctx, params)
    }

    pub fn deactivate_payroll_recipient(
        ctx: Context<DeactivatePayrollRecipient>,
    ) -> Result<()> {
        instructions::deactivate_payroll_recipient(ctx)
    }

    pub fn execute_payroll_recipient(
        ctx: Context<ExecutePayrollRecipient>,
    ) -> Result<()> {
        instructions::execute_payroll_recipient(ctx)
    }

    pub fn finalize_payroll_run(
        ctx: Context<FinalizePayrollRun>,
        recipients_paid:  u32,
        total_gross_kesh: u64,
    ) -> Result<()> {
        instructions::finalize_payroll_run(ctx, recipients_paid, total_gross_kesh)
    }

    pub fn pause_payroll_schedule(ctx: Context<PausePayrollSchedule>) -> Result<()> {
        instructions::pause_payroll_schedule(ctx)
    }

    pub fn resume_payroll_schedule(ctx: Context<PausePayrollSchedule>) -> Result<()> {
        instructions::resume_payroll_schedule(ctx)
    }

    // ── Supplier Payments ──────────────────────────────────────────────────────
    pub fn create_supplier_payment(
        ctx: Context<CreateSupplierPayment>,
        params: CreateSupplierPaymentParams,
    ) -> Result<()> {
        instructions::create_supplier_payment(ctx, params)
    }

    pub fn approve_supplier_payment(
        ctx: Context<ApproveSupplierPayment>,
    ) -> Result<()> {
        instructions::approve_supplier_payment(ctx)
    }

    pub fn execute_supplier_payment(
        ctx: Context<ExecuteSupplierPayment>,
        travel_rule_ref: Option<String>,
    ) -> Result<()> {
        instructions::execute_supplier_payment(ctx, travel_rule_ref)
    }

    pub fn cancel_supplier_payment(
        ctx: Context<CancelSupplierPayment>,
    ) -> Result<()> {
        instructions::cancel_supplier_payment(ctx)
    }

    // ── Recurring Payments ─────────────────────────────────────────────────────
    pub fn create_recurring_payment(
        ctx: Context<CreateRecurringPayment>,
        params: CreateRecurringPaymentParams,
    ) -> Result<()> {
        instructions::create_recurring_payment(ctx, params)
    }

    pub fn execute_recurring_payment(
        ctx: Context<ExecuteRecurringPayment>,
    ) -> Result<()> {
        instructions::execute_recurring_payment(ctx)
    }

    pub fn pause_recurring_payment(ctx: Context<MutateRecurringPayment>) -> Result<()> {
        instructions::pause_recurring_payment(ctx)
    }

    pub fn resume_recurring_payment(ctx: Context<MutateRecurringPayment>) -> Result<()> {
        instructions::resume_recurring_payment(ctx)
    }

    pub fn cancel_recurring_payment(ctx: Context<MutateRecurringPayment>) -> Result<()> {
        instructions::cancel_recurring_payment(ctx)
    }

    // ── Conditional Grants ─────────────────────────────────────────────────────
    pub fn create_conditional_grant(
        ctx: Context<CreateConditionalGrant>,
        params: CreateConditionalGrantParams,
    ) -> Result<()> {
        instructions::create_conditional_grant(ctx, params)
    }

    pub fn satisfy_grant_condition(
        ctx: Context<SatisfyGrantCondition>,
        condition_index: u8,
    ) -> Result<()> {
        instructions::satisfy_grant_condition(ctx, condition_index)
    }

    pub fn disburse_conditional_grant(
        ctx: Context<DisburseConditionalGrant>,
        amount: u64,
    ) -> Result<()> {
        instructions::disburse_conditional_grant(ctx, amount)
    }

    // ── Invoice NFT ────────────────────────────────────────────────────────────
    pub fn issue_invoice_nft(
        ctx: Context<IssueInvoiceNft>,
        params: IssueInvoiceNftParams,
    ) -> Result<()> {
        instructions::issue_invoice_nft(ctx, params)
    }

    pub fn finance_invoice(ctx: Context<FinanceInvoice>) -> Result<()> {
        instructions::finance_invoice(ctx)
    }

    pub fn repay_invoice(ctx: Context<RepayInvoice>) -> Result<()> {
        instructions::repay_invoice(ctx)
    }
}
