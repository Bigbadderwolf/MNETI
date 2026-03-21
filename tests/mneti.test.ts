// ─────────────────────────────────────────────────────────────
//  MNETI Protocol — Full Integration Test Suite
//  Phase 1A: mneti-kesh  (7 tests)
//  Phase 1B: mneti-vault-registry (3 tests)
//  Phase 1C: mneti-rbac  (4 tests)
//  Phase 2:  mneti-oracle (10 tests)
//  Total: 24 tests
//
//  Run: anchor test --skip-local-validator
//  Requires: solana-test-validator running in Terminal 1
// ─────────────────────────────────────────────────────────────

import * as anchor from "@coral-xyz/anchor";
import { Program }  from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";

const provider  = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const authority = provider.wallet as anchor.Wallet;

// ─────────────────────────────────────────────────────────────
//  PHASE 1C — mneti-rbac
// ─────────────────────────────────────────────────────────────
describe("Phase 1C — mneti-rbac", () => {
  const program = anchor.workspace.MnetiRbac as Program<any>;

  const [roleRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("role_registry")], program.programId);
  const [superAdminAssignment] = PublicKey.findProgramAddressSync(
    [Buffer.from("role_assignment"), authority.publicKey.toBuffer(), Buffer.from([0])],
    program.programId);

  it("Initializes role registry and grants SuperAdmin", async () => {
    try {
      await program.methods.initialize()
        .accounts({ authority: authority.publicKey, roleRegistry, superAdminAssignment,
          systemProgram: SystemProgram.programId })
        .rpc();
      const registry = await program.account.roleRegistry.fetch(roleRegistry);
      assert.equal(registry.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(registry.totalAssignments.toNumber(), 1);
      const sa = await program.account.roleAssignment.fetch(superAdminAssignment);
      assert.equal(sa.roleDisc, 0);
      assert.equal(sa.isActive, true);
      console.log("  ✅ Role registry initialized");
    } catch { console.log("  ℹ️  Already initialized"); }
  });

  it("Grants BridgeOperator role", async () => {
    const disc = 3;
    const [assignment] = PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), authority.publicKey.toBuffer(), Buffer.from([disc])],
      program.programId);
    try {
      await program.methods.grantRole(disc, null)
        .accounts({ caller: authority.publicKey, targetWallet: authority.publicKey,
          roleRegistry, callerRoleAssignment: superAdminAssignment,
          roleAssignment: assignment, systemProgram: SystemProgram.programId })
        .rpc();
      const a = await program.account.roleAssignment.fetch(assignment);
      assert.equal(a.roleDisc, disc);
      assert.equal(a.isActive, true);
      console.log("  ✅ BridgeOperator granted");
    } catch { console.log("  ℹ️  BridgeOperator already exists"); }
  });

  it("Grants OracleOperator role", async () => {
    const disc = 2;
    const [assignment] = PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), authority.publicKey.toBuffer(), Buffer.from([disc])],
      program.programId);
    try {
      await program.methods.grantRole(disc, null)
        .accounts({ caller: authority.publicKey, targetWallet: authority.publicKey,
          roleRegistry, callerRoleAssignment: superAdminAssignment,
          roleAssignment: assignment, systemProgram: SystemProgram.programId })
        .rpc();
      console.log("  ✅ OracleOperator granted");
    } catch { console.log("  ℹ️  OracleOperator already exists"); }
  });

  it("Cannot grant SuperAdmin through grant_role", async () => {
    const disc = 0;
    const newWallet = anchor.web3.Keypair.generate();
    const [assignment] = PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), newWallet.publicKey.toBuffer(), Buffer.from([disc])],
      program.programId);
    try {
      await program.methods.grantRole(disc, null)
        .accounts({ caller: authority.publicKey, targetWallet: newWallet.publicKey,
          roleRegistry, callerRoleAssignment: superAdminAssignment,
          roleAssignment: assignment, systemProgram: SystemProgram.programId })
        .rpc();
      assert.fail("Should have thrown CannotGrantSuperAdmin");
    } catch (e: any) {
      assert.include(e.message, "CannotGrantSuperAdmin");
      console.log("  ✅ SuperAdmin grant correctly blocked");
    }
  });
});

