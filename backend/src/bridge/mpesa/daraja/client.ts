// ─────────────────────────────────────────────────────────────
//  MNETI — Daraja API Client
//  File: backend/src/bridge/mpesa/daraja/client.ts
//
//  Manages authentication with Safaricom Daraja API.
//  Tokens expire every 3600 seconds — auto-refreshed.
// ─────────────────────────────────────────────────────────────

import axios from "axios";
import dotenv from "dotenv";
import { logger } from "../../../utils/logger";
dotenv.config();

const ENV         = process.env.DARAJA_ENVIRONMENT || "sandbox";
const CONSUMER_KEY    = process.env.DARAJA_CONSUMER_KEY    || "";
const CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || "";

// Daraja base URLs
const BASE_URL = ENV === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

// Token cache
let cachedToken: string | null = null;
let tokenExpiry: number        = 0;

// ── GET ACCESS TOKEN ──────────────────────────────────────────
export async function getDarajaToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && now < tokenExpiry - 60_000) {
    return cachedToken;
  }

  try {
    const credentials = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString("base64");

    const response = await axios.get(
      `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${credentials}` },
        timeout: 10_000,
      }
    );

    cachedToken = response.data.access_token;
    tokenExpiry = now + (parseInt(response.data.expires_in) * 1000);

    logger.info(`Daraja token refreshed. Expires in: ${response.data.expires_in}s`);
    return cachedToken!;
  } catch (error: any) {
    logger.error(`Daraja auth failed: ${error.message}`);
    // Return mock token in sandbox/dev when no keys configured
    if (!CONSUMER_KEY || !CONSUMER_SECRET) {
      logger.warn("No Daraja credentials — using mock token for development");
      return "mock-daraja-token";
    }
    throw error;
  }
}

// ── DARAJA HTTP CLIENT ────────────────────────────────────────
export async function darajaPost(endpoint: string, body: object): Promise<any> {
  const token = await getDarajaToken();
  try {
    const response = await axios.post(
      `${BASE_URL}${endpoint}`,
      body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      }
    );
    return response.data;
  } catch (error: any) {
    logger.error(`Daraja API error [${endpoint}]: ${error.response?.data?.errorMessage || error.message}`);
    throw error;
  }
}

export { BASE_URL };
