# MNETI - Branch C: Phase 3 & 4 Complete

> **Status**: Compliance Engine + MPesa Bridge Integration  
> **Parent**: `branchB` → This branch adds compliance framework and MPesa bridge

## Overview

Branch C introduces the **Compliance Engine** and **MPesa Bridge Integration** to the MNETI protocol. This phase enables real-world fiat on/off-ramp functionality through MPesa integration and adds zero-knowledge privacy features for regulatory compliance.

## What Changed from `branchB`

### New Programs Added
- **`mneti-compliance`** - AML/KYC compliance screening with tiered limits
- **`circuits/credit-score`** - Zero-knowledge credit score verification (Circom)
- **`circuits/kyc-compliance`** - Zero-knowledge KYC compliance proofs (Circom)

### MPesa Bridge Infrastructure
- **C2B (Customer-to-Business)** - MPesa paybill integration for deposits
- **B2C (Business-to-Customer)** - MPesa payout integration for withdrawals
- **Daraja Client** - Safaricom API integration
- **STK Push** - Mobile money push notifications

### Offline Queue System
- **SQLite queue database** - Persistent offline transaction storage
- **Queue processor** - Background job processing for failed transactions
- **Retry logic** - Exponential backoff for failed operations

### Backend Enhancements
- **Health check routes** - Service monitoring endpoints
- **MPesa routes** - REST API for MPesa operations
- **ZK proof generator SDK** - Client-side proof generation

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      MNETI Phase 3 & 4                               │
├─────────────────────────────────────────────────────────────────────┤
│   Compliance Layer    │   Bridge Layer    │   Privacy Layer        │
│   ────────────────    │   ────────────    │   ───────────          │
│   • mneti-compliance  │   • C2B Listener  │   • ZK Credit Score    │
│   • AML Screening     │   • B2C Payout    │   • ZK KYC Proofs      │
│   • Tiered Limits     │   • STK Push      │   • Circom Circuits    │
│   • KYC Verification  │   • Daraja API    │   • Proof Generation   │
├─────────────────────────────────────────────────────────────────────┤
│                    Offline Queue System                             │
│   ─────────────────────────────────────                             │
│   • SQLite persistence  • Retry processor  • Failed tx recovery     │
└─────────────────────────────────────────────────────────────────────┘
```

## Programs

| Program | Purpose |
|---------|---------|
| `mneti_kesh` | KESH stablecoin token (enhanced with compliance hooks) |
| `mneti_oracle` | Price feed aggregation |
| `mneti_rbac` | Role-based access control |
| `mneti_vault_registry` | Vault management |
| `mneti_compliance` | **NEW**: AML/KYC compliance screening |

## Compliance Features

### Tiered Limits
- **Tier 0**: 1,000 USD daily limit (basic KYC)
- **Tier 1**: 10,000 USD daily limit (enhanced KYC)
- **Tier 2**: 100,000 USD daily limit (institutional)

### Screening Types
- **Real-time AML** - Wallet address screening
- **Velocity checks** - Transaction frequency monitoring
- **Geographic restrictions** - Jurisdiction-based controls

## MPesa Integration

### C2B (Deposit Flow)
1. User initiates deposit via MPesa paybill
2. C2B listener receives Safaricom callback
3. Oracle verifies KES/USD price
4. KESH tokens minted to user wallet

### B2C (Withdrawal Flow)
1. User requests KESH withdrawal
2. Compliance engine validates limits
3. KESH tokens burned
4. B2C payout initiated to MPesa number

## Zero-Knowledge Circuits

| Circuit | Purpose | Constraints |
|---------|---------|-------------|
| `credit_score.circom` | Prove credit score > threshold without revealing score | ~10,000 |
| `kyc_compliance.circom` | Prove KYC status without revealing PII | ~5,000 |

## Build & Test

```bash
# Build circuits
circuits/scripts/build_all.sh

# Generate ZK proof
circuits/scripts/generate_proof.sh credit-score

# Build all programs
anchor build

# Run compliance tests
anchor test --skip-local-validator tests/phase3.test.ts

# Run bridge tests
anchor test --skip-local-validator tests/phase4.test.ts
```

## Environment Variables

```bash
# MPesa Daraja API
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=your_shortcode

# Compliance API
COMPLIANCE_API_URL=https://api.compliance-provider.com
COMPLIANCE_API_KEY=your_api_key

# Database
DATABASE_URL=./data/mneti_queue.db
```

## Branch Progression

- `main` → `branchB`: Oracle infrastructure + backend *(see branchB README)*
- `branchB` → `branchC`: **Compliance + MPesa bridge** *(this branch)*
- `branchC` → `branchD`: Add payments + travel rule *(see branchD README)*

## Notes

- SQLite database auto-creates at `backend/data/mneti_queue.db`
- ZK circuits require Circom 2.0+ and snarkjs
- MPesa integration requires Safaricom Daraja API credentials
- Compliance screening is async with queue-based retry
