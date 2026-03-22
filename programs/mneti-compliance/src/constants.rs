// ─────────────────────────────────────────────────────────────
//  MNETI COMPLIANCE — constants.rs
// ─────────────────────────────────────────────────────────────

/// PDA seed for the compliance registry
pub const COMPLIANCE_REGISTRY_SEED: &[u8] = b"compliance_registry";

/// PDA seed for compliance credentials (one per wallet)
/// Derived as: [CREDENTIAL_SEED, wallet_pubkey]
pub const CREDENTIAL_SEED: &[u8] = b"compliance_credential";

/// PDA seed for credit score credentials (one per wallet)
pub const CREDIT_SCORE_SEED: &[u8] = b"credit_score";

/// Maximum KYC expiry — 1 year in seconds
pub const MAX_KYC_DURATION_SECONDS: i64 = 31_536_000;

/// Minimum credit score (FICO-style floor)
pub const MIN_CREDIT_SCORE: u16 = 300;

/// Maximum credit score
pub const MAX_CREDIT_SCORE: u16 = 850;

/// Credit limits by PoBF score (in KESH raw units, 2 decimals)
pub const CREDIT_LIMIT_TIER_1: u64 = 5_000_00;        // KES 5,000
pub const CREDIT_LIMIT_TIER_2: u64 = 50_000_00;       // KES 50,000
pub const CREDIT_LIMIT_TIER_3: u64 = 500_000_00;      // KES 500,000
pub const CREDIT_LIMIT_TIER_4: u64 = 5_000_000_00;    // KES 5,000,000

/// Score thresholds for credit tiers
pub const SCORE_TIER_2_MIN: u16 = 500;
pub const SCORE_TIER_3_MIN: u16 = 650;
pub const SCORE_TIER_4_MIN: u16 = 750;
