// ─── PDA Seeds ────────────────────────────────────────────────────────────────
pub const VAULT_REGISTRY_SEED: &[u8] = b"vault_registry";
pub const INDIVIDUAL_VAULT_SEED: &[u8] = b"individual_vault";
pub const CHAMA_VAULT_SEED: &[u8] = b"chama_vault";
pub const SME_VAULT_SEED: &[u8] = b"sme_vault";
pub const ENTERPRISE_VAULT_SEED: &[u8] = b"enterprise_vault";
pub const NGO_VAULT_SEED: &[u8] = b"ngo_vault";
pub const CHAMA_MEMBER_SEED: &[u8] = b"chama_member";
pub const CHAMA_PROPOSAL_SEED: &[u8] = b"chama_proposal";
pub const VAULT_ESCROW_SEED: &[u8] = b"vault_escrow";
pub const SAVINGS_GOAL_SEED: &[u8] = b"savings_goal";

// ─── Vault Type Discriminants (matches mneti-vault-registry) ─────────────────
pub const VAULT_TYPE_INDIVIDUAL: u8 = 0;
pub const VAULT_TYPE_CHAMA: u8 = 1;
pub const VAULT_TYPE_SME: u8 = 2;
pub const VAULT_TYPE_ENTERPRISE: u8 = 3;
pub const VAULT_TYPE_NGO: u8 = 4;

// ─── Vault Status Discriminants ───────────────────────────────────────────────
pub const VAULT_STATUS_ACTIVE: u8 = 0;
pub const VAULT_STATUS_PAUSED: u8 = 1;
pub const VAULT_STATUS_FROZEN: u8 = 2;
pub const VAULT_STATUS_CLOSED: u8 = 3;

// ─── Individual Vault ─────────────────────────────────────────────────────────
pub const MAX_SAVINGS_GOALS: usize = 5;
pub const MAX_GOAL_NAME_LEN: usize = 32;
pub const MIN_DEPOSIT_AMOUNT: u64 = 5_000;       // KES 50.00 (2 decimals)
pub const MAX_INDIVIDUAL_BALANCE: u64 = 100_000_000_00; // KES 1,000,000.00

// ─── Chama Vault ──────────────────────────────────────────────────────────────
pub const MAX_CHAMA_MEMBERS: usize = 50;
pub const MAX_CHAMA_NAME_LEN: usize = 48;
pub const MAX_CHAMA_DESCRIPTION_LEN: usize = 128;
pub const MAX_ACTIVE_PROPOSALS: usize = 10;
pub const MAX_ROTATION_QUEUE: usize = 50;
pub const PROPOSAL_EXPIRY_SECONDS: i64 = 7 * 24 * 60 * 60; // 7 days
pub const MIN_CHAMA_MEMBERS: usize = 2;
pub const MAX_CHAMA_MEMBERS_USIZE: usize = 50;

// ─── SME Vault ────────────────────────────────────────────────────────────────
pub const MAX_SME_NAME_LEN: usize = 64;
pub const MAX_SME_SIGNERS: usize = 5;
pub const SME_MULTISIG_THRESHOLD_MIN: u8 = 1;
pub const MAX_PAYROLL_RECIPIENTS: usize = 100;
pub const MAX_ALLOCATION_TARGETS: usize = 5; // yield allocation buckets

// ─── Enterprise Vault ─────────────────────────────────────────────────────────
pub const MAX_ENTERPRISE_NAME_LEN: usize = 64;
pub const MAX_ENTERPRISE_SIGNERS: usize = 10;
pub const MAX_REPORTING_PERIODS: usize = 12; // monthly snapshots
pub const ENTERPRISE_MULTISIG_THRESHOLD_MIN: u8 = 2;

// ─── NGO Vault ────────────────────────────────────────────────────────────────
pub const MAX_NGO_NAME_LEN: usize = 64;
pub const MAX_GRANT_CONDITIONS: usize = 8;
pub const MAX_CONDITION_LEN: usize = 64;
pub const MAX_MILESTONES: usize = 10;
pub const MAX_DONOR_NOTES_LEN: usize = 128;

// ─── Yield / APY ──────────────────────────────────────────────────────────────
/// T-bill backed yield: 12% APY → 32.87 bps/day (12% / 365)
/// Stored as basis points * 100 for precision: 3287 = 32.87 bps
pub const ANNUAL_YIELD_BPS: u64 = 1_200;        // 12.00% APY
pub const DAILY_YIELD_BPS_SCALED: u64 = 32_87;  // 32.87 bps/day × 100

/// Fee on yield harvest: 1.5% of yield distributed
pub const YIELD_HARVEST_FEE_BPS: u64 = 150;

// ─── Oracle ───────────────────────────────────────────────────────────────────
pub const MAX_ORACLE_AGE_SECONDS: i64 = 120; // 2 minutes — fresher than kesh (60s) for vault ops
pub const TBILL_YIELD_FEED_INDEX: u8 = 1;    // matches mneti-oracle feed 1

// ─── Chama Proposal Types ─────────────────────────────────────────────────────
pub const PROPOSAL_TYPE_WITHDRAW: u8 = 0;
pub const PROPOSAL_TYPE_ADD_MEMBER: u8 = 1;
pub const PROPOSAL_TYPE_REMOVE_MEMBER: u8 = 2;
pub const PROPOSAL_TYPE_LOAN: u8 = 3;
pub const PROPOSAL_TYPE_RULE_CHANGE: u8 = 4;

