# MNETI Phase 8 — Complete Integration Guide
# ═══════════════════════════════════════════════════════════════════════════════
#
# Phase 8 adds THREE standalone sub-projects to your MNETI monorepo:
#   app/   — React Native mobile app  (8 screens, ZK proofs, M-Pesa)
#   web/   — Next.js 14 web dashboard (6 views, charts, live data)
#   ai/    — Python FastAPI + TensorFlow PoBF scoring model
#
# No new Anchor programs. No changes to Cargo.toml or Anchor.toml.
# Phases 1–7 must already be integrated before starting Phase 8.
#
# ═══════════════════════════════════════════════════════════════════════════════

## WHAT GOES WHERE
## ─────────────────────────────────────────────────────────────────────────────
##
## Your existing project root:
##   MNETI/
##     programs/       ← Phases 1–7 (unchanged)
##     backend/        ← Phases 1–7 (unchanged)
##     sdk/            ← Phases 1–7 (unchanged)
##     tests/          ← Phases 1–7 (unchanged)
##     circuits/       ← Phase 3 (unchanged)
##
## Phase 8 adds these three new top-level folders:
##   MNETI/
##     app/            ← React Native mobile app   (NEW — Phase 8)
##     web/            ← Next.js 14 web dashboard  (NEW — Phase 8)
##     ai/             ← Python AI scoring server  (NEW — Phase 8)

---

## STEP 1 — COPY FILES INTO YOUR PROJECT
## ─────────────────────────────────────────────────────────────────────────────
## Open a WSL2 terminal, navigate to your project root, then run:

cd /mnt/c/Users/HP/Downloads/MNETI_P1_P2_INTEGRATED/MNETI

## Copy the three Phase 8 folders (replace <path_to_phase8> with where you
## downloaded the MNETI_PHASE8_FINAL folder):

cp -r <path_to_phase8>/app  ./app
cp -r <path_to_phase8>/web  ./web
cp -r <path_to_phase8>/ai   ./ai

## Verify the copy worked:
ls -la
## You should now see: app/  backend/  circuits/  programs/  sdk/  tests/  web/  ai/

---

## STEP 2 — UPDATE PROGRAM IDs
## ─────────────────────────────────────────────────────────────────────────────
## After anchor deploy, get your real program IDs:

anchor keys list
## Example output:
##   mneti_vault      = AbCd...
##   mneti_payments   = EfGh...
##   mneti_remittance = IjKl...
##   (etc.)

## Update these two files with the real IDs:

## FILE 1: app/.env
## Open app/.env and replace every XXX... value with the real program ID.
## The file already has the correct variable names — just update the values.
nano app/.env

## FILE 2: web/.env.local
## Open web/.env.local and replace every XXX... value.
nano web/.env.local

## Also update the API base URL in app/.env:
##   API_BASE_URL=http://10.0.2.2:4000     ← Android emulator
##   API_BASE_URL=http://192.168.1.X:4000  ← Physical device (use your LAN IP)

---

## STEP 3 — WEB DASHBOARD SETUP
## ─────────────────────────────────────────────────────────────────────────────

cd MNETI/web
npm install
## (~2 minutes, installs Next.js 14 + Recharts + Tailwind)
insta
## Start the dashboard:
npm run dev

## Dashboard runs at: http://localhost:3000
## Six pages are immediately available:
##   http://localhost:3000/             ← Protocol overview
##   http://localhost:3000/compliance   ← AML alerts + wallet screening
##   http://localhost:3000/sme          ← Treasury + payroll + PoBF score
##   http://localhost:3000/chama        ← Members + proposals + rotation
##   http://localhost:3000/remittance   ← FX rates + order history
##   http://localhost:3000/admin        ← Program IDs + oracle + VASP registry

## NOTE: The dashboard works even if the backend is offline.
## It shows mock data when the backend returns errors.
## When backend is running it shows live data automatically.

---

## STEP 4 — AI SCORING SERVER SETUP
## ─────────────────────────────────────────────────────────────────────────────

cd MNETI/ai

## Install Python dependencies:
pip install -r requirements.txt
## This installs: fastapi, uvicorn, pydantic, numpy, scikit-learn, tensorflow
## TensorFlow is ~500MB. If you want to skip it:
##   pip install fastapi uvicorn pydantic numpy scikit-learn
## The server will use the rule-based fallback scorer (still works, just no neural net).

## Optional — train the model (improves accuracy, takes ~2 minutes):
python training/train.py
## Output: ai/models/pobf_model_weights.h5

## Start the AI server:
uvicorn api.main:app --port 8000 --reload

## AI server runs at: http://localhost:8000
## Test it:
curl http://localhost:8000/api/pobf/health
## Expected: {"status":"healthy","model_type":"mlp_tensorflow","test_score":72.4}

---

## STEP 5 — MOBILE APP SETUP
## ─────────────────────────────────────────────────────────────────────────────

cd MNETI/app
npm install
## (~5 minutes, installs React Native + navigation + Solana + snarkjs)

## For Android (WSL2 + Android Studio):
## Terminal A — start Metro bundler:
npx react-native start

## Terminal B — run on Android:
npx react-native run-android

## The app will open on your emulator or connected device.
## It works in demo mode out of the box (no wallet required to browse).

## For iOS (Mac only):
cd ios && pod install && cd ..
npx react-native run-ios

---

## STEP 6 — FULL SYSTEM STARTUP (all 4 services)
## ─────────────────────────────────────────────────────────────────────────────
## Open 4 separate WSL2 terminals:

