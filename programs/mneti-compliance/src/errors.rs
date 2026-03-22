use anchor_lang::prelude::*;

#[error_code]
pub enum ComplianceError {
    #[msg("Unauthorized — caller does not have required role")]
    Unauthorized,

    #[msg("Invalid ZK proof — verification failed")]
    InvalidProof,

    #[msg("Proof public inputs are invalid or out of range")]
    InvalidPublicInputs,

    #[msg("Compliance credential already exists for this wallet")]
    CredentialAlreadyExists,

    #[msg("Compliance credential not found for this wallet")]
    CredentialNotFound,

    #[msg("Compliance credential has expired — please renew KYC")]
    CredentialExpired,

    #[msg("Wallet is frozen — contact compliance officer")]
    WalletFrozen,

    #[msg("Compliance tier is insufficient for this operation")]
    InsufficientTier,

    #[msg("Credit score credential not found")]
    CreditScoreNotFound,

    #[msg("Credit score is below minimum threshold for this loan")]
    InsufficientCreditScore,

    #[msg("Jurisdiction is not permitted")]
    JurisdictionNotPermitted,

    #[msg("Wallet is on sanctions list")]
    SanctionsHit,

    #[msg("Invalid credit score — must be 300–850")]
    InvalidCreditScore,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Invalid parameter")]
    InvalidParameter,
}
