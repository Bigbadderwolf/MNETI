pragma circom 2.1.6;

// ─────────────────────────────────────────────────────────────
//  MNETI — ZK M-PESA CREDIT SCORE CIRCUIT (WORLD FIRST)
//  File: circuits/credit-score/src/credit_score.circom
//
//  PURPOSE:
//  Computes a credit score from M-Pesa transaction history
//  WITHOUT revealing any individual transaction details.
//  The M-Pesa data stays on the user's device. Only the
//  proof and aggregate scores go on-chain.
//
//  This enables under-collateralised loans for the unbanked —
//  the holy grail of DeFi for emerging markets.
//
//  PRIVATE INPUTS (24 months of M-Pesa data, stays on device):
//  - monthlyIncomes[24]    : KES income per month (raw units)
//  - monthlyExpenses[24]   : KES expenses per month
//  - paymentSuccesses[24]  : Number of successful payments per month
//  - paymentFailures[24]   : Number of failed payments per month
//  - monthlySavings[24]    : End-of-month savings balance
//  - walletPubkey          : Solana wallet (binds proof to wallet)
//  - nonce                 : Random nonce
//
//  PUBLIC OUTPUTS (go on-chain — no raw transaction data):
//  - creditScore           : 300–850 (FICO-style)
//  - incomeBand            : 1=low, 2=medium, 3=high, 4=very_high
//  - paymentReliability    : 0–100 percentage
//  - savingsRateBand       : 1–5 (1=none, 5=excellent)
//  - monthsOfHistory       : How many months had activity
//  - commitment            : Poseidon(walletPubkey, nonce)
// ─────────────────────────────────────────────────────────────

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Number of months of history
// 24 months = 2 years — robust credit assessment
template MpesaCreditScore(N) {

    // ── PRIVATE INPUTS ──────────────────────────────────────
    signal input monthlyIncomes[N];
    signal input monthlyExpenses[N];
    signal input paymentSuccesses[N];
    signal input paymentFailures[N];
    signal input monthlySavings[N];
    signal input walletPubkey;
    signal input nonce;

    // ── PUBLIC OUTPUTS ───────────────────────────────────────
    signal output creditScore;
    signal output incomeBand;
    signal output paymentReliability;
    signal output savingsRateBand;
    signal output monthsOfHistory;
    signal output commitment;

    // ── INTERMEDIATE SIGNALS ─────────────────────────────────
    signal totalIncome;
    signal totalExpenses;
    signal totalSuccesses;
    signal totalFailures;
    signal totalSavings;
    signal activeMonths;

    // ── COMPONENTS ───────────────────────────────────────────
    component commitHasher = Poseidon(2);

    // ── STEP 1: Aggregate across all months ──────────────────
    var incomeSum    = 0;
    var expenseSum   = 0;
    var successSum   = 0;
    var failureSum   = 0;
    var savingsSum   = 0;
    var activeCount  = 0;

    for (var i = 0; i < N; i++) {
        incomeSum   += monthlyIncomes[i];
        expenseSum  += monthlyExpenses[i];
        successSum  += paymentSuccesses[i];
        failureSum  += paymentFailures[i];
        savingsSum  += monthlySavings[i];
        // Month is "active" if income > 0
        if (monthlyIncomes[i] > 0) {
            activeCount++;
        }
    }

    totalIncome    <== incomeSum;
    totalExpenses  <== expenseSum;
    totalSuccesses <== successSum;
    totalFailures  <== failureSum;
    totalSavings   <== savingsSum;
    activeMonths   <== activeCount;
    monthsOfHistory <== activeCount;

    // ── STEP 2: Payment reliability (0–100) ──────────────────
    // reliability = successfulPayments / totalPayments * 100
    // Stored as integer 0–100
    var totalPayments = successSum + failureSum;
    var reliability;
    if (totalPayments == 0) {
        reliability = 50; // Neutral if no payment history
    } else {
        reliability = (successSum * 100) / totalPayments;
    }
    paymentReliability <== reliability;

    // ── STEP 3: Income band ───────────────────────────────────
    // Based on average monthly income in KES (raw units, 2 decimals)
    // Thresholds: <10K=1, 10K-50K=2, 50K-150K=3, >150K=4
    var avgIncome;
    if (activeCount == 0) {
        avgIncome = 0;
    } else {
        avgIncome = incomeSum / activeCount;
    }

    var band;
    if (avgIncome < 1_000_000) {           // < KES 10,000
        band = 1;
    } else if (avgIncome < 5_000_000) {    // KES 10K–50K
        band = 2;
    } else if (avgIncome < 15_000_000) {   // KES 50K–150K
        band = 3;
    } else {                               // > KES 150K
        band = 4;
    }
    incomeBand <== band;

    // ── STEP 4: Savings rate band (1–5) ──────────────────────
    // Savings rate = avgSavings / avgIncome
    // 1=<5%, 2=5-10%, 3=10-20%, 4=20-30%, 5=>30%
    var savingsBand;
    if (avgIncome == 0) {
        savingsBand = 1;
    } else {
        var avgSavings = savingsSum / (activeCount == 0 ? 1 : activeCount);
        var savingsRate = (avgSavings * 100) / avgIncome;
        if (savingsRate < 5) {
            savingsBand = 1;
        } else if (savingsRate < 10) {
            savingsBand = 2;
        } else if (savingsRate < 20) {
            savingsBand = 3;
        } else if (savingsRate < 30) {
            savingsBand = 4;
        } else {
            savingsBand = 5;
        }
    }
    savingsRateBand <== savingsBand;

    // ── STEP 5: Compute credit score (300–850) ────────────────
    // Weighted formula:
    //   35% Payment reliability (0–100 → 0–297 points)
    //   30% Income consistency (income band 1–4 → 0–255 points)
    //   20% Savings discipline (savings band 1–5 → 0–170 points)
    //   15% History length (months 0–24 → 0–127 points)
    // Base: 300 (minimum score)
    var paymentPoints  = (reliability * 297) / 100;
    var incomePoints   = ((band - 1) * 255) / 3;
    var savingsPoints  = ((savingsBand - 1) * 170) / 4;
    var historyPoints  = (activeCount * 127) / N;

    var rawScore = 300 + paymentPoints + incomePoints + savingsPoints + historyPoints;

    // Cap at 850
    var finalScore;
    if (rawScore > 850) {
        finalScore = 850;
    } else {
        finalScore = rawScore;
    }
    creditScore <== finalScore;

    // ── STEP 6: Wallet commitment ─────────────────────────────
    // Ties this proof to a specific Solana wallet
    commitHasher.inputs[0] <== walletPubkey;
    commitHasher.inputs[1] <== nonce;
    commitment <== commitHasher.out;
}

// Instantiate with 24 months of history
component main {
    public [
        creditScore,
        incomeBand,
        paymentReliability,
        savingsRateBand,
        monthsOfHistory,
        commitment
    ]
} = MpesaCreditScore(24);
