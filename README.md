# MNETI Protocol — Phase 1

## What is implemented in Phase 1

### Phase 1A — mneti-kesh (KESH Stablecoin)
| Feature                        | File                          |
|-------------------------------|-------------------------------|
| KESH SPL token mint creation  | instructions/mod.rs           |
| Protocol global state (PDA)   | state.rs → ProtocolState      |
| Per-wallet state + daily limits| state.rs → WalletState        |
| Mint KESH on M-Pesa deposit   | instructions/mod.rs → mint_kesh|
| Burn KESH on M-Pesa withdrawal| instructions/mod.rs → burn_kesh|
| KES/USD peg rate update       | instructions/mod.rs → update_peg|
| T-bill yield tracking         | state.rs → tbill_yield_bps    |
| Emergency pause / unpause     | instructions/mod.rs → pause   |
| Immutable deposit audit trail | state.rs → BridgeDeposit      |
| Compliance tier daily limits  | state.rs → WalletState        |
| 0.30% protocol fee on mint/burn| constants.rs → DEFAULT_FEE_BPS|
| RBAC operator check on mint   | reads mneti-rbac PDA          |

### Phase 1B — mneti-vault-registry (Master Vault Registry)
| Feature                        | File                          |
|-------------------------------|-------------------------------|
| Registry global state (PDA)   | state.rs → RegistryState      |
| Register any vault type       | instructions/mod.rs → register_vault|
| Vault types: Individual, Chama, SME, Enterprise, NGO | state.rs → VaultType |
| Vault status: Active, Suspended, Closed, PendingKyc | state.rs → VaultStatus |
| Update vault status           | instructions/mod.rs → update_vault_status|
| Deregister / close vault      | instructions/mod.rs → deregister_vault|
| Vault counter (total vaults)  | state.rs → RegistryState      |
| Per-vault KESH balance tracking| state.rs → VaultEntry        |
| Compliance tier per vault     | state.rs → VaultEntry         |
| RBAC gating on registration   | reads mneti-rbac PDA          |

### Phase 1C — mneti-rbac (Role-Based Access Control)
| Feature                        | File                          |
|-------------------------------|-------------------------------|
| Role registry global state    | state.rs → RoleRegistry       |
| 10 roles defined              | state.rs → Role enum          |
| Grant role to wallet          | instructions/mod.rs → grant_role|
| Revoke role from wallet       | instructions/mod.rs → revoke_role|
| Role expiry (time-limited roles)| state.rs → RoleAssignment   |
| Transfer super admin          | instructions/mod.rs → transfer_admin|
| Check role (read by other programs)| state.rs → RoleAssignment PDA|
| Role assignment audit trail   | events.rs → RoleGranted/Revoked|
| Per-wallet per-role PDA       | state.rs → RoleAssignment     |

## Roles
| Role | Who Uses It |
|------|------------|
| SuperAdmin | Rafiki team multisig |
| ComplianceOfficer | Freeze wallets, revoke credentials |
| OracleOperator | Submit SIX price updates |
| BridgeOperator | M-Pesa backend — mint/burn KESH |
| Auditor | Read-only access to all data |
| Custodian | Control collateral custody |
| SmeOwner | Manage SME business vault |
| ChamaMember | Participate in group savings |
| NgoDisbursement | Trigger conditional grants |
| Individual | Basic deposit/withdraw |

## How to run

```bash
# Step 1 — Generate program keypairs and sync IDs (run once)
chmod +x scripts/setup.sh && ./scripts/setup.sh

# Step 2 — Build all three programs
anchor build

# Step 3 — Run local validator (new terminal)
solana-test-validator

# Step 4 — Run all tests
anchor test
```
