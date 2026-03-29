/**
 * MNETI Mobile — Settings Screen
 * app/src/screens/SettingsScreen.tsx
 */

import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Alert } from "react-native";
import { useMnetiStore, selectWallet, selectPrefs } from "../store";

const MNETI_GREEN = "#00875A";
const MNETI_DARK  = "#0A0A0A";
const MNETI_CARD  = "#111827";
const MNETI_GRAY  = "#9CA3AF";

function SettingRow({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export default function SettingsScreen(): React.JSX.Element {
  const wallet = useMnetiStore(selectWallet);
  const prefs  = useMnetiStore(selectPrefs);
  const { setPrefs, disconnectWallet } = useMnetiStore();

  const handleDisconnect = () => {
    Alert.alert("Disconnect Wallet", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: disconnectWallet },
    ]);
  };

  return (
    <ScrollView style={styles.root}>
      <Text style={styles.pageTitle}>Settings</Text>

      {/* Wallet */}
      <Text style={styles.sectionTitle}>Wallet</Text>
      <View style={styles.card}>
        <SettingRow label="Address" sub={wallet.publicKey ?? "Not connected"} right={null} />
        <SettingRow label="KYC Tier" sub={`Tier ${wallet.kycTier}`} right={null} />
        {wallet.creditScore && <SettingRow label="Credit Score" sub={String(wallet.creditScore)} right={null} />}
      </View>

      {/* Preferences */}
      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <SettingRow
          label="Dark Mode"
          right={<Switch value={prefs.darkMode} onValueChange={(v) => setPrefs({ darkMode: v })} trackColor={{ true: MNETI_GREEN }} />}
        />
        <SettingRow
          label="Biometrics"
          sub="Fingerprint / Face ID for transactions"
          right={<Switch value={prefs.biometrics} onValueChange={(v) => setPrefs({ biometrics: v })} trackColor={{ true: MNETI_GREEN }} />}
        />
        <SettingRow
          label="Push Notifications"
          right={<Switch value={prefs.pushNotifs} onValueChange={(v) => setPrefs({ pushNotifs: v })} trackColor={{ true: MNETI_GREEN }} />}
        />
        <SettingRow
          label="Currency"
          sub={prefs.currency}
          right={
            <TouchableOpacity onPress={() => {
              const next = prefs.currency === "KES" ? "USD" : prefs.currency === "USD" ? "GBP" : "KES";
              setPrefs({ currency: next });
            }}>
              <Text style={{ color: MNETI_GREEN, fontWeight: "700" }}>Change</Text>
            </TouchableOpacity>
          }
        />
        <SettingRow
          label="Language"
          sub={prefs.language === "en" ? "English" : "Kiswahili"}
          right={
            <TouchableOpacity onPress={() => setPrefs({ language: prefs.language === "en" ? "sw" : "en" })}>
              <Text style={{ color: MNETI_GREEN, fontWeight: "700" }}>Toggle</Text>
            </TouchableOpacity>
          }
        />
      </View>

      {/* Network */}
      <Text style={styles.sectionTitle}>Network</Text>
      <View style={styles.card}>
        <SettingRow label="RPC Endpoint" sub={__DEV__ ? "Devnet" : "Mainnet-Beta"} right={null} />
        <SettingRow label="Backend API" sub={__DEV__ ? "localhost:4000" : "api.mneti.io"} right={null} />
      </View>

      {/* About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <SettingRow label="Version" sub="1.0.0 (Phase 8)" right={null} />
        <SettingRow label="Protocol" sub="MNETI — StableHacks 2026" right={null} />
        <SettingRow label="Chain" sub="Solana · Anchor 0.30.1" right={null} />
      </View>

      {/* Disconnect */}
      <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
        <Text style={styles.disconnectText}>Disconnect Wallet</Text>
      </TouchableOpacity>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: MNETI_DARK, paddingTop: 52 },
  pageTitle:      { color: "#fff", fontSize: 24, fontWeight: "800", marginHorizontal: 16, marginBottom: 16 },
  sectionTitle:   { color: MNETI_GRAY, fontSize: 11, fontWeight: "600", marginHorizontal: 16, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  card:           { backgroundColor: MNETI_CARD, borderRadius: 16, marginHorizontal: 16, marginBottom: 16 },
  row:            { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#1F2937" },
  rowLabel:       { color: "#fff", fontSize: 14 },
  rowSub:         { color: MNETI_GRAY, fontSize: 12, marginTop: 2 },
  disconnectBtn:  { marginHorizontal: 16, backgroundColor: "#EF444422", borderWidth: 1, borderColor: "#EF4444", borderRadius: 14, padding: 16, alignItems: "center" },
  disconnectText: { color: "#EF4444", fontWeight: "700" },
});
