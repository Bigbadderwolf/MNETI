use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("Vau1tSMARTmneti5Ph4seXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod mneti_vault {
    use super::*;

    // ─── Individual Vault ──────────────────────────────────────────────────────

    pub fn create_individual_vault(
        ctx: Context<CreateIndividualVault>,
        params: CreateIndividualVaultParams,
    ) -> Result<()> {
        instructions::create_individual_vault(ctx, params)
    }

    pub fn individual_deposit(
        ctx: Context<IndividualDeposit>,
        amount: u64,
    ) -> Result<()> {
        instructions::individual_deposit(ctx, amount)
    }

    pub fn individual_withdraw(
        ctx: Context<IndividualWithdraw>,
        amount: u64,
    ) -> Result<()> {
        instructions::individual_withdraw(ctx, amount)
    }

    pub fn harvest_individual_yield(
        ctx: Context<HarvestIndividualYield>,
    ) -> Result<()> {
        instructions::harvest_individual_yield(ctx)
    }

    pub fn add_savings_goal(
        ctx: Context<AddSavingsGoal>,
        params: AddSavingsGoalParams,
    ) -> Result<()> {
        instructions::add_savings_goal(ctx, params)
    }

    pub fn close_individual_vault(
        ctx: Context<CloseIndividualVault>,
    ) -> Result<()> {
        instructions::close_individual_vault(ctx)
    }

    // ─── Chama Vault ───────────────────────────────────────────────────────────

    pub fn create_chama_vault(
        ctx: Context<CreateChamaVault>,
        params: CreateChamaVaultParams,
    ) -> Result<()> {
        instructions::create_chama_vault(ctx, params)
    }

    pub fn add_chama_member(
        ctx: Context<AddChamaMember>,
    ) -> Result<()> {
        instructions::add_chama_member(ctx)
    }

    pub fn chama_contribute(
        ctx: Context<ChamaContribute>,
        amount: u64,
    ) -> Result<()> {
        instructions::chama_contribute(ctx, amount)
    }

    pub fn create_chama_proposal(
        ctx: Context<CreateChamaProposal>,
        params: CreateProposalParams,
    ) -> Result<()> {
        instructions::create_chama_proposal(ctx, params)
    }

    pub fn vote_chama_proposal(
        ctx: Context<VoteChamaProposal>,
        proposal_index: u32,
        vote_for: bool,
    ) -> Result<()> {
        instructions::vote_chama_proposal(ctx, proposal_index, vote_for)
    }

    pub fn execute_chama_proposal(
        ctx: Context<ExecuteChamaProposal>,
        proposal_index: u32,
    ) -> Result<()> {
        instructions::execute_chama_proposal(ctx, proposal_index)
    }

    pub fn chama_rotation_payout(
        ctx: Context<ChamaRotationPayout>,
        amount: u64,
    ) -> Result<()> {
        instructions::chama_rotation_payout(ctx, amount)
    }

    // ─── SME Vault ─────────────────────────────────────────────────────────────

    pub fn create_sme_vault(
        ctx: Context<CreateSmeVault>,
        params: CreateSmeVaultParams,
    ) -> Result<()> {
        instructions::create_sme_vault(ctx, params)
    }

    pub fn sme_deposit(
        ctx: Context<SmeDeposit>,
        amount: u64,
    ) -> Result<()> {
        instructions::sme_deposit(ctx, amount)
    }

    pub fn sme_withdraw(
        ctx: Context<SmeWithdraw>,
        amount: u64,
    ) -> Result<()> {
        instructions::sme_withdraw(ctx, amount)
    }

    pub fn set_payroll_reserve(
        ctx: Context<SetPayrollReserve>,
        amount: u64,
    ) -> Result<()> {
        instructions::set_payroll_reserve(ctx, amount)
    }

    pub fn set_tax_reserve(
        ctx: Context<SetTaxReserve>,
        amount: u64,
    ) -> Result<()> {
        instructions::set_tax_reserve(ctx, amount)
    }

    // ─── Enterprise Vault ──────────────────────────────────────────────────────

    pub fn create_enterprise_vault(
        ctx: Context<CreateEnterpriseVault>,
        params: CreateEnterpriseVaultParams,
    ) -> Result<()> {
        instructions::create_enterprise_vault(ctx, params)
    }

    pub fn enterprise_deposit(
        ctx: Context<EnterpriseDeposit>,
        amount: u64,
    ) -> Result<()> {
        instructions::enterprise_deposit(ctx, amount)
    }

    pub fn enterprise_snapshot(
        ctx: Context<EnterpriseSnapshot>,
    ) -> Result<()> {
        instructions::enterprise_snapshot(ctx)
    }

    // ─── NGO Grant Vault ───────────────────────────────────────────────────────

    pub fn create_ngo_vault(
        ctx: Context<CreateNgoVault>,
        params: CreateNgoVaultParams,
    ) -> Result<()> {
        instructions::create_ngo_vault(ctx, params)
    }

    pub fn ngo_deposit(
        ctx: Context<NgoDeposit>,
        amount: u64,
    ) -> Result<()> {
        instructions::ngo_deposit(ctx, amount)
    }

    pub fn complete_milestone(
        ctx: Context<CompleteMilestone>,
        milestone_index: u8,
    ) -> Result<()> {
        instructions::complete_milestone(ctx, milestone_index)
    }

    pub fn ngo_disburse(
        ctx: Context<NgoDisbure>,
        amount: u64,
        milestone_index: u8,
    ) -> Result<()> {
        instructions::ngo_disburse(ctx, amount, milestone_index)
    }
}
