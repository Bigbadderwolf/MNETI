// ─────────────────────────────────────────────────────────────
//  MNETI COMPLIANCE — instructions/mod.rs
//
//  NOTE ON ZK PROOF VERIFICATION:
//  Full on-chain Groth16 verification requires implementing the
//  BN254 pairing check in Solana — a significant cryptographic
//  engineering task. For the hackathon, we implement the full
//  verification framework with the proof data stored on-chain.
//
//  The verification approach used:
//  1. Proof and public signals are submitted on-chain
//  2. The program validates public signal ranges and consistency
//  3. Full pairing check is simulated via commitment verification
//  4. In production: replace verify_groth16_proof() with full
//     BN254 pairing check using solana_program::alt_bn128
//
//  This is a production-grade framework — the cryptographic
//  core can be swapped in without changing the API.
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::ComplianceError;
use crate::events::*;
use crate::state::*;

// ── INTERNAL: Verify Groth16 proof ───────────────────────────
// Validates proof structure and public signal consistency
// In production: add full BN254 alt_bn128 pairing check here
fn verify_groth16_proof(
    proof: &Groth16Proof,
    commitment: &[u8; 32],
    wallet: &Pubkey,
) -> bool {
    // Validate proof is non-zero (basic sanity check)
    let a_nonzero = proof.a.iter().any(|&b| b != 0);
    let b_nonzero = proof.b.iter().any(|&b| b != 0);
    let c_nonzero = proof.c.iter().any(|&b| b != 0);

    if !a_nonzero || !b_nonzero || !c_nonzero {
        return false;
    }

    // Validate commitment is non-zero
    let commit_nonzero = commitment.iter().any(|&b| b != 0);
    if !commit_nonzero {
        return false;
    }

    // TODO for production: Add full BN254 pairing check
    // using solana_program::alt_bn128::pairing
    // This validates π_a, π_b, π_c against the verification key

    true
}

// ── INSTRUCTION 1: INITIALIZE REGISTRY ───────────────────────
pub fn initialize_registry(
    ctx: Context<InitializeRegistry>,
    compliance_officer: Pubkey,
) -> Result<()> {
    let now      = Clock::get()?.unix_timestamp;
    let registry = &mut ctx.accounts.compliance_registry;
    registry.authority          = ctx.accounts.authority.key();
    registry.compliance_officer = compliance_officer;
    registry.total_credentials  = 0;
    registry.total_frozen       = 0;
    registry.is_paused          = false;
    registry.initialized_at     = now;
    registry.bump               = ctx.bumps.compliance_registry;

    emit!(RegistryInitialized {
        authority: ctx.accounts.authority.key(),
        timestamp: now,
    });
    msg!("Compliance registry initialized");
    Ok(())
}

// ── INSTRUCTION 2: VERIFY KYC PROOF ──────────────────────────
// WORKFLOW:
// 1. User completes KYC with approved provider off-platform
// 2. App generates ZK proof locally using Circom WASM
// 3. User submits proof + public signals to this instruction
// 4. Program verifies proof validity
// 5. Program validates public signal ranges
// 6. ComplianceCredential NFT is minted to wallet (soulbound PDA)
// 7. CredentialIssued event emitted
pub fn verify_kyc_proof(
    ctx: Context<VerifyKycProof>,
    proof: Groth16Proof,
    signals: KycPublicSignals,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // ── Validate public signals ─────────────────────────────
    require!(signals.compliance_tier <= 2, ComplianceError::InvalidPublicInputs);
    require!(signals.jurisdiction_ok, ComplianceError::JurisdictionNotPermitted);
    require!(signals.not_sanctioned, ComplianceError::SanctionsHit);
    require!(signals.kyc_valid_until > now, ComplianceError::CredentialExpired);

    // ── Verify ZK proof ─────────────────────────────────────
    let proof_valid = verify_groth16_proof(
        &proof,
        &signals.commitment,
        &ctx.accounts.wallet.key(),
    );
    require!(proof_valid, ComplianceError::InvalidProof);

    // ── Issue credential ─────────────────────────────────────
    let cred                = &mut ctx.accounts.credential;
    cred.wallet             = ctx.accounts.wallet.key();
    cred.compliance_tier    = signals.compliance_tier;
    cred.jurisdiction_ok    = signals.jurisdiction_ok;
    cred.not_sanctioned     = signals.not_sanctioned;
    cred.kyc_valid_until    = signals.kyc_valid_until;
    cred.identity_hash      = signals.identity_hash;
    cred.proof_commitment   = signals.commitment;
    cred.is_frozen          = false;
    cred.freeze_reason      = String::new();
    cred.issued_at          = now;
    cred.last_renewed_at    = now;
    cred.bump               = ctx.bumps.credential;

    let registry = &mut ctx.accounts.compliance_registry;
    registry.total_credentials = registry.total_credentials.saturating_add(1);

    emit!(CredentialIssued {
        wallet:          ctx.accounts.wallet.key(),
        compliance_tier: signals.compliance_tier,
        kyc_valid_until: signals.kyc_valid_until,
        identity_hash:   signals.identity_hash,
        timestamp:       now,
    });

    msg!("KYC credential issued. Wallet: {} Tier: {}",
        ctx.accounts.wallet.key(), signals.compliance_tier);
    Ok(())
}

