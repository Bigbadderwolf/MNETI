// ─────────────────────────────────────────────────────────────
//  MNETI — C2B Listener (Customer to Business)
//  File: backend/src/bridge/mpesa/c2b/listener.ts
//
//  Processes incoming M-Pesa deposit confirmations from Safaricom.
//  This is called by the webhook when Daraja confirms a payment.
// ─────────────────────────────────────────────────────────────

import { logger }                          from "../../../utils/logger";
import { mintKesh, initWalletStateIfNeeded } from "../../solana/kesh_bridge";
import { enqueue, updateStatus }            from "../queue/offline_queue";
import { connection }                       from "../../solana/kesh_bridge";

export interface MpesaCallback {
  Body: {
    stkCallback: {
      MerchantRequestID:  string;
      CheckoutRequestID:  string;
      ResultCode:         number;
      ResultDesc:         string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value: any }>;
      };
    };
  };
}

// Extract value from Daraja callback metadata items
function extractMetadataValue(items: Array<{ Name: string; Value: any }>, name: string): any {
  return items.find(i => i.Name === name)?.Value;
}

// ── PROCESS STK PUSH CALLBACK ─────────────────────────────────
// Called when Safaricom confirms or rejects an STK push payment
export async function processStkCallback(
  callback:      MpesaCallback,
  walletAddress: string
): Promise<void> {
  const { stkCallback } = callback.Body;
  const { ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

  logger.info(`STK callback received: code=${ResultCode} desc=${ResultDesc}`);

  // ResultCode 0 = success, anything else = failure
  if (ResultCode !== 0) {
    logger.warn(`STK push failed: ${ResultDesc}`);
    return;
  }

  if (!CallbackMetadata) {
    logger.error("No callback metadata in successful STK response");
    return;
  }

  const items        = CallbackMetadata.Item;
  const amountKes    = extractMetadataValue(items, "Amount");
  const mpesaRef     = extractMetadataValue(items, "MpesaReceiptNumber");
  const phoneNumber  = extractMetadataValue(items, "PhoneNumber");

  if (!amountKes || !mpesaRef || !phoneNumber) {
    logger.error("Missing required fields in STK callback", { amountKes, mpesaRef, phoneNumber });
    return;
  }

  logger.info(`M-Pesa deposit confirmed: ref=${mpesaRef} amount=KES${amountKes} phone=${phoneNumber}`);

  // Convert KES to raw units (2 decimal places: KES 100 = 10000 raw)
  const kesRaw = Math.round(amountKes * 100);

  // Initialize wallet state if first transaction
  await initWalletStateIfNeeded(walletAddress);

  // Check if online — try to mint directly
  const isOnline = await checkSolanaConnectivity();

  if (isOnline) {
    try {
      await mintKesh({
        recipientWallet: walletAddress,
        kesAmount:       kesRaw,
        mpesaRef:        mpesaRef.toString(),
      });
      logger.info(`✅ KESH minted directly: ${walletAddress} KES${amountKes}`);
    } catch (e: any) {
      // If mint fails, queue for retry
      logger.warn(`Mint failed, queuing: ${e.message}`);
      const queueId = enqueue("deposit", phoneNumber.toString(), amountKes, walletAddress);
      logger.info(`Queued for retry: ${queueId}`);
    }
  } else {
    // Offline — queue the transaction
    const queueId = enqueue("deposit", phoneNumber.toString(), amountKes, walletAddress);
    logger.info(`Offline — queued transaction: ${queueId}`);
  }
}

// ── CHECK SOLANA CONNECTIVITY ─────────────────────────────────
async function checkSolanaConnectivity(): Promise<boolean> {
  try {
    await connection.getBlockHeight();
    return true;
  } catch {
    logger.warn("Solana RPC unreachable — offline mode activated");
    return false;
  }
}
