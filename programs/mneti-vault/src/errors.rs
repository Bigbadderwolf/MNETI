use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    // ─── Access ───────────────────────────────────────────────────────────────
    #[msg("Unauthorized: caller does not have the required role or ownership")]
    Unauthorized,

    #[msg("Wallet is frozen by compliance — cannot perform vault operations")]
    WalletFrozen,

    #[msg("KYC tier too low for this vault type")]
    InsufficientKycTier,

    #[msg("Vault is paused — deposits and withdrawals are suspended")]
    VaultPaused,

    #[msg("Vault is frozen by compliance authority")]
    VaultFrozen,

    #[msg("Vault is already closed")]
    VaultClosed,

    // ─── Deposit / Withdraw ───────────────────────────────────────────────────
    #[msg("Amount is below the minimum deposit threshold (KES 50)")]
    BelowMinimumAmount,

    #[msg("Insufficient vault balance for this withdrawal")]
    InsufficientBalance,

    #[msg("Withdrawal would exceed the daily limit for this wallet tier")]
    DailyLimitExceeded,

    #[msg("Individual vault balance would exceed maximum allowed (KES 1,000,000)")]
    MaxBalanceExceeded,

    // ─── Chama Governance ─────────────────────────────────────────────────────
    #[msg("Chama is at maximum member capacity (50 members)")]
    ChamaFull,

    #[msg("Wallet is already a member of this chama")]
    AlreadyMember,

    #[msg("Wallet is not a member of this chama")]
    NotMember,

    #[msg("Member is not active — they have been removed from the chama")]
    MemberInactive,

    #[msg("Proposal index out of range for this chama")]
    ProposalNotFound,

    #[msg("Proposal has expired and can no longer be voted on or executed")]
    ProposalExpired,

    #[msg("Proposal has already been executed")]
    ProposalAlreadyExecuted,

    #[msg("Proposal has been cancelled")]
    ProposalCancelled,

    #[msg("Insufficient votes to execute this proposal")]
    InsufficientVotes,

    #[msg("Member has already voted on this proposal")]
    AlreadyVoted,

    #[msg("Chama already has the maximum number of active proposals (10)")]
    TooManyActiveProposals,

    #[msg("Cannot remove the chama creator — transfer admin first")]
    CannotRemoveCreator,

    // ─── SME / Enterprise Multisig ────────────────────────────────────────────
    #[msg("Signer is already registered for this vault")]
    SignerAlreadyExists,

    #[msg("Vault is at maximum signer capacity")]
    TooManySigners,

    #[msg("Multisig threshold must be ≥ 1 and ≤ signer count")]
    InvalidThreshold,

    #[msg("Signer not found in vault signer list")]
    SignerNotFound,

    #[msg("Payroll reserve allocation exceeds available balance")]
    PayrollReserveOverflow,

    #[msg("Tax reserve allocation exceeds available balance")]
    TaxReserveOverflow,

    // ─── NGO Grant Vaults ─────────────────────────────────────────────────────
    #[msg("Grant vault has expired — no further disbursements permitted")]
    GrantExpired,

    #[msg("Disbursement exceeds remaining unlocked grant balance")]
    DisbursementExceedsUnlocked,

    #[msg("Milestone is already marked as completed")]
    MilestoneAlreadyCompleted,

    #[msg("All milestones must be completed before closing grant vault")]
    MilestonesIncomplete,

    #[msg("Maximum number of milestones reached (10)")]
    TooManyMilestones,

    // ─── Yield ────────────────────────────────────────────────────────────────
    #[msg("Yield has already been harvested today — try again after next epoch")]
    YieldAlreadyHarvestedToday,

    #[msg("No yield accrued yet — minimum 1 day required")]
    NoYieldAccrued,

    // ─── Oracle ───────────────────────────────────────────────────────────────
    #[msg("T-bill yield oracle data is stale — cannot compute yield distribution")]
    StaleYieldOracle,

    #[msg("Oracle circuit breaker is active — vault yield operations suspended")]
    OracleCircuitBreaker,

    // ─── Savings Goals ────────────────────────────────────────────────────────
    #[msg("Maximum savings goals reached for this vault (5)")]
    TooManySavingsGoals,

    #[msg("Savings goal not found at specified index")]
    GoalNotFound,

    #[msg("Savings goal is already completed")]
    GoalAlreadyCompleted,

    // ─── Closing ──────────────────────────────────────────────────────────────
    #[msg("Vault must have zero balance before closing")]
    VaultNotEmpty,

    #[msg("Chama must have zero members before closing")]
    ChamaHasMembers,

    // ─── Arithmetic ───────────────────────────────────────────────────────────
    #[msg("Arithmetic overflow in vault calculation")]
    MathOverflow,
}
