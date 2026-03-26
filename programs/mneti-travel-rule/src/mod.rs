// ═══════════════════════════════════════════════════════════════════════════════
// mneti-travel-rule — instructions/mod.rs
//
// All instruction handlers for the FATF Travel Rule compliance program.
//
// Sections:
//   0  Registry initialization
//   1  VASP management — register, update, deactivate, reactivate
//   2  Payload lifecycle — submit, acknowledge, reject
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::TravelRuleError;
use crate::events::*;
use crate::state::*;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 0 — VASP REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct InitializeVaspRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = SZ_VASP_REGISTRY,
        seeds = [VASP_REGISTRY_SEED],
        bump
    )]
    pub registry: Box<Account<'info, VaspRegistry>>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_vasp_registry(ctx: Context<InitializeVaspRegistry>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let r   = &mut ctx.accounts.registry;
    r.authority                  = ctx.accounts.authority.key();
    r.total_vasps_registered     = 0;
    r.total_payloads_submitted   = 0;
    r.total_volume_screened_kesh = 0;
    r.created_at                 = now;
    emit!(VaspRegistryInitialized { authority: r.authority, timestamp: now });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — VASP MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1A  Register VASP ────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterVaspParams {
    pub name:                   String,
    pub did:                    String,
    pub jurisdiction:           String,
    pub compliance_contact_uri: String,
    /// True if this VASP will initiate outgoing Travel Rule payloads
    pub is_originator_vasp:     bool,
    /// True if this VASP will receive and acknowledge incoming payloads
    pub is_beneficiary_vasp:    bool,
}

#[derive(Accounts)]
pub struct RegisterVasp<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub registry: Box<Account<'info, VaspRegistry>>,

    #[account(
        init,
        payer = authority,
        space = SZ_VASP_RECORD,
        seeds = [VASP_RECORD_SEED, authority.key().as_ref()],
        bump
    )]
    pub vasp: Box<Account<'info, VaspRecord>>,

    pub system_program: Program<'info, System>,
}

pub fn register_vasp(ctx: Context<RegisterVasp>, p: RegisterVaspParams) -> Result<()> {
    require!(p.name.len()                   <= MAX_VASP_NAME,   TravelRuleError::Unauthorized);
    require!(p.did.len()                    <= MAX_VASP_DID,    TravelRuleError::Unauthorized);
    require!(p.jurisdiction.len()           <= MAX_JURISDICTION, TravelRuleError::InvalidCountryCode);
    require!(!p.jurisdiction.is_empty(),                         TravelRuleError::InvalidCountryCode);
    require!(p.compliance_contact_uri.len() <= MAX_CONTACT_URI,  TravelRuleError::Unauthorized);

    let now = Clock::get()?.unix_timestamp;
    let v   = &mut ctx.accounts.vasp;
    v.authority               = ctx.accounts.authority.key();
    v.name                    = p.name.clone();
    v.did                     = p.did.clone();
    v.jurisdiction            = p.jurisdiction.clone();
    v.compliance_contact_uri  = p.compliance_contact_uri;
    v.is_active               = true;
    v.is_originator_vasp      = p.is_originator_vasp;
    v.is_beneficiary_vasp     = p.is_beneficiary_vasp;
    v.registered_at           = now;
    v.last_updated_at         = now;

    let r = &mut ctx.accounts.registry;
    r.total_vasps_registered = r.total_vasps_registered
        .checked_add(1).ok_or(TravelRuleError::MathOverflow)?;

    emit!(VaspRegistered {
        vasp:           v.key(),
        authority:      v.authority,
        name:           p.name,
        did:            p.did,
        jurisdiction:   p.jurisdiction,
        is_originator:  v.is_originator_vasp,
        is_beneficiary: v.is_beneficiary_vasp,
        timestamp:      now,
    });
    Ok(())
}

