/**
 * MNETI Mobile — Remittance Screen
 * app/src/screens/RemittanceScreen.tsx
 *
 * Pan-African remittance: select corridor, enter amount, get FX quote, send.
 * 0.30% flat fee. Travel Rule auto-triggered for transfers >= KES 130,000.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from "react-native";
import { getRemittanceQuote, getRemittanceCorridors, validateSafaricomPhone, formatKes } from "../services/mpesa/mpesa_service";

const MNETI_GREEN = "#00875A";
const MNETI_DARK  = "#0A0A0A";
const MNETI_CARD  = "#111827";
const MNETI_GRAY  = "#9CA3AF";

const CORRIDORS = [
  { id: 0, from: "GBP", to: "KES", flag: "🇬🇧", label: "UK → Kenya" },
  { id: 1, from: "USD", to: "KES", flag: "🇺🇸", label: "US → Kenya" },
  { id: 2, from: "AED", to: "KES", flag: "🇦🇪", label: "UAE → Kenya" },
  { id: 3, from: "KES", to: "KES", flag: "🇰🇪", label: "Kenya → Kenya" },
  { id: 4, from: "EUR", to: "KES", flag: "🇪🇺", label: "EU → Kenya" },
];

// ─── Corridor Picker ──────────────────────────────────────────────────────────
function CorridorPicker({ selected, onSelect }: { selected: number; onSelect: (id: number) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
      {CORRIDORS.map((c) => (
        <TouchableOpacity
          key={c.id}
          style={[styles.corridorChip, selected === c.id && styles.corridorChipActive]}
          onPress={() => onSelect(c.id)}
        >
          <Text style={styles.corridorFlag}>{c.flag}</Text>
          <Text style={[styles.corridorLabel, selected === c.id && { color: "#fff" }]}>{c.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Quote Card ───────────────────────────────────────────────────────────────
function QuoteCard({ quote }: { quote: any }) {
  return (
    <View style={styles.quoteCard}>
      <View style={styles.quoteRow}>
        <Text style={styles.quoteLabel}>You send</Text>
        <Text style={styles.quoteValue}>{quote.source_amount.toFixed(2)} {quote.source_currency}</Text>
      </View>
      <View style={styles.quoteRow}>
        <Text style={styles.quoteLabel}>Fee (0.30%)</Text>
        <Text style={[styles.quoteValue, { color: "#F59E0B" }]}>
          {quote.fee_amount.toFixed(2)} {quote.source_currency}
        </Text>
      </View>
      <View style={styles.quoteDivider} />
      <View style={styles.quoteRow}>
        <Text style={styles.quoteLabel}>Recipient gets</Text>
        <Text style={[styles.quoteValue, { color: MNETI_GREEN, fontSize: 20, fontWeight: "800" }]}>
          {formatKes(quote.dest_amount_kesh)}
        </Text>
      </View>
      <View style={styles.quoteRow}>
        <Text style={styles.quoteLabel}>FX Rate</Text>
        <Text style={styles.quoteValue}>1 {quote.source_currency} = {quote.fx_rate.toFixed(2)} KES</Text>
      </View>
      {quote.travel_rule_required && (
        <View style={styles.trWarning}>
          <Text style={styles.trWarningText}>
            ⚠️ FATF Travel Rule applies (KES 130,000+). IVMS101 payload required.
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── RemittanceScreen ─────────────────────────────────────────────────────────
export default function RemittanceScreen(): React.JSX.Element {
  const [corridorId, setCorridorId]   = useState(1); // default USD
  const [amount, setAmount]           = useState("");
  const [recipientPhone, setPhone]    = useState("");
  const [recipientName, setName]      = useState("");
  const [memo, setMemo]               = useState("");
  const [quote, setQuote]             = useState<any>(null);
  const [loadingQuote, setLoadQuote]  = useState(false);
  const [sending, setSending]         = useState(false);

  const corridor = CORRIDORS.find((c) => c.id === corridorId)!;

  const fetchQuote = useCallback(async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setQuote(null); return; }
    setLoadQuote(true);
    try {
      const resp = await getRemittanceQuote(corridorId, amt);
      setQuote(resp?.quote ?? null);
    } catch {
      setQuote(null);
    } finally {
      setLoadQuote(false);
    }
  }, [corridorId, amount]);

  // Debounce quote fetch
  useEffect(() => {
    const t = setTimeout(fetchQuote, 800);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  const handleSend = async () => {
    if (!validateSafaricomPhone(recipientPhone)) {
      Alert.alert("Invalid Phone", "Format: 2547XXXXXXXX");
      return;
    }
    if (!recipientName.trim()) {
      Alert.alert("Required", "Recipient name is required for FATF compliance");
      return;
    }
    if (!quote) return;
    setSending(true);
    try {
      // In production: call create_remittance_order on-chain via SDK
      // then backend relay picks up the event and triggers M-Pesa B2C
      Alert.alert("Order Created", `Sending ${formatKes(quote.dest_amount_kesh)} to ${recipientPhone}`);
    } catch (err: any) {
      Alert.alert("Send Failed", err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={styles.root} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>Send Money</Text>

      {/* Corridor Picker */}
      <Text style={styles.sectionLabel}>Select Corridor</Text>
      <CorridorPicker selected={corridorId} onSelect={(id) => { setCorridorId(id); setQuote(null); }} />

      {/* Amount */}
      <Text style={styles.sectionLabel}>Amount ({corridor.from})</Text>
      <View style={styles.amountRow}>
        <Text style={styles.currencyPrefix}>{corridor.from}</Text>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={MNETI_GRAY}
          keyboardType="numeric"
        />
      </View>

      {/* Quote */}
      {loadingQuote && <ActivityIndicator color={MNETI_GREEN} style={{ margin: 16 }} />}
      {quote && <QuoteCard quote={quote} />}

      {/* Recipient Details */}
      <Text style={styles.sectionLabel}>Recipient Details</Text>
      <TextInput
        style={styles.input}
        value={recipientName}
        onChangeText={setName}
        placeholder="Full Legal Name (for compliance)"
        placeholderTextColor={MNETI_GRAY}
      />
      <TextInput
        style={styles.input}
        value={recipientPhone}
        onChangeText={setPhone}
        placeholder="M-Pesa Phone (2547XXXXXXXX)"
        placeholderTextColor={MNETI_GRAY}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        value={memo}
        onChangeText={setMemo}
        placeholder="Memo (optional)"
        placeholderTextColor={MNETI_GRAY}
      />

      {/* Send Button */}
      <TouchableOpacity
        style={[styles.sendBtn, (!quote || sending) && styles.sendBtnDisabled]}
        onPress={handleSend}
        disabled={!quote || sending}
      >
        <Text style={styles.sendBtnText}>
          {sending ? "Sending..." : `Send ${corridor.flag} → 🇰🇪`}
        </Text>
      </TouchableOpacity>

      {/* Fee Note */}
      <Text style={styles.feeNote}>0.30% flat fee · Powered by SIX Financial FX rates</Text>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1, backgroundColor: MNETI_DARK, paddingTop: 52 },
  pageTitle:       { color: "#fff", fontSize: 24, fontWeight: "800", marginHorizontal: 16, marginBottom: 16 },
  sectionLabel:    { color: MNETI_GRAY, fontSize: 12, fontWeight: "600", marginHorizontal: 16, marginBottom: 8, textTransform: "uppercase" },
  corridorChip:    { backgroundColor: MNETI_CARD, borderRadius: 14, padding: 12, marginLeft: 16, marginRight: 4, alignItems: "center", minWidth: 90 },
  corridorChipActive:{ backgroundColor: MNETI_GREEN },
  corridorFlag:    { fontSize: 22, marginBottom: 4 },
  corridorLabel:   { color: MNETI_GRAY, fontSize: 11, fontWeight: "600", textAlign: "center" },
  amountRow:       { flexDirection: "row", alignItems: "center", backgroundColor: MNETI_CARD, marginHorizontal: 16, borderRadius: 14, paddingHorizontal: 16, marginBottom: 12 },
  currencyPrefix:  { color: MNETI_GREEN, fontSize: 16, fontWeight: "700", marginRight: 8 },
  amountInput:     { flex: 1, color: "#fff", fontSize: 28, fontWeight: "700", paddingVertical: 16 },
  quoteCard:       { backgroundColor: MNETI_CARD, marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16 },
  quoteRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  quoteLabel:      { color: MNETI_GRAY, fontSize: 13 },
  quoteValue:      { color: "#fff", fontSize: 14, fontWeight: "600" },
  quoteDivider:    { height: 1, backgroundColor: "#374151", marginVertical: 8 },
  trWarning:       { backgroundColor: "#F59E0B22", borderRadius: 10, padding: 10, marginTop: 8 },
  trWarningText:   { color: "#F59E0B", fontSize: 12 },
  input:           { backgroundColor: MNETI_CARD, borderRadius: 14, color: "#fff", paddingHorizontal: 16, paddingVertical: 14, marginHorizontal: 16, marginBottom: 10, fontSize: 15 },
  sendBtn:         { backgroundColor: MNETI_GREEN, borderRadius: 14, padding: 18, alignItems: "center", marginHorizontal: 16, marginTop: 8 },
  sendBtnDisabled: { backgroundColor: MNETI_GREEN + "66" },
  sendBtnText:     { color: "#fff", fontSize: 16, fontWeight: "800" },
  feeNote:         { color: MNETI_GRAY, fontSize: 12, textAlign: "center", marginTop: 12 },
});
