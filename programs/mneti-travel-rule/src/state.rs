// ═══════════════════════════════════════════════════════════════════════════════
// mneti-travel-rule — state.rs
// All Anchor account structs for the Travel Rule compliance program.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

// ─── VASP Registry (global singleton) ────────────────────────────────────────
/// One per deployment. Tracks aggregate stats and is the authoritative list
/// of registered VASPs. Initialized once by the protocol authority.
#[account]
pub struct VaspRegistry {
    /// Protocol authority — can override VASP registrations if needed
    pub authority:                   Pubkey,
    /// Monotonically increasing count of registered VASPs
    pub total_vasps_registered:      u64,
    /// Total Travel Rule payloads submitted across the protocol
    pub total_payloads_submitted:    u64,
    /// Cumulative KESH volume screened via Travel Rule
    pub total_volume_screened_kesh:  u64,
    pub created_at:                  i64,
}

// ─── VASP Record (one per VASP institution) ───────────────────────────────────
/// Represents a registered Virtual Asset Service Provider.
/// Seeds: [VASP_RECORD_SEED, authority.key()]
///
/// A VASP can be:
///   - An originator (submits TR payloads for outgoing transfers)
///   - A beneficiary (acknowledges incoming TR payloads)
///   - Both (most VASPs are both)
#[account]
pub struct VaspRecord {
    /// Wallet that controls this record and can submit/acknowledge payloads
    pub authority:               Pubkey,
    /// Human-readable institution name
    pub name:                    String,
    /// W3C DID (e.g. "did:mneti:ke:safaricom" or "did:mneti:gb:monzo")
    pub did:                     String,
    /// ISO 3166-1 alpha-2 regulatory jurisdiction (e.g. "KE", "GB", "US", "AE")
    pub jurisdiction:            String,
    /// URI for compliance team to receive acknowledgement notifications
    /// (e.g. "https://compliance.mneti.io/tr-ack" or "mailto:tr@mneti.io")
    pub compliance_contact_uri:  String,
    /// False when VASP is suspended — blocks payload submission/acknowledgement
    pub is_active:               bool,
    /// True when this VASP can initiate (submit) Travel Rule payloads
    pub is_originator_vasp:      bool,
    /// True when this VASP can acknowledge (receive) Travel Rule payloads
    pub is_beneficiary_vasp:     bool,
    pub registered_at:           i64,
    pub last_updated_at:         i64,
}

impl VaspRecord {
    pub fn can_originate(&self)  -> bool { self.is_active && self.is_originator_vasp }
    pub fn can_benefit(&self)    -> bool { self.is_active && self.is_beneficiary_vasp }
}

// ─── Travel Rule Payload ──────────────────────────────────────────────────────
/// On-chain anchor for one FATF Travel Rule information exchange.
///
/// Privacy architecture:
///   - Full IVMS101 data (names, addresses, account numbers) is stored
///     off-chain in ECIES-encrypted form (IPFS or Arweave).
///   - Only the content-addressed CID is stored here.
///   - originator_name_hash and beneficiary_name_hash are SHA-256 hex digests
///     of the full name strings — enabling audit without exposing PII.
///   - The beneficiary VASP decrypts the IPFS payload using its private key.
///
/// Lifecycle:
///   SUBMITTED → ACKNOWLEDGED  (normal happy path)
///   SUBMITTED → REJECTED      (beneficiary VASP rejects due to compliance concern)
///
/// Seeds: [TR_PAYLOAD_SEED, originator_wallet.key(), beneficiary_wallet.key()]
#[account]
pub struct TravelRulePayload {
    /// VaspRecord PDA of the VASP sending the transfer
    pub originator_vasp:          Pubkey,
    /// VaspRecord PDA of the VASP receiving the transfer
    pub beneficiary_vasp:         Pubkey,
    /// Solana wallet address of the sender
    pub originator_wallet:        Pubkey,
    /// Solana wallet address of the recipient
    pub beneficiary_wallet:       Pubkey,
    /// KESH transfer amount that triggered this Travel Rule filing
    pub transfer_amount_kesh:     u64,
    /// IPFS CID (v1 / base32) or Arweave TX ID of the ECIES-encrypted IVMS101 JSON
    pub encrypted_ivms101_cid:    String,
    /// SHA-256 hex digest of originator full legal name (no plain text)
    pub originator_name_hash:     String,
    /// SHA-256 hex digest of beneficiary full legal name
    pub beneficiary_name_hash:    String,
    /// ISO 3166-1 alpha-2 country of originator (e.g. "KE")
    pub originator_country:       String,
    /// ISO 3166-1 alpha-2 country of beneficiary (e.g. "GB")
    pub beneficiary_country:      String,
    /// Unix timestamp when originator VASP submitted this payload
    pub submitted_at:             i64,
    /// True after the beneficiary VASP calls acknowledge_tr_payload
    pub acknowledged:             bool,
    /// Unix timestamp of acknowledgement (0 if not yet acknowledged)
    pub acknowledged_at:          i64,
    /// True if beneficiary VASP called reject_tr_payload
    pub rejected:                 bool,
    /// Populated on rejection — reason code or explanation
    pub rejection_reason:         String,
}

impl TravelRulePayload {
    pub fn is_pending(&self)      -> bool { !self.acknowledged && !self.rejected }
    pub fn is_acknowledged(&self) -> bool { self.acknowledged }
    pub fn is_rejected(&self)     -> bool { self.rejected }
}
