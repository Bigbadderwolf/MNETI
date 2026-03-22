// ─────────────────────────────────────────────────────────────
//  MNETI — B2C Payout (Business to Customer)
//  File: backend/src/bridge/mpesa/b2c/payout.ts
//
//  WORKFLOW:
//  1. User burns KESH on Solana (burn_kesh instruction)
//  2. mneti-kesh emits KeshBurned event
//  3. Backend catches event, calls initiateB2cPayout()
//  4. Safaricom sends KES to user's M-Pesa number
//  5. Result callback arrives at /api/mpesa/b2c/result
//  6. Backend records payout confirmation
// ─────────────────────────────────────────────────────────────

import { darajaPost } from "../daraja/client";
import { logger }     from "../../../utils/logger";
import dotenv         from "dotenv";
dotenv.config();

const SHORTCODE         = process.env.DARAJA_SHORTCODE              || "174379";
const INITIATOR_NAME    = process.env.DARAJA_B2C_INITIATOR_NAME     || "";
const SECURITY_CRED     = process.env.DARAJA_B2C_SECURITY_CREDENTIAL || "";
const B2C_TIMEOUT_URL   = process.env.DARAJA_B2C_TIMEOUT_URL        || "https://example.com/api/mpesa/b2c/timeout";
const B2C_RESULT_URL    = process.env.DARAJA_B2C_RESULT_URL         || "https://example.com/api/mpesa/b2c/result";

export interface B2cPayoutRequest {
  phoneNumber:    string;   // 2547XXXXXXXX
  amountKes:      number;   // KES to send
  occasion:       string;   // Reference (e.g. "KESH withdrawal")
  remarks:        string;   // e.g. "MNETI KESH Redemption"
  walletAddress:  string;   // For audit trail
  burnTxSig:      string;   // Solana burn transaction signature
}

export interface B2cPayoutResponse {
  ConversationID:         string;
  OriginatorConversationID: string;
  ResponseCode:           string;
  ResponseDescription:    string;
}

// ── INITIATE B2C PAYOUT ───────────────────────────────────────
export async function initiateB2cPayout(req: B2cPayoutRequest): Promise<B2cPayoutResponse> {
  if (!req.phoneNumber.match(/^2547\d{8}$/)) {
    throw new Error(`Invalid phone: ${req.phoneNumber}`);
  }
  if (req.amountKes < 1) {
    throw new Error(`Amount too low: KES ${req.amountKes}`);
  }

  const payload = {
    InitiatorName:          INITIATOR_NAME,
    SecurityCredential:     SECURITY_CRED,
    CommandID:              "BusinessPayment",
    Amount:                 Math.round(req.amountKes),
    PartyA:                 SHORTCODE,
    PartyB:                 req.phoneNumber,
    Remarks:                req.remarks.substring(0, 100),
    QueueTimeOutURL:        B2C_TIMEOUT_URL,
    ResultURL:              B2C_RESULT_URL,
    Occasion:               req.occasion.substring(0, 100),
  };

  logger.info(`B2C payout initiated: phone=${req.phoneNumber} amount=KES${req.amountKes} burnTx=${req.burnTxSig}`);

  // Mock response when credentials not configured
  if (!INITIATOR_NAME || !SECURITY_CRED) {
    logger.warn("No B2C credentials — returning mock payout response");
    return {
      ConversationID:           `AG_mock_${Date.now()}`,
      OriginatorConversationID: `mneti-withdrawal-${Date.now()}`,
      ResponseCode:             "0",
      ResponseDescription:      "Accept the service request successfully.",
    };
  }

  const response = await darajaPost("/mpesa/b2c/v1/paymentrequest", payload);
  logger.info(`B2C response: ${response.ResponseCode} — ${response.ResponseDescription}`);
  return response;
}
