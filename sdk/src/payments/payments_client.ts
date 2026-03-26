/**
 * MNETI Protocol — Phase 6
 * sdk/src/payments/payments_client.ts
 *
 * TypeScript SDK for the mneti-payments Anchor program.
 * All PDA seeds match programs/mneti-payments/src/constants.rs exactly.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// ─── PDA Seeds — must match constants.rs exactly ─────────────────────────────
export const PAYMENT_SEEDS = {
  REGISTRY:         Buffer.from("payment_registry"),
  PAYROLL_SCHEDULE: Buffer.from("payroll_schedule"),
  PAYROLL_RECIPIENT:Buffer.from("payroll_recipient"),
  SUPPLIER_PAYMENT: Buffer.from("supplier_payment"),
  SUPPLIER_ESCROW:  Buffer.from("supplier_escrow"),
  RECURRING_PAYMENT:Buffer.from("recurring_payment"),
  COND_GRANT:       Buffer.from("conditional_grant"),
  COND_GRANT_ESCROW:Buffer.from("grant_escrow"),
  INVOICE_NFT:      Buffer.from("invoice_nft"),
};

// ─── PDA Derivation Helpers ───────────────────────────────────────────────────

export function getPaymentRegistryPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PAYMENT_SEEDS.REGISTRY], programId);
}

export function getPayrollSchedulePda(employer: PublicKey, name: string, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PAYMENT_SEEDS.PAYROLL_SCHEDULE, employer.toBuffer(), Buffer.from(name)],
    programId
  );
}

export function getPayrollRecipientPda(schedule: PublicKey, wallet: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PAYMENT_SEEDS.PAYROLL_RECIPIENT, schedule.toBuffer(), wallet.toBuffer()],
    programId
  );
}

export function getSupplierPaymentPda(payer: PublicKey, invoiceRef: string, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PAYMENT_SEEDS.SUPPLIER_PAYMENT, payer.toBuffer(), Buffer.from(invoiceRef)],
    programId
  );
}

export function getSupplierEscrowPda(payment: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PAYMENT_SEEDS.SUPPLIER_ESCROW, payment.toBuffer()],
    programId
  );
}

export function getRecurringPaymentPda(payer: PublicKey, recipient: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PAYMENT_SEEDS.RECURRING_PAYMENT, payer.toBuffer(), recipient.toBuffer()],
    programId
  );
}

export function getConditionalGrantPda(authority: PublicKey, grantName: string, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PAYMENT_SEEDS.COND_GRANT, authority.toBuffer(), Buffer.from(grantName)],
    programId
  );
}

export function getGrantEscrowPda(grant: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PAYMENT_SEEDS.COND_GRANT_ESCROW, grant.toBuffer()],
    programId
  );
}

export function getInvoiceNftPda(issuer: PublicKey, debtor: PublicKey, dueDate: bigint, programId: PublicKey): [PublicKey, number] {
  const dueBuf = Buffer.alloc(8);
  dueBuf.writeBigInt64LE(BigInt(dueDate));
  return PublicKey.findProgramAddressSync(
    [PAYMENT_SEEDS.INVOICE_NFT, issuer.toBuffer(), debtor.toBuffer(), dueBuf],
    programId
  );
}

// ─── Condition Type Constants ─────────────────────────────────────────────────
export const CONDITION_TYPE = {
  NONE:         0,
  ORACLE_PRICE: 1,
  DATE:         2,
  MULTISIG:     3,
} as const;

export const PAYMENT_STATUS = {
  ACTIVE:            0,
  PAUSED:            1,
  COMPLETED:         2,
  CANCELLED:         3,
  PENDING_CONDITION: 4,
} as const;

// ─── Parameter Types ──────────────────────────────────────────────────────────

export interface CreatePayrollScheduleParams {
  name:             string;
  intervalSeconds:  number;
  firstRunTs?:      number; // defaults to now + intervalSeconds
}

export interface AddPayrollRecipientParams {
  name:             string;
  amountPerPeriod:  anchor.BN;
}

export interface CreateSupplierPaymentParams {
  supplierName:   string;
  invoiceRef:     string;
  amountKesh:     anchor.BN;
  conditionType?: number;
  conditionValue?: anchor.BN;
}

export interface CreateRecurringPaymentParams {
  memo:                 string;
  amountPerExecution:   anchor.BN;
  intervalSeconds:      number;
  maxExecutions?:       number;
  firstExecutionTs?:    number;
}

export interface CreateConditionalGrantParams {
  grantName:        string;
  totalAmount:      anchor.BN;
  expiryTs?:        number; // 0 = no expiry
  conditionDescs:   string[];
}

export interface IssueInvoiceNftParams {
  memo:       string;
  faceValue:  anchor.BN;
  dueDate:    number; // unix timestamp
}

// ─── PaymentsClient ───────────────────────────────────────────────────────────

export class PaymentsClient {
  constructor(
    private program:   anchor.Program,
    private programId: PublicKey,
    private keshMint:  PublicKey
  ) {}

  // ── Registry ────────────────────────────────────────────────────────────────

  async initRegistry(authority: anchor.web3.Signer): Promise<string> {
    const [registry] = getPaymentRegistryPda(this.programId);
    return this.program.methods.initializePaymentRegistry()
      .accounts({ authority: authority.publicKey, registry, systemProgram: SystemProgram.programId })
      .signers([authority]).rpc();
  }

  async fetchRegistry() {
    const [registry] = getPaymentRegistryPda(this.programId);
    return this.program.account.paymentRegistry.fetch(registry);
  }

  // ── Payroll ─────────────────────────────────────────────────────────────────

  async createPayrollSchedule(
    employer: anchor.web3.Signer,
    fundingVault: PublicKey,
    params: CreatePayrollScheduleParams
  ): Promise<string> {
    const [schedule] = getPayrollSchedulePda(employer.publicKey, params.name, this.programId);
    const now        = Math.floor(Date.now() / 1000);
    return this.program.methods.createPayrollSchedule({
      name:            params.name,
      intervalSeconds: new anchor.BN(params.intervalSeconds),
      firstRunTs:      new anchor.BN(params.firstRunTs ?? now + params.intervalSeconds),
    })
      .accounts({
        employer:     employer.publicKey,
        fundingVault,
        schedule,
        systemProgram: SystemProgram.programId,
      })
      .signers([employer]).rpc();
  }

  async addPayrollRecipient(
    employer: anchor.web3.Signer,
    scheduleName: string,
    recipientWallet: PublicKey,
    params: AddPayrollRecipientParams
  ): Promise<string> {
    const [schedule]  = getPayrollSchedulePda(employer.publicKey, scheduleName, this.programId);
    const [recipient] = getPayrollRecipientPda(schedule, recipientWallet, this.programId);
    return this.program.methods.addPayrollRecipient(params)
      .accounts({
        employer: employer.publicKey,
        schedule,
        recipientWallet,
        recipient,
        systemProgram: SystemProgram.programId,
      })
      .signers([employer]).rpc();
  }

  async fetchPayrollSchedule(employer: PublicKey, name: string) {
    const [schedule] = getPayrollSchedulePda(employer, name, this.programId);
    return this.program.account.payrollSchedule.fetch(schedule);
  }

  async fetchPayrollRecipient(employer: PublicKey, scheduleName: string, recipientWallet: PublicKey) {
    const [schedule]  = getPayrollSchedulePda(employer, scheduleName, this.programId);
    const [recipient] = getPayrollRecipientPda(schedule, recipientWallet, this.programId);
    return this.program.account.payrollRecipient.fetch(recipient);
  }

  // ── Supplier Payments ────────────────────────────────────────────────────────

  async createSupplierPayment(
    payer: anchor.web3.Signer,
    supplierWallet: PublicKey,
    params: CreateSupplierPaymentParams
  ): Promise<string> {
    const [payment] = getSupplierPaymentPda(payer.publicKey, params.invoiceRef, this.programId);
    const [escrow]  = getSupplierEscrowPda(payment, this.programId);
    const payerAta  = await getAssociatedTokenAddress(this.keshMint, payer.publicKey);
    return this.program.methods.createSupplierPayment({
      supplierName:   params.supplierName,
      invoiceRef:     params.invoiceRef,
      amountKesh:     params.amountKesh,
      conditionType:  params.conditionType  ?? CONDITION_TYPE.NONE,
      conditionValue: params.conditionValue ?? new anchor.BN(0),
    })
      .accounts({
        payer:             payer.publicKey,
        supplierWallet,
        payment,
        payerTokenAccount: payerAta,
        escrow,
        keshMint:          this.keshMint,
        tokenProgram:      TOKEN_PROGRAM_ID,
        systemProgram:     SystemProgram.programId,
      })
      .signers([payer]).rpc();
  }

  async cancelSupplierPayment(
    payer: anchor.web3.Signer,
    invoiceRef: string
  ): Promise<string> {
    const [payment] = getSupplierPaymentPda(payer.publicKey, invoiceRef, this.programId);
    const [escrow]  = getSupplierEscrowPda(payment, this.programId);
    const payerAta  = await getAssociatedTokenAddress(this.keshMint, payer.publicKey);
    return this.program.methods.cancelSupplierPayment()
      .accounts({
        payer,
        payment,
        escrow,
        payerTokenAccount: payerAta,
        tokenProgram:      TOKEN_PROGRAM_ID,
      })
      .signers([payer]).rpc();
  }

  async fetchSupplierPayment(payer: PublicKey, invoiceRef: string) {
    const [payment] = getSupplierPaymentPda(payer, invoiceRef, this.programId);
    return this.program.account.supplierPayment.fetch(payment);
  }

  // ── Recurring Payments ───────────────────────────────────────────────────────

  async createRecurringPayment(
    payer: anchor.web3.Signer,
    recipient: PublicKey,
    params: CreateRecurringPaymentParams
  ): Promise<string> {
    const [payment] = getRecurringPaymentPda(payer.publicKey, recipient, this.programId);
    return this.program.methods.createRecurringPayment({
      memo:               params.memo,
      amountPerExecution: params.amountPerExecution,
      intervalSeconds:    new anchor.BN(params.intervalSeconds),
      maxExecutions:      params.maxExecutions ?? 0,
      firstExecutionTs:   new anchor.BN(params.firstExecutionTs ?? 0),
    })
      .accounts({
        payer:        payer.publicKey,
        recipient,
        payment,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer]).rpc();
  }

  async cancelRecurringPayment(payer: anchor.web3.Signer, recipient: PublicKey): Promise<string> {
    const [payment] = getRecurringPaymentPda(payer.publicKey, recipient, this.programId);
    return this.program.methods.cancelRecurringPayment()
      .accounts({ payer: payer.publicKey, payment })
      .signers([payer]).rpc();
  }

  async fetchRecurringPayment(payer: PublicKey, recipient: PublicKey) {
    const [payment] = getRecurringPaymentPda(payer, recipient, this.programId);
    return this.program.account.recurringPayment.fetch(payment);
  }

  // ── Conditional Grants ───────────────────────────────────────────────────────

  async createConditionalGrant(
    authority: anchor.web3.Signer,
    params: CreateConditionalGrantParams
  ): Promise<string> {
    const [grant]  = getConditionalGrantPda(authority.publicKey, params.grantName, this.programId);
    const [escrow] = getGrantEscrowPda(grant, this.programId);
    const authAta  = await getAssociatedTokenAddress(this.keshMint, authority.publicKey);
    return this.program.methods.createConditionalGrant({
      grantName:     params.grantName,
      totalAmount:   params.totalAmount,
      expiryTs:      new anchor.BN(params.expiryTs ?? 0),
      conditionDescs:params.conditionDescs,
    })
      .accounts({
        authority,
        grant,
        authorityTokenAccount: authAta,
        grantEscrow:           escrow,
        keshMint:              this.keshMint,
        tokenProgram:          TOKEN_PROGRAM_ID,
        systemProgram:         SystemProgram.programId,
      })
      .signers([authority]).rpc();
  }

  async satisfyGrantCondition(
    authority: anchor.web3.Signer,
    grantName: string,
    conditionIndex: number
  ): Promise<string> {
    const [grant] = getConditionalGrantPda(authority.publicKey, grantName, this.programId);
    return this.program.methods.satisfyGrantCondition(conditionIndex)
      .accounts({ authority: authority.publicKey, grant })
      .signers([authority]).rpc();
  }

  async fetchConditionalGrant(authority: PublicKey, grantName: string) {
    const [grant] = getConditionalGrantPda(authority, grantName, this.programId);
    return this.program.account.conditionalGrant.fetch(grant);
  }

  // ── Invoice NFT ──────────────────────────────────────────────────────────────

  async issueInvoiceNft(
    issuer: anchor.web3.Signer,
    debtor: PublicKey,
    params: IssueInvoiceNftParams
  ): Promise<string> {
    const [invoice] = getInvoiceNftPda(issuer.publicKey, debtor, BigInt(params.dueDate), this.programId);
    return this.program.methods.issueInvoiceNft({
      memo:      params.memo,
      faceValue: params.faceValue,
      dueDate:   new anchor.BN(params.dueDate),
    })
      .accounts({
        issuer:       issuer.publicKey,
        debtor,
        invoice,
        systemProgram: SystemProgram.programId,
      })
      .signers([issuer]).rpc();
  }

  async fetchInvoiceNft(issuer: PublicKey, debtor: PublicKey, dueDate: number) {
    const [invoice] = getInvoiceNftPda(issuer, debtor, BigInt(dueDate), this.programId);
    return this.program.account.invoiceNft.fetch(invoice);
  }
}
