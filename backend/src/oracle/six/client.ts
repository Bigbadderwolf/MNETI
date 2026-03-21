import axios from "axios";
import dotenv from "dotenv";
import { logger } from "../../utils/logger";
dotenv.config();

const SIX_BASE = process.env.SIX_API_BASE_URL || "";
const SIX_KEY  = process.env.SIX_API_KEY      || "";
const SCALE    = 1_000_000;

export interface SixPrice {
  price: number; confidence: number; timestamp: number; source: "SIX" | "MOCK";
}

async function fetchSix(instrument: string): Promise<SixPrice | null> {
  if (!SIX_KEY || !SIX_BASE) return null;
  try {
    const res   = await axios.get(`${SIX_BASE}/price`, {
      headers: { Authorization: `Bearer ${SIX_KEY}` },
      params:  { instrument }, timeout: 5000,
    });
    const price = parseFloat(res.data?.price || res.data?.last);
    if (!price || isNaN(price)) throw new Error("Bad price from SIX");
    return { price: Math.round(price * SCALE), confidence: Math.round(price * SCALE * 0.001),
             timestamp: Math.floor(Date.now() / 1000), source: "SIX" };
  } catch (e: any) {
    logger.warn(`SIX API error: ${e.message}`);
    return null;
  }
}

function mock(feedType: number): SixPrice {
  const now    = Math.floor(Date.now() / 1000);
  const jitter = (Math.random() - 0.5) * 0.002;
  const prices: Record<number, [number, number]> = {
    0: [130.5 * (1 + jitter), 0.05],    // KES/USD
    1: [1500, 10],                        // T-bill bps
    2: [2050 * (1 + jitter), 1.0],       // XAU/USD
    3: [23   * (1 + jitter), 0.02],      // XAG/USD
    4: [(1 / 130.5) * (1 + jitter), 0],  // USD/KES
  };
  const [p, c] = prices[feedType] || [1, 0];
  return { price: Math.round(p * SCALE), confidence: Math.round(c * SCALE),
           timestamp: now, source: "MOCK" };
}

export async function getKesUsdPrice(): Promise<SixPrice> {
  const r = await fetchSix(process.env.SIX_KES_USD_INSTRUMENT || "USD/KES");
  if (r) { logger.info(`SIX KES/USD: ${r.price / SCALE}`); return r; }
  const m = mock(0);
  logger.info(`MOCK KES/USD: ${m.price / SCALE}`);
  return m;
}

export async function getTbillYield(): Promise<SixPrice> {
  const r = await fetchSix(process.env.SIX_TBILL_INSTRUMENT || "KE91D");
  if (r) { logger.info(`SIX T-bill: ${r.price} bps`); return r; }
  const m = mock(1);
  logger.info(`MOCK T-bill: ${m.price} bps`);
  return m;
}

export async function getGoldPrice(): Promise<SixPrice> {
  const r = await fetchSix(process.env.SIX_GOLD_INSTRUMENT || "XAU/USD");
  if (r) { logger.info(`SIX XAU/USD: ${r.price / SCALE}`); return r; }
  const m = mock(2);
  logger.info(`MOCK XAU/USD: ${m.price / SCALE}`);
  return m;
}

export async function getAllPrices(): Promise<Map<number, SixPrice>> {
  const prices = new Map<number, SixPrice>();
  const [kes, tbill, gold] = await Promise.all([
    getKesUsdPrice(), getTbillYield(), getGoldPrice()
  ]);
  prices.set(0, kes); prices.set(1, tbill); prices.set(2, gold);
  return prices;
}
