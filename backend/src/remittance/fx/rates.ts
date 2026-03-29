/**
 * MNETI Protocol — Phase 7
 * backend/src/remittance/fx/rates.ts
 *
 * FX Rate Manager.
 * Primary source: SIX Financial Data API (same source as mneti-oracle).
 * Fallback:       Cached last-known rate with staleness warning.
 *
 * Rates are stored in-memory and refreshed every 30 seconds by the oracle relay.
 * The remittance service reads from this cache when building order quotes.
 */

import axios from "axios";
import { logger } from "../../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FxRate {
  /** Source currency ISO 4217 code */
  from:            string;
  /** Destination currency ISO 4217 code */
  to:              string;
  /** Rate: how many 'to' units per 1 'from' unit */
  rate:            number;
  /** Rate scaled by 1_000_000 for on-chain use (matches oracle format) */
  rate_scaled:     number;
  /** Unix timestamp when this rate was fetched */
  fetched_at:      number;
  /** Data source used */
  source:          "six_financial" | "mock" | "cached";
}

export interface CorridorQuote {
  corridor_id:         number;
  source_currency:     string;
  dest_currency:       string;
  /** Gross source amount (before fee) */
  source_amount:       number;
  /** Net source amount after 0.30% fee */
  net_source_amount:   number;
  /** Fee amount */
  fee_amount:          number;
  /** Destination KES amount */
  dest_amount_kes:     number;
  /** Destination KESH units (2 decimals) */
  dest_amount_kesh:    number;
  fx_rate:             number;
  fx_rate_scaled:      number;
  /** True when dest_amount_kesh >= 13_000_000 */
  travel_rule_required:boolean;
  /** Quote expiry — rates are valid for 60 seconds */
  expires_at:          number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REMITTANCE_FEE_BPS    = 30;           // 0.30%
const TR_THRESHOLD_KESH     = 13_000_000;   // KES 130,000
const ORACLE_PRICE_SCALE    = 1_000_000;
const QUOTE_VALIDITY_SECS   = 60;           // quotes expire after 60 seconds
const RATE_STALE_THRESHOLD  = 120;          // rates older than 120s are stale

// ─── Corridor Definitions ─────────────────────────────────────────────────────

export const CORRIDORS = [
  { id: 0, from: "GBP", to: "KES", name: "UK → Kenya (GBP/KES)" },
  { id: 1, from: "USD", to: "KES", name: "US → Kenya (USD/KES)" },
  { id: 2, from: "AED", to: "KES", name: "UAE → Kenya (AED/KES)" },
  { id: 3, from: "KES", to: "KES", name: "Kenya Domestic (KES/KES)" },
  { id: 4, from: "EUR", to: "KES", name: "Europe → Kenya (EUR/KES)" },
] as const;

// ─── In-Memory Rate Cache ─────────────────────────────────────────────────────

const rateCache = new Map<string, FxRate>();

/** Mock rates — used when SIX_API_KEY is not configured */
const MOCK_RATES: Record<string, number> = {
  "GBP/KES": 166.50,
  "USD/KES": 130.50,
  "AED/KES":  35.50,
  "KES/KES":   1.00,
  "EUR/KES": 141.20,
};

// ─── SIX Financial Rate Fetch ─────────────────────────────────────────────────

async function fetchSixRate(from: string, to: string): Promise<number | null> {
  const apiKey = process.env.SIX_API_KEY;
  if (!apiKey) return null;

  try {
    const pair = `${from}${to}`;
    const resp = await axios.get(
      `https://web.six-group.com/api/marketdata/v2/exchange-rate/${pair}`,
      {
        headers: { "Authorization": `Bearer ${apiKey}` },
        timeout: 5_000,
      }
    );
    const rate = resp.data?.data?.mid ?? resp.data?.mid;
    if (typeof rate === "number" && rate > 0) return rate;
  } catch (err) {
    logger.warn(`[FX] SIX API unavailable for ${from}/${to}: ${(err as Error).message}`);
  }
  return null;
}

// ─── Rate Refresh ─────────────────────────────────────────────────────────────

export async function refreshAllRates(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  for (const corridor of CORRIDORS) {
    const { from, to } = corridor;
    const key = `${from}/${to}`;

    let rate: number;
    let source: FxRate["source"];

    if (from === to) {
      // Domestic — no FX
      rate   = 1.0;
      source = "mock";
    } else {
      const live = await fetchSixRate(from, to);
      if (live !== null) {
        rate   = live;
        source = "six_financial";
      } else {
        // Fallback: check if we have a cached rate
        const cached = rateCache.get(key);
        if (cached && now - cached.fetched_at < 300) {
          logger.info(`[FX] Using cached ${key} rate (${(now - cached.fetched_at)}s old)`);
          rateCache.set(key, { ...cached, source: "cached" });
          continue;
        }
        // Last resort: mock rate
        rate   = MOCK_RATES[key] ?? 130.0;
        source = "mock";
        logger.warn(`[FX] Using mock rate for ${key}: ${rate}`);
      }
    }

    rateCache.set(key, {
      from,
      to,
      rate,
      rate_scaled:  Math.round(rate * ORACLE_PRICE_SCALE),
      fetched_at:   now,
      source,
    });

    logger.info(`[FX] ${key} = ${rate} (${source})`);
  }
}

// ─── Get Rate ─────────────────────────────────────────────────────────────────

export function getRate(from: string, to: string): FxRate | null {
  return rateCache.get(`${from}/${to}`) ?? null;
}

export function isRateStale(rate: FxRate): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now - rate.fetched_at > RATE_STALE_THRESHOLD;
}

// ─── Quote Builder ────────────────────────────────────────────────────────────
/**
 * Build a remittance quote for a given corridor and source amount.
 * Source amount is in the smallest unit of the source currency
 * (e.g. USDC = 6 decimals, GBP pence = 2 decimals handled by frontend).
 *
 * For simplicity, this function works in decimal units (not micro-units).
 * The frontend passes amounts like 100.00 (USD), not 100_000_000 (USDC units).
 */
export function buildQuote(
  corridorId: number,
  sourceAmountDecimal: number
): CorridorQuote | null {
  const corridor = CORRIDORS.find(c => c.id === corridorId);
  if (!corridor) return null;

  const rate = getRate(corridor.from, corridor.to);
  if (!rate || isRateStale(rate)) {
    logger.warn(`[FX] Stale or missing rate for corridor ${corridorId}`);
    return null;
  }

  const fee           = (sourceAmountDecimal * REMITTANCE_FEE_BPS) / 10_000;
  const netSource     = sourceAmountDecimal - fee;
  const destKes       = netSource * rate.rate;
  // KESH units = KES × 100 (2 decimal places)
  const destKesh      = Math.floor(destKes * 100);

  const now = Math.floor(Date.now() / 1000);

  return {
    corridor_id:          corridorId,
    source_currency:      corridor.from,
    dest_currency:        corridor.to,
    source_amount:        sourceAmountDecimal,
    net_source_amount:    netSource,
    fee_amount:           fee,
    dest_amount_kes:      destKes,
    dest_amount_kesh:     destKesh,
    fx_rate:              rate.rate,
    fx_rate_scaled:       rate.rate_scaled,
    travel_rule_required: destKesh >= TR_THRESHOLD_KESH,
    expires_at:           now + QUOTE_VALIDITY_SECS,
  };
}