## TERMINAL 1 — Solana validator (already running from previous phases)
solana-test-validator

## TERMINAL 2 — MNETI backend (Phases 1–7)
cd MNETI/backend
npm run dev
## Shows: HTTP server on port 4000 + Oracle relay + Queue processor etc.

## TERMINAL 3 — AI scoring server (Phase 8)
cd MNETI/ai
uvicorn api.main:app --port 8000 --reload
## Shows: Uvicorn running on http://0.0.0.0:8000

## TERMINAL 4 — Web dashboard (Phase 8)
cd MNETI/web
npm run dev
## Shows: Ready on http://localhost:3000

## TERMINAL 5 (optional) — Mobile app Metro bundler
cd MNETI/app
npx react-native start
## Then in a 6th terminal: npx react-native run-android

---

## STEP 7 — VERIFY EVERYTHING IS CONNECTED
## ─────────────────────────────────────────────────────────────────────────────

## Backend health (must return JSON):
curl http://localhost:4000/api/health

## AI health (must return JSON):
curl http://localhost:8000/api/pobf/health

## Web dashboard (open in browser):
## http://localhost:3000
## Top-right corner shows: "● Solana Connected" when backend is up

## Score a business wallet via AI:
curl -X POST http://localhost:8000/api/pobf/score \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "YourDeployedWalletAddress",
    "zk_credit_score": 720,
    "vault_balance_kes": 1500000,
    "months_active": 18,
    "payroll_run_count": 18,
    "invoices_paid": 12,
    "invoices_defaulted": 1,
    "avg_monthly_inflow": 800000,
    "industry": "technology",
    "multisig_signers": 2
  }'

---

## TROUBLESHOOTING
## ─────────────────────────────────────────────────────────────────────────────

## Web dashboard shows "Solana Offline":
##   → Make sure backend is running: cd backend && npm run dev
##   → Check NEXT_PUBLIC_API_URL in web/.env.local matches backend port

## Mobile app cannot connect to backend:
##   → Android emulator: use 10.0.2.2 not localhost
##   → Physical device: use your LAN IP (run: ip addr | grep inet)
##   → Update API_BASE_URL in app/.env

## AI server fails to start:
##   → TensorFlow install issue? Skip it and use fallback:
##      pip install fastapi uvicorn pydantic numpy
##   → Port 8000 in use? Change port: uvicorn api.main:app --port 8001
##      Then update NEXT_PUBLIC_AI_URL in web/.env.local

## React Native build fails:
##   → Run: cd android && ./gradlew clean && cd ..
##   → Then: npx react-native run-android

## Metro bundler crypto error:
##   → metro.config.js is already included — it handles crypto polyfills
##   → If still failing: npm install crypto-browserify readable-stream buffer

## ZK proof generation fails on device:
##   → Circuit files not bundled yet — app runs in demo mode (mock scores)
##   → To enable real ZK proofs, copy .wasm + .zkey files from circuits/
##     into app/android/app/src/main/assets/circuits/
##   → This requires Phase 3 build_all.sh to have run first

---

## WHAT EACH SCREEN DOES
## ─────────────────────────────────────────────────────────────────────────────

## MOBILE APP (8 screens):
##
##   HomeScreen        — KESH balance, APY (12%), quick-action tiles,
##                       KYC status, recent activity, network indicator
##
##   VaultScreen       — Tabs: Personal | Business | NGO
##                       Deposit via M-Pesa STK Push, withdraw, savings goals,
##                       payroll reserve, tax reserve (KRA), milestone tracker
##
##   ChamaScreen       — Tabs: Overview | Members | Proposals
##                       Pool balance, rotation payout trigger, contribution,
##                       governance votes, member list with rotation positions
##
##   PaymentsScreen    — Tabs: Payroll | Recurring | Supplier | Grants
##                       Run payroll, manage recurring bills, supplier escrow,
##                       conditional NGO grant disbursement
##
##   RemittanceScreen  — Corridor picker (UK/US/UAE/KE/EU), amount entry,
##                       live FX quote, 0.30% fee preview, Travel Rule flag,
##                       recipient phone + name, send button
##
##   CreditScoreScreen — ZK credit score 300–850 (generated on-device),
##                       score breakdown, credit line recommendations,
##                       privacy proof badge (no PII on-chain)
##
##   KYCScreen         — Tier selection (Basic/Enhanced/Full), on-device
##                       form entry, ZK proof generation, soulbound credential
##
##   SettingsScreen    — Currency (KES/USD/GBP), language (EN/SW),
##                       biometrics, dark mode, push notifs, disconnect wallet

## WEB DASHBOARD (6 pages):
##
##   /               — KESH supply + TVL chart, remittance volume bar chart,
##                     live FX rates table, AML summary panel,
##                     T-bill yield info, backend service status
##
##   /compliance     — Open AML alerts table with resolve button,
##                     manual wallet screening form (OFAC/KYT/velocity),
##                     wallet history lookup, risk score display
##
##   /sme            — Cash flow P&L bar chart, payroll schedule panel,
##                     invoice tracker table, supplier fee calculator,
##                     PoBF AI score widget (calls ai server)
##
##   /chama          — Rotation spotlight card, member contributions table,
##                     proposal cards with vote bars + vote buttons,
##                     rotation queue schedule
##
##   /remittance     — FX rate 24h line chart (USD + GBP), corridor rates
##                     panel, recent orders table with status badges
##
##   /admin          — All 9 program IDs with copy buttons,
##                     oracle feed cards (KES/USD + T-bill + XAU/USD),
##                     VASP registry table, backend health cards
