use anchor_lang::prelude::*;

// ─── Vault Lifecycle Events ───────────────────────────────────────────────────

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub vault_type: u8,
    pub timestamp: i64,
}

#[event]
pub struct VaultClosed {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub vault_type: u8,
    pub timestamp: i64,
}

#[event]
pub struct VaultStatusChanged {
    pub vault: Pubkey,
    pub vault_type: u8,
    pub old_status: u8,
    pub new_status: u8,
    pub authority: Pubkey,
    pub timestamp: i64,
}

// ─── Deposit / Withdraw Events ────────────────────────────────────────────────

#[event]
pub struct VaultDeposit {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub vault_type: u8,
    pub amount: u64,
    pub new_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct VaultWithdrawal {
    pub vault: Pubkey,
    pub recipient: Pubkey,
    pub vault_type: u8,
    pub amount: u64,
    pub new_balance: u64,
    pub timestamp: i64,
}

// ─── Yield Events ─────────────────────────────────────────────────────────────

#[event]
pub struct YieldHarvested {
    pub vault: Pubkey,
    pub vault_type: u8,
    pub yield_amount: u64,
    pub fee_amount: u64,
    pub tbill_yield_bps: u64,
    pub timestamp: i64,
}

#[event]
pub struct YieldDistributed {
    pub vault: Pubkey,             // chama vault
    pub vault_type: u8,
    pub total_yield: u64,
    pub members_paid: u32,
    pub per_member_amount: u64,
    pub timestamp: i64,
}

// ─── Savings Goal Events ──────────────────────────────────────────────────────

#[event]
pub struct SavingsGoalCreated {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub goal_index: u8,
    pub target_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct SavingsGoalCompleted {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub goal_index: u8,
    pub amount_saved: u64,
    pub timestamp: i64,
}

// ─── Chama Events ─────────────────────────────────────────────────────────────

#[event]
pub struct ChamaMemberAdded {
    pub chama_vault: Pubkey,
    pub new_member: Pubkey,
    pub member_count: u32,
    pub timestamp: i64,
}

#[event]
pub struct ChamaMemberRemoved {
    pub chama_vault: Pubkey,
    pub removed_member: Pubkey,
    pub member_count: u32,
    pub timestamp: i64,
}

#[event]
pub struct ChamaContribution {
    pub chama_vault: Pubkey,
    pub member: Pubkey,
    pub amount: u64,
    pub new_vault_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct ChamaProposalCreated {
    pub chama_vault: Pubkey,
    pub proposer: Pubkey,
    pub proposal_index: u32,
    pub proposal_type: u8,
    pub amount: u64,
    pub expires_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct ChamaProposalVoted {
    pub chama_vault: Pubkey,
    pub proposal_index: u32,
    pub voter: Pubkey,
    pub vote: bool,   // true = for, false = against
    pub votes_for: u32,
    pub votes_against: u32,
    pub timestamp: i64,
}

#[event]
pub struct ChamaProposalExecuted {
    pub chama_vault: Pubkey,
    pub proposal_index: u32,
    pub proposal_type: u8,
    pub executor: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ChamaRotationPayout {
    pub chama_vault: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub rotation_index: u32,
    pub timestamp: i64,
}

// ─── SME Events ───────────────────────────────────────────────────────────────

#[event]
pub struct PayrollReserveSet {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub reserve_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct TaxReserveSet {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub reserve_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct SmeSignerAdded {
    pub vault: Pubkey,
    pub signer: Pubkey,
    pub new_threshold: u8,
    pub timestamp: i64,
}

// ─── NGO Events ───────────────────────────────────────────────────────────────

#[event]
pub struct GrantDisbursed {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub milestone_index: u8,
    pub timestamp: i64,
}

#[event]
pub struct MilestoneCompleted {
    pub vault: Pubkey,
    pub milestone_index: u8,
    pub unlocked_amount: u64,
    pub timestamp: i64,
}
