// ─────────────────────────────────────────────────────────────
//  MNETI — Solana Bridge
//  File: backend/src/bridge/solana/kesh_bridge.ts
//
//  PURPOSE:
//  Connects M-Pesa events to Solana program instructions.
//  - After M-Pesa deposit confirmed → calls mint_kesh
//  - Before M-Pesa withdrawal → calls burn_kesh
//  - Listens for KeshBurned events → triggers B2C payout
// ─────────────────────────────────────────────────────────────

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import bs58   from "bs58";
import dotenv from "dotenv";
import { logger } from "../../utils/logger";
import { updateStatus } from "../mpesa/queue/offline_queue";
dotenv.config();

const RPC_URL      = process.env.SOLANA_RPC_URL || "http://localhost:8899";
const KESH_PROG_ID = new PublicKey(process.env.KESH_PROGRAM_ID || "11111111111111111111111111111111");

// ── CONNECTION + WALLET ───────────────────────────────────────
export const connection = new Connection(RPC_URL, "confirmed");

let operatorKeypair: Keypair;
try {
  const key = process.env.RELAY_OPERATOR_PRIVATE_KEY;
  if (key) {
    operatorKeypair = Keypair.fromSecretKey(bs58.decode(key));
  } else {
    operatorKeypair = Keypair.generate();
    logger.warn("No RELAY_OPERATOR_PRIVATE_KEY — using generated dev keypair");
  }
} catch {
  operatorKeypair = Keypair.generate();
}

const wallet   = new anchor.Wallet(operatorKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

// ── PDA HELPERS ───────────────────────────────────────────────
function getProtocolStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_state")], KESH_PROG_ID
  );
}

function getWalletStatePDA(walletKey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("wallet_state"), walletKey.toBuffer()], KESH_PROG_ID
  );
}

function getBridgeDepositPDA(mpesaRef: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_deposit"), Buffer.from(mpesaRef)], KESH_PROG_ID
  );
}

// ── MINT KESH AFTER M-PESA DEPOSIT ───────────────────────────
export interface MintRequest {
  recipientWallet: string;   // Base58 Solana wallet address
  kesAmount:       number;   // KES in raw units (1 KES = 100)
  mpesaRef:        string;   // Safaricom transaction reference
  queueId?:        string;   // Offline queue ID if applicable
}

export async function mintKesh(req: MintRequest): Promise<string> {
  logger.info(`Minting KESH: wallet=${req.recipientWallet} kes=${req.kesAmount} ref=${req.mpesaRef}`);

  try {
    const recipient    = new PublicKey(req.recipientWallet);
    const [protocolState] = getProtocolStatePDA();
    const [walletState]   = getWalletStatePDA(recipient);
    const [bridgeDeposit] = getBridgeDepositPDA(req.mpesaRef);
    const [keshMint]      = PublicKey.findProgramAddressSync(
      [Buffer.from("kesh_mint")], KESH_PROG_ID
    );
    const [mintAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority")], KESH_PROG_ID
    );

    // Load program IDL
    const idl = await anchor.Program.fetchIdl(KESH_PROG_ID, provider);
    if (!idl) {
      throw new Error("KESH program IDL not found — is program deployed?");
    }
    const program = new anchor.Program(idl, provider);

    // Get associated token accounts
    const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } =
      await import("@solana/spl-token");

    const recipientAta     = await getAssociatedTokenAddress(keshMint, recipient);
    const feeCollectorAta  = await getAssociatedTokenAddress(keshMint, wallet.publicKey);

    const tx = await program.methods
      .mintKesh(
        new anchor.BN(req.kesAmount),
        req.mpesaRef
      )
      .accounts({
        operator:              wallet.publicKey,
        recipient,
        feeCollector:          wallet.publicKey,
        protocolState,
        keshMint,
        mintAuthority,
        walletState,
        recipientAta,
        feeCollectorAta,
        bridgeDeposit,
        tokenProgram:          TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:         anchor.web3.SystemProgram.programId,
        rent:                  anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    logger.info(`✅ KESH minted: tx=${tx} wallet=${req.recipientWallet} kes=${req.kesAmount}`);

    // Update queue if applicable
    if (req.queueId) {
      updateStatus(req.queueId, "completed", {
        mpesaRef:    req.mpesaRef,
        solanaTxSig: tx,
      });
    }

    return tx;
  } catch (error: any) {
    logger.error(`Mint KESH failed: ${error.message}`);
    if (req.queueId) {
      updateStatus(req.queueId, "failed", { errorMessage: error.message });
    }
    throw error;
  }
}

// ── LISTEN FOR KESH BURNED EVENTS ────────────────────────────
// Subscribes to KeshBurned events — triggers B2C payout
export function listenForBurnEvents(
  onBurn: (wallet: string, keshBurned: number, kesToRelease: number) => Promise<void>
): void {
  logger.info("Listening for KeshBurned events on Solana...");

  connection.onLogs(KESH_PROG_ID, async (logs) => {
    if (!logs.logs.some(l => l.includes("KeshBurned"))) return;

    try {
      // Parse burn amount from log (format: "Burned X KESH — releasing Y KES")
      const burnLog = logs.logs.find(l => l.includes("Burned") && l.includes("KESH"));
      if (!burnLog) return;

      const match = burnLog.match(/Burned (\d+) KESH — releasing (\d+) KES/);
      if (!match) return;

      const keshBurned   = parseInt(match[1]);
      const kesToRelease = parseInt(match[2]);

      // Get wallet from transaction
      const tx   = await connection.getTransaction(logs.signature, { commitment: "confirmed" });
      const signer = tx?.transaction.message.accountKeys[0]?.toString();
      if (!signer) return;

      logger.info(`KeshBurned event: wallet=${signer} kesh=${keshBurned} kes=${kesToRelease}`);
      await onBurn(signer, keshBurned, kesToRelease);
    } catch (e: any) {
      logger.error(`Error processing burn event: ${e.message}`);
    }
  }, "confirmed");
}

// ── INIT WALLET STATE ─────────────────────────────────────────
// Creates WalletState PDA for new users (called before first mint)
export async function initWalletStateIfNeeded(walletAddress: string): Promise<void> {
  try {
    const wallet_key     = new PublicKey(walletAddress);
    const [walletState]  = getWalletStatePDA(wallet_key);

    // Check if wallet state already exists
    const existing = await connection.getAccountInfo(walletState);
    if (existing) return; // Already initialized

    const idl = await anchor.Program.fetchIdl(KESH_PROG_ID, provider);
    if (!idl) throw new Error("KESH IDL not found");
    const program = new anchor.Program(idl, provider);

    await program.methods
      .initWalletState()
      .accounts({
        payer:         wallet.publicKey,
        wallet:        wallet_key,
        walletState,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    logger.info(`Wallet state initialized: ${walletAddress}`);
  } catch (e: any) {
    if (!e.message?.includes("already in use")) {
      logger.error(`Init wallet state failed: ${e.message}`);
    }
  }
}
