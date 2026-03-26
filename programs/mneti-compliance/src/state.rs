use anchor_lang::prelude::*;
use crate::constants::*;

// ── COMPLIANCE REGISTRY ───────────────────────────────────────
/// Single global registry — tracks all issued credentials
#[account]
#[derive(Default)]
pub struct ComplianceRegistry {
    /// Protocol authority (Rafiki multisig)
    pub authority:              Pubkey,
    /// Compliance officer wallet (can freeze, revoke)
    pub compliance_officer:     Pubkey,
    /// Total credentials issued
    pub total_credentials:      u64,
    /// Total wallets currently frozen
    pub total_frozen:           u64,
    /// Is the compliance system paused?
    pub is_paused:              bool,
    /// Registry creation timestamp
    pub initialized_at:         i64,
    pub bump:                   u8,
}

impl ComplianceRegistry {
    pub const LEN: usize = 8
        + 32 + 32 + 8 + 8 + 1 + 8 + 1;
}

// ── COMPLIANCE CREDENTIAL ─────────────────────────────────────
/// Soulbound credential issued after ZK KYC proof verification
/// One per wallet — cannot be transferred
#[account]
pub struct ComplianceCredential {
    /// Wallet this credential belongs to
    pub wallet:              Pubkey,
    /// KYC compliance tier (0=individual, 1=SME, 2=enterprise)
    pub compliance_tier:     u8,
    /// Is the wallet jurisdiction permitted?
    pub jurisdiction_ok:     bool,
    /// Is the wallet NOT on any sanctions list?
    pub not_sanctioned:      bool,
    /// KYC expiry timestamp
    pub kyc_valid_until:     i64,
    /// Poseidon hash of identity (for audit — not raw PII)
    pub identity_hash:       [u8; 32],
    /// Poseidon(walletPubkey, nonce) — ties proof to this wallet
    pub proof_commitment:    [u8; 32],
    /// Is this wallet currently frozen?
    pub is_frozen:           bool,
    /// Freeze reason (empty if not frozen)
    pub freeze_reason:       String,
    /// Timestamp when credential was issued
    pub issued_at:           i64,
    /// Timestamp of most recent KYC renewal
    pub last_renewed_at:     i64,
    /// PDA bump
    pub bump:                u8,
}

impl ComplianceCredential {
    pub const LEN: usize = 8
        + 32     // wallet
        + 1      // compliance_tier
        + 1      // jurisdiction_ok
        + 1      // not_sanctioned
        + 8      // kyc_valid_until
        + 32     // identity_hash
        + 32     // proof_commitment
        + 1      // is_frozen
        + (4 + 200) // freeze_reason
        + 8      // issued_at
        + 8      // last_renewed_at
        + 1;     // bump

    /// Check if this credential is currently valid
    pub fn is_valid(&self, now: i64) -> bool {
        !self.is_frozen
            && self.kyc_valid_until > now
            && self.jurisdiction_ok
            && self.not_sanctioned
    }

    /// Check if wallet meets minimum tier requirement
    pub fn meets_tier(&self, required: u8, now: i64) -> bool {
        self.is_valid(now) && self.compliance_tier >= required
    }
}

// ── CREDIT SCORE CREDENTIAL ───────────────────────────────────
/// Soulbound credit score NFT issued after ZK M-Pesa proof
/// Enables under-collateralised loans for the unbanked
#[account]
pub struct CreditScoreCredential {
    /// Wallet this score belongs to
    pub wallet:              Pubkey,
    /// Credit score 300–850 (FICO-style)
    pub credit_score:        u16,
    /// Income band (1=low, 2=medium, 3=high, 4=very_high)
    pub income_band:         u8,
    /// Payment reliability 0–100
    pub payment_reliability: u8,
    /// Savings rate band (1–5)
    pub savings_rate_band:   u8,
    /// Months of M-Pesa history included in proof
    pub months_of_history:   u8,
    /// Proof commitment (ties proof to wallet)
    pub proof_commitment:    [u8; 32],
    /// Credit limit in KESH unlocked by this score
    pub credit_limit_kesh:   u64,
    /// Outstanding debt (updated by lending program)
    pub outstanding_debt:    u64,
    /// When this score was issued
    pub issued_at:           i64,
    /// Score valid until (6 months — M-Pesa history goes stale)
    pub valid_until:         i64,
    pub bump:                u8,
}

impl CreditScoreCredential {
    pub const LEN: usize = 8
        + 32 + 2 + 1 + 1 + 1 + 1
        + 32 + 8 + 8 + 8 + 8 + 1;

    /// Derive credit limit from score
    pub fn compute_credit_limit(score: u16) -> u64 {
        if score >= SCORE_TIER_4_MIN {
            CREDIT_LIMIT_TIER_4
        } else if score >= SCORE_TIER_3_MIN {
            CREDIT_LIMIT_TIER_3
        } else if score >= SCORE_TIER_2_MIN {
            CREDIT_LIMIT_TIER_2
        } else {
            CREDIT_LIMIT_TIER_1
        }
    }

    pub fn is_valid(&self, now: i64) -> bool {
        self.valid_until > now
    }
}

// ── ZK PROOF TYPES ────────────────────────────────────────────
/// Groth16 proof — 3 elliptic curve points
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Groth16Proof {
    pub a: [u8; 64],    // G1 point (π_a)
    pub b: [u8; 128],   // G2 point (π_b)
    pub c: [u8; 64],    // G1 point (π_c)
}

/// Public signals from KYC compliance circuit
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct KycPublicSignals {
    pub compliance_tier:  u8,
    pub jurisdiction_ok:  bool,
    pub not_sanctioned:   bool,
    pub kyc_valid_until:  i64,
    pub commitment:       [u8; 32],
    pub identity_hash:    [u8; 32],
}

/// Public signals from credit score circuit
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreditPublicSignals {
    pub credit_score:        u16,
    pub income_band:         u8,
    pub payment_reliability: u8,
    pub savings_rate_band:   u8,
    pub months_of_history:   u8,
    pub commitment:          [u8; 32],
}
