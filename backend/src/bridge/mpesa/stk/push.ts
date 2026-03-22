// ─────────────────────────────────────────────────────────────
//  MNETI — STK Push (Lipa Na M-Pesa)
//  File: backend/src/bridge/mpesa/stk/push.ts
//
//  WORKFLOW:
//  1. User requests deposit in MNETI app (e.g. KES 1,000)
//  2. Backend calls initiateStkPush()
//  3. Safaricom sends PIN prompt to user's phone
//  4. User enters M-Pesa PIN on their phone
//  5. Safaricom sends callback to /api/mpesa/callback
//  6. callback.ts processes result and mints KESH
// ─────────────────────────────────────────────────────────────

import { darajaPost } from "../daraja/client";
import { logger }     from "../../../utils/logger";
import dotenv         from "dotenv";
dotenv.config();

const SHORTCODE   = process.env.DARAJA_SHORTCODE    || "174379";
const PASSKEY     = process.env.DARAJA_PASSKEY      || "";
const CALLBACK_URL = process.env.DARAJA_CALLBACK_URL || "https://example.com/api/mpesa/callback";

export interface StkPushRequest {
  phoneNumber:   string;  // Format: 2547XXXXXXXX
  amountKes:     number;  // KES amount (minimum 1)
  accountRef:    string;  // Wallet address or reference
  description:   string;  // e.g. "MNETI KESH Deposit"
}

export interface StkPushResponse {
  MerchantRequestID:  string;
  CheckoutRequestID:  string;
  ResponseCode:       string;
  ResponseDescription: string;
  CustomerMessage:    string;
}

// ── GENERATE TIMESTAMP ────────────────────────────────────────
function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
         `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

// ── GENERATE PASSWORD ─────────────────────────────────────────
function generatePassword(timestamp: string): string {
  const str = `${SHORTCODE}${PASSKEY}${timestamp}`;
  return Buffer.from(str).toString("base64");
}

// ── INITIATE STK PUSH ─────────────────────────────────────────
export async function initiateStkPush(req: StkPushRequest): Promise<StkPushResponse> {
  const timestamp = getTimestamp();
  const password  = generatePassword(timestamp);

  // Validate phone number format
  if (!req.phoneNumber.match(/^2547\d{8}$/)) {
    throw new Error(`Invalid phone number format: ${req.phoneNumber}. Expected: 2547XXXXXXXX`);
  }

  // Minimum deposit: KES 1 (Safaricom minimum)
  if (req.amountKes < 1) {
    throw new Error(`Amount too low: ${req.amountKes}. Minimum is KES 1`);
  }

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   "CustomerPayBillOnline",
    Amount:            Math.round(req.amountKes),
    PartyA:            req.phoneNumber,
    PartyB:            SHORTCODE,
    PhoneNumber:       req.phoneNumber,
    CallBackURL:       CALLBACK_URL,
    AccountReference:  req.accountRef.substring(0, 12), // Max 12 chars
    TransactionDesc:   req.description.substring(0, 13), // Max 13 chars
  };

  logger.info(`STK Push initiated: phone=${req.phoneNumber} amount=KES${req.amountKes}`);

  // Use mock response when no Daraja credentials
  if (!PASSKEY || PASSKEY === "") {
    logger.warn("No Daraja passkey — returning mock STK push response");
    return {
      MerchantRequestID:   `mock-merchant-${Date.now()}`,
      CheckoutRequestID:   `ws_CO_mock_${Date.now()}`,
      ResponseCode:        "0",
      ResponseDescription: "Success. Request accepted for processing",
      CustomerMessage:     "Success. Request accepted for processing",
    };
  }

  const response = await darajaPost("/mpesa/stkpush/v1/processrequest", payload);
  logger.info(`STK Push response: ${response.ResponseCode} — ${response.ResponseDescription}`);
  return response;
}

// ── QUERY STK PUSH STATUS ─────────────────────────────────────
export async function queryStkPushStatus(checkoutRequestId: string): Promise<any> {
  const timestamp = getTimestamp();
  const password  = generatePassword(timestamp);

  return darajaPost("/mpesa/stkpushquery/v1/query", {
    BusinessShortCode: SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    CheckoutRequestID: checkoutRequestId,
  });
}
