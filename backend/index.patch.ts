/**
 * MNETI Backend — Phase 5 Addition to backend/src/index.ts
 *
 * Add the yield crank import and startup call alongside existing services.
 * Your existing index.ts already starts:
 *   - Express HTTP server (port 4000)
 *   - Oracle relay cron
 *   - Queue processor cron
 *   - Solana burn event listener
 *
 * ADD these two lines:
 */

// At the top of index.ts, add:
import { startYieldCrank } from "./cranks/yield_crank";

// In the startup block (after existing service starts), add:
startYieldCrank();
// Expected output on startup:
// [MNETI] info: [YieldCrank] Starting yield crank — schedule: 5 0 * * *

/**
 * Full updated startup block in index.ts should look like:
 *
 * async function main() {
 *   // Phase 1-2: Oracle relay
 *   startOracleRelay();
 *
 *   // Phase 4: Queue processor
 *   startQueueProcessor();
 *
 *   // Phase 4: Solana burn listener
 *   listenForBurnEvents();
 *
 *   // Phase 5: Yield crank  ← ADD
 *   startYieldCrank();
 *
 *   // Express server
 *   app.listen(4000, () => {
 *     logger.info("[MNETI] HTTP server running on port 4000");
 *   });
 * }
 */
