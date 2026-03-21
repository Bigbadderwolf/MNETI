#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  MNETI Protocol — Master Setup Script (Phase 1 + Phase 2)
#  Run once on a fresh machine
#  Usage: chmod +x scripts/setup.sh && ./scripts/setup.sh
# ─────────────────────────────────────────────────────────────
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[MNETI]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }

echo ""
echo "  🌍 MNETI Protocol — Phase 1 + 2 Setup"
echo ""

# ── Generate program keypairs ─────────────────────────────
log "Generating program keypairs..."
mkdir -p target/deploy

for prog in mneti_rbac mneti_vault_registry mneti_kesh mneti_oracle; do
  solana-keygen new -o target/deploy/${prog}-keypair.json \
    --no-bip39-passphrase --force --silent
  log "  ✅ ${prog} keypair generated"
done

# ── Sync program IDs ──────────────────────────────────────
log "Syncing program IDs..."
anchor keys sync
log "  ✅ All program IDs synced"

# ── Install dependencies ──────────────────────────────────
log "Installing root Node dependencies..."
npm install
log "  ✅ Root dependencies installed"

log "Installing backend dependencies..."
cd backend && npm install && cd ..
log "  ✅ Backend dependencies installed"

# ── Create .env files ─────────────────────────────────────
[ ! -f .env ]          && cp .env.example .env          && warn "Created .env — fill in API keys"
[ ! -f backend/.env ]  && cp backend/.env.example backend/.env

# ── Airdrop devnet SOL ────────────────────────────────────
log "Requesting devnet SOL..."
solana airdrop 5 || warn "Airdrop failed — run: solana airdrop 2"

echo ""
log "✅ Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. anchor build"
echo "  2. solana-test-validator    (Terminal 1 — keep running)"
echo "  3. anchor deploy            (Terminal 2)"
echo "  4. anchor test --skip-local-validator"
echo "  5. cd backend && npm run dev"
echo ""
