// ═══════════════════════════════════════════════════════════════════════════════
// mneti-travel-rule — errors.rs
// All error codes for the FATF Travel Rule compliance program.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

#[error_code]
pub enum TravelRuleError {
    // ── Access Control ────────────────────────────────────────────────────────
    #[msg("Unauthorized: signer is not the authority for this VASP record")]
    Unauthorized,

    // ── VASP State ────────────────────────────────────────────────────────────
    #[msg("VASP record is inactive — reactivate before submitting or acknowledging payloads")]
    VaspInactive,

    #[msg("VASP is not registered as an originator VASP — cannot submit Travel Rule payloads")]
    NotOriginatorVasp,

    #[msg("VASP is not registered as a beneficiary VASP — cannot acknowledge payloads")]
    NotBeneficiaryVasp,

    #[msg("A VASP record already exists for this authority — cannot register twice")]
    VaspAlreadyRegistered,

    // ── Payload Validation ────────────────────────────────────────────────────
    #[msg("Transfer amount is below the FATF Travel Rule threshold (KES 130,000 / USD 1,000)")]
    BelowThreshold,

    #[msg("encrypted_ivms101_cid must not be empty — provide a valid IPFS CID or Arweave TX ID")]
    MissingPayloadCid,

    #[msg("encrypted_ivms101_cid exceeds the maximum allowed length (64 characters)")]
    PayloadCidTooLong,

    #[msg("originator_name_hash must be a 64-character hex SHA-256 digest")]
    InvalidNameHash,

    #[msg("country code must be a 2–4 character ISO 3166-1 code (e.g. 'KE', 'GB')")]
    InvalidCountryCode,

    // ── Payload Lifecycle ─────────────────────────────────────────────────────
    #[msg("This Travel Rule payload has already been acknowledged — cannot acknowledge twice")]
    AlreadyAcknowledged,

    #[msg("This Travel Rule payload has been rejected by the beneficiary VASP")]
    PayloadRejected,

    #[msg("This payload has already been rejected — cannot change state again")]
    AlreadyRejected,

    // ── Arithmetic ────────────────────────────────────────────────────────────
    #[msg("Arithmetic overflow in Travel Rule calculation")]
    MathOverflow,
}