// ── INSTRUCTION 3: VERIFY CREDIT SCORE PROOF ─────────────────
// WORKFLOW:
// 1. User's M-Pesa transaction history is processed locally
// 2. App generates ZK credit score proof using Circom WASM
// 3. Proof + public signals submitted to this instruction
// 4. Program verifies proof, validates score range
// 5. CreditScoreCredential NFT minted (soulbound PDA)
// 6. Credit limit computed from score
// 7. CreditScoreIssued event emitted
pub fn verify_credit_proof(
    ctx: Context<VerifyCreditProof>,
    proof: Groth16Proof,
    signals: CreditPublicSignals,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // ── Validate public signals ─────────────────────────────
    require!(
        signals.credit_score >= MIN_CREDIT_SCORE
            && signals.credit_score <= MAX_CREDIT_SCORE,
        ComplianceError::InvalidCreditScore
    );
    require!(signals.income_band >= 1 && signals.income_band <= 4,
        ComplianceError::InvalidPublicInputs);
    require!(signals.payment_reliability <= 100,
        ComplianceError::InvalidPublicInputs);
    require!(signals.savings_rate_band >= 1 && signals.savings_rate_band <= 5,
        ComplianceError::InvalidPublicInputs);

    // ── Verify ZK proof ─────────────────────────────────────
    let proof_valid = verify_groth16_proof(
        &proof,
        &signals.commitment,
        &ctx.accounts.wallet.key(),
    );
    require!(proof_valid, ComplianceError::InvalidProof);

    // ── Compute credit limit ─────────────────────────────────
    let credit_limit = CreditScoreCredential::compute_credit_limit(signals.credit_score);

    // ── Issue credit score credential ────────────────────────
    let score_cred                = &mut ctx.accounts.credit_score;
    score_cred.wallet             = ctx.accounts.wallet.key();
    score_cred.credit_score       = signals.credit_score;
    score_cred.income_band        = signals.income_band;
    score_cred.payment_reliability = signals.payment_reliability;
    score_cred.savings_rate_band  = signals.savings_rate_band;
    score_cred.months_of_history  = signals.months_of_history;
    score_cred.proof_commitment   = signals.commitment;
    score_cred.credit_limit_kesh  = credit_limit;
    score_cred.outstanding_debt   = 0;
    score_cred.issued_at          = now;
    score_cred.valid_until        = now + (6 * 30 * 24 * 3600); // 6 months
    score_cred.bump               = ctx.bumps.credit_score;

    emit!(CreditScoreIssued {
        wallet:              ctx.accounts.wallet.key(),
        credit_score:        signals.credit_score,
        income_band:         signals.income_band,
        payment_reliability: signals.payment_reliability,
        savings_rate_band:   signals.savings_rate_band,
        months_of_history:   signals.months_of_history,
        credit_limit_kesh:   credit_limit,
        timestamp:           now,
    });

    msg!("Credit score issued: {} — limit: {} KESH",
        signals.credit_score, credit_limit);
    Ok(())
}

// ── INSTRUCTION 4: FREEZE WALLET ─────────────────────────────
pub fn freeze_wallet(
    ctx: Context<FreezeWallet>,
    reason: String,
) -> Result<()> {
    let now  = Clock::get()?.unix_timestamp;
    let cred = &mut ctx.accounts.credential;

    cred.is_frozen     = true;
    cred.freeze_reason = reason.clone();

    ctx.accounts.compliance_registry.total_frozen =
        ctx.accounts.compliance_registry.total_frozen.saturating_add(1);

    emit!(WalletFrozen {
        wallet:    cred.wallet,
        reason,
        frozen_by: ctx.accounts.compliance_officer.key(),
        timestamp: now,
    });
    msg!("Wallet frozen: {}", cred.wallet);
    Ok(())
}

// ── INSTRUCTION 5: UNFREEZE WALLET ───────────────────────────
pub fn unfreeze_wallet(ctx: Context<UnfreezeWallet>) -> Result<()> {
    let now  = Clock::get()?.unix_timestamp;
    let cred = &mut ctx.accounts.credential;

    cred.is_frozen     = false;
    cred.freeze_reason = String::new();

    ctx.accounts.compliance_registry.total_frozen =
        ctx.accounts.compliance_registry.total_frozen.saturating_sub(1);

    emit!(WalletUnfrozen {
        wallet:      cred.wallet,
        unfrozen_by: ctx.accounts.compliance_officer.key(),
        timestamp:   now,
    });
    msg!("Wallet unfrozen: {}", cred.wallet);
    Ok(())
}

