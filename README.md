# MNETI - Branch B: Phase 2 Complete

> **Status**: Core KESH Token + Oracle Infrastructure  
> **Parent**: `main` → This branch adds oracle infrastructure and backend framework

## Overview

Branch B introduces the **Oracle Infrastructure** and **Backend Framework** to the MNETI (M-Pesa Networked Token Infrastructure) protocol. This phase builds on the Phase 1 KESH token foundation by adding price feed oracles, role-based access control (RBAC), and vault registry systems.

## What Changed from `main`

### New Programs Added
- **`mneti-oracle`** - Price feed aggregation from Pyth and Switchboard
- **`mneti-rbac`** - Role-based access control for protocol governance
- **`mneti-vault-registry`** - Vault registration and management system

### Backend Infrastructure
- **TypeScript backend** with Solana integration
- **Oracle clients**: Pyth and Switchboard price feed integration
- **Logger utility** for structured logging
- **Environment configuration** via `.env.example`

### Modified Programs
- **`mneti-kesh`** - Enhanced with oracle integration hooks

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MNETI Phase 2                        │
├─────────────────────────────────────────────────────────┤
│  Backend Layer     │  Oracle Layer    │  Token Layer  │
│  ──────────────    │  ────────────    │  ──────────   │
│  • Node/TypeScript │  • Pyth Client   │  • KESH Token │
│  • Config/Solana   │  • Switchboard   │  • Mint/Burn  │
│  • Logger          │  • Price Feeds   │  • Transfers  │
├─────────────────────────────────────────────────────────┤
│  Access Control    │  Vault Registry                   │
│  ─────────────     │  ──────────────                   │
│  • RBAC Program    │  • Vault Registration             │
│  • Role Management │  • Vault Discovery                │
└─────────────────────────────────────────────────────────┘
```

## Programs

| Program | ID (Localnet) | Purpose |
|---------|--------------|---------|
| `mneti_kesh` | `AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR` | KESH stablecoin token |
| `mneti_oracle` | `4XQ2yp1pxQsypbAQposX1a8jLzFZFbjar28Sf7ruiSRU` | Price feed aggregation |
| `mneti_rbac` | *(derived)* | Role-based access control |
| `mneti_vault_registry` | *(derived)* | Vault management |

## Key Features

1. **Oracle Price Feeds**: Real-time KES/USD price from Pyth and Switchboard
2. **RBAC System**: Granular permission management for protocol operations
3. **Vault Registry**: On-chain vault discovery and metadata
4. **Backend Framework**: Node.js/TypeScript foundation for off-chain services

## Build & Test

```bash
# Install dependencies
npm install

# Build all programs
anchor build

# Run tests
anchor test --skip-local-validator
```

## Branch Progression

- `main` → `branchB`: Added oracle infrastructure + backend
- `branchB` → `branchC`: Add compliance + MPesa bridge *(see branchC README)*
- `branchC` → `branchD`: Add payments + travel rule *(see branchD README)*

## Notes

- Oracle program uses **Box<>** pattern for stack optimization
- Backend includes placeholder oracle relay runner
- This branch is stable and builds successfully with Anchor 0.30.1
