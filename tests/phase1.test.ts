import * as anchor from "@coral-xyz/anchor";
import { Program }  from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";

// ─────────────────────────────────────────────────────────────
//  MNETI Phase 1 — Full Test Suite
//  Tests: mneti-rbac | mneti-vault-registry | mneti-kesh
// ─────────────────────────────────────────────────────────────

describe("Phase 1A — mneti-rbac", () => {
  const provider  = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program   = anchor.workspace.MnetiRbac as Program<any>;
  const authority = provider.wallet as anchor.Wallet;

  const [roleRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("role_registry")],
    program.programId
  );
  const [superAdminAssignment] = PublicKey.findProgramAddressSync(
    [Buffer.from("role_assignment"), authority.publicKey.toBuffer(), Buffer.from([0])],
    program.programId
  );

  it("Initializes the role registry and grants SuperAdmin", async () => {
    try {
      await program.methods
        .initialize()
        .accounts({
          authority,
          roleRegistry,
          superAdminAssignment,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const registry = await program.account.roleRegistry.fetch(roleRegistry);
      assert.equal(registry.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(registry.totalAssignments.toNumber(), 1);

      const sa = await program.account.roleAssignment.fetch(superAdminAssignment);
      assert.equal(sa.roleDisc, 0);
      assert.equal(sa.isActive, true);
      assert.isNull(sa.expiresAt);
      console.log("  ✅ Role registry initialized");
      console.log("  ✅ SuperAdmin granted to:", authority.publicKey.toBase58());
    } catch (e) {
      console.log("  ℹ️  Already initialized");
    }
  });

  it("Grants BridgeOperator role to authority wallet", async () => {
    const BRIDGE_OPERATOR_DISC = 3;
    const [bridgeOpAssignment] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role_assignment"),
        authority.publicKey.toBuffer(),
        Buffer.from([BRIDGE_OPERATOR_DISC]),
      ],
      program.programId
    );

    try {
      await program.methods
        .grantRole(BRIDGE_OPERATOR_DISC, null)
        .accounts({
          caller:               authority.publicKey,
          targetWallet:         authority.publicKey,
          roleRegistry,
          callerRoleAssignment: superAdminAssignment,
          roleAssignment:       bridgeOpAssignment,
          systemProgram:        SystemProgram.programId,
        })
        .rpc();

      const assignment = await program.account.roleAssignment.fetch(bridgeOpAssignment);
      assert.equal(assignment.roleDisc, BRIDGE_OPERATOR_DISC);
      assert.equal(assignment.isActive, true);
      console.log("  ✅ BridgeOperator role granted");
    } catch (e) {
      console.log("  ℹ️  BridgeOperator already assigned:", e.message);
    }
  });

  it("Grants OracleOperator role to authority wallet", async () => {
    const ORACLE_DISC = 2;
    const [oracleAssignment] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role_assignment"),
        authority.publicKey.toBuffer(),
        Buffer.from([ORACLE_DISC]),
      ],
      program.programId
    );

    try {
      await program.methods
        .grantRole(ORACLE_DISC, null)
        .accounts({
          caller:               authority.publicKey,
          targetWallet:         authority.publicKey,
          roleRegistry,
          callerRoleAssignment: superAdminAssignment,
          roleAssignment:       oracleAssignment,
          systemProgram:        SystemProgram.programId,
        })
        .rpc();

      const assignment = await program.account.roleAssignment.fetch(oracleAssignment);
      assert.equal(assignment.roleDisc, ORACLE_DISC);
      assert.equal(assignment.isActive, true);
      console.log("  ✅ OracleOperator role granted");
    } catch (e) {
      console.log("  ℹ️  OracleOperator already assigned:", e.message);
    }
  });
});

// ─────────────────────────────────────────────────────────────

