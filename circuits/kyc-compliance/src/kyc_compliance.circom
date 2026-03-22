pragma circom 2.1.6;

// ─────────────────────────────────────────────────────────────
//  MNETI — KYC COMPLIANCE CIRCUIT
//  File: circuits/kyc-compliance/src/kyc_compliance.circom
//
//  PURPOSE:
//  Proves a wallet has passed KYC verification without revealing
//  ANY personal information on-chain. Zero personal data touches
//  the blockchain — only the proof and its public outputs.
//
//  PRIVATE INPUTS (stay on user device, never leave):
//  - fullNameHash      : Poseidon hash of user's full legal name
//  - idNumberHash      : Poseidon hash of ID/passport number
//  - phoneHash         : Poseidon hash of M-Pesa phone number
//  - sanctionsResult   : 0 = clear, 1 = flagged (from KYC provider)
//  - jurisdictionCode  : Country code (non-zero = permitted)
//  - kycExpiry         : Unix timestamp when KYC expires
//  - currentTime       : Current Unix timestamp
//  - tierLevel         : 0=individual, 1=SME, 2=enterprise
//  - nonce             : Random nonce to bind proof to this request
//  - walletPubkey      : Solana wallet public key (as field element)
//
//  PUBLIC OUTPUTS (go on-chain — zero PII):
//  - complianceTier    : 0, 1, or 2
//  - jurisdictionOk    : 1 if jurisdiction is permitted
//  - notSanctioned     : 1 if not on any sanctions list
//  - kycValidUntil     : Expiry timestamp (not sensitive)
//  - commitment        : Poseidon(walletPubkey, nonce) — ties proof to wallet
//  - identityHash      : Poseidon(fullNameHash, idNumberHash) — audit trail
// ─────────────────────────────────────────────────────────────

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/gates.circom";

template KycCompliance() {

    // ── PRIVATE INPUTS ──────────────────────────────────────
    signal input fullNameHash;
    signal input idNumberHash;
    signal input phoneHash;
    signal input sanctionsResult;
    signal input jurisdictionCode;
    signal input kycExpiry;
    signal input currentTime;
    signal input tierLevel;
    signal input nonce;
    signal input walletPubkey;

    // ── PUBLIC OUTPUTS ───────────────────────────────────────
    signal output complianceTier;
    signal output jurisdictionOk;
    signal output notSanctioned;
    signal output kycValidUntil;
    signal output commitment;
    signal output identityHash;

    // ── COMPONENTS ───────────────────────────────────────────
    component commitHasher   = Poseidon(2);
    component identityHasher = Poseidon(2);
    component expiryCheck    = LessThan(64);
    component sanctionsCheck = IsZero();
    component jurisdCheck    = IsZero();
    component tierCheck      = LessThan(4);

    // ── CONSTRAINT 1: KYC must not be expired ────────────────
    // Proves: currentTime < kycExpiry
    expiryCheck.in[0] <== currentTime;
    expiryCheck.in[1] <== kycExpiry;
    expiryCheck.out === 1;  // Circuit fails if KYC is expired

    // ── CONSTRAINT 2: Not on sanctions list ──────────────────
    // sanctionsResult must be 0 (clear)
    sanctionsCheck.in <== sanctionsResult;
    notSanctioned <== sanctionsCheck.out;
    notSanctioned === 1;    // Circuit fails if wallet is sanctioned

    // ── CONSTRAINT 3: Jurisdiction is permitted ───────────────
    // jurisdictionCode must be non-zero (zero = not permitted)
    jurisdCheck.in <== jurisdictionCode;
    jurisdictionOk <== 1 - jurisdCheck.out;
    jurisdictionOk === 1;   // Circuit fails if jurisdiction not permitted

    // ── CONSTRAINT 4: Tier is valid (0, 1, or 2) ─────────────
    tierCheck.in[0] <== tierLevel;
    tierCheck.in[1] <== 3;
    tierCheck.out === 1;

    // ── COMPUTE: Wallet-proof commitment ─────────────────────
    // Binds this proof to a specific wallet — prevents proof reuse
    // commitment = Poseidon(walletPubkey, nonce)
    commitHasher.inputs[0] <== walletPubkey;
    commitHasher.inputs[1] <== nonce;
    commitment <== commitHasher.out;

    // ── COMPUTE: Identity hash for audit trail ────────────────
    // Lets compliance officers verify identity without seeing raw data
    // identityHash = Poseidon(fullNameHash, idNumberHash)
    identityHasher.inputs[0] <== fullNameHash;
    identityHasher.inputs[1] <== idNumberHash;
    identityHash <== identityHasher.out;

    // ── PROPAGATE: Public outputs ─────────────────────────────
    complianceTier <== tierLevel;
    kycValidUntil  <== kycExpiry;
}

// Main component — public signals declared explicitly
component main {
    public [
        complianceTier,
        jurisdictionOk,
        notSanctioned,
        kycValidUntil,
        commitment,
        identityHash
    ]
} = KycCompliance();
