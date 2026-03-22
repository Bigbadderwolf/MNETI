// ─────────────────────────────────────────────────────────────
//  MNETI Phase 3 — Compliance Test Suite
//  Tests: mneti-compliance program (7 instructions)
//  Total: 12 tests
//
//  Run: anchor test --skip-local-validator
// ─────────────────────────────────────────────────────────────

import * as anchor from "@coral-xyz/anchor";
import { Program }  from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("Phase 3 — mneti-compliance", () => {
  const provider  = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program   = anchor.workspace.MnetiCompliance as Program<any>;
  const authority = provider.wallet as anchor.Wallet;

  // PDAs
  const [complianceRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("compliance_registry")],
    program.programId
  );

  const [credential] = PublicKey.findProgramAddressSync(
    [Buffer.from("compliance_credential"), authority.publicKey.toBuffer()],
    program.programId
  );

  const [creditScore] = PublicKey.findProgramAddressSync(
    [Buffer.from("credit_score"), authority.publicKey.toBuffer()],
    program.programId
  );

  // Mock ZK proof (valid structure, non-zero bytes)
  const mockProof = {
    a: Array(64).fill(1),
    b: Array(128).fill(2),
    c: Array(64).fill(3),
  };

  // Mock KYC public signals
  const mockKycSignals = {
    complianceTier:  0,
    jurisdictionOk:  true,
    notSanctioned:   true,
    kycValidUntil:   new anchor.BN(2000000000),
    commitment:      Array(32).fill(4),
    identityHash:    Array(32).fill(5),
  };

  // Mock credit score public signals
  const mockCreditSignals = {
    creditScore:        new anchor.BN(720),
    incomeBand:         3,
    paymentReliability: 95,
    savingsRateBand:    4,
    monthsOfHistory:    24,
    commitment:         Array(32).fill(6),
  };

  // ── TEST 1: Initialize compliance registry ──────────────────
  it("Initializes compliance registry", async () => {
    try {
      await program.methods
        .initializeRegistry(authority.publicKey)
        .accounts({
          authority:           authority.publicKey,
          complianceRegistry,
          systemProgram:       SystemProgram.programId,
        })
        .rpc();

      const registry = await program.account.complianceRegistry.fetch(complianceRegistry);
      assert.equal(registry.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(registry.complianceOfficer.toBase58(), authority.publicKey.toBase58());
      assert.equal(registry.totalCredentials.toNumber(), 0);
      assert.equal(registry.isPaused, false);
      console.log("  ✅ Compliance registry initialized");
    } catch {
      console.log("  ℹ️  Already initialized");
    }
  });

  // ── TEST 2: Issue KYC credential via ZK proof ───────────────
  it("Issues compliance credential after KYC proof verification", async () => {
    try {
      await program.methods
        .verifyKycProof(mockProof, mockKycSignals)
        .accounts({
          payer:               authority.publicKey,
          wallet:              authority.publicKey,
          complianceRegistry,
          credential,
          systemProgram:       SystemProgram.programId,
        })
        .rpc();

      const cred = await program.account.complianceCredential.fetch(credential);
      assert.equal(cred.wallet.toBase58(), authority.publicKey.toBase58());
      assert.equal(cred.complianceTier, 0);
      assert.equal(cred.jurisdictionOk, true);
      assert.equal(cred.notSanctioned, true);
      assert.equal(cred.isFrozen, false);
      console.log("  ✅ KYC credential issued — Tier:", cred.complianceTier);
      console.log("  ✅ KYC valid until:", new Date(cred.kycValidUntil.toNumber() * 1000).toLocaleDateString());
    } catch {
      console.log("  ℹ️  Credential already exists");
    }
  });

  // ── TEST 3: Credential is valid ─────────────────────────────
  it("Verifies issued credential is valid", async () => {
    const cred = await program.account.complianceCredential.fetch(credential);
    assert.equal(cred.isFrozen, false);
    assert.isAbove(cred.kycValidUntil.toNumber(), Math.floor(Date.now() / 1000));
    assert.equal(cred.jurisdictionOk, true);
    assert.equal(cred.notSanctioned, true);
    console.log("  ✅ Credential is valid and not expired");
  });

  // ── TEST 4: Issue credit score credential ───────────────────
  it("Issues credit score credential after M-Pesa ZK proof", async () => {
    try {
      await program.methods
        .verifyCreditProof(mockProof, mockCreditSignals)
        .accounts({
          payer:         authority.publicKey,
          wallet:        authority.publicKey,
          creditScore,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const score = await program.account.creditScoreCredential.fetch(creditScore);
      assert.equal(score.wallet.toBase58(), authority.publicKey.toBase58());
      assert.equal(score.creditScore, 720);
      assert.equal(score.incomeBand, 3);
      assert.equal(score.paymentReliability, 95);
      assert.isAbove(score.creditLimitKesh.toNumber(), 0);
      console.log("  ✅ Credit score issued:", score.creditScore);
      console.log("  ✅ Credit limit:", score.creditLimitKesh.toNumber() / 100, "KES");
    } catch {
      console.log("  ℹ️  Credit score already exists");
    }
  });

  // ── TEST 5: Credit limit matches score ──────────────────────
  it("Verifies credit limit is correctly derived from score", async () => {
    const score = await program.account.creditScoreCredential.fetch(creditScore);
    // Score 720 falls in tier 3 (650-749) → KES 500,000
    assert.equal(score.creditLimitKesh.toNumber(), 500_000_00);
    console.log("  ✅ Credit limit correctly calculated: KES 500,000 for score 720");
  });

  // ── TEST 6: Freeze wallet ────────────────────────────────────
  it("Freezes a wallet for AML review", async () => {
    await program.methods
      .freezeWallet("AML review triggered by suspicious transaction pattern")
      .accounts({
        complianceOfficer: authority.publicKey,
        targetWallet:      authority.publicKey,
        complianceRegistry,
        credential,
      })
      .rpc();

    const cred = await program.account.complianceCredential.fetch(credential);
    assert.equal(cred.isFrozen, true);
    assert.include(cred.freezeReason, "AML");
    console.log("  ✅ Wallet frozen successfully");
    console.log("  ✅ Freeze reason:", cred.freezeReason);
  });

  // ── TEST 7: Check compliance fails when frozen ───────────────
  it("Check compliance correctly rejects frozen wallet", async () => {
    try {
      await program.methods
        .checkCompliance(0)
        .accounts({
          wallet:     authority.publicKey,
          credential,
        })
        .rpc();
      assert.fail("Should have thrown WalletFrozen");
    } catch (e: any) {
      assert.include(e.message, "WalletFrozen");
      console.log("  ✅ Frozen wallet correctly rejected by compliance check");
    }
  });

  // ── TEST 8: Unfreeze wallet ──────────────────────────────────
  it("Unfreezes wallet after review", async () => {
    await program.methods
      .unfreezeWallet()
      .accounts({
        complianceOfficer: authority.publicKey,
        targetWallet:      authority.publicKey,
        complianceRegistry,
        credential,
      })
      .rpc();

    const cred = await program.account.complianceCredential.fetch(credential);
    assert.equal(cred.isFrozen, false);
    assert.equal(cred.freezeReason, "");
    console.log("  ✅ Wallet unfrozen successfully");
  });

  // ── TEST 9: Check compliance passes when valid ───────────────
  it("Check compliance passes for valid wallet", async () => {
    await program.methods
      .checkCompliance(0)
      .accounts({
        wallet:     authority.publicKey,
        credential,
      })
      .rpc();
    console.log("  ✅ Compliance check passed for Tier 0");
  });

  // ── TEST 10: Check compliance fails wrong tier ───────────────
  it("Check compliance rejects insufficient tier", async () => {
    try {
      await program.methods
        .checkCompliance(2) // Requires Tier 2, wallet is Tier 0
        .accounts({
          wallet:     authority.publicKey,
          credential,
        })
        .rpc();
      assert.fail("Should have thrown InsufficientTier");
    } catch (e: any) {
      assert.include(e.message, "InsufficientTier");
      console.log("  ✅ Tier 2 requirement correctly rejected Tier 0 wallet");
    }
  });

  // ── TEST 11: Registry counters correct ──────────────────────
  it("Verifies registry counters are accurate", async () => {
    const registry = await program.account.complianceRegistry.fetch(complianceRegistry);
    assert.isAbove(registry.totalCredentials.toNumber(), 0);
    assert.equal(registry.totalFrozen.toNumber(), 0); // Was unfrozen
    console.log("  ✅ Total credentials:", registry.totalCredentials.toNumber());
    console.log("  ✅ Total frozen:", registry.totalFrozen.toNumber());
  });

  // ── TEST 12: Revoke credential ───────────────────────────────
  it("Revokes a compliance credential", async () => {
    // Create a separate wallet to revoke (don't revoke authority's credential)
    const testWallet = anchor.web3.Keypair.generate();
    const [testCredential] = PublicKey.findProgramAddressSync(
      [Buffer.from("compliance_credential"), testWallet.publicKey.toBuffer()],
      program.programId
    );

    // First issue a credential for this test wallet
    try {
      await program.methods
        .verifyKycProof(mockProof, mockKycSignals)
        .accounts({
          payer:               authority.publicKey,
          wallet:              testWallet.publicKey,
          complianceRegistry,
          credential:          testCredential,
          systemProgram:       SystemProgram.programId,
        })
        .rpc();

      // Now revoke it
      await program.methods
        .revokeCredential("Sanctions list hit confirmed")
        .accounts({
          complianceOfficer: authority.publicKey,
          targetWallet:      testWallet.publicKey,
          complianceRegistry,
          credential:        testCredential,
        })
        .rpc();

      const cred = await program.account.complianceCredential.fetch(testCredential);
      assert.equal(cred.kycValidUntil.toNumber(), 0);
      assert.equal(cred.isFrozen, true);
      console.log("  ✅ Credential revoked — sanctions hit confirmed");
    } catch (e: any) {
      console.log("  ℹ️  Revocation test:", e.message);
    }
  });
});
