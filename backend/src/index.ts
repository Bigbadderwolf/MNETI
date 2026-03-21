import dotenv from "dotenv";
dotenv.config();
import { logger }           from "./utils/logger";
import { startOracleRelay } from "./oracle/relay/runner";

async function main() {
  logger.info("════════════════════════════════");
  logger.info("  MNETI Backend — Phase 1 + 2");
  logger.info("  Oracle Relay Service");
  logger.info("════════════════════════════════");
  try {
    await startOracleRelay();
  } catch (e: any) {
    logger.error(`Fatal: ${e.message}`);
    process.exit(1);
  }
}

main();
