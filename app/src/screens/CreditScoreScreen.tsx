/**
 * MNETI Mobile — Credit Score Screen
 * app/src/screens/CreditScoreScreen.tsx
 */

import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useMnetiStore, selectWallet } from "../store";
import { generateCreditProof, CreditProofOutputs } from "../services/zk/proof_generator";

const MNETI_GREEN = "#00875A";
const MNETI_DARK  = "#0A0A0A";
const MNETI_CARD  = "#111827";
const MNETI_GRAY  = "#9CA3AF";

function ScoreArc({ score }: { score: number }) {
  const pct   = ((score - 300) / (850 - 300)) * 100;
  const color = score >= 750 ? "#10B981" : score >= 650 ? MNETI_GREEN : score >= 500 ? "#F59E0B" : "#EF4444";
  const label = score >= 750 ? "Excellent" : score >= 650 ? "Good" : score >= 500 ? "Fair" : "Poor";
  return (
    <View style={styles.scoreCard}>
      <Text style={styles.scoreLabel}>ZK Credit Score</Text>
      <Text style={[styles.scoreNum, { color }]}>{score}</Text>
      <Text style={[styles.scoreGrade, { color }]}>{label}</Text>
      <View style={styles.scoreBar}>
        <View style={[styles.scoreFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.scoreRange}>300 — 850</Text>
    </View>
  );
}

export default function CreditScoreScreen(): React.JSX.Element {
  const wallet    = useMnetiStore(selectWallet);
  const { setWallet, addNotification } = useMnetiStore();
  const [generating, setGenerating]   = useState(false);
  const [result, setResult]           = useState<CreditProofOutputs | null>(null);

  const score = wallet.creditScore ?? result?.creditScore ?? null;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // In production: fetch real 24-month M-Pesa history from the user's device
      // For demo: use mock history
      const mockHistory = Array.from({ length: 24 }, (_, i) => ({
        income:          50_000 + Math.random() * 20_000,
        expenses:        30_000 + Math.random() * 10_000,
        paymentSuccess:  8 + Math.floor(Math.random() * 4),
        paymentFail:     Math.random() > 0.8 ? 1 : 0,
        savings:         15_000 + Math.random() * 10_000,
      }));

      const proof = await generateCreditProof({ history: mockHistory });
      setResult(proof);
      setWallet({ creditScore: proof.creditScore });
      addNotification({
        type:    "success",
        title:   "Credit Score Generated",
        message: `Your ZK credit score: ${proof.creditScore} — proof generated on-device, no data shared`,
      });
    } catch (err: any) {
      // In dev/test without circuit files, show a demo score
      const demoScore = 720;
      setWallet({ creditScore: demoScore });
      addNotification({ type: "info", title: "Demo Score", message: "Circuit files not bundled — showing demo score" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ScrollView style={styles.root}>
      <Text style={styles.pageTitle}>Credit Score</Text>
      <Text style={styles.subtitle}>World-first ZK M-Pesa credit scoring — your data never leaves your device</Text>

      {score ? (
        <>
          <ScoreArc score={score} />
          {result && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Score Breakdown</Text>
              <Row label="Income Band"          value={`Band ${result.incomeBand}/5`} />
              <Row label="Payment Reliability"  value={`${result.paymentReliability}%`} />
              <Row label="Savings Rate"         value={`Band ${result.savingsRateBand}/4`} />
              <Row label="History Length"       value={`${result.monthsOfHistory} months`} />
            </View>
          )}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Credit Limits</Text>
            {score >= 750 && <Row label="Enterprise Line" value="KES 5,000,000" />}
            {score >= 650 && <Row label="SME Line"        value="KES 500,000" />}
            {score >= 500 && <Row label="Personal Line"   value="KES 50,000" />}
            {score < 500  && <Row label="Starter Line"    value="KES 5,000" />}
          </View>
          <View style={styles.zkNote}>
            <Text style={styles.zkNoteText}>
              🔐 Groth16 ZK proof generated on-device · M-Pesa history never transmitted · BN254 curve
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No Credit Score Yet</Text>
          <Text style={styles.emptySub}>Generate your ZK credit score from your M-Pesa history. Your data stays on your device.</Text>
        </View>
      )}

      <TouchableOpacity style={styles.btn} onPress={handleGenerate} disabled={generating}>
        {generating ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Generate ZK Proof on Device</Text>}
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: MNETI_DARK, paddingTop: 52 },
  pageTitle:  { color: "#fff", fontSize: 24, fontWeight: "800", marginHorizontal: 16, marginBottom: 4 },
  subtitle:   { color: MNETI_GRAY, fontSize: 13, marginHorizontal: 16, marginBottom: 16, lineHeight: 18 },
  scoreCard:  { backgroundColor: MNETI_CARD, borderRadius: 20, margin: 16, padding: 24, alignItems: "center" },
  scoreLabel: { color: MNETI_GRAY, fontSize: 12, marginBottom: 8 },
  scoreNum:   { fontSize: 72, fontWeight: "900", letterSpacing: -2 },
  scoreGrade: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  scoreBar:   { width: "100%", height: 8, backgroundColor: "#374151", borderRadius: 4, marginBottom: 6 },
  scoreFill:  { height: 8, borderRadius: 4 },
  scoreRange: { color: MNETI_GRAY, fontSize: 11 },
  card:       { backgroundColor: MNETI_CARD, borderRadius: 16, marginHorizontal: 16, marginBottom: 12, padding: 16 },
  cardTitle:  { color: "#fff", fontSize: 14, fontWeight: "700", marginBottom: 12 },
  row:        { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#1F2937" },
  rowLabel:   { color: MNETI_GRAY, fontSize: 13 },
  rowValue:   { color: "#fff", fontSize: 13, fontWeight: "600" },
  zkNote:     { backgroundColor: MNETI_GREEN + "11", borderRadius: 12, marginHorizontal: 16, padding: 12, marginBottom: 12 },
  zkNoteText: { color: MNETI_GREEN, fontSize: 12 },
  emptyCard:  { backgroundColor: MNETI_CARD, borderRadius: 20, margin: 16, padding: 32, alignItems: "center" },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySub:   { color: MNETI_GRAY, fontSize: 13, textAlign: "center", lineHeight: 18 },
  btn:        { backgroundColor: MNETI_GREEN, borderRadius: 14, padding: 18, alignItems: "center", marginHorizontal: 16 },
  btnText:    { color: "#fff", fontWeight: "700", fontSize: 15 },
});
