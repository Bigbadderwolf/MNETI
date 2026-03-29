/**
 * MNETI Mobile — Payments Screen
 * app/src/screens/PaymentsScreen.tsx
 *
 * Programmable Payments: payroll runs, recurring bills, supplier payments, conditional grants.
 */

import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
} from "react-native";
import { formatKes } from "../services/mpesa/mpesa_service";

const MNETI_GREEN = "#00875A";
const MNETI_DARK  = "#0A0A0A";
const MNETI_CARD  = "#111827";
const MNETI_GRAY  = "#9CA3AF";

type PayTab = "payroll" | "recurring" | "supplier" | "grants";

const MOCK_PAYROLL = {
  name:        "MNETI Payroll",
  nextRun:     "2026-04-07",
  recipients:  5,
  totalGross:  250_000_00,
};

const MOCK_RECURRING = [
  { memo: "Office Rent", amount: 50_000_00, interval: "Monthly", nextRun: "2026-04-01", status: "active" },
  { memo: "Internet Bill", amount: 8_000_00, interval: "Monthly", nextRun: "2026-04-03", status: "active" },
];

const MOCK_SUPPLIER = [
  { supplier: "Savanna Supplies", ref: "INV-001", amount: 150_000_00, status: "pending_condition", condition: "Date: Apr 15 2026" },
  { supplier: "Tech Parts Ltd", ref: "INV-002", amount: 80_000_00, status: "active", condition: "None (ready)" },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    active:            { color: "#10B981", label: "Ready" },
    pending_condition: { color: "#F59E0B", label: "Pending Condition" },
    completed:         { color: MNETI_GRAY, label: "Completed" },
    cancelled:         { color: "#EF4444", label: "Cancelled" },
  };
  const s = map[status] ?? { color: MNETI_GRAY, label: status };
  return (
    <View style={[styles.badge, { backgroundColor: s.color + "22" }]}>
      <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

export default function PaymentsScreen(): React.JSX.Element {
  const [tab, setTab] = useState<PayTab>("payroll");
  const [showNew, setShowNew] = useState(false);

  return (
    <View style={styles.root}>
      <Text style={styles.pageTitle}>Payments</Text>

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        {(["payroll", "recurring", "supplier", "grants"] as PayTab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabChip, tab === t && styles.tabChipActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabChipText, tab === t && styles.tabChipTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll}>
        {/* Payroll */}
        {tab === "payroll" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Current Schedule</Text>
              <Text style={styles.cardTitle}>{MOCK_PAYROLL.name}</Text>
              <View style={styles.metaRow}>
                <View>
                  <Text style={styles.metaLabel}>Next Run</Text>
                  <Text style={styles.metaValue}>{MOCK_PAYROLL.nextRun}</Text>
                </View>
                <View>
                  <Text style={styles.metaLabel}>Recipients</Text>
                  <Text style={styles.metaValue}>{MOCK_PAYROLL.recipients}</Text>
                </View>
                <View>
                  <Text style={styles.metaLabel}>Total Gross</Text>
                  <Text style={styles.metaValue}>{formatKes(MOCK_PAYROLL.totalGross)}</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Run Payroll Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowNew(true)}>
              <Text style={styles.secondaryBtnText}>+ Add Employee</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Recurring */}
        {tab === "recurring" && (
          <>
            {MOCK_RECURRING.map((r, i) => (
              <View key={i} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{r.memo}</Text>
                    <Text style={styles.cardSub}>{r.interval} · Next: {r.nextRun}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.amtText}>{formatKes(r.amount)}</Text>
                    <StatusBadge status={r.status} />
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.smBtn}><Text style={styles.smBtnText}>Pause</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.smBtn, styles.smBtnRed]}><Text style={[styles.smBtnText, { color: "#EF4444" }]}>Cancel</Text></TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowNew(true)}>
              <Text style={styles.secondaryBtnText}>+ New Recurring Payment</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Supplier */}
        {tab === "supplier" && (
          <>
            {MOCK_SUPPLIER.map((s, i) => (
              <View key={i} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{s.supplier}</Text>
                    <Text style={styles.cardSub}>Ref: {s.ref}</Text>
                    <Text style={styles.conditionText}>Condition: {s.condition}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.amtText}>{formatKes(s.amount)}</Text>
                    <StatusBadge status={s.status} />
                  </View>
                </View>
                {s.status === "active" && (
                  <TouchableOpacity style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnText}>Release Payment</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowNew(true)}>
              <Text style={styles.secondaryBtnText}>+ Create Supplier Payment</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Grants */}
        {tab === "grants" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Conditional Grants</Text>
            <Text style={styles.cardSub}>NGO and government conditional disbursements</Text>
            <TouchableOpacity style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>View Active Grants</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: MNETI_DARK, paddingTop: 52 },
  pageTitle:      { color: "#fff", fontSize: 24, fontWeight: "800", marginHorizontal: 16, marginBottom: 12 },
  tabScroll:      { flexGrow: 0, paddingLeft: 16, marginBottom: 8 },
  tabChip:        { backgroundColor: MNETI_CARD, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 },
  tabChipActive:  { backgroundColor: MNETI_GREEN },
  tabChipText:    { color: MNETI_GRAY, fontSize: 13, fontWeight: "600" },
  tabChipTextActive:{ color: "#fff" },
  scroll:         { flex: 1 },
  card:           { backgroundColor: MNETI_CARD, borderRadius: 16, marginHorizontal: 16, marginBottom: 12, padding: 16 },
  cardRow:        { flexDirection: "row", alignItems: "flex-start" },
  cardLabel:      { color: MNETI_GRAY, fontSize: 11, marginBottom: 4 },
  cardTitle:      { color: "#fff", fontSize: 15, fontWeight: "700" },
  cardSub:        { color: MNETI_GRAY, fontSize: 12, marginTop: 2 },
  conditionText:  { color: "#F59E0B", fontSize: 12, marginTop: 4 },
  amtText:        { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 4 },
  metaRow:        { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  metaLabel:      { color: MNETI_GRAY, fontSize: 11 },
  metaValue:      { color: "#fff", fontSize: 13, fontWeight: "600" },
  badge:          { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:      { fontSize: 11, fontWeight: "700" },
  cardActions:    { flexDirection: "row", gap: 10, marginTop: 12 },
  smBtn:          { flex: 1, borderWidth: 1, borderColor: "#374151", borderRadius: 10, padding: 9, alignItems: "center" },
  smBtnRed:       { borderColor: "#EF4444" + "44" },
  smBtnText:      { color: MNETI_GRAY, fontSize: 13, fontWeight: "600" },
  primaryBtn:     { backgroundColor: MNETI_GREEN, borderRadius: 12, padding: 14, alignItems: "center", marginHorizontal: 16, marginBottom: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  secondaryBtn:   { borderWidth: 1, borderColor: MNETI_GREEN + "66", borderRadius: 12, padding: 14, alignItems: "center", marginHorizontal: 16, marginBottom: 12, borderStyle: "dashed" },
  secondaryBtnText:{ color: MNETI_GREEN, fontWeight: "600" },
});
