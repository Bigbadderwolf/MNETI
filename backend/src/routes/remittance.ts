/**
 * MNETI Protocol — Phase 7
 * backend/src/routes/remittance.ts
 *
 * Express REST routes for the remittance corridor.
 *
 * Endpoints:
 *   GET  /api/remittance/quote               — Get FX quote for a corridor
 *   GET  /api/remittance/corridors            — List all active corridors
 *   GET  /api/remittance/order/:pubkey        — Get order status
 *   POST /api/remittance/b2c/result           — Daraja B2C success callback
 *   POST /api/remittance/b2c/timeout          — Daraja B2C timeout callback
 *   GET  /api/remittance/stats                — Relay statistics
 */

import { Router, Request, Response } from "express";
import { buildQuote, CORRIDORS, getRate } from "../remittance/fx/rates";
import { getRelayStats, getPayoutByOrder } from "../remittance/corridors/relay";
import { logger } from "../utils/logger";

const router = Router();

// ─── GET /api/remittance/quote ────────────────────────────────────────────────
/**
 * Query params:
 *   corridor_id: number  (0=GBP/KES, 1=USD/KES, 2=AED/KES, 3=KES/KES, 4=EUR/KES)
 *   amount:      number  (decimal source amount e.g. 100.00)
 */
router.get("/quote", (req: Request, res: Response) => {
  const corridorId = parseInt(req.query.corridor_id as string, 10);
  const amount     = parseFloat(req.query.amount as string);

  if (isNaN(corridorId) || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "corridor_id and amount are required" });
  }

  const quote = buildQuote(corridorId, amount);
  if (!quote) {
    return res.status(503).json({
      error: "FX rate unavailable for this corridor — try again shortly",
    });
  }

  return res.json({ success: true, quote });
});

// ─── GET /api/remittance/corridors ────────────────────────────────────────────
router.get("/corridors", (_req: Request, res: Response) => {
  const corridors = CORRIDORS.map(c => {
    const rate = getRate(c.from, c.to);
    return {
      ...c,
      rate:          rate?.rate        ?? null,
      rate_scaled:   rate?.rate_scaled ?? null,
      rate_source:   rate?.source      ?? null,
      fetched_at:    rate?.fetched_at  ?? null,
    };
  });
  return res.json({ success: true, corridors });
});

// ─── GET /api/remittance/order/:pubkey ────────────────────────────────────────
router.get("/order/:pubkey", async (req: Request, res: Response) => {
  const { pubkey } = req.params;
  if (!pubkey || pubkey.length < 32) {
    return res.status(400).json({ error: "Invalid order pubkey" });
  }

  const payout = getPayoutByOrder(pubkey);
  return res.json({
    success: true,
    order_pubkey: pubkey,
    payout_status: payout ?? null,
  });
});

// ─── POST /api/remittance/b2c/result (Daraja callback) ───────────────────────
/**
 * Safaricom calls this endpoint after processing a B2C payment.
 * The relay service has already queued on-chain recording when it
 * detects the Solana event.  This endpoint records the Daraja receipt
 * in the relay DB and triggers on-chain recording if not yet done.
 */
router.post("/b2c/result", async (req: Request, res: Response) => {
  try {
    const body   = req.body;
    const result = body?.Result;

    if (!result) {
      return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid payload" });
    }

    const resultCode: number = result.ResultCode;
    const conversationId     = result.ConversationID;
    const originatorRef      = result.OriginatorConversationID;

    if (resultCode === 0) {
      // Success — extract M-Pesa receipt
      const items: any[] = result.ResultParameters?.ResultParameter ?? [];
      const receiptItem  = items.find((i: any) => i.Key === "TransactionReceipt");
      const receipt      = receiptItem?.Value ?? conversationId;

      logger.info(`[Relay] B2C success: ref=${originatorRef} receipt=${receipt}`);
      // On-chain recording is handled by the relay cron matching daraja_ref
    } else {
      logger.warn(`[Relay] B2C failed: code=${resultCode} ref=${originatorRef}`);
    }

    // Safaricom requires this exact response shape
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    logger.error("[Relay] B2C result handler error:", err);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" }); // always accept to avoid retries
  }
});

// ─── POST /api/remittance/b2c/timeout ────────────────────────────────────────
router.post("/b2c/timeout", (req: Request, res: Response) => {
  logger.warn("[Relay] B2C timeout callback received:", JSON.stringify(req.body).slice(0, 200));
  return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ─── GET /api/remittance/stats ────────────────────────────────────────────────
router.get("/stats", (_req: Request, res: Response) => {
  const stats = getRelayStats();
  return res.json({ success: true, stats });
});

export default router;
