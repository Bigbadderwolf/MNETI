// ─────────────────────────────────────────────────────────────
//  MNETI VAULT REGISTRY — constants.rs
// ─────────────────────────────────────────────────────────────

/// Global registry PDA seed
pub const REGISTRY_STATE_SEED: &[u8] = b"vault_registry_state";

/// Per-vault entry PDA seed
/// Derived as: [VAULT_ENTRY_SEED, owner_pubkey, vault_type_byte]
pub const VAULT_ENTRY_SEED: &[u8] = b"vault_entry";

/// Vault type discriminants
pub const VAULT_INDIVIDUAL:  u8 = 0;
pub const VAULT_CHAMA:       u8 = 1;
pub const VAULT_SME:         u8 = 2;
pub const VAULT_ENTERPRISE:  u8 = 3;
pub const VAULT_NGO:         u8 = 4;

/// Maximum vaults one wallet can own
pub const MAX_VAULTS_PER_WALLET: u8 = 3;
