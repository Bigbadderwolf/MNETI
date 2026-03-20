// ─────────────────────────────────────────────────────────────
//  MNETI RBAC — errors.rs
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

#[error_code]
pub enum RbacError {
    #[msg("Unauthorized — caller does not have SuperAdmin or ComplianceOfficer role")]
    Unauthorized,

    #[msg("Role assignment already exists for this wallet and role")]
    RoleAlreadyAssigned,

    #[msg("Role assignment not found for this wallet and role")]
    RoleNotFound,

    #[msg("Role assignment has expired")]
    RoleExpired,

    #[msg("Role assignment is not active")]
    RoleInactive,

    #[msg("Cannot revoke SuperAdmin — transfer admin first")]
    CannotRevokeAdmin,

    #[msg("Invalid role discriminant provided")]
    InvalidRole,

    #[msg("Cannot grant SuperAdmin through grant_role — use transfer_admin")]
    CannotGrantSuperAdmin,

    #[msg("New admin wallet cannot be the same as current admin")]
    SameAdminWallet,

    #[msg("Invalid expiry — expiry must be in the future")]
    InvalidExpiry,
}
