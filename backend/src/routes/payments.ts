/**
 * MNETI Protocol — Phase 6
 * backend/src/routes/payments.ts
 *
 * Express REST routes for the Programmable Payments system.
 *
 * Endpoints:
 *   GET  /api/payments/registry              — Protocol payment statistics
 *   GET  /api/payments/payroll/stats         — Payroll crank run history
 *   POST /api/payments/supplier/quote        — Quote a supplier payment fee
 *   GET  /api/payments/supplier/:payer/:ref  — Get supplier payment status
 *   GET  /api/payments/recurring/:payer/:recipient — Get recurring payment status
 *   GET  /api/payments/grant/:authority/:name      — Get conditional grant status
 *   GET  /api/payments/invoice/:issuer/:debtor/:due — Get invoice NFT status
 */

import { Router, Request, Response } from "express";
import { getPayrollCrankStats } from "../cranks/payroll_crank";
import { logger } from "../utils/logger";

const router = Router();

// ─── GET /api/payments/registry ───────────────────────────────────────────────
router.get("/registry", (_req: Request, res: Response) => {
  res.json({
    success:  true,
    message:  "Fetch payment registry from on-chain using the SDK PaymentsClient.fetchRegistry()",
    sdk_hint: "sdk/src/payments/payments_client.ts → PaymentsClient.fetchRegistry()",
  });
});

// ─── GET /api/payments/payroll/stats ──────────────────────────────────────────
router.get("/payroll/stats", (_req: Request, res: Response) => {
  try {
    const stats = getPayrollCrankStats();
    res.json({ success: true, stats });
  } catch (err) {
    logger.error("[Routes/Payments] Payroll stats error:", err);
    res.status(500).json({ error: "Failed to fetch payroll stats" });
  }
});

// ─── POST /api/payments/supplier/quote ────────────────────────────────────────
/**
 * Body: { amount_kesh: number }
 * Returns: fee breakdown for a supplier payment
 */
router.post("/supplier/quote", (req: Request, res: Response) => {
  const { amount_kesh } = req.body;
  if (typeof amount_kesh !== "number" || amount_kesh <= 0) {
    return res.status(400).json({ error: "amount_kesh must be a positive number" });
  }

  const FEE_SUPPLIER_BPS  = 20;
  const TR_THRESHOLD_KESH = 13_000_000;

  const fee    = Math.floor((amount_kesh * FEE_SUPPLIER_BPS) / 10_000);
  const net    = amount_kesh - fee;
  const trReq  = amount_kesh >= TR_THRESHOLD_KESH;

  return res.json({
    success: true,
    quote: {
      gross_amount_kesh:   amount_kesh,
      fee_kesh:            fee,
      fee_pct:             "0.20%",
      net_amount_kesh:     net,
      travel_rule_required: trReq,
      travel_rule_threshold_kes: "KES 130,000",
    },
  });
});

// ─── GET /api/payments/supplier/:payer/:invoiceRef ────────────────────────────
router.get("/supplier/:payer/:invoiceRef", (req: Request, res: Response) => {
  const { payer, invoiceRef } = req.params;
  res.json({
    success:   true,
    message:   "Fetch supplier payment state from on-chain",
    payer,
    invoice_ref: invoiceRef,
    sdk_hint:  "sdk/src/payments/payments_client.ts → getSupplierPaymentPda(payer, invoiceRef, programId)",
  });
});

// ─── GET /api/payments/recurring/:payer/:recipient ────────────────────────────
router.get("/recurring/:payer/:recipient", (req: Request, res: Response) => {
  const { payer, recipient } = req.params;
  res.json({
    success:   true,
    message:   "Fetch recurring payment state from on-chain",
    payer,
    recipient,
    sdk_hint:  "sdk/src/payments/payments_client.ts → getRecurringPaymentPda(payer, recipient, programId)",
  });
});

// ─── GET /api/payments/grant/:authority/:name ─────────────────────────────────
router.get("/grant/:authority/:name", (req: Request, res: Response) => {
  const { authority, name } = req.params;
  res.json({
    success:   true,
    message:   "Fetch conditional grant state from on-chain",
    authority,
    grant_name: name,
    sdk_hint:  "sdk/src/payments/payments_client.ts → getConditionalGrantPda(authority, name, programId)",
  });
});

// ─── GET /api/payments/health ─────────────────────────────────────────────────
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    success:   true,
    service:   "mneti-payments",
    timestamp: new Date().toISOString(),
  });
});

export default router;
