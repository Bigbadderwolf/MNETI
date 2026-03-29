# MNETI Project - Complete Workflow & Architecture Guide

> **Version**: 1.0  
> **Project**: MNETI (M-Pesa Networked Token Infrastructure)  
> **Status**: Production-Ready (Phase 5/6 Complete)

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [File-by-File Breakdown](#2-file-by-file-breakdown)
3. [Complete User Workflows](#3-complete-user-workflows)
4. [Data Flow Summary](#4-data-flow-summary)
5. [Key Integration Points](#5-key-integration-points)
6. [Deployment Artifacts](#6-deployment-artifacts)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
│                         (Mobile/Wallet/DApp)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND API LAYER                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │  MPesa Routes │ │Payment Routes│ │Compliance API│ │  Health API  │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │  IPFS Client │ │  ZK Proofs   │ │ Oracle Relay │ │   Logger     │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CRANK/AUTOMATION LAYER                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ Yield Crank  │ │Payroll Crank │ │ Remittance   │ │ Queue Proc   │       │
│  │ (Auto-harvest)│ │(Auto-stream) │ │  Listener    │ │ (Offline tx) │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SOLANA PROGRAM LAYER                              │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │   mneti-kesh    │  │  mneti-oracle   │  │ mneti-compliance│            │
│  │   (KESH Token)  │  │  (Price Feeds)  │  │ (AML/KYC/Tiers) │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │ mneti-payments  │  │mneti-travel-rule│  │  mneti-vault    │            │
│  │ (Streams/Payroll)│  │ (FATF Remittance)│  │(Yield Strategies)│            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BRIDGE LAYER                                    │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  MPesa C2B   │  │  MPesa B2C   │  │  Daraja API  │  │   STK Push   │ │
│  │ (Deposits)   │  │ (Withdrawals)│  │  (Safaricom) │  │  (Mobile)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. File-by-File Breakdown

### **Root Configuration Files**

| File | Purpose |
|------|---------|
| `Anchor.toml` | Anchor workspace config—defines 6 programs, devnet/localnet program IDs, build settings |
| `Cargo.toml` | Workspace-level Rust dependencies, release profile optimizations |
| `package.json` | Node.js dependencies for testing (Mocha, Chai, Anchor JS SDK) |
| `tsconfig.json` | TypeScript compiler settings for test files |
| `.gitignore` | Excludes `target/`, `node_modules/`, `.anchor/`, keypairs from git |

### **Programs Directory** (On-Chain Logic)

Each program folder (`programs/mneti-*/`) contains:
- `src/lib.rs` — Program entry point, instruction handlers
- `src/instructions/mod.rs` — Account validation structs, business logic
- `src/state.rs` — Data structures (accounts stored on Solana)
- `src/errors.rs` — Custom error codes
- `src/events.rs` — On-chain event logs (for indexing)
- `src/constants.rs` — Hardcoded seeds, limits, fees
- `Cargo.toml` — Program-specific dependencies

**Program Details:**

| Program | Key Files | What It Does |
|---------|-----------|--------------|
| `mneti-kesh` | `instructions/mod.rs` (Mint/Transfer/Burn) | KESH stablecoin—mint when MPesa deposit arrives, burn on withdrawal, tiered daily limits |
| `mneti-oracle` | `instructions/mod.rs` (PushPrice) | Aggregates KES/USD price from Pyth + Switchboard, stores in on-chain `OracleState` |
| `mneti-compliance` | `instructions/mod.rs` (ScreenWallet, SetTier) | AML screening, KYC tier management (Tier0/1/2 limits), velocity checks |
| `mneti-payments` | `instructions/mod.rs` (CreateStream, ExecutePayroll) | Payment streaming, payroll batches, escrow holding, batch payments |
| `mneti-travel-rule` | `mod.rs` (InitiateRemittance, ConfirmTravelRule) | FATF Travel Rule compliance—VASPs exchange sender/receiver data cross-border |
| `mneti-vault` | `instructions/mod.rs` (CreateVault, HarvestYield) | Yield-bearing vaults—auto-harvest from strategies, distribute to depositors |

### **Backend Directory** (Off-Chain Services)

| File/Folder | Purpose |
|-------------|---------|
| `src/index.ts` | Main entry—initializes Solana connection, loads programs, starts cranks |
| `src/config/solana.ts` | RPC endpoint config, program ID constants, wallet setup |
| `src/routes/mpesa.ts` | REST API for MPesa callbacks (C2B), STK push initiation |
| `src/routes/payments.ts` | API for creating payment streams, viewing payroll status |
| `src/routes/compliance.ts` | API for screening requests, KYC tier checks |
| `src/routes/health.ts` | Health check endpoint for monitoring |
| `src/cranks/yield_crank.ts` | Background job—harvests yield from strategies, distributes to vaults |
| `src/cranks/payroll_crank.ts` | Background job—executes scheduled payroll streams |
| `src/bridge/mpesa/c2b/listener.ts` | HTTP listener for Safaricom C2B callbacks (deposits) |
| `src/bridge/mpesa/b2c/payout.ts` | Handles B2C withdrawals to MPesa |
| `src/bridge/mpesa/daraja/client.ts` | Safaricom Daraja API client (auth, STK push, balance query) |
| `src/bridge/mpesa/queue/offline_queue.ts` | SQLite-based queue for failed transactions |
| `src/bridge/mpesa/queue/processor.ts` | Retries failed MPesa operations with backoff |
| `src/bridge/solana/kesh_bridge.ts` | On-chain bridging logic—mint/burn KESH |
| `src/oracle/pyth/client.ts` | Pyth price feed client |
| `src/oracle/six/client.ts` | Switchboard price feed client |
| `src/oracle/relay/runner.ts` | Fetches off-chain prices, pushes to on-chain oracle |
| `src/services/ipfs/ipfs_client.ts` | IPFS upload/download for audit logs, compliance docs |
| `src/utils/logger.ts` | Winston logger configuration |
| `.env` | Environment variables—RPC URLs, MPesa credentials, API keys |

### **SDK Directory** (Client Libraries)

| File | Purpose |
|------|---------|
| `src/payments/payments_client.ts` | TypeScript SDK for creating/managing payment streams |
| `src/vaults/vault_client.ts` | SDK for vault deposits, withdrawals, yield claiming |
| `src/travel_rule/travel_rule_client.ts` | SDK for initiating/completing remittances with Travel Rule |
| `src/zk/proof_generator.ts` | Zero-knowledge proof generation (credit score, KYC) |

### **Circuits Directory** (Zero-Knowledge)

| File | Purpose |
|------|---------|
| `credit-score/src/credit_score.circom` | Circuit: Prove credit score > threshold without revealing score |
| `kyc-compliance/src/kyc_compliance.circom` | Circuit: Prove KYC status without revealing PII |
| `scripts/build_all.sh` | Builds all circuits, generates verification keys |
| `scripts/generate_proof.sh` | Generates ZK proofs for specific circuits |

### **Tests Directory**

| File | What It Tests |
|------|---------------|
| `phase3.test.ts` | Compliance engine—tier limits, AML screening |
| `phase4.test.ts` | MPesa bridge—C2B deposits, B2C withdrawals |
| `phase5.test.ts` | Payment engine—streams, payroll, escrow |
| `phase6_travel_rule.test.ts` | Travel Rule—VASPs exchanging data |
| `phase6_payments.test.ts` | Payment integration end-to-end |
| `mneti.test.ts` | Full protocol integration test |

### **Target Directory** (Build Outputs)

| Folder | Contents |
|--------|----------|
| `target/deploy/*.so` | Compiled BPF programs (deployed to Solana) |
| `target/deploy/*-keypair.json` | Program keypairs (addresses) |
| `target/idl/*.json` | IDL files—program interface definitions for client SDK |
| `target/types/*.ts` | TypeScript types generated from IDLs |

---

## 3. Complete User Workflows

### **Workflow 1: User Deposits via MPesa**

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User   │────▶│  MPesa App  │────▶│ Safaricom   │────▶│  MNETI      │
│ (Kenya) │     │   (STK Push)│     │   (Daraja)  │     │  Backend    │
└─────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                               │
                                                               ▼
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  KESH   │◀────│mneti-kesh   │◀────│ Compliance  │◀────│  Oracle     │
│ Tokens  │     │  Program     │     │  Check      │     │  (Price)    │
│Minted   │     │  (MintKesh)  │     │  (Tier OK?) │     │  (KES/USD)  │
└─────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Step-by-step:**
1. User sends MPesa to paybill number
2. Safaricom sends C2B callback to `src/bridge/mpesa/c2b/listener.ts`
3. Backend validates callback signature (Daraja auth)
4. Compliance engine checks user's daily tier limit (`mneti-compliance`)
5. Oracle fetches KES/USD price (`mneti-oracle`)
6. Backend calls `mneti-kesh` to mint KESH tokens to user's wallet
7. Event emitted, recorded in IPFS for audit

---

### **Workflow 2: User Sets Up Automated Payroll**

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│Employer │────▶│  Backend    │────▶│  mneti-pay  │────▶│  Stream     │
│(Create  │     │  (API)      │     │  ments      │     │  Created    │
│ Payroll)│     │             │     │  Program    │     │  On-Chain   │
└─────────┘     └─────────────┘     └──────┬──────┘     └─────────────┘
                                             │
                                             ▼
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│Employees│◀────│  Payroll    │◀────│  Yield      │◀────│  Vault      │
│(Paid)   │     │  Crank      │     │  Crank      │     │  (Optional) │
│         │     │  (Auto-exec)│     │  (Fund it)  │     │             │
└─────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Step-by-step:**
1. Employer calls `/payments/payroll` with employee list + amounts + schedule
2. Backend calls `mneti-payments` to create `PayrollAccount` on-chain
3. Employer funds payroll (can come from vault yield)
4. `payroll_crank.ts` runs every block/cron—executes `ExecutePayroll` instruction
5. Employees receive KESH automatically per schedule
6. Events logged, IPFS audit trail created

---

### **Workflow 3: Cross-Border Remittance (Travel Rule)**

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Alice  │────▶│ Originating │────▶│  Travel     │────▶│Beneficiary  │
│ (Kenya) │     │    VASP     │     │   Rule      │     │    VASP     │
│         │     │ (MNETI)       │     │  Exchange   │     │   (UK/US)   │
└─────────┘     └──────┬──────┘     └─────────────┘     └──────┬──────┘
                       │                                        │
                       ▼                                        ▼
              ┌─────────────┐                          ┌─────────────┐
              │mneti-travel-│                          │Compliance   │
              │    rule     │                          │Screening    │
              │  Program    │                          │(Receiver)   │
              └──────┬──────┘                          └─────────────┘
                     │
                     ▼
              ┌─────────────┐
              │   mneti-    │
              │   kesh      │◀────── Settlement (KESH transferred)
              │  (Transfer) │
              └─────────────┘
```

**Step-by-step:**
1. Alice initiates remittance to Bob in UK
2. Originating VASP (MNETI) collects Alice's KYC data
3. `mneti-travel-rule` program initiates remittance with encrypted PII hash
4. PII sent via secure channel to Beneficiary VASP
5. Beneficiary VASP screens Bob, confirms receipt
6. On-chain confirmation triggers KESH transfer
7. Bob receives KESH (can withdraw to local fiat via partner)
8. Full audit trail stored in IPFS for regulators

---

### **Workflow 4: Yield Vault Auto-Compounding**

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User   │────▶│  mneti-vault│────▶│  Deposits   │────▶│  Strategy   │
│ (Deposit│     │  Program    │     │  LP Tokens  │     │  (Yield     │
│  KESH)  │     │             │     │  (USDC/etc) │     │   Source)   │
└─────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                 │
                                                                 ▼
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ User    │◀────│  mneti-vault│◀────│  Yield      │◀────│  Yield      │
│ (Claim  │     │  (Distribute)│     │  Crank      │     │  Harvested  │
│  Yield) │     │             │     │  (Auto-run) │     │             │
└─────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Step-by-step:**
1. User deposits KESH into vault (becomes vault shares)
2. Vault deposits underlying assets to yield strategies (Solend, Marinade, etc.)
3. `yield_crank.ts` runs periodically—calls `HarvestYield` on vault
4. Yield harvested, distributed pro-rata to all depositors
5. User can `ClaimYield` anytime or let it auto-compound
6. All yield events logged on-chain + IPFS

---

## 4. Data Flow Summary

| Layer | Input | Processing | Output |
|-------|-------|------------|--------|
| **User** | MPesa/Wallet/App | Sign transaction | Signed tx |
| **Backend** | HTTP/API requests | Route, validate, queue | Program calls |
| **Crank** | Time/block triggers | Execute scheduled ops | On-chain txs |
| **Programs** | Instructions | Validate accounts, modify state | Events, state changes |
| **Bridge** | Callbacks/cron | Transform, relay | On/off-chain sync |
| **IPFS** | Audit events | Store immutable logs | Compliance evidence |

---

## 5. Key Integration Points

| External Service | Integration File | Purpose |
|------------------|------------------|---------|
| **Safaricom MPesa** | `bridge/mpesa/daraja/client.ts` | Fiat on/off-ramp |
| **Pyth Network** | `oracle/pyth/client.ts` | Price feeds |
| **Switchboard** | `oracle/six/client.ts` | Backup price feeds |
| **IPFS (Filebase/Pinata)** | `services/ipfs/ipfs_client.ts` | Audit storage |
| **Compliance APIs** | `compliance/screening.ts` | AML/KYC checks |
| **Travel Rule VASPs** | `travel_rule/client.ts` | Cross-border data exchange |

---

## 6. Deployment Artifacts

After `anchor build --provider.cluster devnet`:
```
target/
├── deploy/
│   ├── mneti_kesh.so              ← Deployed program
│   ├── mneti_kesh-keypair.json    ← Program address
│   ├── mneti_oracle.so
│   ├── mneti_oracle-keypair.json
│   └── ... (6 total)
└── idl/
    ├── mneti_kesh.json            ← Client SDK interface
    ├── mneti_oracle.json
    └── ...
```

The IDL files are used by the TypeScript SDK to know how to encode/decode instructions for each program.

---

## Quick Reference: Program IDs (Devnet Placeholders)

| Program | Devnet Address |
|---------|----------------|
| `mneti_kesh` | `AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR` |
| `mneti_oracle` | `4XQ2yp1pxQsypbAQposX1a8jLzFZFbjar28Sf7ruiSRU` |
| `mneti_compliance` | `7D5hBC1HhbDa6eahWFeVz79EPGK56v7nxgSCzWqTCPP6` |
| `mneti_payments` | `PAY6mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `mneti_travel_rule` | `TRL6mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `mneti_remittance` | `REM7mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |

---

*Document generated for MNETI Protocol - All Rights Reserved*
# Testnet demo link or a 2 min technical walkthrough video

/* Pitch video (max. 2-3 min) covering the problem, solution, key differentiators, and team */