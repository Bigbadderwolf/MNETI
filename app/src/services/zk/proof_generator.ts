/**
 * MNETI Mobile — ZK Proof Generator (On-Device)
 * app/src/services/zk/proof_generator.ts
 *
 * Generates Groth16 ZK proofs entirely on the user's device.
 * Private data (name, ID, M-Pesa history) NEVER leaves the device.
 *
 * Wraps snarkjs.groth16.fullProve() with MNETI-specific input preparation.
 * Circuit files (.wasm + .zkey) are bundled with the app.
 *
 * Two proof types:
 *   1. KYC Compliance — proves wallet passed KYC, reveals: tier, jurisdiction, expiry
 *   2. M-Pesa Credit Score — proves creditworthiness from 24-month history, reveals: score band
 *
 * Mirrors sdk/src/zk/proof_generator.ts (Phase 3) adapted for React Native.
 */

import * as snarkjs from "snarkjs";
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import { createHash } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KycProofInputs {
  /** Full legal name — hashed locally, never transmitted */
  fullName:          string;
  /** National ID number — hashed locally */
  idNumber:          string;
  /** M-Pesa registered phone — hashed locally */
  phone:             string;
  /** 1 = not sanctioned, 0 = sanctioned */
  sanctionsResult:   1 | 0;
  /** KYC tier 1–3 */
  kycTier:           number;
  /** ISO 3166-1 numeric jurisdiction code */
  jurisdiction:      number;
  /** Unix timestamp when KYC expires */
  expiryTimestamp:   number;
}

export interface KycProofOutputs {
  /** Proof object for on-chain submission */
  proof:       object;
  /** Public signals for on-chain verification */
  publicSignals: string[];
  /** KYC tier proven */
  tier:        number;
  /** Jurisdiction code */
  jurisdiction:number;
  /** Expiry timestamp */
  expiry:      number;
  /** Identity commitment (hash of private inputs) */
  commitment:  string;
}

export interface MpesaHistoryMonth {
  income:         number;   // total inflows in KES
  expenses:       number;   // total outflows in KES
  paymentSuccess: number;   // successful payment count
  paymentFail:    number;   // failed payment count
  savings:        number;   // end-of-month balance
}

export interface CreditProofInputs {
  /** 24 months of M-Pesa transaction history */
  history: MpesaHistoryMonth[];
}

export interface CreditProofOutputs {
  proof:            object;
  publicSignals:    string[];
  creditScore:      number;   // 300–850
  incomeBand:       number;   // 1–5
  paymentReliability:number;  // 0–100
  savingsRateBand:  number;   // 0–4
  monthsOfHistory:  number;
  commitment:       string;
}

// ─── Circuit Asset Paths ───────────────────────────────────────────────────────
// These files are bundled in the app's assets directory

function wasmPath(circuit: "kyc" | "credit"): string {
  const base = Platform.OS === "android"
    ? `${RNFS.DocumentDirectoryPath}/circuits`
    : `${RNFS.MainBundlePath}/circuits`;
  return `${base}/${circuit}_compliance.wasm`;
}

function zkeyPath(circuit: "kyc" | "credit"): string {
  const base = Platform.OS === "android"
    ? `${RNFS.DocumentDirectoryPath}/circuits`
    : `${RNFS.MainBundlePath}/circuits`;
  return `${base}/${circuit}_final.zkey`;
}

// ─── Hashing Helpers ──────────────────────────────────────────────────────────

function hashField(value: string): bigint {
  const hash = createHash("sha256").update(value).digest("hex");
  // Take first 31 bytes to stay within BN254 field modulus
  return BigInt("0x" + hash.slice(0, 62));
}

function toBigIntArray(values: number[]): bigint[] {
  return values.map(v => BigInt(Math.round(v)));
}

// ─── KYC Proof Generator ──────────────────────────────────────────────────────

export async function generateKycProof(
  inputs: KycProofInputs
): Promise<KycProofOutputs> {
  // Build circuit inputs — all private data hashed locally
  const circuitInputs = {
    nameHash:        hashField(inputs.fullName).toString(),
    idHash:          hashField(inputs.idNumber).toString(),
    phoneHash:       hashField(inputs.phone).toString(),
    sanctionsResult: String(inputs.sanctionsResult),
    kycTier:         String(inputs.kycTier),
    jurisdiction:    String(inputs.jurisdiction),
    expiryTimestamp: String(inputs.expiryTimestamp),
    // Salt for commitment — random per proof
    salt:            hashField(Math.random().toString()).toString(),
  };

  const wasm = wasmPath("kyc");
  const zkey = zkeyPath("kyc");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasm,
    zkey
  );

  // Public signals layout (matches kyc_compliance.circom outputs):
  // [0] tier
  // [1] jurisdiction
  // [2] not_sanctioned
  // [3] expiry
  // [4] commitment
  // [5] identity_hash

  return {
    proof,
    publicSignals,
    tier:        parseInt(publicSignals[0]),
    jurisdiction:parseInt(publicSignals[1]),
    expiry:      parseInt(publicSignals[3]),
    commitment:  publicSignals[4],
  };
}

// ─── Credit Score Proof Generator ────────────────────────────────────────────

export async function generateCreditProof(
  inputs: CreditProofInputs
): Promise<CreditProofOutputs> {
  if (inputs.history.length < 1 || inputs.history.length > 24) {
    throw new Error("Credit proof requires 1–24 months of M-Pesa history");
  }

  // Pad to 24 months if less than 24 months provided
  const padded = [...inputs.history];
  while (padded.length < 24) {
    padded.push({ income: 0, expenses: 0, paymentSuccess: 0, paymentFail: 0, savings: 0 });
  }

  const circuitInputs = {
    monthlyIncomes:  toBigIntArray(padded.map(m => m.income)).map(String),
    expenses:        toBigIntArray(padded.map(m => m.expenses)).map(String),
    paymentSuccesses:toBigIntArray(padded.map(m => m.paymentSuccess)).map(String),
    failures:        toBigIntArray(padded.map(m => m.paymentFail)).map(String),
    savings:         toBigIntArray(padded.map(m => m.savings)).map(String),
    salt:            hashField(Math.random().toString()).toString(),
  };

  const wasm = wasmPath("credit");
  const zkey = zkeyPath("credit");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasm,
    zkey
  );

  // Public signals layout (matches credit_score.circom outputs):
  // [0] creditScore (300–850)
  // [1] incomeBand (1–5)
  // [2] paymentReliability (0–100)
  // [3] savingsRateBand (0–4)
  // [4] monthsOfHistory
  // [5] commitment

  return {
    proof,
    publicSignals,
    creditScore:       parseInt(publicSignals[0]),
    incomeBand:        parseInt(publicSignals[1]),
    paymentReliability:parseInt(publicSignals[2]),
    savingsRateBand:   parseInt(publicSignals[3]),
    monthsOfHistory:   parseInt(publicSignals[4]),
    commitment:        publicSignals[5],
  };
}

// ─── Proof Serializer (for on-chain submission) ───────────────────────────────

export interface SerializedProof {
  piA:  [string, string];
  piB:  [[string, string], [string, string]];
  piC:  [string, string];
}

export function serializeProof(proof: any): SerializedProof {
  return {
    piA: [proof.pi_a[0], proof.pi_a[1]],
    piB: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    piC: [proof.pi_c[0], proof.pi_c[1]],
  };
}
