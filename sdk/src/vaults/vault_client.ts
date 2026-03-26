/**
 * MNETI Protocol — Phase 5
 * Vault SDK Client
 *
 * Wraps all mneti-vault program instructions with typed helpers.
 * Mirrors the pattern of sdk/src/zk/proof_generator.ts from Phase 3.
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ─── PDA Seeds (must match constants.rs) ─────────────────────────────────────

export const SEEDS = {
  INDIVIDUAL_VAULT: Buffer.from("individual_vault"),
  CHAMA_VAULT: Buffer.from("chama_vault"),
  SME_VAULT: Buffer.from("sme_vault"),
  ENTERPRISE_VAULT: Buffer.from("enterprise_vault"),
  NGO_VAULT: Buffer.from("ngo_vault"),
  CHAMA_MEMBER: Buffer.from("chama_member"),
  CHAMA_PROPOSAL: Buffer.from("chama_proposal"),
  VAULT_ESCROW: Buffer.from("vault_escrow"),
  SAVINGS_GOAL: Buffer.from("savings_goal"),
};

// ─── PDA Derivation Helpers ───────────────────────────────────────────────────

export function getIndividualVaultPda(
  owner: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.INDIVIDUAL_VAULT, owner.toBuffer()],
    programId
  );
}

export function getChamaVaultPda(
  creator: PublicKey,
  name: string,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.CHAMA_VAULT, creator.toBuffer(), Buffer.from(name)],
    programId
  );
}

export function getSmVaultPda(
  owner: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.SME_VAULT, owner.toBuffer()],
    programId
  );
}

export function getEnterpriseVaultPda(
  owner: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.ENTERPRISE_VAULT, owner.toBuffer()],
    programId
  );
}

export function getNgoVaultPda(
  authority: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.NGO_VAULT, authority.toBuffer()],
    programId
  );
}

export function getVaultEscrowPda(
  vault: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.VAULT_ESCROW, vault.toBuffer()],
    programId
  );
}

export function getChamaMemberPda(
  chamaVault: PublicKey,
  memberWallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.CHAMA_MEMBER, chamaVault.toBuffer(), memberWallet.toBuffer()],
    programId
  );
}

export function getChamaProposalPda(
  chamaVault: PublicKey,
  proposalIndex: number,
  programId: PublicKey
): [PublicKey, number] {
  const indexBuf = Buffer.alloc(4);
  indexBuf.writeUInt32LE(proposalIndex);
  return PublicKey.findProgramAddressSync(
    [SEEDS.CHAMA_PROPOSAL, chamaVault.toBuffer(), indexBuf],
    programId
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateIndividualVaultParams {
  kycTier: number;
}

export interface CreateChamaVaultParams {
  name: string;
  description: string;
  contributionIntervalSeconds: number;
  contributionAmount: anchor.BN;
  governanceThresholdPct: number;
}

export interface CreateSmeVaultParams {
  businessName: string;
  multisigThreshold: number;
  additionalSigners: PublicKey[];
}

export interface CreateEnterpriseVaultParams {
  entityName: string;
  multisigThreshold: number;
  signers: PublicKey[];
}

export interface CreateNgoVaultParams {
  organizationName: string;
  grantExpiry: anchor.BN; // unix timestamp, 0 = no expiry
  milestones: anchor.BN[]; // unlock amounts
  donorNotes: string;
}

export interface CreateProposalParams {
  proposalType: number; // 0=withdraw, 1=add_member, 2=remove_member, 3=loan, 4=rule_change
  amount: anchor.BN;
  targetWallet: PublicKey;
}

export interface AddSavingsGoalParams {
  name: string;
  targetAmount: anchor.BN;
}

// ─── Proposal Types (mirrors constants.rs) ────────────────────────────────────

export const PROPOSAL_TYPE = {
  WITHDRAW: 0,
  ADD_MEMBER: 1,
  REMOVE_MEMBER: 2,
  LOAN: 3,
  RULE_CHANGE: 4,
} as const;

// ─── VaultClient ──────────────────────────────────────────────────────────────

export class VaultClient {
  private program: anchor.Program;
  private connection: Connection;
  private programId: PublicKey;
  private keshMint: PublicKey;

  constructor(
    program: anchor.Program,
    connection: Connection,
    programId: PublicKey,
    keshMint: PublicKey
  ) {
    this.program = program;
    this.connection = connection;
    this.programId = programId;
    this.keshMint = keshMint;
  }

  // ─── Individual Vault ──────────────────────────────────────────────────────

  async createIndividualVault(
    owner: anchor.web3.Signer,
    params: CreateIndividualVaultParams
  ) {
    const [vault] = getIndividualVaultPda(owner.publicKey, this.programId);
    return this.program.methods
      .createIndividualVault({ kycTier: params.kycTier })
      .accounts({
        owner: owner.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
  }

  async individualDeposit(owner: anchor.web3.Signer, amount: anchor.BN) {
    const [vault] = getIndividualVaultPda(owner.publicKey, this.programId);
    const [vaultEscrow] = getVaultEscrowPda(vault, this.programId);
    const depositorAta = await getAssociatedTokenAddress(this.keshMint, owner.publicKey);

    return this.program.methods
      .individualDeposit(amount)
      .accounts({
        owner: owner.publicKey,
        vault,
        depositorTokenAccount: depositorAta,
        vaultEscrow,
        keshMint: this.keshMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();
  }

  async individualWithdraw(owner: anchor.web3.Signer, amount: anchor.BN) {
    const [vault] = getIndividualVaultPda(owner.publicKey, this.programId);
    const [vaultEscrow] = getVaultEscrowPda(vault, this.programId);
    const recipientAta = await getAssociatedTokenAddress(this.keshMint, owner.publicKey);

    return this.program.methods
      .individualWithdraw(amount)
      .accounts({
        owner: owner.publicKey,
        vault,
        recipientTokenAccount: recipientAta,
        vaultEscrow,
        keshMint: this.keshMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();
  }

  async addSavingsGoal(owner: anchor.web3.Signer, params: AddSavingsGoalParams) {
    const [vault] = getIndividualVaultPda(owner.publicKey, this.programId);
    return this.program.methods
      .addSavingsGoal({ name: params.name, targetAmount: params.targetAmount })
      .accounts({ owner: owner.publicKey, vault })
      .signers([owner])
      .rpc();
  }

  async harvestIndividualYield(
    owner: anchor.web3.Signer,
    tbillOraclePubkey: PublicKey,
    feeCollectorAta: PublicKey
  ) {
    const [vault] = getIndividualVaultPda(owner.publicKey, this.programId);
    const [vaultEscrow] = getVaultEscrowPda(vault, this.programId);
    const recipientAta = await getAssociatedTokenAddress(this.keshMint, owner.publicKey);

    return this.program.methods
      .harvestIndividualYield()
      .accounts({
        owner: owner.publicKey,
        vault,
        tbillOracle: tbillOraclePubkey,
        recipientTokenAccount: recipientAta,
        feeCollectorTokenAccount: feeCollectorAta,
        vaultEscrow,
        keshMint: this.keshMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();
  }

  async closeIndividualVault(owner: anchor.web3.Signer) {
    const [vault] = getIndividualVaultPda(owner.publicKey, this.programId);
    return this.program.methods
      .closeIndividualVault()
      .accounts({ owner: owner.publicKey, vault })
      .signers([owner])
      .rpc();
  }

  // ─── Chama Vault ───────────────────────────────────────────────────────────

  async createChamaVault(creator: anchor.web3.Signer, params: CreateChamaVaultParams) {
    const [vault] = getChamaVaultPda(creator.publicKey, params.name, this.programId);
    const [creatorMember] = getChamaMemberPda(vault, creator.publicKey, this.programId);

    return this.program.methods
      .createChamaVault({
        name: params.name,
        description: params.description,
        contributionIntervalSeconds: new anchor.BN(params.contributionIntervalSeconds),
        contributionAmount: params.contributionAmount,
        governanceThresholdPct: params.governanceThresholdPct,
      })
      .accounts({
        creator: creator.publicKey,
        vault,
        creatorMember,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();
  }

  async addChamaMember(
    authority: anchor.web3.Signer,
    chamaVault: PublicKey,
    newMemberWallet: PublicKey
  ) {
    const [memberAccount] = getChamaMemberPda(chamaVault, newMemberWallet, this.programId);

    return this.program.methods
      .addChamaMember()
      .accounts({
        authority: authority.publicKey,
        vault: chamaVault,
        newMemberWallet,
        memberAccount,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
  }

  async chamaContribute(
    memberWallet: anchor.web3.Signer,
    chamaVault: PublicKey,
    amount: anchor.BN
  ) {
    const [member] = getChamaMemberPda(chamaVault, memberWallet.publicKey, this.programId);
    const [vaultEscrow] = getVaultEscrowPda(chamaVault, this.programId);
    const contributorAta = await getAssociatedTokenAddress(this.keshMint, memberWallet.publicKey);

    return this.program.methods
      .chamaContribute(amount)
      .accounts({
        memberWallet: memberWallet.publicKey,
        vault: chamaVault,
        member,
        contributorTokenAccount: contributorAta,
        vaultEscrow,
        keshMint: this.keshMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([memberWallet])
      .rpc();
  }

  async createChamaProposal(
    proposer: anchor.web3.Signer,
    chamaVault: PublicKey,
    proposalIndex: number,
    params: CreateProposalParams
  ) {
    const [member] = getChamaMemberPda(chamaVault, proposer.publicKey, this.programId);
    const [proposal] = getChamaProposalPda(chamaVault, proposalIndex, this.programId);

    return this.program.methods
      .createChamaProposal({
        proposalType: params.proposalType,
        amount: params.amount,
        targetWallet: params.targetWallet,
      })
      .accounts({
        proposer: proposer.publicKey,
        vault: chamaVault,
        member,
        proposal,
        systemProgram: SystemProgram.programId,
      })
      .signers([proposer])
      .rpc();
  }

  async voteChamaProposal(
    voter: anchor.web3.Signer,
    chamaVault: PublicKey,
    proposalIndex: number,
    voteFor: boolean
  ) {
    const [member] = getChamaMemberPda(chamaVault, voter.publicKey, this.programId);
    const [proposal] = getChamaProposalPda(chamaVault, proposalIndex, this.programId);

    return this.program.methods
      .voteChamaProposal(proposalIndex, voteFor)
      .accounts({
        voter: voter.publicKey,
        vault: chamaVault,
        member,
        proposal,
      })
      .signers([voter])
      .rpc();
  }

  async executeChamaProposal(
    executor: anchor.web3.Signer,
    chamaVault: PublicKey,
    proposalIndex: number,
    recipientTokenAccount: PublicKey
  ) {
    const [member] = getChamaMemberPda(chamaVault, executor.publicKey, this.programId);
    const [proposal] = getChamaProposalPda(chamaVault, proposalIndex, this.programId);
    const [vaultEscrow] = getVaultEscrowPda(chamaVault, this.programId);

    return this.program.methods
      .executeChamaProposal(proposalIndex)
      .accounts({
        executor: executor.publicKey,
        vault: chamaVault,
        member,
        proposal,
        vaultEscrow,
        recipientTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([executor])
      .rpc();
  }

  // ─── SME Vault ─────────────────────────────────────────────────────────────

  async createSmeVault(owner: anchor.web3.Signer, params: CreateSmeVaultParams) {
    const [vault] = getSmVaultPda(owner.publicKey, this.programId);
    return this.program.methods
      .createSmeVault({
        businessName: params.businessName,
        multisigThreshold: params.multisigThreshold,
        additionalSigners: params.additionalSigners,
      })
      .accounts({
        owner: owner.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
  }

  async smeDeposit(signer: anchor.web3.Signer, vaultOwner: PublicKey, amount: anchor.BN) {
    const [vault] = getSmVaultPda(vaultOwner, this.programId);
    const [vaultEscrow] = getVaultEscrowPda(vault, this.programId);
    const depositorAta = await getAssociatedTokenAddress(this.keshMint, signer.publicKey);

    return this.program.methods
      .smeDeposit(amount)
      .accounts({
        signer: signer.publicKey,
        vault,
        depositorTokenAccount: depositorAta,
        vaultEscrow,
        keshMint: this.keshMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();
  }

  async setPayrollReserve(owner: anchor.web3.Signer, amount: anchor.BN) {
    const [vault] = getSmVaultPda(owner.publicKey, this.programId);
    return this.program.methods
      .setPayrollReserve(amount)
      .accounts({ owner: owner.publicKey, vault })
      .signers([owner])
      .rpc();
  }

  async setTaxReserve(owner: anchor.web3.Signer, amount: anchor.BN) {
    const [vault] = getSmVaultPda(owner.publicKey, this.programId);
    return this.program.methods
      .setTaxReserve(amount)
      .accounts({ owner: owner.publicKey, vault })
      .signers([owner])
      .rpc();
  }

  // ─── NGO Vault ─────────────────────────────────────────────────────────────

  async createNgoVault(authority: anchor.web3.Signer, params: CreateNgoVaultParams) {
    const [vault] = getNgoVaultPda(authority.publicKey, this.programId);
    return this.program.methods
      .createNgoVault({
        organizationName: params.organizationName,
        grantExpiry: params.grantExpiry,
        milestones: params.milestones,
        donorNotes: params.donorNotes,
      })
      .accounts({
        authority: authority.publicKey,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
  }

  async ngoDeposit(donor: anchor.web3.Signer, ngoAuthority: PublicKey, amount: anchor.BN) {
    const [vault] = getNgoVaultPda(ngoAuthority, this.programId);
    const [vaultEscrow] = getVaultEscrowPda(vault, this.programId);
    const donorAta = await getAssociatedTokenAddress(this.keshMint, donor.publicKey);

    return this.program.methods
      .ngoDeposit(amount)
      .accounts({
        donor: donor.publicKey,
        vault,
        donorTokenAccount: donorAta,
        vaultEscrow,
        keshMint: this.keshMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([donor])
      .rpc();
  }

  async completeMilestone(authority: anchor.web3.Signer, milestoneIndex: number) {
    const [vault] = getNgoVaultPda(authority.publicKey, this.programId);
    return this.program.methods
      .completeMilestone(milestoneIndex)
      .accounts({ authority: authority.publicKey, vault })
      .signers([authority])
      .rpc();
  }

  async ngoDisburse(
    authority: anchor.web3.Signer,
    amount: anchor.BN,
    milestoneIndex: number,
    recipientTokenAccount: PublicKey
  ) {
    const [vault] = getNgoVaultPda(authority.publicKey, this.programId);
    const [vaultEscrow] = getVaultEscrowPda(vault, this.programId);

    return this.program.methods
      .ngoDisburse(amount, milestoneIndex)
      .accounts({
        authority: authority.publicKey,
        vault,
        recipientTokenAccount,
        vaultEscrow,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();
  }

  // ─── Account Fetchers ──────────────────────────────────────────────────────

  async fetchIndividualVault(owner: PublicKey) {
    const [vault] = getIndividualVaultPda(owner, this.programId);
    return this.program.account.individualVault.fetch(vault);
  }

  async fetchChamaVault(creator: PublicKey, name: string) {
    const [vault] = getChamaVaultPda(creator, name, this.programId);
    return this.program.account.chamaVault.fetch(vault);
  }

  async fetchChamaMember(chamaVault: PublicKey, memberWallet: PublicKey) {
    const [member] = getChamaMemberPda(chamaVault, memberWallet, this.programId);
    return this.program.account.chamaMember.fetch(member);
  }

  async fetchChamaProposal(chamaVault: PublicKey, proposalIndex: number) {
    const [proposal] = getChamaProposalPda(chamaVault, proposalIndex, this.programId);
    return this.program.account.chamaProposal.fetch(proposal);
  }

  async fetchSmeVault(owner: PublicKey) {
    const [vault] = getSmVaultPda(owner, this.programId);
    return this.program.account.smeVault.fetch(vault);
  }

  async fetchNgoVault(authority: PublicKey) {
    const [vault] = getNgoVaultPda(authority, this.programId);
    return this.program.account.ngoVault.fetch(vault);
  }
}
