/**
 * MNETI Mobile — Vault Screen
 * app/src/screens/VaultScreen.tsx
 *
 * Manages: Individual savings vault, deposit/withdraw, savings goals, yield harvest.
 * Tabs: Individual | SME | NGO
 */

import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { useMnetiStore, selectWallet } from "../store";
import { initiateDeposit, initiateWithdrawal, formatKes, kesToKesh, validateSafaricomPhone } from "../services/mpesa/mpesa_service";

const MNETI_GREEN = "#00875A";
const MNETI_DARK  = "#0A0A0A";
const MNETI_CARD  = "#111827";
const MNETI_GRAY  = "#9CA3AF";

type VaultTab = "individual" | "sme" | "ngo";

// ─── Deposit Modal ────────────────────────────────────────────────────────────
function DepositModal({
  visible, onClose, walletPublicKey,
}: { visible: boolean; onClose: () => void; walletPublicKey: string }) {
  const [phone,  setPhone]  = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const { addNotification } = useMnetiStore();

  const handleDeposit = async () => {
    if (!validateSafaricomPhone(phone)) {
      Alert.alert("Invalid Phone", "Enter phone in format 2547XXXXXXXX");
      return;
    }
    const kes = parseFloat(amount);
    if (isNaN(kes) || kes < 50) {
      Alert.alert("Invalid Amount", "Minimum deposit is KES 50");
      return;
    }
    setLoading(true);
    try {
      const resp = await initiateDeposit({ walletPublicKey, phoneNumber: phone, amountKes: kes });
      addNotification({ type: "success", title: "STK Push Sent", message: `Check phone ${phone} for M-Pesa prompt` });
      onClose();
    } catch (err: any) {
      Alert.alert("Deposit Failed", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Deposit via M-Pesa</Text>
          <Text style={styles.label}>M-Pesa Phone</Text>
          <TextInput
            style={styles.input} value={phone} onChangeText={setPhone}
            placeholder="2547XXXXXXXX" placeholderTextColor={MNETI_GRAY}
            keyboardType="phone-pad"
          />
          <Text style={styles.label}>Amount (KES)</Text>
          <TextInput
            style={styles.input} value={amount} onChangeText={setAmount}
            placeholder="Min KES 50" placeholderTextColor={MNETI_GRAY}
            keyboardType="numeric"
          />
          <TouchableOpacity style={styles.btn} onPress={handleDeposit} disabled={loading}>
            <Text style={styles.btnText}>{loading ? "Sending STK Push..." : "Deposit"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Savings Goal Card ────────────────────────────────────────────────────────
function GoalCard({ name, current, target }: { name: string; current: number; target: number }) {
  const pct = Math.min((current / target) * 100, 100);
  return (
    <View style={styles.goalCard}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.goalName}>{name}</Text>
        <Text style={styles.goalPct}>{pct.toFixed(0)}%</Text>
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.goalAmts}>{formatKes(current)} / {formatKes(target)}</Text>
    </View>
  );
}

// ─── VaultScreen ─────────────────────────────────────────────────────────────
export default function VaultScreen(): React.JSX.Element {
  const wallet   = useMnetiStore(selectWallet);
  const vaults   = useMnetiStore((s) => s.vaults);
  const [tab, setTab]             = useState<VaultTab>("individual");
  const [showDeposit, setDeposit] = useState(false);

  const indVault = vaults.find((v) => v.vaultType === 0);
  const smeVault = vaults.find((v) => v.vaultType === 2);
  const ngoVault = vaults.find((v) => v.vaultType === 4);

  return (
    <View style={styles.root}>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(["individual", "sme", "ngo"] as VaultTab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabItem, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "individual" ? "Personal" : t === "sme" ? "Business" : "NGO"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll}>
        {tab === "individual" && (
          <>
            {/* Balance Card */}
            <View style={styles.balCard}>
              <Text style={styles.balLabel}>Individual Vault</Text>
              <Text style={styles.balAmt}>{formatKes(indVault?.balanceKesh ?? 0)}</Text>
              <Text style={styles.balSub}>
                Accrued Yield: {formatKes(indVault?.accruedYield ?? 0)} · APY 12%
              </Text>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setDeposit(true)}>
                  <Text style={styles.actionBtnText}>+ Deposit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnOutline]}>
                  <Text style={[styles.actionBtnText, { color: MNETI_GREEN }]}>Withdraw</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Savings Goals */}
            <Text style={styles.sectionTitle}>Savings Goals</Text>
            <GoalCard name="School Fees" current={25_000_00} target={50_000_00} />
            <GoalCard name="Emergency Fund" current={10_000_00} target={30_000_00} />

            <TouchableOpacity style={styles.addGoalBtn}>
              <Text style={styles.addGoalText}>+ Add Savings Goal</Text>
            </TouchableOpacity>
          </>
        )}

        {tab === "sme" && (
          <View style={styles.balCard}>
            <Text style={styles.balLabel}>Business Treasury</Text>
            <Text style={styles.balAmt}>{formatKes(smeVault?.balanceKesh ?? 0)}</Text>
            <View style={styles.reserveRow}>
              <View style={styles.reserveItem}>
                <Text style={styles.reserveLabel}>Payroll Reserve</Text>
                <Text style={styles.reserveValue}>KES 0</Text>
              </View>
              <View style={styles.reserveItem}>
                <Text style={styles.reserveLabel}>Tax Reserve (KRA)</Text>
                <Text style={styles.reserveValue}>KES 0</Text>
              </View>
              <View style={styles.reserveItem}>
                <Text style={styles.reserveLabel}>Operating</Text>
                <Text style={styles.reserveValue}>{formatKes(smeVault?.balanceKesh ?? 0)}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.btn} onPress={() => setDeposit(true)}>
              <Text style={styles.btnText}>Deposit</Text>
            </TouchableOpacity>
          </View>
        )}

        {tab === "ngo" && (
          <View style={styles.balCard}>
            <Text style={styles.balLabel}>Grant Vault</Text>
            <Text style={styles.balAmt}>{formatKes(ngoVault?.balanceKesh ?? 0)}</Text>
            <Text style={styles.balSub}>Conditional disbursement vault</Text>
            <View style={styles.milestoneRow}>
              <Text style={styles.milestoneTxt}>0 / 0 milestones completed</Text>
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <DepositModal
        visible={showDeposit}
        onClose={() => setDeposit(false)}
        walletPublicKey={wallet.publicKey ?? ""}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: MNETI_DARK, paddingTop: 52 },
  tabBar:         { flexDirection: "row", marginHorizontal: 16, backgroundColor: "#1F2937", borderRadius: 12, padding: 4, marginBottom: 8 },
  tabItem:        { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10 },
  tabActive:      { backgroundColor: MNETI_CARD },
  tabText:        { color: MNETI_GRAY, fontSize: 13, fontWeight: "600" },
  tabTextActive:  { color: "#fff" },
  scroll:         { flex: 1 },
  balCard:        { backgroundColor: MNETI_CARD, borderRadius: 20, margin: 16, padding: 20 },
  balLabel:       { color: MNETI_GRAY, fontSize: 13 },
  balAmt:         { color: "#fff", fontSize: 32, fontWeight: "800", marginVertical: 4 },
  balSub:         { color: MNETI_GRAY, fontSize: 12 },
  actionRow:      { flexDirection: "row", gap: 12, marginTop: 16 },
  actionBtn:      { flex: 1, backgroundColor: MNETI_GREEN, borderRadius: 12, padding: 12, alignItems: "center" },
  actionBtnOutline:{ backgroundColor: "transparent", borderWidth: 1, borderColor: MNETI_GREEN },
  actionBtnText:  { color: "#fff", fontWeight: "700" },
  sectionTitle:   { color: MNETI_GRAY, fontSize: 12, marginHorizontal: 16, marginBottom: 8, textTransform: "uppercase" },
  goalCard:       { backgroundColor: MNETI_CARD, borderRadius: 14, marginHorizontal: 16, marginBottom: 10, padding: 14 },
  goalName:       { color: "#fff", fontSize: 14, fontWeight: "600" },
  goalPct:        { color: MNETI_GREEN, fontSize: 14, fontWeight: "700" },
  progressBg:     { height: 6, backgroundColor: "#374151", borderRadius: 3, marginVertical: 8 },
  progressFill:   { height: 6, backgroundColor: MNETI_GREEN, borderRadius: 3 },
  goalAmts:       { color: MNETI_GRAY, fontSize: 11 },
  addGoalBtn:     { marginHorizontal: 16, borderWidth: 1, borderColor: MNETI_GREEN + "66", borderRadius: 14, padding: 14, alignItems: "center", borderStyle: "dashed" },
  addGoalText:    { color: MNETI_GREEN, fontWeight: "600" },
  reserveRow:     { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  reserveItem:    { alignItems: "center" },
  reserveLabel:   { color: MNETI_GRAY, fontSize: 10 },
  reserveValue:   { color: "#fff", fontSize: 14, fontWeight: "700" },
  milestoneRow:   { marginTop: 12 },
  milestoneTxt:   { color: MNETI_GRAY, fontSize: 13 },
  modalOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard:      { backgroundColor: MNETI_CARD, borderRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle:     { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 20 },
  label:          { color: MNETI_GRAY, fontSize: 12, marginBottom: 6 },
  input:          { backgroundColor: "#1F2937", borderRadius: 12, color: "#fff", padding: 14, marginBottom: 14, fontSize: 15 },
  btn:            { backgroundColor: MNETI_GREEN, borderRadius: 14, padding: 16, alignItems: "center", marginTop: 4 },
  btnText:        { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelBtn:      { padding: 14, alignItems: "center", marginTop: 8 },
  cancelText:     { color: MNETI_GRAY, fontSize: 14 },
});
