use anchor_lang::prelude::*;
use crate::constants::*;

// ─── Shared Enums ─────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum VaultStatus {
    Active    = 0,
    Paused    = 1,
    Frozen    = 2,
    Closed    = 3,
}

impl VaultStatus {
    pub fn as_u8(&self) -> u8 {
        match self {
            VaultStatus::Active  => VAULT_STATUS_ACTIVE,
            VaultStatus::Paused  => VAULT_STATUS_PAUSED,
            VaultStatus::Frozen  => VAULT_STATUS_FROZEN,
            VaultStatus::Closed  => VAULT_STATUS_CLOSED,
        }
    }
    pub fn is_operational(&self) -> bool {
        matches!(self, VaultStatus::Active)
    }
}

// ─── Savings Goal (embedded in IndividualVault) ───────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SavingsGoal {
    pub name: String,            // max MAX_GOAL_NAME_LEN
    pub target_amount: u64,      // KESH (2 decimals, KES)
    pub current_amount: u64,     // amount allocated to this goal
    pub completed: bool,
}

impl SavingsGoal {
    pub fn progress_bps(&self) -> u64 {
        if self.target_amount == 0 { return 10_000; }
        (self.current_amount * 10_000) / self.target_amount
    }
}

// ─── Individual Vault ─────────────────────────────────────────────────────────

#[account]
pub struct IndividualVault {
    pub owner: Pubkey,
    pub vault_id: Pubkey,         // unique identifier — set to vault PDA itself
    pub vault_type: u8,           // always VAULT_TYPE_INDIVIDUAL
    pub status: VaultStatus,
    pub balance_kesh: u64,        // current deposited balance
    pub total_deposited: u64,     // lifetime deposits
    pub total_withdrawn: u64,     // lifetime withdrawals
    pub accrued_yield: u64,       // unharvested yield
    pub last_yield_ts: i64,       // last yield accrual timestamp
    pub created_at: i64,
    pub updated_at: i64,
    pub kyc_tier: u8,             // snapshot from compliance at vault creation
    pub savings_goals: Vec<SavingsGoal>,  // up to MAX_SAVINGS_GOALS
}

impl IndividualVault {
    pub fn is_operational(&self) -> bool {
        self.status.is_operational()
    }

    /// Compute accrued yield since last_yield_ts using daily TWAP yield
    /// yield = balance * tbill_yield_bps * days_elapsed / (365 * 10_000)
    pub fn compute_pending_yield(&self, now: i64, tbill_yield_bps: u64) -> u64 {
        let elapsed = now.saturating_sub(self.last_yield_ts);
        if elapsed <= 0 || self.balance_kesh == 0 { return 0; }
        let days_elapsed = elapsed as u64 / 86_400;
        if days_elapsed == 0 { return 0; }
        // yield = balance * tbill_yield_bps * days / (365 * 10_000)
        self.balance_kesh
            .saturating_mul(tbill_yield_bps)
            .saturating_mul(days_elapsed)
            / (365 * 10_000)
    }
}

// ─── Chama Member (separate PDA per member per chama) ────────────────────────

#[account]
pub struct ChamaMember {
    pub wallet: Pubkey,
    pub chama_vault: Pubkey,
    pub total_contributed: u64,
    pub joined_at: i64,
    pub last_contribution_ts: i64,
    pub rotation_position: u8,    // position in rotation queue (0 = next payout)
    pub is_active: bool,
    pub has_received_rotation: bool, // received payout in current cycle
    pub vote_bitmap: u64,            // bitmask: bit N = voted on proposal N (mod 64)
}

// ─── Chama Proposal (separate PDA per proposal) ───────────────────────────────

#[account]
pub struct ChamaProposal {
    pub chama_vault: Pubkey,
    pub proposer: Pubkey,
    pub proposal_index: u32,
    pub proposal_type: u8,         // PROPOSAL_TYPE_*
    pub amount: u64,               // relevant for WITHDRAW / LOAN / ROTATION
    pub target_wallet: Pubkey,     // recipient for withdraw/loan/add/remove
    pub created_at: i64,
    pub expires_at: i64,
    pub votes_for: u32,
    pub votes_against: u32,
    pub executed: bool,
    pub cancelled: bool,
}

impl ChamaProposal {
    pub fn is_expired(&self, now: i64) -> bool {
        now > self.expires_at
    }
    pub fn is_active(&self) -> bool {
        !self.executed && !self.cancelled
    }
    pub fn quorum_reached(&self, member_count: u32, threshold_pct: u8) -> bool {
        let total_votes = self.votes_for + self.votes_against;
        // quorum: >50% of members voted AND votes_for > votes_against
        let quorum = (member_count * 50 / 100) + 1;
        total_votes >= quorum && self.votes_for > self.votes_against
    }
    pub fn passes(&self, member_count: u32, threshold_pct: u8) -> bool {
        self.quorum_reached(member_count, threshold_pct)
    }
}

// ─── Chama Vault ──────────────────────────────────────────────────────────────

#[account]
pub struct ChamaVault {
    pub creator: Pubkey,
    pub vault_id: Pubkey,
    pub name: String,                    // max MAX_CHAMA_NAME_LEN
    pub description: String,             // max MAX_CHAMA_DESCRIPTION_LEN
    pub status: VaultStatus,
    pub balance_kesh: u64,
    pub total_deposited: u64,
    pub accrued_yield: u64,
    pub last_yield_ts: i64,
    pub created_at: i64,
    pub contribution_interval_seconds: i64, // e.g. 7*24*3600 for weekly
    pub contribution_amount: u64,        // required contribution per interval
    pub member_count: u32,
    pub proposal_count: u32,             // monotonically increasing proposal ID
    pub rotation_index: u32,             // next member index to receive rotation payout
    pub governance_threshold_pct: u8,    // % votes needed (default 51)
}

