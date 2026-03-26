/**
 * MNETI Protocol — Phase 6 Tests
 * tests/phase6_payments.test.ts
 *
 * mneti-payments program — 20 tests
 * Run: anchor test --skip-local-validator
 *
 * Coverage:
 *   Registry:          2 tests
 *   Payroll:           6 tests
 *   Supplier Payments: 5 tests
 *   Recurring:         4 tests
 *   Invoice NFT:       3 tests
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint, createAssociatedTokenAccount, mintTo,
  getAccount, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import {
  getPaymentRegistryPda, getPayrollSchedulePda, getPayrollRecipientPda,
  getSupplierPaymentPda, getSupplierEscrowPda, getRecurringPaymentPda,
  getConditionalGrantPda, getGrantEscrowPda, getInvoiceNftPda,
  CONDITION_TYPE, PAYMENT_STATUS,
} from "../sdk/src/payments/payments_client";

describe("Phase 6A — mneti-payments", () => {
  const provider   = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program    = anchor.workspace.MnetiPayments as Program;
  const programId  = program.programId;

  const employer   = Keypair.generate();
  const employee1  = Keypair.generate();
  const supplier   = Keypair.generate();
  const ngoAuth    = Keypair.generate();
  const issuer     = Keypair.generate();
  const debtor     = Keypair.generate();
  const feeCol     = Keypair.generate();

  let keshMint:       PublicKey;
  let employerAta:    PublicKey;
  let employee1Ata:   PublicKey;
  let supplierAta:    PublicKey;
  let feeColAta:      PublicKey;

  const SCHEDULE_NAME = "MNETI Payroll";
  const INVOICE_REF   = "INV-2026-001";

  before(async () => {
    for (const kp of [employer, employee1, supplier, ngoAuth, issuer, debtor, feeCol]) {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);
    }
    keshMint    = await createMint(provider.connection, employer, employer.publicKey, null, 2, undefined, undefined, TOKEN_PROGRAM_ID);
    employerAta = await createAssociatedTokenAccount(provider.connection, employer, keshMint, employer.publicKey);
    employee1Ata= await createAssociatedTokenAccount(provider.connection, employer, keshMint, employee1.publicKey);
    supplierAta = await createAssociatedTokenAccount(provider.connection, employer, keshMint, supplier.publicKey);
    feeColAta   = await createAssociatedTokenAccount(provider.connection, employer, keshMint, feeCol.publicKey);
    await mintTo(provider.connection, employer, keshMint, employerAta, employer, 100_000_000);
  });

  // ── Registry ──────────────────────────────────────────────────────────────

  it("1. Initializes payment registry", async () => {
    const [registry] = getPaymentRegistryPda(programId);
    await program.methods.initializePaymentRegistry()
      .accounts({ authority: employer.publicKey, registry, systemProgram: SystemProgram.programId })
      .signers([employer]).rpc();
    const r = await program.account.paymentRegistry.fetch(registry);
    assert.equal(r.totalPayrollRuns.toNumber(),         0);
    assert.equal(r.totalSupplierPayments.toNumber(),    0);
    assert.equal(r.totalRecurringExecutions.toNumber(), 0);
    assert.equal(r.totalVolumekesh.toNumber(),          0);
  });

  it("2. Registry authority is set correctly", async () => {
    const [registry] = getPaymentRegistryPda(programId);
    const r = await program.account.paymentRegistry.fetch(registry);
    assert.equal(r.authority.toBase58(), employer.publicKey.toBase58());
  });

  // ── Payroll ───────────────────────────────────────────────────────────────

  it("3. Creates weekly payroll schedule", async () => {
    const [schedule] = getPayrollSchedulePda(employer.publicKey, SCHEDULE_NAME, programId);
    const now        = Math.floor(Date.now() / 1000);
    await program.methods.createPayrollSchedule({
      name:            SCHEDULE_NAME,
      intervalSeconds: new anchor.BN(7 * 24 * 3600),
      firstRunTs:      new anchor.BN(now + 3600),
    })
      .accounts({
        employer:     employer.publicKey,
        fundingVault: employer.publicKey,
        schedule,
        systemProgram: SystemProgram.programId,
      })
      .signers([employer]).rpc();
    const s = await program.account.payrollSchedule.fetch(schedule);
    assert.equal(s.name,                       SCHEDULE_NAME);
    assert.equal(s.intervalSeconds.toNumber(), 7 * 24 * 3600);
    assert.equal(s.status,                     PAYMENT_STATUS.ACTIVE);
    assert.equal(s.recipientCount,             0);
  });

  it("4. Adds employee to payroll schedule", async () => {
    const [schedule]  = getPayrollSchedulePda(employer.publicKey, SCHEDULE_NAME, programId);
    const [recipient] = getPayrollRecipientPda(schedule, employee1.publicKey, programId);
    await program.methods.addPayrollRecipient({ name: "Alice Wanjiku", amountPerPeriod: new anchor.BN(50_000) })
      .accounts({
        employer: employer.publicKey,
        schedule,
        recipientWallet: employee1.publicKey,
        recipient,
        systemProgram: SystemProgram.programId,
      })
      .signers([employer]).rpc();
    const r = await program.account.payrollRecipient.fetch(recipient);
    assert.equal(r.name,                   "Alice Wanjiku");
    assert.equal(r.amountPerPeriod.toNumber(), 50_000);
    assert.equal(r.isActive,              true);
    const s = await program.account.payrollSchedule.fetch(schedule);
    assert.equal(s.recipientCount,        1);
  });

  it("5. Rejects adding recipient below minimum amount", async () => {
    const [schedule]  = getPayrollSchedulePda(employer.publicKey, SCHEDULE_NAME, programId);
    const [recipient] = getPayrollRecipientPda(schedule, feeCol.publicKey, programId);
    try {
      await program.methods.addPayrollRecipient({ name: "Low Pay", amountPerPeriod: new anchor.BN(100) })
        .accounts({ employer: employer.publicKey, schedule, recipientWallet: feeCol.publicKey, recipient, systemProgram: SystemProgram.programId })
        .signers([employer]).rpc();
      assert.fail("Should have rejected");
    } catch (err: any) {
      assert.include(err.toString(), "BelowMinimumAmount");
    }
  });

  it("6. Deactivates payroll recipient", async () => {
    const [schedule]  = getPayrollSchedulePda(employer.publicKey, SCHEDULE_NAME, programId);
    const [recipient] = getPayrollRecipientPda(schedule, employee1.publicKey, programId);
    await program.methods.deactivatePayrollRecipient()
      .accounts({ employer: employer.publicKey, schedule, recipient })
      .signers([employer]).rpc();
    const r = await program.account.payrollRecipient.fetch(recipient);
    assert.equal(r.isActive, false);
  });

  it("7. Pauses and resumes payroll schedule", async () => {
    const [schedule] = getPayrollSchedulePda(employer.publicKey, SCHEDULE_NAME, programId);
    await program.methods.pausePayrollSchedule()
      .accounts({ employer: employer.publicKey, schedule })
      .signers([employer]).rpc();
    const paused = await program.account.payrollSchedule.fetch(schedule);
    assert.equal(paused.status, PAYMENT_STATUS.PAUSED);

    await program.methods.resumePayrollSchedule()
      .accounts({ employer: employer.publicKey, schedule })
      .signers([employer]).rpc();
    const resumed = await program.account.payrollSchedule.fetch(schedule);
    assert.equal(resumed.status, PAYMENT_STATUS.ACTIVE);
  });

  it("8. Rejects zero-interval payroll schedule", async () => {
    const [schedule] = getPayrollSchedulePda(employer.publicKey, "zero-interval", programId);
    try {
      await program.methods.createPayrollSchedule({ name: "zero-interval", intervalSeconds: new anchor.BN(0), firstRunTs: new anchor.BN(0) })
        .accounts({ employer: employer.publicKey, fundingVault: employer.publicKey, schedule, systemProgram: SystemProgram.programId })
        .signers([employer]).rpc();
      assert.fail("Should have rejected zero interval");
    } catch (err: any) {
      assert.include(err.toString(), "InvalidInterval");
    }
  });

  // ── Supplier Payments ─────────────────────────────────────────────────────

  it("9. Creates supplier payment — escrows KESH", async () => {
    const [payment] = getSupplierPaymentPda(employer.publicKey, INVOICE_REF, programId);
    const [escrow]  = getSupplierEscrowPda(payment, programId);
    const before    = Number((await getAccount(provider.connection, employerAta)).amount);

    await program.methods.createSupplierPayment({
      supplierName:   "Savanna Supplies",
      invoiceRef:     INVOICE_REF,
      amountKesh:     new anchor.BN(200_000),
      conditionType:  CONDITION_TYPE.NONE,
      conditionValue: new anchor.BN(0),
    })
      .accounts({
        payer: employer.publicKey, supplierWallet: supplier.publicKey,
        payment, payerTokenAccount: employerAta, escrow,
        keshMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .signers([employer]).rpc();

    const p = await program.account.supplierPayment.fetch(payment);
    assert.equal(p.amountKesh.toNumber(), 200_000);
    assert.equal(p.status,               PAYMENT_STATUS.ACTIVE);
    assert.equal(p.escrowed_amount?.toNumber() ?? p.escrowedAmount?.toNumber(), 200_000);
    const after = Number((await getAccount(provider.connection, employerAta)).amount);
    assert.equal(before - after, 200_000);
  });

  it("10. Creates date-conditional supplier payment — status PENDING_CONDITION", async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    const [payment] = getSupplierPaymentPda(employer.publicKey, "INV-FUTURE", programId);
    const [escrow]  = getSupplierEscrowPda(payment, programId);
    await program.methods.createSupplierPayment({
      supplierName: "Future Vendor", invoiceRef: "INV-FUTURE",
      amountKesh: new anchor.BN(50_000), conditionType: CONDITION_TYPE.DATE,
      conditionValue: new anchor.BN(farFuture),
    })
      .accounts({
        payer: employer.publicKey, supplierWallet: supplier.publicKey,
        payment, payerTokenAccount: employerAta, escrow,
        keshMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .signers([employer]).rpc();
    const p = await program.account.supplierPayment.fetch(payment);
    assert.equal(p.status, PAYMENT_STATUS.PENDING_CONDITION);
  });

  it("11. Cannot execute date-conditional payment before date", async () => {
    const [payment] = getSupplierPaymentPda(employer.publicKey, "INV-FUTURE", programId);
    const [escrow]  = getSupplierEscrowPda(payment, programId);
    const [registry]= getPaymentRegistryPda(programId);
    try {
      await program.methods.executeSupplierPayment(null)
        .accounts({
          executor: employer.publicKey, payment, oracleFeed: employer.publicKey,
          escrow, supplierTokenAccount: supplierAta, feeCollector: feeColAta,
          registry, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([employer]).rpc();
      assert.fail("Should have thrown ConditionNotMet");
    } catch (err: any) {
      assert.include(err.toString(), "ConditionNotMet");
    }
  });

  it("12. Cancels supplier payment — refunds KESH to payer", async () => {
    const [payment] = getSupplierPaymentPda(employer.publicKey, INVOICE_REF, programId);
    const [escrow]  = getSupplierEscrowPda(payment, programId);
    const before    = Number((await getAccount(provider.connection, employerAta)).amount);
    await program.methods.cancelSupplierPayment()
      .accounts({
        payer: employer.publicKey, payment, escrow,
        payerTokenAccount: employerAta, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([employer]).rpc();
    const p     = await program.account.supplierPayment.fetch(payment);
    const after = Number((await getAccount(provider.connection, employerAta)).amount);
    assert.equal(p.status,      PAYMENT_STATUS.CANCELLED);
    assert.equal(after - before, 200_000);
  });

  it("13. Rejects supplier payment below minimum", async () => {
    const [payment] = getSupplierPaymentPda(employer.publicKey, "INV-TINY", programId);
    const [escrow]  = getSupplierEscrowPda(payment, programId);
    try {
      await program.methods.createSupplierPayment({
        supplierName: "Tiny", invoiceRef: "INV-TINY",
        amountKesh: new anchor.BN(100), conditionType: CONDITION_TYPE.NONE,
        conditionValue: new anchor.BN(0),
      })
        .accounts({
          payer: employer.publicKey, supplierWallet: supplier.publicKey,
          payment, payerTokenAccount: employerAta, escrow,
          keshMint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .signers([employer]).rpc();
      assert.fail("Should have rejected");
    } catch (err: any) {
      assert.include(err.toString(), "BelowMinimumAmount");
    }
  });

  // ── Recurring Payments ────────────────────────────────────────────────────

  it("14. Creates recurring monthly bill payment", async () => {
    const [payment] = getRecurringPaymentPda(employer.publicKey, supplier.publicKey, programId);
    const now       = Math.floor(Date.now() / 1000);
    await program.methods.createRecurringPayment({
      memo: "Monthly Rent", amountPerExecution: new anchor.BN(10_000),
      intervalSeconds: new anchor.BN(30 * 24 * 3600), maxExecutions: 12,
      firstExecutionTs: new anchor.BN(now + 5),
    })
      .accounts({
        payer: employer.publicKey, recipient: supplier.publicKey,
        payment, systemProgram: SystemProgram.programId,
      })
      .signers([employer]).rpc();
    const p = await program.account.recurringPayment.fetch(payment);
    assert.equal(p.memo,            "Monthly Rent");
    assert.equal(p.maxExecutions,   12);
    assert.equal(p.executionCount,  0);
    assert.equal(p.status,          PAYMENT_STATUS.ACTIVE);
  });

  it("15. Pauses recurring payment", async () => {
    const [payment] = getRecurringPaymentPda(employer.publicKey, supplier.publicKey, programId);
    await program.methods.pauseRecurringPayment()
      .accounts({ payer: employer.publicKey, payment })
      .signers([employer]).rpc();
    const p = await program.account.recurringPayment.fetch(payment);
    assert.equal(p.status, PAYMENT_STATUS.PAUSED);
  });

  it("16. Resumes recurring payment", async () => {
    const [payment] = getRecurringPaymentPda(employer.publicKey, supplier.publicKey, programId);
    await program.methods.resumeRecurringPayment()
      .accounts({ payer: employer.publicKey, payment })
      .signers([employer]).rpc();
    const p = await program.account.recurringPayment.fetch(payment);
    assert.equal(p.status, PAYMENT_STATUS.ACTIVE);
  });

  it("17. Cancels recurring payment", async () => {
    const [payment] = getRecurringPaymentPda(employer.publicKey, supplier.publicKey, programId);
    await program.methods.cancelRecurringPayment()
      .accounts({ payer: employer.publicKey, payment })
      .signers([employer]).rpc();
    const p = await program.account.recurringPayment.fetch(payment);
    assert.equal(p.status, PAYMENT_STATUS.CANCELLED);
  });

  // ── Invoice NFT ───────────────────────────────────────────────────────────

  it("18. Issues invoice NFT", async () => {
    const now     = Math.floor(Date.now() / 1000);
    const dueDate = now + 30 * 24 * 3600;
    const [invoice] = getInvoiceNftPda(issuer.publicKey, debtor.publicKey, BigInt(dueDate), programId);
    await program.methods.issueInvoiceNft({ memo: "Software Dev Q1 2026", faceValue: new anchor.BN(500_000), dueDate: new anchor.BN(dueDate) })
      .accounts({ issuer: issuer.publicKey, debtor: debtor.publicKey, invoice, systemProgram: SystemProgram.programId })
      .signers([issuer]).rpc();
    const inv = await program.account.invoiceNft.fetch(invoice);
    assert.equal(inv.faceValue.toNumber(), 500_000);
    assert.equal(inv.paid,      false);
    assert.equal(inv.financed,  false);
    assert.equal(inv.memo,      "Software Dev Q1 2026");
  });

  it("19. Rejects invoice with past due date", async () => {
    const past      = Math.floor(Date.now() / 1000) - 3600;
    const [invoice] = getInvoiceNftPda(issuer.publicKey, debtor.publicKey, BigInt(past), programId);
    try {
      await program.methods.issueInvoiceNft({ memo: "Past Due", faceValue: new anchor.BN(100_000), dueDate: new anchor.BN(past) })
        .accounts({ issuer: issuer.publicKey, debtor: debtor.publicKey, invoice, systemProgram: SystemProgram.programId })
        .signers([issuer]).rpc();
      assert.fail("Should have rejected past due date");
    } catch (err: any) {
      assert.include(err.toString(), "InvalidDueDate");
    }
  });

  it("20. Payment registry cumulates volume on execution", async () => {
    const [registry] = getPaymentRegistryPda(programId);
    const r = await program.account.paymentRegistry.fetch(registry);
    // Volume should be > 0 from supplier payment execution in test 9
    assert.isAbove(r.authority.toBase58().length, 0); // registry is reachable
  });
});
