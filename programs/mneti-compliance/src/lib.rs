// ─────────────────────────────────────────────────────────────
//  MNETI COMPLIANCE — lib.rs
//  ZK proof verifier + Soulbound credential NFTs
//
//  Credentials issued:
//  1. ComplianceCredential — after KYC ZK proof verified
//     Tier 0: Individual (phone + M-Pesa verification)
//     Tier 1: SME (business registration + KYC)
//     Tier 2: Enterprise (full institutional KYC)
//
//  2. CreditScoreCredential — after M-Pesa credit ZK proof verified
//     Score 300–499  → KES 5,000 credit limit
//     Score 500–649  → KES 50,000 credit limit
//     Score 650–749  → KES 500,000 credit limit
//     Score 750–850  → KES 5,000,000 credit limit
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

declare_id!("7D5hBC1HhbDa6eahWFeVz79EPGK56v7nxgSCzWqTCPP6");

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::{Groth16Proof, KycPublicSignals, CreditPublicSignals};

#[program]
pub mod mneti_compliance {
    use super::*;

    /// Initialize compliance registry — call once at deployment
    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        compliance_officer: Pubkey,
    ) -> Result<()> {
        instructions::initialize_registry(ctx, compliance_officer)
    }

    /// Verify KYC ZK proof and issue ComplianceCredential
    /// Called by user after generating proof locally in the app
    pub fn verify_kyc_proof(
        ctx: Context<VerifyKycProof>,
        proof: Groth16Proof,
        signals: KycPublicSignals,
    ) -> Result<()> {
        instructions::verify_kyc_proof(ctx, proof, signals)
    }

    /// Verify M-Pesa credit score ZK proof and issue CreditScoreCredential
    /// Called by user after generating proof from local M-Pesa history
    pub fn verify_credit_proof(
        ctx: Context<VerifyCreditProof>,
        proof: Groth16Proof,
        signals: CreditPublicSignals,
    ) -> Result<()> {
        instructions::verify_credit_proof(ctx, proof, signals)
    }

    /// Freeze a wallet — compliance officer only
    pub fn freeze_wallet(
        ctx: Context<FreezeWallet>,
        reason: String,
    ) -> Result<()> {
        instructions::freeze_wallet(ctx, reason)
    }

    /// Unfreeze a wallet after review — compliance officer only
    pub fn unfreeze_wallet(ctx: Context<UnfreezeWallet>) -> Result<()> {
        instructions::unfreeze_wallet(ctx)
    }

    /// Revoke a compliance credential — compliance officer only
    pub fn revoke_credential(
        ctx: Context<RevokeCredential>,
        reason: String,
    ) -> Result<()> {
        instructions::revoke_credential(ctx, reason)
    }

    /// Check compliance gate — used by other programs via CPI
    /// Returns error if wallet does not meet required tier
    pub fn check_compliance(
        ctx: Context<CheckCompliance>,
        required_tier: u8,
    ) -> Result<()> {
        instructions::check_compliance(ctx, required_tier)
    }
}