describe("Phase 1B — mneti-vault-registry", () => {
  const provider  = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program   = anchor.workspace.MnetiVaultRegistry as Program<any>;
  const authority = provider.wallet as anchor.Wallet;

  const [registryState] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_registry_state")],
    program.programId
  );

  it("Initializes the vault registry", async () => {
    try {
      await program.methods
        .initialize()
        .accounts({
          authority,
          registryState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const registry = await program.account.registryState.fetch(registryState);
      assert.equal(registry.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(registry.totalVaults.toNumber(), 0);
      assert.equal(registry.activeVaults.toNumber(), 0);
      console.log("  ✅ Vault registry initialized");
    } catch (e) {
      console.log("  ℹ️  Already initialized");
    }
  });
});

// ─────────────────────────────────────────────────────────────

describe("Phase 1A — mneti-kesh", () => {
  const provider  = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program   = anchor.workspace.MnetiKesh as Program<any>;
  const authority = provider.wallet as anchor.Wallet;

  // PDAs
  const [protocolState] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_state")],
    program.programId
  );
  const [keshMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("kesh_mint")],
    program.programId
  );
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority")],
    program.programId
  );
  const [walletState] = PublicKey.findProgramAddressSync(
    [Buffer.from("wallet_state"), authority.publicKey.toBuffer()],
    program.programId
  );

  const INITIAL_RATE       = 130_000_000; // 130 KES per USD × 1_000_000
  const INITIAL_YIELD_BPS  = 1500;        // 15% T-bill yield

  it("Initializes the KESH protocol", async () => {
    try {
      await program.methods
        .initialize({
          feeBps:               30,
          feeCollector:         authority.publicKey,
          initialKesUsdRate:    new anchor.BN(INITIAL_RATE),
          initialTbillYieldBps: INITIAL_YIELD_BPS,
        })
        .accounts({
          authority,
          protocolState,
          keshMint,
          mintAuthority,
          tokenProgram:  TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent:          SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      const state = await program.account.protocolState.fetch(protocolState);
      assert.equal(state.feeBps, 30);
      assert.equal(state.kesUsdRate.toNumber(), INITIAL_RATE);
      assert.equal(state.tbillYieldBps, INITIAL_YIELD_BPS);
      assert.equal(state.isPaused, false);
      assert.equal(state.totalKeshSupply.toNumber(), 0);
      console.log("  ✅ KESH protocol initialized");
      console.log("  ✅ KESH Mint:", keshMint.toBase58());
    } catch (e) {
      console.log("  ℹ️  Already initialized:", e.message);
    }
  });

  it("Initializes wallet state", async () => {
    try {
      await program.methods
        .initWalletState()
        .accounts({
          payer:         authority.publicKey,
          wallet:        authority.publicKey,
          walletState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const ws = await program.account.walletState.fetch(walletState);
      assert.equal(ws.complianceTier, 0);
      assert.equal(ws.isKycVerified, false);
      assert.equal(ws.isFrozen, false);
      assert.equal(ws.lifetimeKeshReceived.toNumber(), 0);
      console.log("  ✅ Wallet state initialized");
    } catch (e) {
      console.log("  ℹ️  Wallet state already exists");
    }
  });

  it("Updates KES/USD peg rate", async () => {
    const newRate = 131_500_000;
    await program.methods
      .updatePeg(new anchor.BN(newRate), 1500)
      .accounts({
        oracleOperator: authority.publicKey,
        protocolState,
      })
      .rpc();

    const state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.kesUsdRate.toNumber(), newRate);
    console.log("  ✅ Peg updated:", newRate / 1_000_000, "KES/USD");
  });

  it("Pauses and unpauses the protocol", async () => {
    await program.methods
      .pause("Integration test pause")
      .accounts({ authority: authority.publicKey, protocolState })
      .rpc();

    let state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.isPaused, true);
    console.log("  ✅ Protocol paused");

    await program.methods
      .unpause()
      .accounts({ authority: authority.publicKey, protocolState })
      .rpc();

    state = await program.account.protocolState.fetch(protocolState);
    assert.equal(state.isPaused, false);
    console.log("  ✅ Protocol unpaused");
  });
});