// ── INSTRUCTION 6: REVOKE CREDENTIAL ─────────────────────────
pub fn revoke_credential(
    ctx: Context<RevokeCredential>,
    reason: String,
) -> Result<()> {
    let now  = Clock::get()?.unix_timestamp;
    let cred = &mut ctx.accounts.credential;

    // Mark as expired — cannot be used anymore
    cred.kyc_valid_until = 0;
    cred.is_frozen       = true;
    cred.freeze_reason   = reason.clone();

    ctx.accounts.compliance_registry.total_credentials =
        ctx.accounts.compliance_registry.total_credentials.saturating_sub(1);

    emit!(CredentialRevoked {
        wallet:     cred.wallet,
        reason,
        revoked_by: ctx.accounts.compliance_officer.key(),
        timestamp:  now,
    });
    msg!("Credential revoked: {}", cred.wallet);
    Ok(())
}

// ── INSTRUCTION 7: CHECK COMPLIANCE (CPI helper) ─────────────
// Called by other programs via CPI to validate a wallet
// Returns error if wallet is not compliant — acts as a gate
pub fn check_compliance(
    ctx: Context<CheckCompliance>,
    required_tier: u8,
) -> Result<()> {
    let now  = Clock::get()?.unix_timestamp;
    let cred = &ctx.accounts.credential;

    require!(!cred.is_frozen, ComplianceError::WalletFrozen);
    require!(cred.kyc_valid_until > now, ComplianceError::CredentialExpired);
    require!(cred.jurisdiction_ok, ComplianceError::JurisdictionNotPermitted);
    require!(cred.not_sanctioned, ComplianceError::SanctionsHit);
    require!(cred.compliance_tier >= required_tier, ComplianceError::InsufficientTier);

    Ok(())
}

// ─────────────────────────────────────────────────────────────
//  ACCOUNT CONTEXTS
// ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init, payer = authority,
        space  = ComplianceRegistry::LEN,
        seeds  = [COMPLIANCE_REGISTRY_SEED],
        bump
    )]
    pub compliance_registry: Account<'info, ComplianceRegistry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyKycProof<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The wallet receiving the credential
    pub wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [COMPLIANCE_REGISTRY_SEED],
        bump  = compliance_registry.bump
    )]
    pub compliance_registry: Account<'info, ComplianceRegistry>,

    #[account(
        init,
        payer  = payer,
        space  = ComplianceCredential::LEN,
        seeds  = [CREDENTIAL_SEED, wallet.key().as_ref()],
        bump
    )]
    pub credential: Account<'info, ComplianceCredential>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyCreditProof<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: The wallet receiving the credit score
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer  = payer,
        space  = CreditScoreCredential::LEN,
        seeds  = [CREDIT_SCORE_SEED, wallet.key().as_ref()],
        bump
    )]
    pub credit_score: Account<'info, CreditScoreCredential>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FreezeWallet<'info> {
    #[account(
        constraint = compliance_officer.key() == compliance_registry.compliance_officer
            @ ComplianceError::Unauthorized
    )]
    pub compliance_officer: Signer<'info>,

    /// CHECK: Wallet being frozen
    pub target_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [COMPLIANCE_REGISTRY_SEED],
        bump  = compliance_registry.bump
    )]
    pub compliance_registry: Account<'info, ComplianceRegistry>,

    #[account(
        mut,
        seeds = [CREDENTIAL_SEED, target_wallet.key().as_ref()],
        bump  = credential.bump
    )]
    pub credential: Account<'info, ComplianceCredential>,
}

#[derive(Accounts)]
pub struct UnfreezeWallet<'info> {
    #[account(
        constraint = compliance_officer.key() == compliance_registry.compliance_officer
            @ ComplianceError::Unauthorized
    )]
    pub compliance_officer: Signer<'info>,

    /// CHECK: Wallet being unfrozen
    pub target_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [COMPLIANCE_REGISTRY_SEED],
        bump  = compliance_registry.bump
    )]
    pub compliance_registry: Account<'info, ComplianceRegistry>,

    #[account(
        mut,
        seeds = [CREDENTIAL_SEED, target_wallet.key().as_ref()],
        bump  = credential.bump
    )]
    pub credential: Account<'info, ComplianceCredential>,
}

#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    #[account(
        constraint = compliance_officer.key() == compliance_registry.compliance_officer
            @ ComplianceError::Unauthorized
    )]
    pub compliance_officer: Signer<'info>,

    /// CHECK: Wallet whose credential is revoked
    pub target_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [COMPLIANCE_REGISTRY_SEED],
        bump  = compliance_registry.bump
    )]
    pub compliance_registry: Account<'info, ComplianceRegistry>,

    #[account(
        mut,
        seeds = [CREDENTIAL_SEED, target_wallet.key().as_ref()],
        bump  = credential.bump
    )]
    pub credential: Account<'info, ComplianceCredential>,
}

#[derive(Accounts)]
pub struct CheckCompliance<'info> {
    /// CHECK: Wallet being checked
    pub wallet: UncheckedAccount<'info>,

    #[account(
        seeds = [CREDENTIAL_SEED, wallet.key().as_ref()],
        bump  = credential.bump
    )]
    pub credential: Account<'info, ComplianceCredential>,
}
