/**
 * MNETI Protocol — Phase 7
 * sdk/src/remittance/remittance_client.ts
 *
 * TypeScript SDK for the mneti-remittance Anchor program.
 * Mirrors the pattern of sdk/src/vaults/vault_client.ts (Phase 5)
 * and sdk/src/payments/payments_client.ts (Phase 6).
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// ─── PDA Seed Buffers ─────────────────────────────────────────────────────────
export const REM_SEEDS = {
  REGISTRY:   Buffer.from("remittance_registry"),
  CORRIDOR:   Buffer.from("corridor"),
  ORDER:      Buffer.from("remittance_order"),
  ESCROW:     Buffer.from("order_escrow"),
  POOL:       Buffer.from("liquidity_pool"),
};

// ─── PDA Derivation Helpers ───────────────────────────────────────────────────

export function getRemittanceRegistryPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([REM_SEEDS.REGISTRY], programId);
}

export function getCorridorPda(corridorId: number, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REM_SEEDS.CORRIDOR, Buffer.from([corridorId])],
    programId
  );
}

export function getRemittanceOrderPda(
  sender: PublicKey,
  nonce: bigint,
  programId: PublicKey
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [REM_SEEDS.ORDER, sender.toBuffer(), nonceBuf],
    programId
  );
}

export function getOrderEscrowPda(order: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REM_SEEDS.ESCROW, order.toBuffer()],
    programId
  );
}

export function getLiquidityPoolPda(corridorId: number, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REM_SEEDS.POOL, Buffer.from([corridorId])],
    programId
  );
}

// ─── Corridor Constants ───────────────────────────────────────────────────────
export const CORRIDOR = {
  UK_GBP:  0,
  US_USD:  1,
  UAE_AED: 2,
  KE_KES:  3,
  EU_EUR:  4,
} as const;

// ─── Parameter Types ──────────────────────────────────────────────────────────

export interface InitializeCorridorParams {
  corridorId:     number;
  name:           string;
  minAmountKesh:  anchor.BN;
  maxAmountKesh:  anchor.BN;
}

export interface CreateRemittanceOrderParams {
  senderName:         string;
  recipientName:      string;
  recipientPhone:     string;
  memo:               string;
  corridorId:         number;
  sourceAmountUsdc:   anchor.BN;
  travelRuleRef:      string;
  nonce:              anchor.BN;
}

// ─── RemittanceClient ─────────────────────────────────────────────────────────

export class RemittanceClient {
  constructor(
    private program:   anchor.Program,
    private programId: PublicKey,
    private usdcMint:  PublicKey,
    private keshMint:  PublicKey
  ) {}

  // ── Registry ────────────────────────────────────────────────────────────────

  async initRegistry(authority: anchor.web3.Signer): Promise<string> {
    const [registry] = getRemittanceRegistryPda(this.programId);
    return this.program.methods
      .initializeRemittanceRegistry()
      .accounts({ authority: authority.publicKey, registry, systemProgram: SystemProgram.programId })
      .signers([authority])
      .rpc();
  }

  async fetchRegistry() {
    const [registry] = getRemittanceRegistryPda(this.programId);
    return this.program.account.remittanceRegistry.fetch(registry);
  }

  // ── Corridors ────────────────────────────────────────────────────────────────

  async initCorridor(
    authority: anchor.web3.Signer,
    params: InitializeCorridorParams
  ): Promise<string> {
    const [registry] = getRemittanceRegistryPda(this.programId);
    const [corridor] = getCorridorPda(params.corridorId, this.programId);
    return this.program.methods
      .initializeCorridor({
        corridorId:    params.corridorId,
        name:          params.name,
        minAmountKesh: params.minAmountKesh,
        maxAmountKesh: params.maxAmountKesh,
      })
      .accounts({ authority: authority.publicKey, registry, corridor, systemProgram: SystemProgram.programId })
      .signers([authority])
      .rpc();
  }

  async fetchCorridor(corridorId: number) {
    const [corridor] = getCorridorPda(corridorId, this.programId);
    return this.program.account.corridor.fetch(corridor);
  }

  // ── Orders ───────────────────────────────────────────────────────────────────

  async createOrder(
    sender: anchor.web3.Signer,
    beneficiaryWallet: PublicKey,
    params: CreateRemittanceOrderParams
  ): Promise<string> {
    const nonceBig  = BigInt(params.nonce.toString());
    const [order]   = getRemittanceOrderPda(sender.publicKey, nonceBig, this.programId);
    const [escrow]  = getOrderEscrowPda(order, this.programId);
    const [corridor]= getCorridorPda(params.corridorId, this.programId);
    const senderUsdc= await getAssociatedTokenAddress(this.usdcMint, sender.publicKey);

    return this.program.methods
      .createRemittanceOrder({
        senderName:       params.senderName,
        recipientName:    params.recipientName,
        recipientPhone:   params.recipientPhone,
        memo:             params.memo,
        corridorId:       params.corridorId,
        sourceAmountUsdc: params.sourceAmountUsdc,
        travelRuleRef:    params.travelRuleRef,
        nonce:            params.nonce,
      })
      .accounts({
        sender:           sender.publicKey,
        corridor,
        beneficiaryWallet,
        order,
        senderUsdc,
        orderEscrow:      escrow,
        usdcMint:         this.usdcMint,
        tokenProgram:     TOKEN_PROGRAM_ID,
        systemProgram:    SystemProgram.programId,
      })
      .signers([sender])
      .rpc();
  }

  async cancelOrder(
    sender: anchor.web3.Signer,
    orderPubkey: PublicKey,
    cancelReason: string
  ): Promise<string> {
    const [escrow]  = getOrderEscrowPda(orderPubkey, this.programId);
    const senderUsdc= await getAssociatedTokenAddress(this.usdcMint, sender.publicKey);
    return this.program.methods
      .cancelRemittanceOrder(cancelReason)
      .accounts({
        sender:       sender.publicKey,
        order:        orderPubkey,
        orderEscrow:  escrow,
        senderUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([sender])
      .rpc();
  }

  async fetchOrder(sender: PublicKey, nonce: bigint) {
    const [order] = getRemittanceOrderPda(sender, nonce, this.programId);
    return this.program.account.remittanceOrder.fetch(order);
  }
}
