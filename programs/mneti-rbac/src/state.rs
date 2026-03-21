use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum Role {
    SuperAdmin        = 0,
    ComplianceOfficer = 1,
    OracleOperator    = 2,
    BridgeOperator    = 3,
    Auditor           = 4,
    Custodian         = 5,
    SmeOwner          = 6,
    ChamaMember       = 7,
    NgoDisbursement   = 8,
    Individual        = 9,
}

impl Role {
    pub fn from_discriminant(d: u8) -> Option<Self> {
        match d {
            0 => Some(Role::SuperAdmin),
            1 => Some(Role::ComplianceOfficer),
            2 => Some(Role::OracleOperator),
            3 => Some(Role::BridgeOperator),
            4 => Some(Role::Auditor),
            5 => Some(Role::Custodian),
            6 => Some(Role::SmeOwner),
            7 => Some(Role::ChamaMember),
            8 => Some(Role::NgoDisbursement),
            9 => Some(Role::Individual),
            _ => None,
        }
    }
}

#[account]
#[derive(Default)]
pub struct RoleRegistry {
    pub authority:         Pubkey,
    pub total_assignments: u64,
    pub bump:              u8,
}

impl RoleRegistry {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct RoleAssignment {
    pub wallet:        Pubkey,
    pub role:          Role,
    pub role_disc:     u8,
    pub granted_by:    Pubkey,
    pub granted_at:    i64,
    pub expires_at:    Option<i64>,
    pub is_active:     bool,
    pub revoke_reason: String,
    pub bump:          u8,
}

impl RoleAssignment {
    pub const LEN: usize = 8 + 32 + 2 + 1 + 32 + 8 + 9 + 1 + (4 + 100) + 1;

    pub fn is_valid(&self, now: i64) -> bool {
        if !self.is_active { return false; }
        if let Some(expiry) = self.expires_at {
            if now > expiry { return false; }
        }
        true
    }
}
