import axios from "axios";
import dotenv from "dotenv";
import { logger } from "../../utils/logger";
dotenv.config();

const PYTH_URL = process.env.PYTH_DEVNET_URL || "https://hermes-beta.pyth.network";
const SCALE    = 1_000_000;

const FEED_IDS: Record<number, string> = {
  0: process.env.PYTH_KES_USD_FEED_ID ||
     "0x84c2dde9633d93d1bcad84e7dc41c9d56578b7ec1bf106c73498495589016b74",
  2: "0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2",
};

export interface PythPrice {
  price: number; confidence: number; timestamp: number;
}

export async function getPythPrice(feedType: number): Promise<PythPrice | null> {
  const feedId = FEED_IDS[feedType];
  if (!feedId) { logger.warn(`No Pyth feed for type ${feedType}`); return null; }
  try {
    const res    = await axios.get(`${PYTH_URL}/v2/updates/price/latest`,
      { params: { ids: [feedId] }, timeout: 5000 });
    const parsed = res.data?.parsed?.[0];
    if (!parsed) throw new Error("No Pyth data");
    const price  = parseFloat(parsed.price.price) * Math.pow(10, parsed.price.expo);
    const conf   = parseFloat(parsed.price.conf)  * Math.pow(10, parsed.price.expo);
    return { price: Math.round(price * SCALE), confidence: Math.round(conf * SCALE),
             timestamp: Math.floor(Date.now() / 1000) };
  } catch (e: any) {
    logger.warn(`Pyth error for feed ${feedType}: ${e.message}`);
    return null;
  }
}
