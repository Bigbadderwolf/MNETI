// ─────────────────────────────────────────────────────────────
//  MNETI Phase 4 — M-Pesa Bridge Tests
//  Tests run with: cd backend && npm test
// ─────────────────────────────────────────────────────────────

import { initiateStkPush }   from "../src/bridge/mpesa/stk/push";
import { initiateB2cPayout } from "../src/bridge/mpesa/b2c/payout";
import {
  enqueue,
  updateStatus,
  getPendingTransactions,
  getQueueStats,
  getTransaction,
  cleanupOldTransactions,
} from "../src/bridge/mpesa/queue/offline_queue";
import { processStkCallback, MpesaCallback } from "../src/bridge/mpesa/c2b/listener";

// ─────────────────────────────────────────────────────────────
//  STK PUSH TESTS
// ─────────────────────────────────────────────────────────────
describe("STK Push", () => {
  it("initiates STK push with mock credentials", async () => {
    const response = await initiateStkPush({
      phoneNumber:  "254712345678",
      amountKes:    1000,
      accountRef:   "testWallet123",
      description:  "MNETI KESH",
    });
    expect(response.ResponseCode).toBe("0");
    expect(response.CheckoutRequestID).toBeTruthy();
    console.log("  ✅ STK push initiated:", response.CheckoutRequestID);
  });

  it("rejects invalid phone number format", async () => {
    await expect(
      initiateStkPush({
        phoneNumber:  "0712345678", // Wrong format (missing country code)
        amountKes:    1000,
        accountRef:   "test",
        description:  "test",
      })
    ).rejects.toThrow("Invalid phone number format");
    console.log("  ✅ Invalid phone correctly rejected");
  });

  it("rejects amount below minimum", async () => {
    await expect(
      initiateStkPush({
        phoneNumber:  "254712345678",
        amountKes:    0,
        accountRef:   "test",
        description:  "test",
      })
    ).rejects.toThrow("Amount too low");
    console.log("  ✅ Zero amount correctly rejected");
  });
});

// ─────────────────────────────────────────────────────────────
//  B2C PAYOUT TESTS
// ─────────────────────────────────────────────────────────────
describe("B2C Payout", () => {
  it("initiates B2C payout with mock credentials", async () => {
    const response = await initiateB2cPayout({
      phoneNumber:   "254712345678",
      amountKes:     970,  // After 0.30% fee on KES 1000
      occasion:      "KESH Withdrawal",
      remarks:       "MNETI KESH Redemption",
      walletAddress: "AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR",
      burnTxSig:     "mock-solana-tx-sig",
    });
    expect(response.ResponseCode).toBe("0");
    expect(response.ConversationID).toBeTruthy();
    console.log("  ✅ B2C payout initiated:", response.ConversationID);
  });
});

// ─────────────────────────────────────────────────────────────
//  OFFLINE QUEUE TESTS
// ─────────────────────────────────────────────────────────────
describe("Offline Queue", () => {
  it("enqueues a deposit transaction", () => {
    const id = enqueue(
      "deposit",
      "254712345678",
      1000,
      "AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR",
      "KE"
    );
    expect(id).toBeTruthy();
    expect(id.length).toBe(36); // UUID length

    const tx = getTransaction(id);
    expect(tx).toBeTruthy();
    expect(tx!.status).toBe("pending");
    expect(tx!.amount_kes).toBe(1000);
    expect(tx!.retry_count).toBe(0);
    console.log("  ✅ Transaction enqueued:", id);
  });

  it("retrieves pending transactions", () => {
    const pending = getPendingTransactions(10);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].status).toBe("pending");
    console.log("  ✅ Pending transactions:", pending.length);
  });

  it("updates transaction status to completed", () => {
    const id = enqueue("deposit", "254787654321", 500, "testWallet", "KE");
    updateStatus(id, "completed", {
      mpesaRef:    "ABC123DEF456",
      solanaTxSig: "mockSolanaTxSignature123",
    });

    const tx = getTransaction(id);
    expect(tx!.status).toBe("completed");
    expect(tx!.mpesa_ref).toBe("ABC123DEF456");
    expect(tx!.solana_tx_sig).toBe("mockSolanaTxSignature123");
    console.log("  ✅ Status updated to completed");
  });

  it("updates transaction to failed and increments retry count", () => {
    const id = enqueue("withdrawal", "254799999999", 200, "testWallet2", "KE");
    updateStatus(id, "failed", { errorMessage: "Solana RPC timeout" });

    const tx = getTransaction(id);
    expect(tx!.status).toBe("failed");
    expect(tx!.error_message).toBe("Solana RPC timeout");
    expect(tx!.retry_count).toBe(1);
    console.log("  ✅ Failed status and retry count incremented");
  });

  it("returns correct queue stats", () => {
    const stats = getQueueStats();
    expect(typeof stats.pending).toBe("number");
    expect(typeof stats.completed).toBe("number");
    expect(typeof stats.failed).toBe("number");
    console.log("  ✅ Queue stats:", stats);
  });

  it("cleans up old completed transactions", () => {
    cleanupOldTransactions(0); // Clean everything older than 0 days
    const stats = getQueueStats();
    expect(stats.completed).toBe(0);
    console.log("  ✅ Old transactions cleaned up");
  });
});

// ─────────────────────────────────────────────────────────────
//  C2B CALLBACK TESTS
// ─────────────────────────────────────────────────────────────
describe("STK Callback Processing", () => {
  it("processes successful STK callback", async () => {
    const successCallback: MpesaCallback = {
      Body: {
        stkCallback: {
          MerchantRequestID:  "mock-merchant-123",
          CheckoutRequestID:  "ws_CO_mock_123",
          ResultCode:         0,
          ResultDesc:         "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount",              Value: 1000 },
              { Name: "MpesaReceiptNumber",  Value: "OEI2AK8L5T" },
              { Name: "TransactionDate",     Value: 20240101120000 },
              { Name: "PhoneNumber",         Value: 254712345678 },
            ],
          },
        },
      },
    };

    // Should not throw — even if Solana is unreachable (will queue)
    await expect(
      processStkCallback(successCallback, "AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR")
    ).resolves.not.toThrow();
    console.log("  ✅ Successful STK callback processed");
  });

  it("handles failed STK callback gracefully", async () => {
    const failCallback: MpesaCallback = {
      Body: {
        stkCallback: {
          MerchantRequestID: "mock-merchant-456",
          CheckoutRequestID: "ws_CO_mock_456",
          ResultCode:        1032,
          ResultDesc:        "Request cancelled by user",
        },
      },
    };

    await expect(
      processStkCallback(failCallback, "testWallet")
    ).resolves.not.toThrow();
    console.log("  ✅ Failed STK callback handled gracefully");
  });
});
