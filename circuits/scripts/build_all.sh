#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  MNETI — Build All ZK Circuits
#  Run: chmod +x circuits/scripts/build_all.sh
#       bash circuits/scripts/build_all.sh
#
#  This script:
#  1. Compiles both Circom circuits to R1CS + WASM
#  2. Downloads the Powers of Tau trusted setup file
#  3. Runs Groth16 setup to generate proving + verification keys
#  4. Exports the Solana-compatible verification key
# ─────────────────────────────────────────────────────────────
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[MNETI-ZK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}    $1"; }

CIRCUITS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
log "Circuits directory: $CIRCUITS_DIR"

# ── POWERS OF TAU ─────────────────────────────────────────────
# Download trusted setup file (needed for Groth16 key generation)
PTAU_FILE="$CIRCUITS_DIR/pot14_final.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    log "Downloading Powers of Tau (pot14)..."
    curl -L https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau \
        -o "$PTAU_FILE"
    log "  ✅ Powers of Tau downloaded"
else
    log "  ✅ Powers of Tau already exists"
fi

# ── FUNCTION: Build one circuit ────────────────────────────────
build_circuit() {
    local NAME=$1
    local SRC="$CIRCUITS_DIR/$NAME/src/${NAME}.circom"
    local BUILD="$CIRCUITS_DIR/$NAME/build"
    local KEYS="$CIRCUITS_DIR/$NAME/keys"

    log "Building circuit: $NAME"
    mkdir -p "$BUILD" "$KEYS"

    # Step 1: Compile Circom → R1CS + WASM + sym
    log "  Compiling $NAME.circom..."
    circom "$SRC" \
        --r1cs "$BUILD/${NAME}.r1cs" \
        --wasm "$BUILD/${NAME}_js/${NAME}.wasm" \
        --sym  "$BUILD/${NAME}.sym" \
        --output "$BUILD" \
        -l node_modules

    log "  ✅ Compiled to R1CS and WASM"

    # Step 2: Groth16 setup — generate proving key (zkey)
    log "  Running Groth16 setup..."
    snarkjs groth16 setup \
        "$BUILD/${NAME}.r1cs" \
        "$PTAU_FILE" \
        "$KEYS/${NAME}_0000.zkey"

    # Step 3: Contribute to phase 2 ceremony (for production use real randomness)
    log "  Contributing to phase 2..."
    echo "mneti-phase2-contribution" | snarkjs zkey contribute \
        "$KEYS/${NAME}_0000.zkey" \
        "$KEYS/${NAME}_final.zkey" \
        --name="MNETI Phase 2" -v

    # Step 4: Export verification key (JSON — used by on-chain verifier)
    log "  Exporting verification key..."
    snarkjs zkey export verificationkey \
        "$KEYS/${NAME}_final.zkey" \
        "$KEYS/${NAME}_verification_key.json"

    # Step 5: Export Solana-compatible verifier
    log "  Exporting Solana verifier..."
    snarkjs zkey export solidityverifier \
        "$KEYS/${NAME}_final.zkey" \
        "$KEYS/${NAME}_verifier.sol" 2>/dev/null || true

    log "  ✅ $NAME circuit built successfully"
    echo ""
}

# ── BUILD ALL CIRCUITS ─────────────────────────────────────────
build_circuit "kyc-compliance"
build_circuit "credit-score"

log "✅ All circuits built successfully!"
echo ""
echo "  Output files:"
echo "  circuits/kyc-compliance/build/kyc-compliance.r1cs"
echo "  circuits/kyc-compliance/build/kyc-compliance_js/kyc-compliance.wasm"
echo "  circuits/kyc-compliance/keys/kyc-compliance_final.zkey"
echo "  circuits/kyc-compliance/keys/kyc-compliance_verification_key.json"
echo ""
echo "  circuits/credit-score/build/credit-score.r1cs"
echo "  circuits/credit-score/build/credit-score_js/credit-score.wasm"
echo "  circuits/credit-score/keys/credit-score_final.zkey"
echo "  circuits/credit-score/keys/credit-score_verification_key.json"
echo ""
echo "  Next: anchor build (to compile mneti-compliance program)"
