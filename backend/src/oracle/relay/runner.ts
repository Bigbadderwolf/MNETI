import * as anchor from "@coral-xyz/anchor";
import cron from "node-cron";
import dotenv from "dotenv";
import { logger }           from "../../utils/logger";
import { getAllPrices, SixPrice } from "../six/client";
import { getPythPrice }     from "../pyth/client";
import {
  provider, ORACLE_PROGRAM_ID,
  FEED_TYPES, getOracleRegistryPDA, getPriceFeedPDA,
} from "../../config/solana";
dotenv.config();

const INTERVAL = parseInt(process.env.RELAY_INTERVAL_SECONDS || "30");
let oracleProgram: anchor.Program | null = null;

async function loadProgram(): Promise<anchor.Program> {
  if (oracleProgram) return oracleProgram;
  const idl = await anchor.Program.fetchIdl(ORACLE_PROGRAM_ID, provider);
  if (!idl) throw new Error("Oracle IDL not found — run anchor deploy first");
  oracleProgram = new anchor.Program(idl, provider);
  logger.info("Oracle program loaded");
  return oracleProgram;
}

async function submitSix(program: anchor.Program, feedType: number, price: SixPrice): Promise<boolean> {
  try {
    const [registry] = getOracleRegistryPDA();
    const [feed]     = getPriceFeedPDA(feedType);
    await program.methods
      .submitSixPrice(feedType, {
        price:      new anchor.BN(price.price),
        confidence: new anchor.BN(price.confidence),
        timestamp:  new anchor.BN(price.timestamp),
      })
      .accounts({ relayOperator: provider.wallet.publicKey, oracleRegistry: registry, priceFeed: feed })
      .rpc();
    logger.info(`✅ SIX feed=${feedType} price=${price.price} source=${price.source}`);
    return true;
  } catch (e: any) {
    if (e.message?.includes("PriceDeviationTooLarge")) {
      logger.warn(`⚡ Circuit breaker feed=${feedType} — switching to Pyth`);
      await submitPyth(program, feedType);
      return false;
    }
    logger.error(`SIX submit failed feed=${feedType}: ${e.message}`);
    return false;
  }
}

async function submitPyth(program: anchor.Program, feedType: number): Promise<void> {
  const pyth = await getPythPrice(feedType);
  if (!pyth) { logger.error(`No Pyth price for feed ${feedType}`); return; }
  try {
    const [registry] = getOracleRegistryPDA();
    const [feed]     = getPriceFeedPDA(feedType);
    await program.methods
      .submitPythPrice(feedType, {
        price:      new anchor.BN(pyth.price),
        confidence: new anchor.BN(pyth.confidence),
        timestamp:  new anchor.BN(pyth.timestamp),
      })
      .accounts({ relayOperator: provider.wallet.publicKey, oracleRegistry: registry, priceFeed: feed })
      .rpc();
    logger.info(`✅ Pyth fallback feed=${feedType} price=${pyth.price}`);
  } catch (e: any) {
    logger.error(`Pyth submit failed feed=${feedType}: ${e.message}`);
  }
}

async function runCycle(): Promise<void> {
  logger.info("── Oracle relay cycle ──");
  let program: anchor.Program;
  try { program = await loadProgram(); } catch { return; }

  const prices = await getAllPrices();
  for (const feedType of [FEED_TYPES.KES_USD, FEED_TYPES.TBILL_YIELD, FEED_TYPES.XAU_USD]) {
    const price = prices.get(feedType);
    if (!price) { await submitPyth(program, feedType); continue; }
    await submitSix(program, feedType, price);
  }
  logger.info("── Cycle complete ──");
}

export async function startOracleRelay(): Promise<void> {
  logger.info(`Oracle relay starting — interval: ${INTERVAL}s`);
  await runCycle();
  cron.schedule(`*/${INTERVAL} * * * * *`, runCycle);
  logger.info("Oracle relay running");
}