// ─── 1B  Update VASP Record (contact URI, DID, roles) ─────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateVaspParams {
    pub compliance_contact_uri: String,
    pub did:                    String,
    pub is_originator_vasp:     bool,
    pub is_beneficiary_vasp:    bool,
}

#[derive(Accounts)]
pub struct UpdateVasp<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = vasp.authority == authority.key() @ TravelRuleError::Unauthorized,
        constraint = vasp.is_active                    @ TravelRuleError::VaspInactive,
    )]
    pub vasp: Box<Account<'info, VaspRecord>>,
}

pub fn update_vasp(ctx: Context<UpdateVasp>, p: UpdateVaspParams) -> Result<()> {
    require!(p.did.len()                    <= MAX_VASP_DID,   TravelRuleError::Unauthorized);
    require!(p.compliance_contact_uri.len() <= MAX_CONTACT_URI, TravelRuleError::Unauthorized);

    let now = Clock::get()?.unix_timestamp;
    let v   = &mut ctx.accounts.vasp;
    v.did                   = p.did;
    v.compliance_contact_uri = p.compliance_contact_uri;
    v.is_originator_vasp    = p.is_originator_vasp;
    v.is_beneficiary_vasp   = p.is_beneficiary_vasp;
    v.last_updated_at       = now;

    emit!(VaspUpdated { vasp: v.key(), authority: ctx.accounts.authority.key(), timestamp: now });
    Ok(())
}

// ─── 1C  Deactivate VASP ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ToggleVasp<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = vasp.authority == authority.key() @ TravelRuleError::Unauthorized,
    )]
    pub vasp: Box<Account<'info, VaspRecord>>,
}

pub fn deactivate_vasp(ctx: Context<ToggleVasp>) -> Result<()> {
    ctx.accounts.vasp.is_active       = false;
    ctx.accounts.vasp.last_updated_at = Clock::get()?.unix_timestamp;
    emit!(VaspDeactivated {
        vasp:      ctx.accounts.vasp.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: ctx.accounts.vasp.last_updated_at,
    });
    Ok(())
}

// ─── 1D  Reactivate VASP ──────────────────────────────────────────────────────

pub fn reactivate_vasp(ctx: Context<ToggleVasp>) -> Result<()> {
    ctx.accounts.vasp.is_active       = true;
    ctx.accounts.vasp.last_updated_at = Clock::get()?.unix_timestamp;
    emit!(VaspReactivated {
        vasp:      ctx.accounts.vasp.key(),
        authority: ctx.accounts.authority.key(),
        timestamp: ctx.accounts.vasp.last_updated_at,
    });
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — PAYLOAD LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 2A  Submit Travel Rule Payload ───────────────────────────────────────────
/// Called by the originator VASP when initiating a cross-VASP transfer ≥ threshold.
/// The full IVMS101 payload must already be ECIES-encrypted and uploaded to IPFS
/// before this instruction is called.  Only the CID is stored on-chain.

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitTrPayloadParams {
    /// IPFS CIDv1 or Arweave TX ID of the ECIES-encrypted IVMS101 JSON blob
    pub encrypted_ivms101_cid:  String,
    /// SHA-256 hex of originator full legal name — 64 hex characters
    pub originator_name_hash:   String,
    /// SHA-256 hex of beneficiary full legal name — 64 hex characters
    pub beneficiary_name_hash:  String,
    /// ISO 3166-1 alpha-2 country code of originator
    pub originator_country:     String,
    /// ISO 3166-1 alpha-2 country code of beneficiary
    pub beneficiary_country:    String,
}

#[derive(Accounts)]
pub struct SubmitTrPayload<'info> {
    /// Originator VASP authority must sign
    #[account(mut)]
    pub originator_vasp_authority: Signer<'info>,

    /// Originator VASP record — must be active and registered as originator
    #[account(
        constraint = originator_vasp.authority == originator_vasp_authority.key() @ TravelRuleError::Unauthorized,
        constraint = originator_vasp.can_originate()                               @ TravelRuleError::NotOriginatorVasp,
    )]
    pub originator_vasp: Box<Account<'info, VaspRecord>>,

    /// Beneficiary VASP record — must be active
    #[account(
        constraint = beneficiary_vasp.is_active @ TravelRuleError::VaspInactive,
    )]
    pub beneficiary_vasp: Box<Account<'info, VaspRecord>>,

    /// CHECK: originator's Solana wallet address — only stored, not a signer
    pub originator_wallet: UncheckedAccount<'info>,

    /// CHECK: beneficiary's Solana wallet address — only stored, not a signer
    pub beneficiary_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = originator_vasp_authority,
        space = SZ_TR_PAYLOAD,
        seeds = [
            TR_PAYLOAD_SEED,
            originator_wallet.key().as_ref(),
            beneficiary_wallet.key().as_ref(),
        ],
        bump
    )]
    pub payload: Box<Account<'info, TravelRulePayload>>,

    #[account(mut)]
    pub registry: Box<Account<'info, VaspRegistry>>,

    pub system_program: Program<'info, System>,
}