impl ChamaVault {
    pub fn is_operational(&self) -> bool {
        self.status.is_operational()
    }

    pub fn compute_pending_yield(&self, now: i64, tbill_yield_bps: u64) -> u64 {
        let elapsed = now.saturating_sub(self.last_yield_ts);
        if elapsed <= 0 || self.balance_kesh == 0 { return 0; }
        let days_elapsed = elapsed as u64 / 86_400;
        if days_elapsed == 0 { return 0; }
        self.balance_kesh
            .saturating_mul(tbill_yield_bps)
            .saturating_mul(days_elapsed)
            / (365 * 10_000)
    }
}

// ─── SME Allocation Target (embedded in SmeVault) ─────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct AllocationTarget {
    pub label: u8,      // 0=payroll, 1=tax, 2=operating, 3=investment, 4=reserve
    pub bps: u16,       // basis points of total balance (must sum to 10_000)
}

// ─── SME Vault ────────────────────────────────────────────────────────────────

#[account]
pub struct SmeVault {
    pub owner: Pubkey,
    pub vault_id: Pubkey,
    pub business_name: String,           // max MAX_SME_NAME_LEN
    pub status: VaultStatus,
    pub balance_kesh: u64,               // total balance
    pub payroll_reserve: u64,            // sub-balance allocated for payroll
    pub tax_reserve: u64,                // sub-balance allocated for KRA
    pub operating_balance: u64,          // available for operations
    pub total_deposited: u64,
    pub accrued_yield: u64,
    pub last_yield_ts: i64,
    pub created_at: i64,
    pub multisig_threshold: u8,          // M of N required
    pub signers: Vec<Pubkey>,            // max MAX_SME_SIGNERS
    pub allocation_targets: Vec<AllocationTarget>, // max MAX_ALLOCATION_TARGETS
}

impl SmeVault {
    pub fn is_operational(&self) -> bool {
        self.status.is_operational()
    }

    pub fn is_signer(&self, key: &Pubkey) -> bool {
        self.signers.contains(key)
    }

    pub fn compute_pending_yield(&self, now: i64, tbill_yield_bps: u64) -> u64 {
        let elapsed = now.saturating_sub(self.last_yield_ts);
        if elapsed <= 0 || self.balance_kesh == 0 { return 0; }
        let days_elapsed = elapsed as u64 / 86_400;
        if days_elapsed == 0 { return 0; }
        self.balance_kesh
            .saturating_mul(tbill_yield_bps)
            .saturating_mul(days_elapsed)
            / (365 * 10_000)
    }
}

// ─── Enterprise Vault ─────────────────────────────────────────────────────────

#[account]
pub struct EnterpriseVault {
    pub owner: Pubkey,
    pub vault_id: Pubkey,
    pub entity_name: String,             // max MAX_ENTERPRISE_NAME_LEN
    pub status: VaultStatus,
    pub balance_kesh: u64,
    pub total_deposited: u64,
    pub accrued_yield: u64,
    pub last_yield_ts: i64,
    pub created_at: i64,
    pub reporting_period_start: i64,
    pub multisig_threshold: u8,
    pub signers: Vec<Pubkey>,            // max MAX_ENTERPRISE_SIGNERS
    pub period_snapshots: Vec<u64>,      // historical balance snapshots (monthly)
}

impl EnterpriseVault {
    pub fn is_operational(&self) -> bool {
        self.status.is_operational()
    }

    pub fn is_signer(&self, key: &Pubkey) -> bool {
        self.signers.contains(key)
    }

    pub fn compute_pending_yield(&self, now: i64, tbill_yield_bps: u64) -> u64 {
        let elapsed = now.saturating_sub(self.last_yield_ts);
        if elapsed <= 0 || self.balance_kesh == 0 { return 0; }
        let days_elapsed = elapsed as u64 / 86_400;
        if days_elapsed == 0 { return 0; }
        self.balance_kesh
            .saturating_mul(tbill_yield_bps)
            .saturating_mul(days_elapsed)
            / (365 * 10_000)
    }
}

// ─── NGO Milestone (embedded in NgoVault) ────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct GrantMilestone {
    pub unlock_amount: u64,    // KESH released when milestone complete
    pub completed: bool,
    pub completed_at: i64,
}

// ─── NGO Vault ────────────────────────────────────────────────────────────────

#[account]
pub struct NgoVault {
    pub authority: Pubkey,
    pub vault_id: Pubkey,
    pub organization_name: String,       // max MAX_NGO_NAME_LEN
    pub status: VaultStatus,
    pub balance_kesh: u64,
    pub disbursed_total: u64,
    pub locked_for_milestones: u64,      // cannot disburse until milestone unlocks
    pub total_received: u64,
    pub created_at: i64,
    pub grant_expiry: i64,               // unix timestamp — 0 = no expiry
    pub milestones: Vec<GrantMilestone>, // max MAX_MILESTONES
    pub donor_notes: String,             // max MAX_DONOR_NOTES_LEN
}

impl NgoVault {
    pub fn is_operational(&self) -> bool {
        self.status.is_operational()
    }

    pub fn unlocked_balance(&self) -> u64 {
        self.balance_kesh.saturating_sub(self.locked_for_milestones)
    }

    pub fn is_expired(&self, now: i64) -> bool {
        self.grant_expiry > 0 && now > self.grant_expiry
    }
}
