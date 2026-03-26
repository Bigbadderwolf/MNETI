// ═══════════════════════════════════════════════════════════════════════════════
// mneti-travel-rule — constants.rs
//
// All constants for the Travel Rule compliance program.
//
// FATF Recommendation 16 (Travel Rule) requires VASPs to share originator and
// beneficiary information for virtual asset transfers at or above a threshold.
// IVMS101 is the standardized data format for this information.
//
// Architecture:
//   - Full IVMS101 JSON is ECIES-encrypted and stored off-chain (IPFS / Arweave)
//   - Only the CID (content identifier) is anchored on-chain in TravelRulePayload
//   - Originator/beneficiary names are stored as SHA-256 hash commitments only —
//     NO plain PII appears on-chain at any point
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PDA Seeds ────────────────────────────────────────────────────────────────
pub const VASP_REGISTRY_SEED:   &[u8] = b"vasp_registry";
pub const VASP_RECORD_SEED:     &[u8] = b"vasp_record";
pub const TR_PAYLOAD_SEED:      &[u8] = b"tr_payload";

// ─── FATF Threshold ───────────────────────────────────────────────────────────
/// USD 1,000 equivalent in KESH units (2 decimals).
/// At KES/USD = 130 → KES 130,000 → 13_000_000 KESH units.
/// Transfers at or above this amount require a submitted TravelRulePayload.
pub const TRAVEL_RULE_THRESHOLD_KESH: u64 = 13_000_000;

// ─── String Length Limits ─────────────────────────────────────────────────────
/// VASP display name (e.g. "MNETI Kenya", "Safaricom M-Pesa")
pub const MAX_VASP_NAME:        usize = 64;
/// W3C Decentralized Identifier (e.g. "did:mneti:ke:safaricom")
pub const MAX_VASP_DID:         usize = 128;
/// ISO 3166-1 alpha-2 jurisdiction code (e.g. "KE", "GB", "US", "AE")
pub const MAX_JURISDICTION:     usize = 4;
/// IPFS CID v1 or Arweave transaction ID pointing to ECIES-encrypted IVMS101 JSON
pub const MAX_PAYLOAD_CID:      usize = 64;
/// SHA-256 hex digest of originator / beneficiary full name (64 hex chars)
pub const MAX_NAME_COMMITMENT:  usize = 64;
/// Country code stored per party (same as MAX_JURISDICTION)
pub const MAX_COUNTRY_CODE:     usize = 4;
/// VASP compliance contact URI (e.g. mailto: or https: endpoint)
pub const MAX_CONTACT_URI:      usize = 128;

// ─── Account Space (bytes) ────────────────────────────────────────────────────

pub const SZ_VASP_REGISTRY: usize = 8
    + 32   // authority
    + 8    // total_vasps_registered
    + 8    // total_payloads_submitted
    + 8    // total_volume_screened_kesh
    + 8    // created_at
    + 32;  // reserved

pub const SZ_VASP_RECORD: usize = 8
    + 32                          // authority (controls this VASP record)
    + (4 + MAX_VASP_NAME)         // name
    + (4 + MAX_VASP_DID)          // did
    + (4 + MAX_JURISDICTION)      // jurisdiction
    + (4 + MAX_CONTACT_URI)       // compliance_contact_uri
    + 1                           // is_active
    + 1                           // is_originator_vasp  (can initiate payloads)
    + 1                           // is_beneficiary_vasp (can acknowledge)
    + 8                           // registered_at
    + 8                           // last_updated_at
    + 32;                         // reserved

pub const SZ_TR_PAYLOAD: usize = 8
    + 32                          // originator_vasp (Pubkey of VaspRecord)
    + 32                          // beneficiary_vasp
    + 32                          // originator_wallet
    + 32                          // beneficiary_wallet
    + 8                           // transfer_amount_kesh
    + (4 + MAX_PAYLOAD_CID)       // encrypted_ivms101_cid
    + (4 + MAX_NAME_COMMITMENT)   // originator_name_hash (SHA-256 hex)
    + (4 + MAX_NAME_COMMITMENT)   // beneficiary_name_hash
    + (4 + MAX_COUNTRY_CODE)      // originator_country
    + (4 + MAX_COUNTRY_CODE)      // beneficiary_country
    + 8                           // submitted_at
    + 1                           // acknowledged
    + 8                           // acknowledged_at  (0 if pending)
    + 1                           // rejected  (beneficiary VASP can reject)
    + (4 + 128)                   // rejection_reason  (if rejected)
    + 32;                         // reserved
