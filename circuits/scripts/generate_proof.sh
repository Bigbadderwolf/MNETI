#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  MNETI — Generate a ZK Proof
#  Usage: bash circuits/scripts/generate_proof.sh <circuit> <input_file>
#  Example: bash circuits/scripts/generate_proof.sh kyc-compliance input.json
# ─────────────────────────────────────────────────────────────
set -e
GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${GREEN}[MNETI-ZK]${NC} $1"; }

CIRCUIT=${1:-"kyc-compliance"}
INPUT=${2:-"circuits/$CIRCUIT/src/input.json"}
CIRCUITS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$CIRCUITS_DIR/$CIRCUIT/build"
KEYS="$CIRCUITS_DIR/$CIRCUIT/keys"
OUT="$CIRCUITS_DIR/$CIRCUIT/build"

log "Generating proof for: $CIRCUIT"
log "Input file: $INPUT"

# Step 1: Compute witness
log "Computing witness..."
node "$BUILD/${CIRCUIT}_js/generate_witness.js" \
    "$BUILD/${CIRCUIT}_js/${CIRCUIT}.wasm" \
    "$INPUT" \
    "$OUT/witness.wtns"
log "  ✅ Witness computed"

# Step 2: Generate Groth16 proof
log "Generating Groth16 proof..."
snarkjs groth16 prove \
    "$KEYS/${CIRCUIT}_final.zkey" \
    "$OUT/witness.wtns" \
    "$OUT/proof.json" \
    "$OUT/public.json"
log "  ✅ Proof generated"

# Step 3: Verify proof locally
log "Verifying proof locally..."
snarkjs groth16 verify \
    "$KEYS/${CIRCUIT}_verification_key.json" \
    "$OUT/public.json" \
    "$OUT/proof.json"
log "  ✅ Proof verified locally"

log "Proof files:"
echo "  $OUT/proof.json   ← Submit this to Solana verifier"
echo "  $OUT/public.json  ← Public signals (go on-chain)"