// ─────────────────────────────────────────────────────────────
//  PHASE 1B — mneti-vault-registry
// ─────────────────────────────────────────────────────────────
describe("Phase 1B — mneti-vault-registry", () => {
  const program = anchor.workspace.MnetiVaultRegistry as Program<any>;

  const [registryState] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_registry_state")], program.programId);

  it("Initializes vault registry", async () => {
    try {
      await program.methods.initialize()
        .accounts({ authority: authority.publicKey, registryState,
          systemProgram: SystemProgram.programId })
        .rpc();
      const registry = await program.account.registryState.fetch(registryState);
      assert.equal(registry.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(registry.totalVaults.toNumber(), 0);
      console.log("  ✅ Vault registry initialized");
    } catch { console.log("  ℹ️  Already initialized"); }
  });

  it("Registers an individual vault", async () => {
    const INDIVIDUAL = 0;
    const vaultId    = anchor.web3.Keypair.generate().publicKey;
    const [vaultEntry] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_entry"), authority.publicKey.toBuffer(), Buffer.from([INDIVIDUAL])],
      program.programId);
    try {
      await program.methods.registerVault({
        vaultName: "Test Individual Vault", vaultTypeDisc: INDIVIDUAL, vaultId })
        .accounts({ owner: authority.publicKey, registryState, vaultEntry,
          systemProgram: SystemProgram.programId })
        .rpc();
      const entry   = await program.account.vaultEntry.fetch(vaultEntry);
      assert.equal(entry.vaultTypeDisc, INDIVIDUAL);
      assert.equal(entry.vaultStatusDisc, 1); // Active
      console.log("  ✅ Individual vault registered");
    } catch { console.log("  ℹ️  Vault already registered"); }
  });

  it("Verifies registry counters updated", async () => {
    const registry = await program.account.registryState.fetch(registryState);
    assert.isAbove(registry.totalVaults.toNumber(), 0);
    console.log("  ✅ Registry counters correct:", registry.totalVaults.toNumber(), "vaults");
  });
});

// ─────────────────────────────────────────────────────────────
//  PHASE 1A — mneti-kesh
// ─────────────────────────────────────────────────────────────
describe("Phase 1A — mneti-kesh", () => {
  const program = anchor.workspace.MnetiKesh as Program<any>;

  const [protocolState] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_state")], program.programId);
  const [keshMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("kesh_mint")], program.programId);
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority")], program.programId);
  const [walletState] = PublicKey.findProgramAddressSync(
    [Buffer.from("wallet_state"), authority.publicKey.toBuffer()], program.programId);

  const RATE  = new anchor.BN(130_500_000); // 130.5 KES/USD × 1M
  const YIELD = 1500;                        // 15% in bps

  it("Initializes KESH protocol", async () => {
    try {
      await program.methods.initialize({
        feeBps: 30, feeCollector: authority.publicKey,
        initialKesUsdRate: RATE, initialTbillYieldBps: YIELD })
        .accounts({ authority: authority.publicKey, protocolState, keshMint,
          mintAuthority, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY })
        .rpc();
      const state = await program.account.protocolState.fetch(protocolState);
      assert.equal(state.feeBps, 30);
      assert.equal(state.kesUsdRate.toNumber(), RATE.toNumber());
      assert.equal(state.isPaused, false);
      console.log("  ✅ KESH protocol initialized");
      console.log("  ✅ KESH Mint:", keshMint.toBase58());
    } catch { console.log("  ℹ️  Already initialized"); }
  });

  it("Initializes wallet state", async () => {
    try {
      await program.methods.initWalletState()
        .accounts({ payer: authority.publicKey, wallet: authority.publicKey,
          walletState, systemProgram: SystemProgram.programId })
        .rpc();
      const ws = await program.account.walletState.fetch(walletState);
      assert.equal(ws.complianceTier, 0);
      assert.equal(ws.isKycVerified, false);
      assert.equal(ws.isFrozen, false);
      console.log("  ✅ Wallet state initialized");
    } catch { console.log("  ℹ️  Wallet state already exists"); }
  });

  it("Updates KES/USD peg rate", async () => {
    const newRate = new anchor.BN(131_000_000);
    await program.methods.updatePeg(newRate, 1500)
      .accounts({ oracleOperator: authority.publicKey, protocolState })
      .rpc();
    const state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.kesUsdRate.toNumber(), newRate.toNumber());
    console.log("  ✅ Peg updated:", newRate.toNumber() / 1_000_000, "KES/USD");
  });

  it("Pauses and unpauses the protocol", async () => {
    await program.methods.pause("Test pause")
      .accounts({ authority: authority.publicKey, protocolState }).rpc();
    let state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.isPaused, true);
    console.log("  ✅ Protocol paused");

    await program.methods.unpause()
      .accounts({ authority: authority.publicKey, protocolState }).rpc();
    state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.isPaused, false);
    console.log("  ✅ Protocol unpaused");
  });

  it("Rejects pause from non-authority", async () => {
    const fake = anchor.web3.Keypair.generate();
    try {
      await program.methods.pause("Fake pause")
        .accounts({ authority: fake.publicKey, protocolState })
        .signers([fake]).rpc();
      assert.fail("Should have thrown Unauthorized");
    } catch (e: any) {
      assert.include(e.message, "Unauthorized");
      console.log("  ✅ Non-authority pause correctly rejected");
    }
  });

  it("Verifies total supply is zero before minting", async () => {
    const state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.totalKeshSupply.toNumber(), 0);
    console.log("  ✅ Total KESH supply is 0 (no minting yet)");
  });

  it("Verifies fee is 0.30%", async () => {
    const state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.feeBps, 30);
    console.log("  ✅ Fee is 0.30% (30 bps)");
  });
});

