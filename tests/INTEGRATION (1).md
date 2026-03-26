# Phase 7 Integration Guide — MNETI Remittance Corridor

## What Phase 7 adds

| Item | Details |
|---|---|
| Anchor program | `mneti-remittance` — USDC→KESH swap, 0.3% fee, 5 corridors |
| Backend service | `relay.ts` — listens for Solana events, triggers M-Pesa B2C |
| Backend service | `rates.ts` — SIX FX rate cache, quote builder |
| REST routes | `remittance.ts` — 5 endpoints mounted at `/api/remittance` |
| SDK | `remittance_client.ts` — TypeScript wrappers for all instructions |
| Tests | `phase7.test.ts` — 24 tests |

---

## Step 1 — Create directories

```bash
cd /mnt/c/Users/HP/Downloads/MNETI_P1_P2_INTEGRATED/MNETI

mkdir -p programs/mneti-remittance/src/instructions
mkdir -p backend/src/remittance/fx
mkdir -p backend/src/remittance/corridors
mkdir -p sdk/src/remittance
```

---

## Step 2 — Copy program files

```bash
# From the phase7 output folder:
cp phase7/programs/mneti-remittance/Cargo.toml         programs/mneti-remittance/Cargo.toml
cp phase7/programs/mneti-remittance/src/lib.rs         programs/mneti-remittance/src/lib.rs
cp phase7/programs/mneti-remittance/src/constants.rs   programs/mneti-remittance/src/constants.rs
cp phase7/programs/mneti-remittance/src/errors.rs      programs/mneti-remittance/src/errors.rs
cp phase7/programs/mneti-remittance/src/events.rs      programs/mneti-remittance/src/events.rs
cp phase7/programs/mneti-remittance/src/state.rs       programs/mneti-remittance/src/state.rs
cp phase7/programs/mneti-remittance/src/utils.rs       programs/mneti-remittance/src/utils.rs
cp phase7/programs/mneti-remittance/src/instructions/mod.rs \
   programs/mneti-remittance/src/instructions/mod.rs

# Verify
find programs/mneti-remittance -type f
# Expected: 8 files
```

---

## Step 3 — Update root Cargo.toml

Open `Cargo.toml` and add `"programs/mneti-remittance"` to the members list:

```toml
[workspace]
members = [
    "programs/mneti-rbac",
    "programs/mneti-vault-registry",
    "programs/mneti-kesh",
    "programs/mneti-oracle",
    "programs/mneti-compliance",
    "programs/mneti-vault",
    "programs/mneti-payments",
    "programs/mneti-travel-rule",
    "programs/mneti-remittance",    # ← ADD THIS
]
resolver = "2"
```

---

## Step 4 — Update Anchor.toml

Under `[programs.localnet]`, add:

```toml
mneti_remittance = "REM7mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

(Replace placeholder with real ID after `anchor build`)

---

## Step 5 — Copy backend services

```bash
cp phase7/backend/src/remittance/fx/rates.ts               backend/src/remittance/fx/rates.ts
cp phase7/backend/src/remittance/corridors/relay.ts         backend/src/remittance/corridors/relay.ts
cp phase7/backend/src/routes/remittance.ts                  backend/src/routes/remittance.ts
```

---

## Step 6 — Wire routes into backend/src/index.ts

Open `backend/src/index.ts` and add:

```typescript
// At the top with other imports:
import remittanceRoutes from "./routes/remittance";
import { startRemittanceRelay, startRemittanceEventListener } from "./remittance/corridors/relay";

// In your Express app setup (alongside existing routes):
app.use("/api/remittance", remittanceRoutes);

// In your main() startup function (alongside startYieldCrank etc.):
startRemittanceEventListener(connection, remittanceProgram);
startRemittanceRelay(connection, remittanceProgram, operatorKeypair);
```

---

## Step 7 — Copy SDK and tests

```bash
cp phase7/sdk/src/remittance/remittance_client.ts   sdk/src/remittance/remittance_client.ts
cp phase7/tests/phase7.test.ts                       tests/phase7.test.ts
```

---

## Step 8 — Add environment variables

Append to `backend/.env`:

```bash
# Phase 7 — Remittance Corridor
REMITTANCE_PROGRAM_ID=REM7mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
REMITTANCE_DB_PATH=./remittance_relay.db
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v   # Devnet USDC

# Daraja B2C (Safaricom M-Pesa — leave blank for mock mode)
DARAJA_B2C_SHORTCODE=
DARAJA_B2C_INITIATOR_PASSWORD=
DARAJA_INITIATOR_NAME=MNETI_API
DARAJA_B2C_RESULT_URL=https://api.mneti.io/api/remittance/b2c/result

# SIX Financial (leave blank for mock FX rates)
SIX_API_KEY=
```

---

## Step 9 — Build

```bash
anchor build
```

After build completes, get the real program ID:

```bash
anchor keys list
# Find: mneti_remittance = <REAL_ID>
```

Update the placeholder in:
1. `programs/mneti-remittance/src/lib.rs` — `declare_id!("<REAL_ID>")`
2. `Anchor.toml` — `mneti_remittance = "<REAL_ID>"`
3. `backend/.env` — `REMITTANCE_PROGRAM_ID=<REAL_ID>`

Then rebuild:

```bash
anchor build
```

---

## Step 10 — Deploy

```bash
# Terminal 1 — ensure validator is running
solana-test-validator

# Terminal 2
anchor deploy
# Expected: 9 programs deployed including mneti_remittance
```

---

## Step 11 — Initialize corridors (run once after deploy)

```bash
cd scripts
ts-node init_corridors.ts
```

This calls `initialize_remittance_registry` and `initialize_corridor` for all 5 corridors.
(Script is in `phase7/scripts/init_corridors.ts`)

---

## Step 12 — Run tests

```bash
anchor test --skip-local-validator
```

Target: **24 tests passing** (18 on-chain + 6 backend)

---

## Deployment Order (complete — all 9 programs)

| # | Program | Phase |
|---|---|---|
| 1 | mneti-rbac | 1 |
| 2 | mneti-vault-registry | 1 |
| 3 | mneti-kesh | 1 |
| 4 | mneti-oracle | 2 |
| 5 | mneti-compliance | 3 |
| 6 | mneti-vault | 5 |
| 7 | mneti-payments | 6 |
| 8 | mneti-travel-rule | 6 |
| 9 | mneti-remittance | 7 |

---

## Phase 7 REST API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/remittance/quote?corridor_id=1&amount=100` | Get FX quote |
| GET | `/api/remittance/corridors` | List all corridors with live rates |
| GET | `/api/remittance/order/:pubkey` | Get order + payout status |
| POST | `/api/remittance/b2c/result` | Daraja B2C success callback |
| POST | `/api/remittance/b2c/timeout` | Daraja B2C timeout callback |
| GET | `/api/remittance/stats` | Relay queue statistics |

---

## Ongoing operations

- FX rates refresh every 30 seconds (cron inside `startRemittanceRelay`)
- M-Pesa payouts processed every 30 seconds
- Up to 5 retry attempts per failed payout
- On-chain receipt recorded via `record_mpesa_payout` after Daraja confirms
