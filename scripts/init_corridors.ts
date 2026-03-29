/**
 * MNETI Protocol — Phase 7
 * scripts/init_corridors.ts
 *
 * One-time initialization script.
 * Run once after `anchor deploy` to set up the remittance registry
 * and all 5 corridor records on-chain.
 *
 * Usage:
 *   cd MNETI
 *   ts-node scripts/init_corridors.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ─── Load wallet ──────────────────────────────────────────────────────────────
const walletPath = process.env.ANCHOR_WALLET
  || path.join(process.env.HOME!, ".config/solana/id.json");
const walletKp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
);

// ─── Connection ───────────────────────────────────────────────────────────────
const rpcUrl     = process.env.SOLANA_RPC_URL || "http://localhost:8899";
const connection = new Connection(rpcUrl, "confirmed");
const wallet     = new anchor.Wallet(walletKp);
const provider   = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

// ─── Load IDL + program ───────────────────────────────────────────────────────
const idlPath    = path.join(__dirname, "../target/idl/mneti_remittance.json");
const idl        = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
const programId  = new PublicKey(
  process.env.REMITTANCE_PROGRAM_ID
  || idl.address
  || "REM7mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
);
const program    = new anchor.Program(idl, provider);

// ─── PDA helpers ─────────────────────────────────────────────────────────────
function registryPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("remittance_registry")], programId);
}
function corridorPda(id: number) {
  return PublicKey.findProgramAddressSync([Buffer.from("corridor"), Buffer.from([id])], programId);
}

// ─── Corridor definitions ─────────────────────────────────────────────────────
const CORRIDORS = [
  { id: 0, name: "UK → Kenya (GBP/KES)",  min: 65_000,       max: 650_000_000 },
  { id: 1, name: "US → Kenya (USD/KES)",  min: 65_000,       max: 650_000_000 },
  { id: 2, name: "UAE → Kenya (AED/KES)", min: 65_000,       max: 650_000_000 },
  { id: 3, name: "Kenya Domestic (KES)",  min: 5_000,        max: 100_000_000 },
  { id: 4, name: "EU → Kenya (EUR/KES)",  min: 65_000,       max: 650_000_000 },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Initializing MNETI Remittance Corridors`);
  console.log(`   RPC:       ${rpcUrl}`);
  console.log(`   Authority: ${walletKp.publicKey.toBase58()}`);
  console.log(`   Program:   ${programId.toBase58()}\n`);

  // 1. Initialize registry
  const [registry] = registryPda();
  try {
    await (program.methods as any)
      .initializeRemittanceRegistry()
      .accounts({
        authority:    walletKp.publicKey,
        registry,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log(`✅ Registry initialized: ${registry.toBase58()}`);
  } catch (err: any) {
    if (err.toString().includes("already in use")) {
      console.log(`ℹ️  Registry already exists — skipping`);
    } else {
      throw err;
    }
  }

  // 2. Initialize each corridor
  for (const c of CORRIDORS) {
    const [corridor] = corridorPda(c.id);
    try {
      await (program.methods as any)
        .initializeCorridor({
          corridorId:    c.id,
          name:          c.name,
          minAmountKesh: new anchor.BN(c.min),
          maxAmountKesh: new anchor.BN(c.max),
        })
        .accounts({
          authority:    walletKp.publicKey,
          registry,
          corridor,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      console.log(`✅ Corridor ${c.id} initialized: ${c.name}`);
    } catch (err: any) {
      if (err.toString().includes("already in use")) {
        console.log(`ℹ️  Corridor ${c.id} already exists — skipping`);
      } else {
        console.error(`❌ Corridor ${c.id} failed:`, err.message);
      }
    }
  }

  console.log(`\n✅ Remittance initialization complete`);
  console.log(`   Run 'anchor test' to verify all 24 Phase 7 tests pass\n`);
}

main().catch(err => {
  console.error("❌ Initialization failed:", err);
  process.exit(1);
});
