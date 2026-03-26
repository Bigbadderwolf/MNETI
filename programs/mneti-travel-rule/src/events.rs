// ═══════════════════════════════════════════════════════════════════════════════
// mneti-travel-rule — events.rs
// All on-chain events emitted by the Travel Rule program.
// These are monitored by the off-chain compliance dashboard and VASP notification
// service to drive real-time acknowledgement workflows.
// ═══════════════════════════════════════════════════════════════════════════════

use anchor_lang::prelude::*;

// ─── Registry Events ──────────────────────────────────────────────────────────

#[event]
pub struct VaspRegistryInitialized {
    pub authority: Pubkey,
    pub timestamp: i64,
}

// ─── VASP Lifecycle Events ────────────────────────────────────────────────────

#[event]
pub struct VaspRegistered {
    /// PDA of the new VaspRecord account
    pub vasp:             Pubkey,
    /// Wallet that controls this VASP record
    pub authority:        Pubkey,
    pub name:             String,
    /// W3C DID (e.g. "did:mneti:ke:safaricom")
    pub did:              String,
    pub jurisdiction:     String,
    pub is_originator:    bool,
    pub is_beneficiary:   bool,
    pub timestamp:        i64,
}

#[event]
pub struct VaspUpdated {
    pub vasp:            Pubkey,
    pub authority:       Pubkey,
    pub timestamp:       i64,
}

#[event]
pub struct VaspDeactivated {
    pub vasp:      Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaspReactivated {
    pub vasp:      Pubkey,
    pub authority: Pubkey,
    pub timestamp: i64,
}

// ─── Travel Rule Payload Events ───────────────────────────────────────────────

#[event]
pub struct TrPayloadSubmitted {
    /// PDA of the TravelRulePayload account
    pub payload:              Pubkey,
    /// VASP record PDA of the originating VASP
    pub originator_vasp:      Pubkey,
    /// VASP record PDA of the beneficiary VASP
    pub beneficiary_vasp:     Pubkey,
    pub originator_wallet:    Pubkey,
    pub beneficiary_wallet:   Pubkey,
    pub transfer_amount_kesh: u64,
    /// IPFS CID or Arweave TX ID of the ECIES-encrypted IVMS101 JSON
    pub encrypted_ivms101_cid: String,
    pub originator_country:   String,
    pub beneficiary_country:  String,
    pub timestamp:            i64,
}

#[event]
pub struct TrPayloadAcknowledged {
    pub payload:          Pubkey,
    pub beneficiary_vasp: Pubkey,
    pub timestamp:        i64,
}

#[event]
pub struct TrPayloadRejected {
    pub payload:          Pubkey,
    pub beneficiary_vasp: Pubkey,
    pub rejection_reason: String,
    pub timestamp:        i64,
}
