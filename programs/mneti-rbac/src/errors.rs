use anchor_lang::prelude::*;

#[error_code]
pub enum RbacError {
    #[msg("Unauthorized — caller does not have SuperAdmin or ComplianceOfficer role")]
    Unauthorized,
    #[msg("Role already assigned to this wallet")]
    RoleAlreadyAssigned,
    #[msg("Role not found for this wallet")]
    RoleNotFound,
    #[msg("Role assignment has expired")]
    RoleExpired,
    #[msg("Role assignment is not active")]
    RoleInactive,
    #[msg("Cannot revoke SuperAdmin — use transfer_admin")]
    CannotRevokeAdmin,
    #[msg("Invalid role discriminant")]
    InvalidRole,
    #[msg("Cannot grant SuperAdmin through grant_role — use transfer_admin")]
    CannotGrantSuperAdmin,
    #[msg("New admin cannot be same as current admin")]
    SameAdminWallet,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
}
