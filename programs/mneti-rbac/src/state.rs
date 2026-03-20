// ─────────────────────────────────────────────────────────────
//  MNETI RBAC — state.rs
// ─────────────────────────────────────────────────────────────

use anchor_lang::prelude::*;

// ── ROLE ENUM ─────────────────────────────────────────────────
/// All roles in the MNETI protocol
/// The u8 discriminant matches constants.rs and is used in PDA derivation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum Role {
    /// Rafiki team multisig — full system control
    SuperAdmin         = 0,
    /// Can freeze wallets, revoke credentials, pause protocol
    ComplianceOfficer  = 1,
    /// Backend service — submits SIX/Pyth price updates
    OracleOperator     = 2,
    /// M-Pesa bridge backend — can mint and burn KESH
    BridgeOperator     = 3,
    /// Read-only access to all accounts for regulatory reporting
    Auditor            = 4,
    /// Controls collateral custody addresses
    Custodian          = 5,
    /// Manages an SME business vault
    SmeOwner           = 6,
    /// Participates in a chama group savings vault
    ChamaMember        = 7,
    /// NGO/government — can trigger conditional grant disbursements
    NgoDisbursement    = 8,
    /// Basic individual user — deposit, withdraw, transfer
    Individual         = 9,
}

impl Role {
    pub fn to_discriminant(&self) -> u8 {
        match self {
            Role::SuperAdmin        => 0,
            Role::ComplianceOfficer => 1,
            Role::OracleOperator    => 2,
            Role::BridgeOperator    => 3,
            Role::Auditor           => 4,
            Role::Custodian         => 5,
            Role::SmeOwner          => 6,
            Role::ChamaMember       => 7,
            Role::NgoDisbursement   => 8,
            Role::Individual        => 9,
        }
    }

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

// ── ROLE REGISTRY ─────────────────────────────────────────────
/// Single global registry — one per deployment
#[account]
#[derive(Default)]
pub struct RoleRegistry {
    /// SuperAdmin wallet — the only wallet that can call transfer_admin
    pub authority:          Pubkey,
    /// Total active role assignments across all wallets
    pub total_assignments:  u64,
    /// PDA bump seed
    pub bump:               u8,
}

impl RoleRegistry {
    pub const LEN: usize = 8
        + 32    // authority
        + 8     // total_assignments
        + 1;    // bump
}

// ── ROLE ASSIGNMENT ───────────────────────────────────────────
/// One per wallet per role — the atomic unit of access control
/// PDA seeds: [ROLE_ASSIGNMENT_SEED, wallet, role_discriminant_byte]
#[account]
pub struct RoleAssignment {
    /// Wallet that holds this role
    pub wallet:       Pubkey,
    /// The role assigned
    pub role:         Role,
    /// Role discriminant as u8 (for easier PDA lookups)
    pub role_disc:    u8,
    /// Who granted this role (ComplianceOfficer or SuperAdmin)
    pub granted_by:   Pubkey,
    /// When this role was granted
    pub granted_at:   i64,
    /// Optional expiry — None means permanent, Some(ts) = expires at timestamp
    pub expires_at:   Option<i64>,
    /// Is this assignment currently active?
    pub is_active:    bool,
    /// Reason for most recent revocation (empty if active)
    pub revoke_reason: String,
    /// PDA bump seed
    pub bump:         u8,
}

impl RoleAssignment {
    pub const LEN: usize = 8
        + 32    // wallet
        + 2     // role enum (1 byte discriminant + safety)
        + 1     // role_disc
        + 32    // granted_by
        + 8     // granted_at
        + 9     // Option<i64> expires_at (1 tag + 8 data)
        + 1     // is_active
        + 4 + 100  // String revoke_reason (4 len prefix + 100 max chars)
        + 1;    // bump

    /// Check if this role assignment is currently valid
    pub fn is_valid(&self, now: i64) -> bool {
        if !self.is_active {
            return false;
        }
        if let Some(expiry) = self.expires_at {
            if now > expiry {
                return false;
            }
        }
        true
    }
}
