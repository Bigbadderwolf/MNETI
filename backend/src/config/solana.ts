import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

const rpcUrl = process.env.SOLANA_RPC_URL || "http://localhost:8899";
export const connection = new Connection(rpcUrl, "confirmed");

// Load relay keypair
let relayKeypair: Keypair;
try {
  const key = process.env.RELAY_OPERATOR_PRIVATE_KEY;
  if (key) {
    const { decode } = require("bs58");
    relayKeypair = Keypair.fromSecretKey(decode(key));
  } else {
    relayKeypair = Keypair.generate();
    logger.warn("No RELAY_OPERATOR_PRIVATE_KEY — using generated dev keypair");
  }
} catch {
  relayKeypair = Keypair.generate();
}

export const relayWallet    = new anchor.Wallet(relayKeypair);
export const relayPublicKey = relayKeypair.publicKey;

export const ORACLE_PROGRAM_ID = new PublicKey(
  process.env.ORACLE_PROGRAM_ID || "11111111111111111111111111111111"
);

export const provider = new anchor.AnchorProvider(
  connection, relayWallet, { commitment: "confirmed" }
);
anchor.setProvider(provider);

// PDA helpers
export function getOracleRegistryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")], ORACLE_PROGRAM_ID
  );
}

export function getPriceFeedPDA(feedType: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("price_feed"), Buffer.from([feedType])], ORACLE_PROGRAM_ID
  );
}

export const FEED_TYPES = {
  KES_USD: 0, TBILL_YIELD: 1, XAU_USD: 2, XAG_USD: 3, USD_KES: 4
} as const;

logger.info(`Solana RPC: ${rpcUrl}`);
logger.info(`Relay operator: ${relayPublicKey.toBase58()}`);