pub fn submit_tr_payload(
    ctx: Context<SubmitTrPayload>,
    transfer_amount_kesh: u64,
    p: SubmitTrPayloadParams,
) -> Result<()> {
    // ── Threshold check ──────────────────────────────────────────────────────
    require!(
        transfer_amount_kesh >= TRAVEL_RULE_THRESHOLD_KESH,
        TravelRuleError::BelowThreshold
    );

    // ── CID validation ───────────────────────────────────────────────────────
    require!(!p.encrypted_ivms101_cid.is_empty(), TravelRuleError::MissingPayloadCid);
    require!(
        p.encrypted_ivms101_cid.len() <= MAX_PAYLOAD_CID,
        TravelRuleError::PayloadCidTooLong
    );

    // ── Name hash validation — must be 64 hex chars (SHA-256) ────────────────
    require!(p.originator_name_hash.len()  == 64, TravelRuleError::InvalidNameHash);
    require!(p.beneficiary_name_hash.len() == 64, TravelRuleError::InvalidNameHash);

    // ── Country code validation ───────────────────────────────────────────────
    require!(
        !p.originator_country.is_empty() && p.originator_country.len() <= MAX_COUNTRY_CODE,
        TravelRuleError::InvalidCountryCode
    );
    require!(
        !p.beneficiary_country.is_empty() && p.beneficiary_country.len() <= MAX_COUNTRY_CODE,
        TravelRuleError::InvalidCountryCode
    );

    let now = Clock::get()?.unix_timestamp;
    let pl  = &mut ctx.accounts.payload;
    pl.originator_vasp        = ctx.accounts.originator_vasp.key();
    pl.beneficiary_vasp       = ctx.accounts.beneficiary_vasp.key();
    pl.originator_wallet      = ctx.accounts.originator_wallet.key();
    pl.beneficiary_wallet     = ctx.accounts.beneficiary_wallet.key();
    pl.transfer_amount_kesh   = transfer_amount_kesh;
    pl.encrypted_ivms101_cid  = p.encrypted_ivms101_cid.clone();
    pl.originator_name_hash   = p.originator_name_hash;
    pl.beneficiary_name_hash  = p.beneficiary_name_hash;
    pl.originator_country     = p.originator_country.clone();
    pl.beneficiary_country    = p.beneficiary_country.clone();
    pl.submitted_at           = now;
    pl.acknowledged           = false;
    pl.acknowledged_at        = 0;
    pl.rejected               = false;
    pl.rejection_reason       = String::new();

    let r = &mut ctx.accounts.registry;
    r.total_payloads_submitted   = r.total_payloads_submitted
        .checked_add(1).ok_or(TravelRuleError::MathOverflow)?;
    r.total_volume_screened_kesh = r.total_volume_screened_kesh
        .checked_add(transfer_amount_kesh).ok_or(TravelRuleError::MathOverflow)?;

    emit!(TrPayloadSubmitted {
        payload:               pl.key(),
        originator_vasp:       pl.originator_vasp,
        beneficiary_vasp:      pl.beneficiary_vasp,
        originator_wallet:     pl.originator_wallet,
        beneficiary_wallet:    pl.beneficiary_wallet,
        transfer_amount_kesh,
        encrypted_ivms101_cid: p.encrypted_ivms101_cid,
        originator_country:    p.originator_country,
        beneficiary_country:   p.beneficiary_country,
        timestamp:             now,
    });
    Ok(())
}

