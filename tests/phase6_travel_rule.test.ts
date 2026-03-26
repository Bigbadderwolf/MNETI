/**
 * MNETI Protocol — Phase 6 Tests
 * tests/phase6_travel_rule.test.ts
 *
 * mneti-travel-rule program — 10 tests
 * Run: anchor test --skip-local-validator
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import {
  getVaspRegistryPda, getVaspRecordPda, getTrPayloadPda,
  TRAVEL_RULE_THRESHOLD_KESH,
} from "../sdk/src/travel_rule/travel_rule_client";

describe("Phase 6B — mneti-travel-rule", () => {
  const provider   = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program    = anchor.workspace.MnetiTravelRule as Program;
  const programId  = program.programId;

  const originatorAuth  = Keypair.generate();
  const beneficiaryAuth = Keypair.generate();
  const originatorWallet= Keypair.generate();
  const beneficiaryWallet = Keypair.generate();

  before(async () => {
    for (const kp of [originatorAuth, beneficiaryAuth]) {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 3 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);
    }
  });

  it("1. Initializes VASP registry", async () => {
    const [registry] = getVaspRegistryPda(programId);
    await program.methods.initializeVaspRegistry()
      .accounts({ authority: originatorAuth.publicKey, registry, systemProgram: SystemProgram.programId })
      .signers([originatorAuth]).rpc();
    const r = await program.account.vaspRegistry.fetch(registry);
    assert.equal(r.authority.toBase58(),       originatorAuth.publicKey.toBase58());
    assert.equal(r.totalVaspsRegistered.toNumber(),   0);
    assert.equal(r.totalPayloadsSubmitted.toNumber(), 0);
  });

  it("2. Registers originator VASP (MNETI Kenya)", async () => {
    const [registry] = getVaspRegistryPda(programId);
    const [vasp]     = getVaspRecordPda(originatorAuth.publicKey, programId);
    await program.methods.registerVasp({
      name: "MNETI Kenya", did: "did:mneti:ke:safaricom",
      jurisdiction: "KE", complianceContactUri: "https://compliance.mneti.io/tr",
      isOriginatorVasp: true, isBeneficiaryVasp: true,
    })
      .accounts({ authority: originatorAuth.publicKey, registry, vasp, systemProgram: SystemProgram.programId })
      .signers([originatorAuth]).rpc();
    const v = await program.account.vaspRecord.fetch(vasp);
    assert.equal(v.name,             "MNETI Kenya");
    assert.equal(v.jurisdiction,     "KE");
    assert.equal(v.isActive,         true);
    assert.equal(v.isOriginatorVasp, true);
    assert.equal(v.isBeneficiaryVasp,true);
  });

  it("3. Registers beneficiary VASP (MNETI UK)", async () => {
    const [registry] = getVaspRegistryPda(programId);
    const [vasp]     = getVaspRecordPda(beneficiaryAuth.publicKey, programId);
    await program.methods.registerVasp({
      name: "MNETI UK", did: "did:mneti:gb:monzo",
      jurisdiction: "GB", complianceContactUri: "https://compliance.mneti.io/tr",
      isOriginatorVasp: false, isBeneficiaryVasp: true,
    })
      .accounts({ authority: beneficiaryAuth.publicKey, registry, vasp, systemProgram: SystemProgram.programId })
      .signers([beneficiaryAuth]).rpc();
    const r = await program.account.vaspRegistry.fetch(registry);
    assert.equal(r.totalVaspsRegistered.toNumber(), 2);
  });

  it("4. Deactivates and reactivates a VASP", async () => {
    const [vasp] = getVaspRecordPda(beneficiaryAuth.publicKey, programId);
    await program.methods.deactivateVasp()
      .accounts({ authority: beneficiaryAuth.publicKey, vasp })
      .signers([beneficiaryAuth]).rpc();
    const deactivated = await program.account.vaspRecord.fetch(vasp);
    assert.equal(deactivated.isActive, false);

    await program.methods.reactivateVasp()
      .accounts({ authority: beneficiaryAuth.publicKey, vasp })
      .signers([beneficiaryAuth]).rpc();
    const reactivated = await program.account.vaspRecord.fetch(vasp);
    assert.equal(reactivated.isActive, true);
  });

  it("5. Submits Travel Rule payload for large transfer (KES 200,000)", async () => {
    const [registry]       = getVaspRegistryPda(programId);
    const [originatorVasp] = getVaspRecordPda(originatorAuth.publicKey, programId);
    const [beneficiaryVasp]= getVaspRecordPda(beneficiaryAuth.publicKey, programId);
    const [payload]        = getTrPayloadPda(originatorWallet.publicKey, beneficiaryWallet.publicKey, programId);

    await program.methods.submitTrPayload(
      new anchor.BN(20_000_000), // KES 200,000 — above threshold
      {
        encryptedIvms101Cid: "QmX9abc123def456ghi789jkl012mno345pqr678stu901vw",
        originatorNameHash:  "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
        beneficiaryNameHash: "2c624232cdd221771294dfbb310acbc8a05f8d0e4d2f4e0a7b4f4b6c0d9f4a1",
        originatorCountry:   "KE",
        beneficiaryCountry:  "GB",
      }
    )
      .accounts({
        originatorVaspAuthority: originatorAuth.publicKey,
        originatorVasp, beneficiaryVasp,
        originatorWallet:  originatorWallet.publicKey,
        beneficiaryWallet: beneficiaryWallet.publicKey,
        payload, registry,
        systemProgram: SystemProgram.programId,
      })
      .signers([originatorAuth]).rpc();

    const p = await program.account.travelRulePayload.fetch(payload);
    assert.equal(p.transferAmountKesh.toNumber(),      20_000_000);
    assert.equal(p.acknowledged,                       false);
    assert.equal(p.rejected,                           false);
    assert.equal(p.originatorCountry,                  "KE");
    assert.equal(p.beneficiaryCountry,                 "GB");
    assert.isTrue(p.encryptedIvms101Cid.startsWith("Qm"));
  });

  it("6. Acknowledges Travel Rule payload", async () => {
    const [beneficiaryVasp] = getVaspRecordPda(beneficiaryAuth.publicKey, programId);
    const [payload]         = getTrPayloadPda(originatorWallet.publicKey, beneficiaryWallet.publicKey, programId);
    await program.methods.acknowledgeTrPayload()
      .accounts({
        beneficiaryVaspAuthority: beneficiaryAuth.publicKey,
        beneficiaryVasp, payload,
      })
      .signers([beneficiaryAuth]).rpc();
    const p = await program.account.travelRulePayload.fetch(payload);
    assert.equal(p.acknowledged,    true);
    assert.equal(p.rejected,        false);
    assert.isAbove(p.acknowledgedAt.toNumber(), 0);
  });

  it("7. Cannot acknowledge the same payload twice", async () => {
    const [beneficiaryVasp] = getVaspRecordPda(beneficiaryAuth.publicKey, programId);
    const [payload]         = getTrPayloadPda(originatorWallet.publicKey, beneficiaryWallet.publicKey, programId);
    try {
      await program.methods.acknowledgeTrPayload()
        .accounts({ beneficiaryVaspAuthority: beneficiaryAuth.publicKey, beneficiaryVasp, payload })
        .signers([beneficiaryAuth]).rpc();
      assert.fail("Should have rejected double acknowledgement");
    } catch (err: any) {
      assert.include(err.toString(), "AlreadyAcknowledged");
    }
  });

  it("8. Rejects payload submission below threshold (KES 50,000)", async () => {
    const w2 = Keypair.generate();
    const w3 = Keypair.generate();
    const [registry]       = getVaspRegistryPda(programId);
    const [originatorVasp] = getVaspRecordPda(originatorAuth.publicKey, programId);
    const [beneficiaryVasp]= getVaspRecordPda(beneficiaryAuth.publicKey, programId);
    const [payload]        = getTrPayloadPda(w2.publicKey, w3.publicKey, programId);
    try {
      await program.methods.submitTrPayload(
        new anchor.BN(5_000_000), // KES 50,000 — below threshold
        {
          encryptedIvms101Cid: "QmTest",
          originatorNameHash:  "a".repeat(64),
          beneficiaryNameHash: "b".repeat(64),
          originatorCountry:   "KE",
          beneficiaryCountry:  "GB",
        }
      )
        .accounts({
          originatorVaspAuthority: originatorAuth.publicKey,
          originatorVasp, beneficiaryVasp,
          originatorWallet:  w2.publicKey,
          beneficiaryWallet: w3.publicKey,
          payload, registry,
          systemProgram: SystemProgram.programId,
        })
        .signers([originatorAuth]).rpc();
      assert.fail("Should have rejected below threshold");
    } catch (err: any) {
      assert.include(err.toString(), "BelowThreshold");
    }
  });

  it("9. Rejects payload with empty CID", async () => {
    const w4 = Keypair.generate();
    const w5 = Keypair.generate();
    const [registry]       = getVaspRegistryPda(programId);
    const [originatorVasp] = getVaspRecordPda(originatorAuth.publicKey, programId);
    const [beneficiaryVasp]= getVaspRecordPda(beneficiaryAuth.publicKey, programId);
    const [payload]        = getTrPayloadPda(w4.publicKey, w5.publicKey, programId);
    try {
      await program.methods.submitTrPayload(
        new anchor.BN(20_000_000),
        {
          encryptedIvms101Cid: "", // empty — should fail
          originatorNameHash:  "a".repeat(64),
          beneficiaryNameHash: "b".repeat(64),
          originatorCountry:   "KE",
          beneficiaryCountry:  "GB",
        }
      )
        .accounts({
          originatorVaspAuthority: originatorAuth.publicKey,
          originatorVasp, beneficiaryVasp,
          originatorWallet:  w4.publicKey,
          beneficiaryWallet: w5.publicKey,
          payload, registry,
          systemProgram: SystemProgram.programId,
        })
        .signers([originatorAuth]).rpc();
      assert.fail("Should have rejected empty CID");
    } catch (err: any) {
      assert.include(err.toString(), "MissingPayloadCid");
    }
  });

  it("10. TRAVEL_RULE_THRESHOLD_KESH constant is correct (KES 130,000)", () => {
    assert.equal(TRAVEL_RULE_THRESHOLD_KESH, 13_000_000);
    // KES 130,000 × 100 KESH/KES = 13,000,000 KESH units (2 decimals)
  });
});
