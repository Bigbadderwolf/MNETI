/**
 * MNETI Mobile — Blockchain Connection Service
 * app/src/services/blockchain/connection.ts
 *
 * Manages Solana connection, program IDs, and PDA derivation
 * for all MNETI programs accessed by the mobile app.
 */

import { Connection, PublicKey, Commitment } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

// ─── RPC Endpoints ────────────────────────────────────────────────────────────

const RPC_ENDPOINTS = {
  mainnet:   "https://api.mainnet-beta.solana.com",
  devnet:    "https://api.devnet.solana.com",
  localnet:  "http://localhost:8899",
  helius:    `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY ?? ""}`,
};

const ACTIVE_NETWORK = __DEV__ ? "devnet" : "mainnet";

// ─── Program IDs ──────────────────────────────────────────────────────────────
// These match the deployed program IDs from Phases 1–7

export const PROGRAM_IDS = {
  RBAC:            new PublicKey(process.env.RBAC_PROGRAM_ID            ?? "6YxDrhp2pwSTmPWdPuCobwTvtrB3YuivKRdc1A7ypFLB"),
  VAULT_REGISTRY:  new PublicKey(process.env.VAULT_REGISTRY_PROGRAM_ID  ?? "GirQCGWXDnhLC6KZxEGuFmY38nZMfVWTg7L8QgFU9Yhp"),
  KESH:            new PublicKey(process.env.KESH_PROGRAM_ID             ?? "AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR"),
  ORACLE:          new PublicKey(process.env.ORACLE_PROGRAM_ID           ?? "4XQ2yp1pxQsypbAQposX1a8jLzFZFbjar28Sf7ruiSRU"),
  COMPLIANCE:      new PublicKey(process.env.COMPLIANCE_PROGRAM_ID       ?? "PLACEHOLDER_COMPLIANCE"),
  VAULT:           new PublicKey(process.env.VAULT_PROGRAM_ID            ?? "Vau1tSMARTmneti5Ph4seXXXXXXXXXXXXXXXXXXXXXX"),
  PAYMENTS:        new PublicKey(process.env.PAYMENTS_PROGRAM_ID         ?? "PAY6mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"),
  TRAVEL_RULE:     new PublicKey(process.env.TRAVEL_RULE_PROGRAM_ID      ?? "TRL6mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"),
  REMITTANCE:      new PublicKey(process.env.REMITTANCE_PROGRAM_ID       ?? "REM7mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"),
};

export const KESH_MINT = new PublicKey(
  process.env.KESH_MINT_ADDRESS ?? "KESHmint111111111111111111111111111111111111"
);
export const USDC_MINT = new PublicKey(
  process.env.USDC_MINT_ADDRESS ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

// ─── Connection Singleton ─────────────────────────────────────────────────────

let _connection: Connection | null = null;

export function getConnection(commitment: Commitment = "confirmed"): Connection {
  if (!_connection) {
    const endpoint = RPC_ENDPOINTS[ACTIVE_NETWORK as keyof typeof RPC_ENDPOINTS];
    _connection = new Connection(endpoint, commitment);
  }
  return _connection;
}

// ─── PDA Helpers — all programs ───────────────────────────────────────────────

// Phase 5 — Vaults
export const vaultPdas = {
  individual: (owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("individual_vault"), owner.toBuffer()], PROGRAM_IDS.VAULT),
  chama: (creator: PublicKey, name: string) =>
    PublicKey.findProgramAddressSync([Buffer.from("chama_vault"), creator.toBuffer(), Buffer.from(name)], PROGRAM_IDS.VAULT),
  sme: (owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("sme_vault"), owner.toBuffer()], PROGRAM_IDS.VAULT),
  enterprise: (owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("enterprise_vault"), owner.toBuffer()], PROGRAM_IDS.VAULT),
  ngo: (authority: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("ngo_vault"), authority.toBuffer()], PROGRAM_IDS.VAULT),
};

// Phase 3 — Compliance
export const compliancePdas = {
  registry: () =>
    PublicKey.findProgramAddressSync([Buffer.from("compliance_registry")], PROGRAM_IDS.COMPLIANCE),
  credential: (wallet: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("compliance_credential"), wallet.toBuffer()], PROGRAM_IDS.COMPLIANCE),
  creditScore: (wallet: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("credit_score_credential"), wallet.toBuffer()], PROGRAM_IDS.COMPLIANCE),
};

// Phase 6 — Payments
export const paymentPdas = {
  registry: () =>
    PublicKey.findProgramAddressSync([Buffer.from("payment_registry")], PROGRAM_IDS.PAYMENTS),
  payrollSchedule: (employer: PublicKey, name: string) =>
    PublicKey.findProgramAddressSync([Buffer.from("payroll_schedule"), employer.toBuffer(), Buffer.from(name)], PROGRAM_IDS.PAYMENTS),
};

// Phase 7 — Remittance
export const remittancePdas = {
  registry: () =>
    PublicKey.findProgramAddressSync([Buffer.from("remittance_registry")], PROGRAM_IDS.REMITTANCE),
  corridor: (id: number) =>
    PublicKey.findProgramAddressSync([Buffer.from("corridor"), Buffer.from([id])], PROGRAM_IDS.REMITTANCE),
  order: (sender: PublicKey, nonce: bigint) => {
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64LE(nonce);
    return PublicKey.findProgramAddressSync([Buffer.from("remittance_order"), sender.toBuffer(), nonceBuf], PROGRAM_IDS.REMITTANCE);
  },
};

// ─── Account Fetchers ─────────────────────────────────────────────────────────

export async function fetchIndividualVault(owner: PublicKey): Promise<any | null> {
  try {
    const conn = getConnection();
    const [pda] = vaultPdas.individual(owner);
    const info  = await conn.getAccountInfo(pda);
    return info; // raw — decoded by UI layer using IDL
  } catch {
    return null;
  }
}

export async function fetchKeshBalance(walletPublicKey: PublicKey): Promise<number> {
  try {
    const conn = getConnection();
    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    const ata  = await getAssociatedTokenAddress(KESH_MINT, walletPublicKey);
    const info = await conn.getTokenAccountBalance(ata);
    return info.value.uiAmount ?? 0;
  } catch {
    return 0;
  }
}

export async function getSlot(): Promise<number> {
  return getConnection().getSlot();
}
