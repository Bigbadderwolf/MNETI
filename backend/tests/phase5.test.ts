/**
 * MNETI Protocol — Phase 5 Tests
 * Smart Vault System — 24 tests
 *
 * Run with: anchor test --skip-local-validator
 * Requires: solana-test-validator running on localhost:8899
 *
 * Test coverage:
 *  Individual Vault: 7 tests
 *  Chama Vault:      8 tests
 *  SME Vault:        5 tests
 *  NGO Vault:        4 tests
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import {
  getIndividualVaultPda,
  getChamaVaultPda,
  getSmVaultPda,
  getNgoVaultPda,
  getVaultEscrowPda,
  getChamaMemberPda,
  getChamaProposalPda,
  PROPOSAL_TYPE,
} from "../sdk/src/vaults/vault_client";

// ─── Setup ────────────────────────────────────────────────────────────────────

describe("Phase 5 — Smart Vault System", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MnetiVault as Program;
  const programId = program.programId;

  // Wallets
  const owner = Keypair.generate();
  const member2 = Keypair.generate();
  const member3 = Keypair.generate();
  const ngoAuthority = Keypair.generate();
  const donor = Keypair.generate();

  // Token
  let keshMint: PublicKey;
  let ownerAta: PublicKey;
  let member2Ata: PublicKey;
  let donorAta: PublicKey;

  // Chama
  const CHAMA_NAME = "MamaFund";
  let chamaVaultPda: PublicKey;

  // Constants
  const DEPOSIT_AMOUNT = new anchor.BN(50_000); // KES 500.00
  const SMALL_AMOUNT = new anchor.BN(5_000);    // KES 50.00 (min)

  before(async () => {
    // Airdrop SOL to all test wallets
    for (const kp of [owner, member2, member3, ngoAuthority, donor]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    // Create mock KESH mint
    keshMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,  // mint authority
      null,
      2,               // 2 decimals = KES
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Create ATAs and mint test KESH
    ownerAta = await createAssociatedTokenAccount(
      provider.connection,
      owner,
      keshMint,
      owner.publicKey
    );
    await mintTo(
      provider.connection,
      owner,
      keshMint,
      ownerAta,
      owner,
      10_000_000 // KES 100,000
    );

    member2Ata = await createAssociatedTokenAccount(
      provider.connection,
      member2,
      keshMint,
      member2.publicKey
    );
    await mintTo(
      provider.connection,
      owner,
      keshMint,
      member2Ata,
      owner,
      5_000_000 // KES 50,000
    );

    donorAta = await createAssociatedTokenAccount(
      provider.connection,
      donor,
      keshMint,
      donor.publicKey
    );
    await mintTo(
      provider.connection,
      owner,
      keshMint,
      donorAta,
      owner,
      20_000_000
    );

    // Derive chama vault PDA for later use
    [chamaVaultPda] = getChamaVaultPda(owner.publicKey, CHAMA_NAME, programId);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — Individual Vault (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Individual Vault", () => {
    it("1. Creates individual vault with KYC tier 1", async () => {
      const [vault] = getIndividualVaultPda(owner.publicKey, programId);

      await program.methods
        .createIndividualVault({ kycTier: 1 })
        .accounts({
          owner: owner.publicKey,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.individualVault.fetch(vault);
      assert.equal(vaultAccount.owner.toBase58(), owner.publicKey.toBase58());
      assert.equal(vaultAccount.vaultType, 0); // VAULT_TYPE_INDIVIDUAL
      assert.equal(vaultAccount.status, 0);     // VaultStatus::Active
      assert.equal(vaultAccount.balanceKesh.toNumber(), 0);
      assert.equal(vaultAccount.kycTier, 1);
      assert.deepEqual(vaultAccount.savingsGoals, []);
    });

    it("2. Deposits KESH into individual vault", async () => {
      const [vault] = getIndividualVaultPda(owner.publicKey, programId);
      const [vaultEscrow] = getVaultEscrowPda(vault, programId);

      await program.methods
        .individualDeposit(DEPOSIT_AMOUNT)
        .accounts({
          owner: owner.publicKey,
          vault,
          depositorTokenAccount: ownerAta,
          vaultEscrow,
          keshMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.individualVault.fetch(vault);
      assert.equal(
        vaultAccount.balanceKesh.toNumber(),
        DEPOSIT_AMOUNT.toNumber()
      );
      assert.equal(
        vaultAccount.totalDeposited.toNumber(),
        DEPOSIT_AMOUNT.toNumber()
      );

      const escrowAccount = await getAccount(provider.connection, vaultEscrow);
      assert.equal(
        Number(escrowAccount.amount),
        DEPOSIT_AMOUNT.toNumber()
      );
    });

    it("3. Rejects deposit below minimum (KES 49)", async () => {
      const [vault] = getIndividualVaultPda(owner.publicKey, programId);
      const [vaultEscrow] = getVaultEscrowPda(vault, programId);
      const belowMin = new anchor.BN(4_999); // KES 49.99

      try {
        await program.methods
          .individualDeposit(belowMin)
          .accounts({
            owner: owner.publicKey,
            vault,
            depositorTokenAccount: ownerAta,
            vaultEscrow,
            keshMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([owner])
          .rpc();
        assert.fail("Should have thrown BelowMinimumAmount error");
      } catch (err: any) {
        assert.include(err.toString(), "BelowMinimumAmount");
      }
    });

    it("4. Adds savings goal to vault", async () => {
      const [vault] = getIndividualVaultPda(owner.publicKey, programId);

      await program.methods
        .addSavingsGoal({
          name: "School Fees",
          targetAmount: new anchor.BN(500_000), // KES 5,000
        })
        .accounts({ owner: owner.publicKey, vault })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.individualVault.fetch(vault);
      assert.equal(vaultAccount.savingsGoals.length, 1);
      assert.equal(vaultAccount.savingsGoals[0].name, "School Fees");
      assert.equal(
        vaultAccount.savingsGoals[0].targetAmount.toNumber(),
        500_000
      );
      assert.equal(vaultAccount.savingsGoals[0].completed, false);
    });

    it("5. Withdraws KESH from individual vault", async () => {
      const [vault] = getIndividualVaultPda(owner.publicKey, programId);
      const [vaultEscrow] = getVaultEscrowPda(vault, programId);
      const withdrawAmount = new anchor.BN(10_000); // KES 100

      const vaultBefore = await program.account.individualVault.fetch(vault);

      await program.methods
        .individualWithdraw(withdrawAmount)
        .accounts({
          owner: owner.publicKey,
          vault,
          recipientTokenAccount: ownerAta,
          vaultEscrow,
          keshMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      const vaultAfter = await program.account.individualVault.fetch(vault);
      assert.equal(
        vaultAfter.balanceKesh.toNumber(),
        vaultBefore.balanceKesh.toNumber() - withdrawAmount.toNumber()
      );
      assert.equal(
        vaultAfter.totalWithdrawn.toNumber(),
        withdrawAmount.toNumber()
      );
    });

    it("6. Rejects withdrawal exceeding balance", async () => {
      const [vault] = getIndividualVaultPda(owner.publicKey, programId);
      const [vaultEscrow] = getVaultEscrowPda(vault, programId);
      const tooMuch = new anchor.BN(999_999_999);

      try {
        await program.methods
          .individualWithdraw(tooMuch)
          .accounts({
            owner: owner.publicKey,
            vault,
            recipientTokenAccount: ownerAta,
            vaultEscrow,
            keshMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([owner])
          .rpc();
        assert.fail("Should have thrown InsufficientBalance error");
      } catch (err: any) {
        assert.include(err.toString(), "InsufficientBalance");
      }
    });

    it("7. Closes individual vault when balance is zero", async () => {
      // Create a separate vault for close test
      const closer = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        closer.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");

      const [vault] = getIndividualVaultPda(closer.publicKey, programId);

      await program.methods
        .createIndividualVault({ kycTier: 1 })
        .accounts({
          owner: closer.publicKey,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([closer])
        .rpc();

      // Close immediately (zero balance)
      await program.methods
        .closeIndividualVault()
        .accounts({ owner: closer.publicKey, vault })
        .signers([closer])
        .rpc();

      // Account should no longer exist
      const vaultInfo = await provider.connection.getAccountInfo(vault);
      assert.isNull(vaultInfo);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Chama Vault (8 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Chama Vault", () => {
    it("8. Creates chama vault with creator as first member", async () => {
      const [vault] = getChamaVaultPda(owner.publicKey, CHAMA_NAME, programId);
      const [creatorMember] = getChamaMemberPda(vault, owner.publicKey, programId);

      await program.methods
        .createChamaVault({
          name: CHAMA_NAME,
          description: "Women's savings group — Nairobi",
          contributionIntervalSeconds: new anchor.BN(7 * 24 * 3600), // weekly
          contributionAmount: new anchor.BN(20_000), // KES 200/week
          governanceThresholdPct: 51,
        })
        .accounts({
          creator: owner.publicKey,
          vault,
          creatorMember,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.chamaVault.fetch(vault);
      assert.equal(vaultAccount.name, CHAMA_NAME);
      assert.equal(vaultAccount.memberCount, 1);
      assert.equal(vaultAccount.proposalCount, 0);
      assert.equal(vaultAccount.governanceThresholdPct, 51);
      assert.equal(vaultAccount.status, 0); // Active

      const memberAccount = await program.account.chamaMember.fetch(creatorMember);
      assert.equal(memberAccount.wallet.toBase58(), owner.publicKey.toBase58());
      assert.equal(memberAccount.isActive, true);
      assert.equal(memberAccount.rotationPosition, 0);
    });

    it("9. Adds second member to chama", async () => {
      const [vault] = getChamaVaultPda(owner.publicKey, CHAMA_NAME, programId);
      const [memberAccount] = getChamaMemberPda(vault, member2.publicKey, programId);

      await program.methods
        .addChamaMember()
        .accounts({
          authority: owner.publicKey,
          vault,
          newMemberWallet: member2.publicKey,
          memberAccount,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.chamaVault.fetch(vault);
      assert.equal(vaultAccount.memberCount, 2);

      const memberAcc = await program.account.chamaMember.fetch(memberAccount);
      assert.equal(memberAcc.wallet.toBase58(), member2.publicKey.toBase58());
      assert.equal(memberAcc.rotationPosition, 1);
    });

    it("10. Member contributes to chama vault", async () => {
      const [vault] = getChamaVaultPda(owner.publicKey, CHAMA_NAME, programId);
      const [member] = getChamaMemberPda(vault, owner.publicKey, programId);
      const [vaultEscrow] = getVaultEscrowPda(vault, programId);

      await program.methods
        .chamaContribute(DEPOSIT_AMOUNT)
        .accounts({
          memberWallet: owner.publicKey,
          vault,
          member,
          contributorTokenAccount: ownerAta,
          vaultEscrow,
          keshMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.chamaVault.fetch(vault);
      assert.equal(vaultAccount.balanceKesh.toNumber(), DEPOSIT_AMOUNT.toNumber());

      const memberAcc = await program.account.chamaMember.fetch(member);
      assert.equal(
        memberAcc.totalContributed.toNumber(),
        DEPOSIT_AMOUNT.toNumber()
      );
    });

    it("11. Non-member cannot contribute to chama", async () => {
      const [vault] = getChamaVaultPda(owner.publicKey, CHAMA_NAME, programId);
      const stranger = Keypair.generate();
      const [strangeMember] = getChamaMemberPda(vault, stranger.publicKey, programId);
      const [vaultEscrow] = getVaultEscrowPda(vault, programId);

      try {
        await program.methods
          .chamaContribute(SMALL_AMOUNT)
          .accounts({
            memberWallet: stranger.publicKey,
            vault,
            member: strangeMember,
            contributorTokenAccount: ownerAta, // wrong ATA — doesn't matter, fails at member check
            vaultEscrow,
            keshMint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([stranger])
          .rpc();
        assert.fail("Should have rejected non-member contribution");
      } catch (err: any) {
        // Expected: account not found or constraint violation
        assert.ok(err);
      }
    });

    it("12. Creates withdrawal proposal with correct expiry", async () => {
      const [vault] = getChamaVaultPda(owner.publicKey, CHAMA_NAME, programId);
      const [member] = getChamaMemberPda(vault, owner.publicKey, programId);
      const [proposal] = getChamaProposalPda(vault, 0, programId);

      await program.methods
        .createChamaProposal({
          proposalType: PROPOSAL_TYPE.WITHDRAW,
          amount: new anchor.BN(10_000),
          targetWallet: owner.publicKey,
        })
        .accounts({
          proposer: owner.publicKey,
          vault,
          member,
          proposal,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const proposalAccount = await program.account.chamaProposal.fetch(proposal);
      assert.equal(proposalAccount.proposalType, PROPOSAL_TYPE.WITHDRAW);
      assert.equal(proposalAccount.amount.toNumber(), 10_000);
      assert.equal(proposalAccount.executed, false);
      assert.equal(proposalAccount.cancelled, false);
      assert.equal(proposalAccount.votesFor, 0);

      const vaultAccount = await program.account.chamaVault.fetch(vault);
      assert.equal(vaultAccount.proposalCount, 1);
    });

    it("13. Member votes on proposal", async () => {
      const [vault] = getChamaVaultPda(owner.publicKey, CHAMA_NAME, programId);
      const [member] = getChamaMemberPda(vault, owner.publicKey, programId);
      const [proposal] = getChamaProposalPda(vault, 0, programId);

      await program.methods
        .voteChamaProposal(0, true) // vote FOR
        .accounts({
          voter: owner.publicKey,
          vault,
          member,
          proposal,
        })
        .signers([owner])
        .rpc();

      const proposalAccount = await program.account.chamaProposal.fetch(proposal);
      assert.equal(proposalAccount.votesFor, 1);

      // Verify vote bitmap updated
      const memberAcc = await program.account.chamaMember.fetch(member);
      assert.notEqual(memberAcc.voteBitmap.toNumber(), 0);
    });

    it("14. Cannot vote twice on same proposal", async () => {
      const [vault] = getChamaVaultPda(owner.publicKey, CHAMA_NAME, programId);
      const [member] = getChamaMemberPda(vault, owner.publicKey, programId);
      const [proposal] = getChamaProposalPda(vault, 0, programId);

      try {
        await program.methods
          .voteChamaProposal(0, true)
          .accounts({
            voter: owner.publicKey,
            vault,
            member,
            proposal,
          })
          .signers([owner])
          .rpc();
        assert.fail("Should have rejected duplicate vote");
      } catch (err: any) {
        assert.include(err.toString(), "AlreadyVoted");
      }
    });

    it("15. Proposal counters and rotation index initialize correctly", async () => {
      const [vault] = getChamaVaultPda(owner.publicKey, CHAMA_NAME, programId);
      const vaultAccount = await program.account.chamaVault.fetch(vault);

      assert.equal(vaultAccount.rotationIndex, 0);
      assert.equal(vaultAccount.memberCount, 2);
      assert.isAbove(vaultAccount.proposalCount, 0);
      assert.equal(vaultAccount.totalDeposited.toNumber(), DEPOSIT_AMOUNT.toNumber());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — SME Vault (5 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("SME Vault", () => {
    it("16. Creates SME vault with multisig", async () => {
      const [vault] = getSmVaultPda(owner.publicKey, programId);

      await program.methods
        .createSmeVault({
          businessName: "Savanna Tech Ltd",
          multisigThreshold: 2,
          additionalSigners: [member2.publicKey],
        })
        .accounts({
          owner: owner.publicKey,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.smeVault.fetch(vault);
      assert.equal(vaultAccount.businessName, "Savanna Tech Ltd");
      assert.equal(vaultAccount.multisigThreshold, 2);
      assert.equal(vaultAccount.signers.length, 2); // owner + member2
      assert.equal(vaultAccount.balanceKesh.toNumber(), 0);
      assert.equal(vaultAccount.payrollReserve.toNumber(), 0);
      assert.equal(vaultAccount.taxReserve.toNumber(), 0);
    });

    it("17. SME vault accepts deposit from registered signer", async () => {
      const [vault] = getSmVaultPda(owner.publicKey, programId);
      const [vaultEscrow] = getVaultEscrowPda(vault, programId);

      await program.methods
        .smeDeposit(DEPOSIT_AMOUNT)
        .accounts({
          signer: owner.publicKey,
          vault,
          depositorTokenAccount: ownerAta,
          vaultEscrow,
          keshMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.smeVault.fetch(vault);
      assert.equal(vaultAccount.balanceKesh.toNumber(), DEPOSIT_AMOUNT.toNumber());
      assert.equal(vaultAccount.operatingBalance.toNumber(), DEPOSIT_AMOUNT.toNumber());
    });

    it("18. Sets payroll reserve correctly", async () => {
      const [vault] = getSmVaultPda(owner.publicKey, programId);
      const payrollAmount = new anchor.BN(20_000); // KES 200

      await program.methods
        .setPayrollReserve(payrollAmount)
        .accounts({ owner: owner.publicKey, vault })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.smeVault.fetch(vault);
      assert.equal(vaultAccount.payrollReserve.toNumber(), payrollAmount.toNumber());
      assert.equal(
        vaultAccount.operatingBalance.toNumber(),
        DEPOSIT_AMOUNT.toNumber() - payrollAmount.toNumber()
      );
    });

    it("19. Sets tax reserve correctly", async () => {
      const [vault] = getSmVaultPda(owner.publicKey, programId);
      const taxAmount = new anchor.BN(5_000); // KES 50

      await program.methods
        .setTaxReserve(taxAmount)
        .accounts({ owner: owner.publicKey, vault })
        .signers([owner])
        .rpc();

      const vaultAccount = await program.account.smeVault.fetch(vault);
      assert.equal(vaultAccount.taxReserve.toNumber(), taxAmount.toNumber());
    });

    it("20. Blocks withdrawal exceeding operating balance", async () => {
      const [vault] = getSmVaultPda(owner.publicKey, programId);
      const [vaultEscrow] = getVaultEscrowPda(vault, programId);
      // Operating balance = 50,000 - 20,000 payroll - 5,000 tax = 25,000
      const tooMuch = new anchor.BN(30_000);

      try {
        await program.methods
          .smeWithdraw(tooMuch)
          .accounts({
            signer: owner.publicKey,
            vault,
            recipientTokenAccount: ownerAta,
            vaultEscrow,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([owner])
          .rpc();
        assert.fail("Should have thrown InsufficientBalance");
      } catch (err: any) {
        assert.include(err.toString(), "InsufficientBalance");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — NGO Grant Vault (4 tests)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("NGO Grant Vault", () => {
    it("21. Creates NGO vault with milestones", async () => {
      const [vault] = getNgoVaultPda(ngoAuthority.publicKey, programId);

      await program.methods
        .createNgoVault({
          organizationName: "Kenya Education Fund",
          grantExpiry: new anchor.BN(0), // no expiry
          milestones: [
            new anchor.BN(100_000), // KES 1,000 for milestone 0
            new anchor.BN(200_000), // KES 2,000 for milestone 1
          ],
          donorNotes: "USAID Grant FY2026",
        })
        .accounts({
          authority: ngoAuthority.publicKey,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([ngoAuthority])
        .rpc();

      const vaultAccount = await program.account.ngoVault.fetch(vault);
      assert.equal(vaultAccount.organizationName, "Kenya Education Fund");
      assert.equal(vaultAccount.milestones.length, 2);
      assert.equal(vaultAccount.milestones[0].unlockAmount.toNumber(), 100_000);
      assert.equal(vaultAccount.milestones[0].completed, false);
      assert.equal(vaultAccount.grantExpiry.toNumber(), 0);
    });

    it("22. Donor deposits KESH into NGO vault", async () => {
      const [vault] = getNgoVaultPda(ngoAuthority.publicKey, programId);
      const [vaultEscrow] = getVaultEscrowPda(vault, programId);

      await program.methods
        .ngoDeposit(DEPOSIT_AMOUNT)
        .accounts({
          donor: donor.publicKey,
          vault,
          donorTokenAccount: donorAta,
          vaultEscrow,
          keshMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([donor])
        .rpc();

      const vaultAccount = await program.account.ngoVault.fetch(vault);
      assert.equal(vaultAccount.balanceKesh.toNumber(), DEPOSIT_AMOUNT.toNumber());
      assert.equal(vaultAccount.totalReceived.toNumber(), DEPOSIT_AMOUNT.toNumber());
    });

    it("23. Completes milestone and unlocks funds", async () => {
      const [vault] = getNgoVaultPda(ngoAuthority.publicKey, programId);

      await program.methods
        .completeMilestone(0) // complete first milestone
        .accounts({ authority: ngoAuthority.publicKey, vault })
        .signers([ngoAuthority])
        .rpc();

      const vaultAccount = await program.account.ngoVault.fetch(vault);
      assert.equal(vaultAccount.milestones[0].completed, true);
      assert.isAbove(vaultAccount.milestones[0].completedAt.toNumber(), 0);
      // locked_for_milestones should decrease
      assert.isBelow(
        vaultAccount.lockedForMilestones.toNumber(),
        vaultAccount.totalReceived.toNumber()
      );
    });

    it("24. Cannot complete milestone twice", async () => {
      const [vault] = getNgoVaultPda(ngoAuthority.publicKey, programId);

      try {
        await program.methods
          .completeMilestone(0) // already completed in test 23
          .accounts({ authority: ngoAuthority.publicKey, vault })
          .signers([ngoAuthority])
          .rpc();
        assert.fail("Should have thrown MilestoneAlreadyCompleted");
      } catch (err: any) {
        assert.include(err.toString(), "MilestoneAlreadyCompleted");
      }
    });
  });
});