// ─── Compliance Integration ───────────────────────────────────────────────────
/// Minimum KYC tier required to open each vault type
pub const MIN_KYC_TIER_INDIVIDUAL: u8 = 1; // Basic KYC
pub const MIN_KYC_TIER_CHAMA: u8 = 1;
pub const MIN_KYC_TIER_SME: u8 = 2;        // Enhanced KYC
pub const MIN_KYC_TIER_ENTERPRISE: u8 = 3; // Full KYC
pub const MIN_KYC_TIER_NGO: u8 = 2;

// ─── Account Space Sizing ─────────────────────────────────────────────────────
pub const INDIVIDUAL_VAULT_SIZE: usize = 8   // discriminator
    + 32                                       // owner
    + 32                                       // vault_id (Pubkey used as ID)
    + 1                                        // vault_type
    + 1                                        // status
    + 8                                        // balance_kesh
    + 8                                        // total_deposited
    + 8                                        // total_withdrawn
    + 8                                        // accrued_yield
    + 8                                        // last_yield_ts
    + 8                                        // created_at
    + 8                                        // updated_at
    + 1                                        // kyc_tier
    + (4 + MAX_GOAL_NAME_LEN + 8 + 8 + 1) * MAX_SAVINGS_GOALS  // goals
    + 32;                                      // padding

pub const CHAMA_VAULT_SIZE: usize = 8
    + 32                                       // creator
    + 32                                       // vault_id
    + 4 + MAX_CHAMA_NAME_LEN                   // name string
    + 4 + MAX_CHAMA_DESCRIPTION_LEN            // description
    + 1                                        // status
    + 8                                        // balance_kesh
    + 8                                        // total_deposited
    + 8                                        // accrued_yield
    + 8                                        // last_yield_ts
    + 8                                        // created_at
    + 8                                        // contribution_interval_seconds
    + 8                                        // contribution_amount
    + 4                                        // member_count (u32)
    + 4                                        // proposal_count (u32)
    + 4                                        // rotation_index (u32)
    + 1                                        // governance_threshold_pct
    + 64;                                      // padding

pub const SME_VAULT_SIZE: usize = 8
    + 32                                       // owner
    + 32                                       // vault_id
    + 4 + MAX_SME_NAME_LEN                     // business name
    + 1                                        // status
    + 8                                        // balance_kesh
    + 8                                        // payroll_reserve
    + 8                                        // tax_reserve
    + 8                                        // operating_balance
    + 8                                        // total_deposited
    + 8                                        // accrued_yield
    + 8                                        // last_yield_ts
    + 8                                        // created_at
    + 1                                        // multisig_threshold
    + 4                                        // signer_count
    + (32 * MAX_SME_SIGNERS)                   // signers
    + (8 * MAX_ALLOCATION_TARGETS)             // allocation_targets_bps
    + 64;                                      // padding

pub const ENTERPRISE_VAULT_SIZE: usize = 8
    + 32                                       // owner
    + 32                                       // vault_id
    + 4 + MAX_ENTERPRISE_NAME_LEN              // entity name
    + 1                                        // status
    + 8                                        // balance_kesh
    + 8                                        // total_deposited
    + 8                                        // accrued_yield
    + 8                                        // last_yield_ts
    + 8                                        // created_at
    + 8                                        // reporting_period_start
    + 1                                        // multisig_threshold
    + 4                                        // signer_count
    + (32 * MAX_ENTERPRISE_SIGNERS)            // signers
    + (8 * MAX_REPORTING_PERIODS)              // period_snapshots
    + 64;                                      // padding

pub const NGO_VAULT_SIZE: usize = 8
    + 32                                       // authority
    + 32                                       // vault_id
    + 4 + MAX_NGO_NAME_LEN                     // organization name
    + 1                                        // status
    + 8                                        // balance_kesh
    + 8                                        // disbursed_total
    + 8                                        // locked_for_milestones
    + 8                                        // total_received
    + 8                                        // created_at
    + 8                                        // grant_expiry
    + 1                                        // milestone_count
    + 1                                        // milestones_completed
    + 4 + MAX_DONOR_NOTES_LEN                  // donor_notes
    + 64;                                      // padding

pub const CHAMA_MEMBER_SIZE: usize = 8
    + 32                                       // wallet
    + 32                                       // chama_vault
    + 8                                        // total_contributed
    + 8                                        // joined_at
    + 8                                        // last_contribution_ts
    + 1                                        // rotation_position
    + 1                                        // is_active
    + 16;                                      // padding

pub const CHAMA_PROPOSAL_SIZE: usize = 8
    + 32                                       // proposer
    + 32                                       // chama_vault
    + 4                                        // proposal_index
    + 1                                        // proposal_type
    + 8                                        // amount (if applicable)
    + 32                                       // target_wallet (if applicable)
    + 8                                        // created_at
    + 8                                        // expires_at
    + 4                                        // votes_for
    + 4                                        // votes_against
    + 1                                        // executed
    + 1                                        // cancelled
    + 16;                                      // padding