// ─── 2B  Acknowledge Travel Rule Payload ──────────────────────────────────────
/// Called by the beneficiary VASP after decrypting and verifying the IVMS101 data.
/// This confirms the transfer can proceed on the receiving side.

#[derive(Accounts)]
pub struct AcknowledgeTrPayload<'info> {
    /// Beneficiary VASP authority must sign
    #[account(mut)]
    pub beneficiary_vasp_authority: Signer<'info>,

    #[account(
        constraint = beneficiary_vasp.authority == beneficiary_vasp_authority.key() @ TravelRuleError::Unauthorized,
        constraint = beneficiary_vasp.can_benefit()                                  @ TravelRuleError::NotBeneficiaryVasp,
    )]
    pub beneficiary_vasp: Box<Account<'info, VaspRecord>>,

    #[account(
        mut,
        constraint = payload.beneficiary_vasp == beneficiary_vasp.key() @ TravelRuleError::Unauthorized,
        constraint = payload.is_pending()                                @ TravelRuleError::AlreadyAcknowledged,
    )]
    pub payload: Box<Account<'info, TravelRulePayload>>,
}

pub fn acknowledge_tr_payload(ctx: Context<AcknowledgeTrPayload>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.payload.acknowledged    = true;
    ctx.accounts.payload.acknowledged_at = now;

    emit!(TrPayloadAcknowledged {
        payload:          ctx.accounts.payload.key(),
        beneficiary_vasp: ctx.accounts.beneficiary_vasp.key(),
        timestamp:        now,
    });
    Ok(())
}

// ─── 2C  Reject Travel Rule Payload ───────────────────────────────────────────
/// Called by the beneficiary VASP when the received IVMS101 data fails verification,
/// the counterparty is sanctioned, or the transfer violates local regulations.
/// Rejecting does NOT automatically block the on-chain transfer — it is a
/// compliance signal to the originator VASP to halt the payment.

#[derive(Accounts)]
pub struct RejectTrPayload<'info> {
    #[account(mut)]
    pub beneficiary_vasp_authority: Signer<'info>,

    #[account(
        constraint = beneficiary_vasp.authority == beneficiary_vasp_authority.key() @ TravelRuleError::Unauthorized,
        constraint = beneficiary_vasp.can_benefit()                                  @ TravelRuleError::NotBeneficiaryVasp,
    )]
    pub beneficiary_vasp: Box<Account<'info, VaspRecord>>,

    #[account(
        mut,
        constraint = payload.beneficiary_vasp == beneficiary_vasp.key() @ TravelRuleError::Unauthorized,
        constraint = payload.is_pending()                                @ TravelRuleError::AlreadyAcknowledged,
    )]
    pub payload: Box<Account<'info, TravelRulePayload>>,
}

pub fn reject_tr_payload(ctx: Context<RejectTrPayload>, rejection_reason: String) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    ctx.accounts.payload.rejected         = true;
    ctx.accounts.payload.rejection_reason = rejection_reason.clone();

    emit!(TrPayloadRejected {
        payload:          ctx.accounts.payload.key(),
        beneficiary_vasp: ctx.accounts.beneficiary_vasp.key(),
        rejection_reason,
        timestamp:        now,
    });
    Ok(())
}