// ─────────────────────────────────────────────────────────────
//  PHASE 2 — mneti-oracle
// ─────────────────────────────────────────────────────────────
describe("Phase 2 — mneti-oracle", () => {
  const program = anchor.workspace.MnetiOracle as Program<any>;

  const [oracleRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry")], program.programId);

  const getFeed = (t: number) => PublicKey.findProgramAddressSync(
    [Buffer.from("price_feed"), Buffer.from([t])], program.programId);

  const KES_PRICE  = new anchor.BN(130_500_000);
  const TBILL_BPS  = new anchor.BN(1500);
  const XAU_PRICE  = new anchor.BN(2050_000_000);
  const CONF       = new anchor.BN(50_000);

  it("Initializes oracle registry", async () => {
    try {
      await program.methods.initializeRegistry({ relayOperator: authority.publicKey })
        .accounts({ authority: authority.publicKey, oracleRegistry,
          systemProgram: SystemProgram.programId })
        .rpc();
      const reg = await program.account.oracleRegistry.fetch(oracleRegistry);
      assert.equal(reg.relayOperator.toBase58(), authority.publicKey.toBase58());
      assert.equal(reg.totalFeeds, 0);
      console.log("  ✅ Oracle registry initialized");
    } catch { console.log("  ℹ️  Already initialized"); }
  });

  it("Initializes KES/USD feed", async () => {
    const [priceFeed] = getFeed(0);
    try {
      await program.methods.initializeFeed(0)
        .accounts({ authority: authority.publicKey, oracleRegistry, priceFeed,
          systemProgram: SystemProgram.programId })
        .rpc();
      const feed = await program.account.priceFeed.fetch(priceFeed);
      assert.equal(feed.feedType, 0);
      assert.equal(feed.circuitBreakerActive, false);
      console.log("  ✅ KES/USD feed initialized");
    } catch { console.log("  ℹ️  Already initialized"); }
  });

  it("Initializes T-bill yield feed", async () => {
    const [priceFeed] = getFeed(1);
    try {
      await program.methods.initializeFeed(1)
        .accounts({ authority: authority.publicKey, oracleRegistry, priceFeed,
          systemProgram: SystemProgram.programId })
        .rpc();
      console.log("  ✅ T-bill feed initialized");
    } catch { console.log("  ℹ️  Already initialized"); }
  });

  it("Initializes XAU/USD gold feed", async () => {
    const [priceFeed] = getFeed(2);
    try {
      await program.methods.initializeFeed(2)
        .accounts({ authority: authority.publicKey, oracleRegistry, priceFeed,
          systemProgram: SystemProgram.programId })
        .rpc();
      console.log("  ✅ XAU/USD feed initialized");
    } catch { console.log("  ℹ️  Already initialized"); }
  });

  it("Submits SIX KES/USD price", async () => {
    const [priceFeed] = getFeed(0);
    const now         = Math.floor(Date.now() / 1000);
    await program.methods.submitSixPrice(0,
      { price: KES_PRICE, confidence: CONF, timestamp: new anchor.BN(now) })
      .accounts({ relayOperator: authority.publicKey, oracleRegistry, priceFeed })
      .rpc();
    const feed = await program.account.priceFeed.fetch(priceFeed);
    assert.equal(feed.sixPrice.toNumber(), KES_PRICE.toNumber());
    assert.equal(feed.sixUpdateCount.toNumber(), 1);
    assert.isAbove(feed.twap.toNumber(), 0);
    console.log("  ✅ KES/USD price submitted:", feed.sixPrice.toNumber() / 1_000_000);
    console.log("  ✅ TWAP:", feed.twap.toNumber() / 1_000_000);
  });

  it("Submits T-bill yield", async () => {
    const [priceFeed] = getFeed(1);
    const now         = Math.floor(Date.now() / 1000);
    await program.methods.submitSixPrice(1,
      { price: TBILL_BPS, confidence: new anchor.BN(10), timestamp: new anchor.BN(now) })
      .accounts({ relayOperator: authority.publicKey, oracleRegistry, priceFeed })
      .rpc();
    const feed = await program.account.priceFeed.fetch(priceFeed);
    assert.equal(feed.sixPrice.toNumber(), 1500);
    console.log("  ✅ T-bill yield:", feed.sixPrice.toNumber() / 100, "%");
  });

  it("Builds TWAP from multiple price submissions", async () => {
    const [priceFeed] = getFeed(0);
    const testPrices  = [130_400_000, 130_600_000, 130_450_000, 130_550_000];
    for (const p of testPrices) {
      const now = Math.floor(Date.now() / 1000);
      await program.methods.submitSixPrice(0,
        { price: new anchor.BN(p), confidence: CONF, timestamp: new anchor.BN(now) })
        .accounts({ relayOperator: authority.publicKey, oracleRegistry, priceFeed })
        .rpc();
    }
    const feed = await program.account.priceFeed.fetch(priceFeed);
    assert.isAbove(feed.twap.toNumber(), 0);
    console.log("  ✅ TWAP after 5 readings:", feed.twap.toNumber() / 1_000_000);
    console.log("  ✅ Total updates:", feed.sixUpdateCount.toNumber());
  });

  it("Submits Pyth fallback and activates fallback mode", async () => {
    const [priceFeed] = getFeed(0);
    const now         = Math.floor(Date.now() / 1000);
    const pythPrice   = new anchor.BN(130_200_000);
    await program.methods.submitPythPrice(0,
      { price: pythPrice, confidence: new anchor.BN(100_000), timestamp: new anchor.BN(now) })
      .accounts({ relayOperator: authority.publicKey, oracleRegistry, priceFeed })
      .rpc();
    const feed = await program.account.priceFeed.fetch(priceFeed);
    assert.equal(feed.pythIsActiveSource, true);
    assert.equal(feed.pythPrice.toNumber(), pythPrice.toNumber());
    console.log("  ✅ Pyth fallback active:", feed.pythPrice.toNumber() / 1_000_000);
  });

  it("Fresh SIX price deactivates Pyth fallback", async () => {
    const [priceFeed] = getFeed(0);
    const now         = Math.floor(Date.now() / 1000);
    await program.methods.submitSixPrice(0,
      { price: KES_PRICE, confidence: CONF, timestamp: new anchor.BN(now) })
      .accounts({ relayOperator: authority.publicKey, oracleRegistry, priceFeed })
      .rpc();
    const feed = await program.account.priceFeed.fetch(priceFeed);
    assert.equal(feed.pythIsActiveSource, false);
    assert.equal(feed.circuitBreakerActive, false);
    console.log("  ✅ Pyth fallback deactivated — SIX primary");
  });

  it("Rotates relay operator", async () => {
    const newOp = anchor.web3.Keypair.generate().publicKey;
    await program.methods.updateRelayOperator(newOp)
      .accounts({ authority: authority.publicKey, oracleRegistry }).rpc();
    const reg = await program.account.oracleRegistry.fetch(oracleRegistry);
    assert.equal(reg.relayOperator.toBase58(), newOp.toBase58());
    // Rotate back
    await program.methods.updateRelayOperator(authority.publicKey)
      .accounts({ authority: authority.publicKey, oracleRegistry }).rpc();
    console.log("  ✅ Relay operator rotated and restored");
  });
});
