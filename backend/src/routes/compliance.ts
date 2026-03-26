/**
 * MNETI Protocol — Phase 6
 * backend/src/routes/compliance.ts
 *
 * Express REST routes for the AML Compliance Dashboard.
 *
 * Endpoints:
 *   GET  /api/compliance/stats                    — AML screening statistics
 *   GET  /api/compliance/alerts                   — Open AML alerts
 *   GET  /api/compliance/wallet/:wallet           — Screening history for a wallet
 *   POST /api/compliance/screen                   — Manually screen a wallet/tx
 *   POST /api/compliance/alert/:id/resolve        — Resolve an open alert
 *   GET  /api/compliance/health                   — Service health check
 */

import { Router, Request, Response } from "express";
import {
  screenTransaction,
  getAmlStats,
  getWalletHistory,
  getOpenAlerts,
  resolveAlert,
} from "../compliance/aml/screening";
import { logger } from "../utils/logger";

const router = Router();

// ─── GET /api/compliance/stats ────────────────────────────────────────────────
router.get("/stats", (_req: Request, res: Response) => {
  try {
    const stats = getAmlStats();
    res.json({ success: true, stats });
  } catch (err) {
    logger.error("[Routes/Compliance] Stats error:", err);
    res.status(500).json({ error: "Failed to fetch AML stats" });
  }
});

// ─── GET /api/compliance/alerts ───────────────────────────────────────────────
router.get("/alerts", (req: Request, res: Response) => {
  try {
    const limit  = parseInt(req.query.limit as string, 10) || 100;
    const alerts = getOpenAlerts(limit);
    res.json({ success: true, count: (alerts as any[]).length, alerts });
  } catch (err) {
    logger.error("[Routes/Compliance] Alerts error:", err);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// ─── GET /api/compliance/wallet/:wallet ───────────────────────────────────────
router.get("/wallet/:wallet", (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const limit  = parseInt(req.query.limit as string, 10) || 20;
    const history = getWalletHistory(wallet, limit);
    res.json({ success: true, wallet, count: (history as any[]).length, history });
  } catch (err) {
    logger.error("[Routes/Compliance] Wallet history error:", err);
    res.status(500).json({ error: "Failed to fetch wallet history" });
  }
});

// ─── POST /api/compliance/screen ─────────────────────────────────────────────
/**
 * Body: {
 *   wallet: string,
 *   amount_kesh: number,
 *   phone?: string,
 *   transaction_type: "deposit"|"withdrawal"|"supplier_payment"|"recurring_payment"|"remittance"|"payroll"
 * }
 */
router.post("/screen", async (req: Request, res: Response) => {
  try {
    const { wallet, amount_kesh, phone, transaction_type } = req.body;

    if (!wallet || typeof amount_kesh !== "number" || !transaction_type) {
      return res.status(400).json({ error: "wallet, amount_kesh, and transaction_type are required" });
    }

    const result = await screenTransaction({
      wallet,
      amount_kesh: BigInt(amount_kesh),
      phone,
      transaction_type,
    });

    return res.json({ success: true, result });
  } catch (err) {
    logger.error("[Routes/Compliance] Screen error:", err);
    return res.status(500).json({ error: "Screening failed" });
  }
});

// ─── POST /api/compliance/alert/:id/resolve ───────────────────────────────────
router.post("/alert/:id/resolve", (req: Request, res: Response) => {
  try {
    const alertId    = parseInt(req.params.id, 10);
    const resolvedBy = req.body?.resolved_by || "compliance_officer";

    if (isNaN(alertId)) {
      return res.status(400).json({ error: "Invalid alert ID" });
    }

    resolveAlert(alertId, resolvedBy);
    return res.json({ success: true, alert_id: alertId, resolved_by: resolvedBy });
  } catch (err) {
    logger.error("[Routes/Compliance] Resolve alert error:", err);
    return res.status(500).json({ error: "Failed to resolve alert" });
  }
});

// ─── GET /api/compliance/health ───────────────────────────────────────────────
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    success:   true,
    service:   "mneti-compliance-aml",
    timestamp: new Date().toISOString(),
  });
});

export default router;
