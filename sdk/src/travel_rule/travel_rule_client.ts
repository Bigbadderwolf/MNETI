/**
 * MNETI Protocol — Phase 6
 * sdk/src/travel_rule/travel_rule_client.ts
 *
 * TypeScript SDK for the mneti-travel-rule Anchor program.
 * All PDA seeds match programs/mneti-travel-rule/src/constants.rs exactly.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

// ─── PDA Seeds — must match constants.rs exactly ─────────────────────────────
export const TR_SEEDS = {
  VASP_REGISTRY: Buffer.from("vasp_registry"),
  VASP_RECORD:   Buffer.from("vasp_record"),
  TR_PAYLOAD:    Buffer.from("tr_payload"),
};

// ─── PDA Derivation Helpers ───────────────────────────────────────────────────

export function getVaspRegistryPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([TR_SEEDS.VASP_REGISTRY], programId);
}

export function getVaspRecordPda(authority: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TR_SEEDS.VASP_RECORD, authority.toBuffer()],
    programId
  );
}

export function getTrPayloadPda(
  originatorWallet: PublicKey,
  beneficiaryWallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TR_SEEDS.TR_PAYLOAD, originatorWallet.toBuffer(), beneficiaryWallet.toBuffer()],
    programId
  );
}

// ─── FATF threshold ───────────────────────────────────────────────────────────
export const TRAVEL_RULE_THRESHOLD_KESH = 13_000_000; // KES 130,000

// ─── Parameter Types ──────────────────────────────────────────────────────────

export interface RegisterVaspParams {
  name:                  string;
  did:                   string;
  jurisdiction:          string;
  complianceContactUri:  string;
  isOriginatorVasp:      boolean;
  isBeneficiaryVasp:     boolean;
}

export interface UpdateVaspParams {
  complianceContactUri:  string;
  did:                   string;
  isOriginatorVasp:      boolean;
  isBeneficiaryVasp:     boolean;
}

export interface SubmitTrPayloadParams {
  encryptedIvms101Cid:  string;  // IPFS CID of ECIES-encrypted IVMS101 JSON
  originatorNameHash:   string;  // SHA-256 hex of originator full legal name
  beneficiaryNameHash:  string;  // SHA-256 hex of beneficiary full legal name
  originatorCountry:    string;  // ISO 3166-1 alpha-2 e.g. "KE"
  beneficiaryCountry:   string;  // ISO 3166-1 alpha-2 e.g. "GB"
}

// ─── TravelRuleClient ─────────────────────────────────────────────────────────

export class TravelRuleClient {
  constructor(
    private program:   anchor.Program,
    private programId: PublicKey
  ) {}

  // ── Registry ────────────────────────────────────────────────────────────────

  async initRegistry(authority: anchor.web3.Signer): Promise<string> {
    const [registry] = getVaspRegistryPda(this.programId);
    return this.program.methods.initializeVaspRegistry()
      .accounts({ authority: authority.publicKey, registry, systemProgram: SystemProgram.programId })
      .signers([authority]).rpc();
  }

  async fetchRegistry() {
    const [registry] = getVaspRegistryPda(this.programId);
    return this.program.account.vaspRegistry.fetch(registry);
  }

  // ── VASP Management ──────────────────────────────────────────────────────────

  async registerVasp(authority: anchor.web3.Signer, params: RegisterVaspParams): Promise<string> {
    const [registry] = getVaspRegistryPda(this.programId);
    const [vasp]     = getVaspRecordPda(authority.publicKey, this.programId);
    return this.program.methods.registerVasp({
      name:                  params.name,
      did:                   params.did,
      jurisdiction:          params.jurisdiction,
      complianceContactUri:  params.complianceContactUri,
      isOriginatorVasp:      params.isOriginatorVasp,
      isBeneficiaryVasp:     params.isBeneficiaryVasp,
    })
      .accounts({ authority: authority.publicKey, registry, vasp, systemProgram: SystemProgram.programId })
      .signers([authority]).rpc();
  }

  async updateVasp(authority: anchor.web3.Signer, params: UpdateVaspParams): Promise<string> {
    const [vasp] = getVaspRecordPda(authority.publicKey, this.programId);
    return this.program.methods.updateVasp({
      complianceContactUri: params.complianceContactUri,
      did:                  params.did,
      isOriginatorVasp:     params.isOriginatorVasp,
      isBeneficiaryVasp:    params.isBeneficiaryVasp,
    })
      .accounts({ authority: authority.publicKey, vasp })
      .signers([authority]).rpc();
  }

  async deactivateVasp(authority: anchor.web3.Signer): Promise<string> {
    const [vasp] = getVaspRecordPda(authority.publicKey, this.programId);
    return this.program.methods.deactivateVasp()
      .accounts({ authority: authority.publicKey, vasp })
      .signers([authority]).rpc();
  }

  async reactivateVasp(authority: anchor.web3.Signer): Promise<string> {
    const [vasp] = getVaspRecordPda(authority.publicKey, this.programId);
    return this.program.methods.reactivateVasp()
      .accounts({ authority: authority.publicKey, vasp })
      .signers([authority]).rpc();
  }

  async fetchVasp(authority: PublicKey) {
    const [vasp] = getVaspRecordPda(authority, this.programId);
    return this.program.account.vaspRecord.fetch(vasp);
  }

  // ── Payload Lifecycle ────────────────────────────────────────────────────────

  async submitPayload(
    originatorVaspAuthority: anchor.web3.Signer,
    beneficiaryVaspPubkey:   PublicKey,
    originatorWallet:        PublicKey,
    beneficiaryWallet:       PublicKey,
    transferAmountKesh:      anchor.BN,
    params:                  SubmitTrPayloadParams
  ): Promise<string> {
    const [registry]       = getVaspRegistryPda(this.programId);
    const [originatorVasp] = getVaspRecordPda(originatorVaspAuthority.publicKey, this.programId);
    const [payload]        = getTrPayloadPda(originatorWallet, beneficiaryWallet, this.programId);

    return this.program.methods.submitTrPayload(transferAmountKesh, {
      encryptedIvms101Cid: params.encryptedIvms101Cid,
      originatorNameHash:  params.originatorNameHash,
      beneficiaryNameHash: params.beneficiaryNameHash,
      originatorCountry:   params.originatorCountry,
      beneficiaryCountry:  params.beneficiaryCountry,
    })
      .accounts({
        originatorVaspAuthority: originatorVaspAuthority.publicKey,
        originatorVasp,
        beneficiaryVasp:         beneficiaryVaspPubkey,
        originatorWallet,
        beneficiaryWallet,
        payload,
        registry,
        systemProgram:           SystemProgram.programId,
      })
      .signers([originatorVaspAuthority]).rpc();
  }

  async acknowledgePayload(
    beneficiaryVaspAuthority: anchor.web3.Signer,
    originatorWallet:         PublicKey,
    beneficiaryWallet:        PublicKey
  ): Promise<string> {
    const [beneficiaryVasp] = getVaspRecordPda(beneficiaryVaspAuthority.publicKey, this.programId);
    const [payload]         = getTrPayloadPda(originatorWallet, beneficiaryWallet, this.programId);
    return this.program.methods.acknowledgeTrPayload()
      .accounts({
        beneficiaryVaspAuthority: beneficiaryVaspAuthority.publicKey,
        beneficiaryVasp,
        payload,
      })
      .signers([beneficiaryVaspAuthority]).rpc();
  }

  async rejectPayload(
    beneficiaryVaspAuthority: anchor.web3.Signer,
    originatorWallet:         PublicKey,
    beneficiaryWallet:        PublicKey,
    rejectionReason:          string
  ): Promise<string> {
    const [beneficiaryVasp] = getVaspRecordPda(beneficiaryVaspAuthority.publicKey, this.programId);
    const [payload]         = getTrPayloadPda(originatorWallet, beneficiaryWallet, this.programId);
    return this.program.methods.rejectTrPayload(rejectionReason)
      .accounts({
        beneficiaryVaspAuthority: beneficiaryVaspAuthority.publicKey,
        beneficiaryVasp,
        payload,
      })
      .signers([beneficiaryVaspAuthority]).rpc();
  }

  async fetchPayload(originatorWallet: PublicKey, beneficiaryWallet: PublicKey) {
    const [payload] = getTrPayloadPda(originatorWallet, beneficiaryWallet, this.programId);
    return this.program.account.travelRulePayload.fetch(payload);
  }

  // ── Travel Rule Gate Helper ───────────────────────────────────────────────────
  /** Returns true when a transfer amount requires a Travel Rule payload */
  requiresPayload(amountKesh: number): boolean {
    return amountKesh >= TRAVEL_RULE_THRESHOLD_KESH;
  }
}
