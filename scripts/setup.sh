#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  MNETI Phase 1 — Setup Script
#  Run this ONCE before anchor build
#  Usage: chmod +x scripts/setup.sh && ./scripts/setup.sh
# ─────────────────────────────────────────────────────────────
set -e
GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${GREEN}[MNETI]${NC} $1"; }

log "Generating program keypairs..."
mkdir -p target/deploy

# Generate a fresh keypair for each program
solana-keygen new -o target/deploy/mneti_rbac-keypair.json \
    --no-bip39-passphrase --force --silent
log "  ✅ mneti-rbac keypair generated"

solana-keygen new -o target/deploy/mneti_vault_registry-keypair.json \
    --no-bip39-passphrase --force --silent
log "  ✅ mneti-vault-registry keypair generated"

solana-keygen new -o target/deploy/mneti_kesh-keypair.json \
    --no-bip39-passphrase --force --silent
log "  ✅ mneti-kesh keypair generated"

log "Syncing program IDs into source files..."
anchor keys sync
log "  ✅ Program IDs synced into lib.rs and Anchor.toml"

log "Installing Node dependencies..."
npm install
log "  ✅ Dependencies installed"

echo ""
log "Setup complete. Run: anchor build"
echo ""
