// ─────────────────────────────────────────────────────────────
//  MNETI — M-Pesa Routes
//  File: backend/src/routes/mpesa.ts
//
//  All Daraja webhook endpoints and deposit/withdrawal APIs
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { logger }                    from "../utils/logger";
import { initiateStkPush }           from "../bridge/mpesa/stk/push";
import { initiateB2cPayout }         from "../bridge/mpesa/b2c/payout";
import { processStkCallback }        from "../bridge/mpesa/c2b/listener";
import { getQueueStats, getByWallet } from "../bridge/mpesa/queue/offline_queue";

export const mpesaRouter = Router();

// ── POST /api/mpesa/deposit ───────────────────────────────────
// Initiate STK push for a deposit request
mpesaRouter.post("/deposit", async (req: Request, res: Response) => {
  try {
    const { phoneNumber, amountKes, walletAddress } = req.body;

    if (!phoneNumber || !amountKes || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: phoneNumber, amountKes, walletAddress"
      });
    }

    const response = await initiateStkPush({
      phoneNumber,
      amountKes:   parseFloat(amountKes),
      accountRef:  walletAddress.substring(0, 12),
      description: "MNETI KESH",
    });

    // Store wallet address for use when callback arrives
    // In production: persist to Redis/DB with CheckoutRequestID as key
    (req.app.locals.pendingDeposits ||= {})[response.CheckoutRequestID] = walletAddress;

    res.json({
      success:          true,
      checkoutRequestId: response.CheckoutRequestID,
      message:          "STK push sent — check your phone",
    });
  } catch (e: any) {
    logger.error(`Deposit error: ${e.message}`);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/mpesa/callback ──────────────────────────────────
// Daraja STK push callback — Safaricom calls this after payment
mpesaRouter.post("/callback", async (req: Request, res: Response) => {
  try {
    logger.info("M-Pesa STK callback received");
    const callback = req.body;
    const checkoutId = callback?.Body?.stkCallback?.CheckoutRequestID;

    // Retrieve wallet address from pending deposits
    const walletAddress = (req.app.locals.pendingDeposits || {})[checkoutId];
    if (!walletAddress) {
      logger.warn(`No wallet found for CheckoutRequestID: ${checkoutId}`);
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // Process the deposit asynchronously
    processStkCallback(callback, walletAddress).catch(e =>
      logger.error(`Callback processing error: ${e.message}`)
    );

    // Always respond immediately to Safaricom (they timeout in 5s)
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (e: any) {
    logger.error(`Callback error: ${e.message}`);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" }); // Always accept
  }
});

// ── POST /api/mpesa/b2c/result ────────────────────────────────
// B2C result callback — Safaricom confirms payout success/failure
mpesaRouter.post("/b2c/result", async (req: Request, res: Response) => {
  try {
    const result = req.body?.Result;
    if (!result) return res.json({ ResultCode: 0, ResultDesc: "Accepted" });

    const { ResultCode, ResultDesc, ConversationID } = result;
    if (ResultCode === 0) {
      logger.info(`B2C payout successful: ConversationID=${ConversationID}`);
    } else {
      logger.warn(`B2C payout failed: ${ResultDesc} ConversationID=${ConversationID}`);
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (e: any) {
    logger.error(`B2C result error: ${e.message}`);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
});

// ── POST /api/mpesa/b2c/timeout ───────────────────────────────
// B2C timeout — Safaricom did not get a response in time
mpesaRouter.post("/b2c/timeout", async (req: Request, res: Response) => {
  logger.warn("B2C timeout received:", req.body);
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ── GET /api/mpesa/queue/stats ────────────────────────────────
// Queue monitoring endpoint
mpesaRouter.get("/queue/stats", (_req: Request, res: Response) => {
  res.json({ success: true, stats: getQueueStats() });
});

// ── GET /api/mpesa/queue/:wallet ──────────────────────────────
// Get queue history for a wallet
mpesaRouter.get("/queue/:wallet", (req: Request, res: Response) => {
  const transactions = getByWallet(req.params.wallet, 20);
  res.json({ success: true, transactions });
});

// ── POST /api/mpesa/withdraw ──────────────────────────────────
// Initiate withdrawal — burns KESH and triggers B2C payout
mpesaRouter.post("/withdraw", async (req: Request, res: Response) => {
  try {
    const { phoneNumber, amountKes, walletAddress, burnTxSig } = req.body;

    if (!phoneNumber || !amountKes || !walletAddress || !burnTxSig) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    const response = await initiateB2cPayout({
      phoneNumber,
      amountKes:     parseFloat(amountKes),
      occasion:      "KESH Withdrawal",
      remarks:       "MNETI KESH Redemption",
      walletAddress,
      burnTxSig,
    });

    res.json({
      success:        true,
      conversationId: response.ConversationID,
      message:        "Withdrawal initiated — KES will arrive shortly",
    });
  } catch (e: any) {
    logger.error(`Withdrawal error: ${e.message}`);
    res.status(500).json({ success: false, error: e.message });
  }
});
