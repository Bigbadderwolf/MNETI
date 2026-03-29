/**
 * MNETI Mobile — Home Screen
 * app/src/screens/HomeScreen.tsx
 *
 * Shows: KESH balance, APY, quick-action tiles, recent notifications, network status.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { useMnetiStore, selectWallet, selectVaults, selectNotifications } from "../store";
import { fetchKeshBalance } from "../services/blockchain/connection";
import { formatKes, keshToKes } from "../services/mpesa/mpesa_service";
import { PublicKey } from "@solana/web3.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const MNETI_GREEN = "#00875A";
const MNETI_DARK  = "#0A0A0A";
const MNETI_CARD  = "#111827";
const MNETI_GRAY  = "#9CA3AF";
const APY         = "12.00%";

// ─── Quick Action Tile ────────────────────────────────────────────────────────
function ActionTile({
  icon, label, onPress, color = MNETI_GREEN,
}: { icon: string; label: string; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity style={[styles.tile, { borderColor: color + "33" }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.tileIcon}>{icon}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Notification Row ─────────────────────────────────────────────────────────
function NotifRow({ title, message, type }: { title: string; message: string; type: string }) {
  const color = type === "success" ? "#10B981" : type === "error" ? "#EF4444" : MNETI_GRAY;
  return (
    <View style={styles.notifRow}>
      <View style={[styles.notifDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.notifTitle}>{title}</Text>
        <Text style={styles.notifMsg} numberOfLines={1}>{message}</Text>
      </View>
    </View>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: any): React.JSX.Element {
  const wallet        = useMnetiStore(selectWallet);
  const vaults        = useMnetiStore(selectVaults);
  const notifications = useMnetiStore(selectNotifications);
  const { setVaults, addNotification, isOnline } = useMnetiStore();

  const [keshBalance, setKeshBalance] = useState<number>(0);
  const [refreshing, setRefreshing]   = useState(false);
  const [loading, setLoading]         = useState(true);

  const totalVaultBalance = vaults.reduce((sum, v) => sum + v.balanceKesh, 0);
  const totalYield        = vaults.reduce((sum, v) => sum + v.accruedYield, 0);

  const loadBalances = useCallback(async () => {
    if (!wallet.publicKey) return;
    try {
      const bal = await fetchKeshBalance(new PublicKey(wallet.publicKey));
      setKeshBalance(bal);
    } catch {
      // offline — show cached
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBalances();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.root}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={MNETI_GREEN} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good day 👋</Text>
          <Text style={styles.walletAddr}>
            {wallet.publicKey?.slice(0, 6)}...{wallet.publicKey?.slice(-4)}
          </Text>
        </View>
        <View style={styles.networkBadge}>
          <View style={[styles.dot, { backgroundColor: isOnline ? "#10B981" : "#EF4444" }]} />
          <Text style={styles.networkText}>{isOnline ? "Online" : "Offline"}</Text>
        </View>
      </View>

      {/* KESH Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>KESH Balance</Text>
        {loading ? (
          <ActivityIndicator color={MNETI_GREEN} size="large" style={{ marginVertical: 8 }} />
        ) : (
          <Text style={styles.balanceAmount}>{formatKes(keshBalance * 100)}</Text>
        )}
        <View style={styles.apyRow}>
          <Text style={styles.apyLabel}>T-Bill APY</Text>
          <Text style={styles.apyValue}>{APY}</Text>
        </View>
      </View>

      {/* Vault Summary */}
      {totalVaultBalance > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vault Balance</Text>
          <Text style={styles.cardValue}>{formatKes(totalVaultBalance)}</Text>
          <Text style={styles.cardSub}>Accrued Yield: {formatKes(totalYield)}</Text>
        </View>
      )}

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.tileGrid}>
        <ActionTile icon="💰" label="Deposit"    onPress={() => navigation.navigate("Vault")} />
        <ActionTile icon="📤" label="Send"       onPress={() => navigation.navigate("Payments")} />
        <ActionTile icon="✈️" label="Send Abroad" onPress={() => navigation.navigate("Remittance")} />
        <ActionTile icon="👥" label="Chama"      onPress={() => navigation.navigate("Chama")} />
        <ActionTile icon="🔐" label="KYC"        onPress={() => navigation.navigate("More", { screen: "KYC" })} />
        <ActionTile icon="📊" label="Credit"     onPress={() => navigation.navigate("More", { screen: "CreditScore" })} />
      </View>

      {/* KYC Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>KYC Status</Text>
        <Text style={[styles.cardValue, { color: wallet.kycTier > 0 ? "#10B981" : "#F59E0B" }]}>
          {wallet.kycTier === 0 ? "Not Verified" :
           wallet.kycTier === 1 ? "Basic ✓" :
           wallet.kycTier === 2 ? "Enhanced ✓✓" : "Full ✓✓✓"}
        </Text>
        {wallet.creditScore && (
          <Text style={styles.cardSub}>Credit Score: {wallet.creditScore}</Text>
        )}
      </View>

      {/* Recent Notifications */}
      {notifications.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <View style={styles.card}>
            {notifications.slice(0, 3).map((n) => (
              <NotifRow key={n.id} title={n.title} message={n.message} type={n.type} />
            ))}
          </View>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: MNETI_DARK },
  header:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 56 },
  greeting:      { color: "#fff", fontSize: 20, fontWeight: "700" },
  walletAddr:    { color: MNETI_GRAY, fontSize: 12, marginTop: 2 },
  networkBadge:  { flexDirection: "row", alignItems: "center", backgroundColor: "#1F2937", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  dot:           { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  networkText:   { color: "#fff", fontSize: 12 },
  balanceCard:   { margin: 16, backgroundColor: MNETI_GREEN, borderRadius: 20, padding: 24 },
  balanceLabel:  { color: "rgba(255,255,255,0.8)", fontSize: 14, marginBottom: 4 },
  balanceAmount: { color: "#fff", fontSize: 36, fontWeight: "800", letterSpacing: -1 },
  apyRow:        { flexDirection: "row", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)" },
  apyLabel:      { color: "rgba(255,255,255,0.8)", fontSize: 13 },
  apyValue:      { color: "#fff", fontSize: 13, fontWeight: "700" },
  card:          { backgroundColor: MNETI_CARD, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12 },
  cardTitle:     { color: MNETI_GRAY, fontSize: 12, marginBottom: 4 },
  cardValue:     { color: "#fff", fontSize: 22, fontWeight: "700" },
  cardSub:       { color: MNETI_GRAY, fontSize: 12, marginTop: 4 },
  sectionTitle:  { color: MNETI_GRAY, fontSize: 12, fontWeight: "600", marginHorizontal: 16, marginTop: 8, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  tileGrid:      { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8, marginBottom: 12 },
  tile:          { width: "30%", backgroundColor: MNETI_CARD, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1 },
  tileIcon:      { fontSize: 24, marginBottom: 6 },
  tileLabel:     { color: "#fff", fontSize: 11, fontWeight: "600" },
  notifRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1F2937" },
  notifDot:      { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  notifTitle:    { color: "#fff", fontSize: 13, fontWeight: "600" },
  notifMsg:      { color: MNETI_GRAY, fontSize: 12 },
});
