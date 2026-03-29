/**
 * MNETI Mobile — Chama Screen
 * app/src/screens/ChamaScreen.tsx
 *
 * Chama group savings: member list, contributions, proposals, votes, rotation payout.
 */

import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert,
} from "react-native";
import { formatKes } from "../services/mpesa/mpesa_service";

const MNETI_GREEN = "#00875A";
const MNETI_DARK  = "#0A0A0A";
const MNETI_CARD  = "#111827";
const MNETI_GRAY  = "#9CA3AF";

// ─── Mock data (replaced by on-chain fetch in production) ────────────────────
const MOCK_CHAMA = {
  name:             "MamaFund Nairobi",
  balance:          1_250_000_00, // KESH units
  memberCount:      12,
  nextRotation:     "Alice Wanjiku",
  rotationAmount:   100_000_00,
  contributionAmt:  20_000_00,
  interval:         "Weekly",
  proposals:        [
    { id: 0, type: "Withdraw", amount: 50_000_00, votesFor: 7, votesAgainst: 2, total: 12, expires: "2026-04-02" },
    { id: 1, type: "Add Member", amount: 0, votesFor: 10, votesAgainst: 0, total: 12, expires: "2026-04-05" },
  ],
  members: [
    { name: "Alice Wanjiku", contributed: 480_000_00, position: 0 },
    { name: "Betty Kamau",   contributed: 480_000_00, position: 1 },
    { name: "Clara Mwangi",  contributed: 480_000_00, position: 2 },
  ],
};

// ─── Proposal Card ────────────────────────────────────────────────────────────
function ProposalCard({ proposal, onVote }: { proposal: any; onVote: (id: number, vote: boolean) => void }) {
  const pct = ((proposal.votesFor / proposal.total) * 100).toFixed(0);
  const quorum = proposal.votesFor + proposal.votesAgainst;
  const passes = proposal.votesFor > proposal.votesAgainst && quorum > Math.floor(proposal.total / 2);
  return (
    <View style={styles.proposalCard}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={styles.proposalType}>{proposal.type}</Text>
        <Text style={[styles.proposalStatus, { color: passes ? "#10B981" : MNETI_GRAY }]}>
          {passes ? "Passing ✓" : "Pending"}
        </Text>
      </View>
      {proposal.amount > 0 && <Text style={styles.proposalAmt}>{formatKes(proposal.amount)}</Text>}
      <View style={styles.voteBar}>
        <View style={[styles.voteFor, { flex: proposal.votesFor }]} />
        <View style={[styles.voteAgainst, { flex: Math.max(proposal.votesAgainst, 0.01) }]} />
      </View>
      <Text style={styles.voteCount}>{proposal.votesFor} for · {proposal.votesAgainst} against · {proposal.total} members</Text>
      <Text style={styles.expiry}>Expires: {proposal.expires}</Text>
      <View style={styles.voteRow}>
        <TouchableOpacity style={styles.voteForBtn} onPress={() => onVote(proposal.id, true)}>
          <Text style={styles.voteBtnText}>✓ Vote For</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.voteAgainstBtn} onPress={() => onVote(proposal.id, false)}>
          <Text style={styles.voteBtnText}>✗ Against</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── ChamaScreen ─────────────────────────────────────────────────────────────
export default function ChamaScreen(): React.JSX.Element {
  const [tab, setTab]                 = useState<"overview" | "members" | "proposals">("overview");
  const [showContribute, setContrib]  = useState(false);
  const [amount, setAmount]           = useState("");

  const chama = MOCK_CHAMA;

  const handleVote = (proposalId: number, voteFor: boolean) => {
    Alert.alert("Vote Submitted", `You voted ${voteFor ? "FOR" : "AGAINST"} proposal #${proposalId}`);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.chamaName}>{chama.name}</Text>
        <Text style={styles.memberCount}>{chama.memberCount} Members</Text>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(["overview", "members", "proposals"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabItem, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll}>
        {/* Overview Tab */}
        {tab === "overview" && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Pool Balance</Text>
              <Text style={styles.bigAmt}>{formatKes(chama.balance)}</Text>
              <View style={styles.metaRow}>
                <View>
                  <Text style={styles.metaLabel}>Contribution</Text>
                  <Text style={styles.metaValue}>{formatKes(chama.contributionAmt)} / {chama.interval}</Text>
                </View>
                <View>
                  <Text style={styles.metaLabel}>Next Rotation</Text>
                  <Text style={[styles.metaValue, { color: MNETI_GREEN }]}>{chama.nextRotation}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>Rotation Payout</Text>
              <Text style={styles.bigAmt}>{formatKes(chama.rotationAmount)}</Text>
              <TouchableOpacity style={styles.btn}>
                <Text style={styles.btnText}>Trigger Rotation Payout</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.contributeBtn} onPress={() => setContrib(true)}>
              <Text style={styles.contributeBtnText}>+ Contribute Now</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Members Tab */}
        {tab === "members" && (
          <>
            {chama.members.map((m, i) => (
              <View key={i} style={styles.memberCard}>
                <View style={styles.memberPos}>
                  <Text style={styles.memberPosText}>#{m.position + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  <Text style={styles.memberContrib}>Total: {formatKes(m.contributed)}</Text>
                </View>
                {m.position === 0 && (
                  <View style={styles.nextBadge}>
                    <Text style={styles.nextBadgeText}>Next</Text>
                  </View>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addMemberBtn}>
              <Text style={styles.addMemberText}>+ Propose New Member</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Proposals Tab */}
        {tab === "proposals" && (
          <>
            {chama.proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} onVote={handleVote} />
            ))}
            <TouchableOpacity style={styles.addMemberBtn}>
              <Text style={styles.addMemberText}>+ Create Proposal</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Contribute Modal */}
      <Modal visible={showContribute} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Contribute to {chama.name}</Text>
            <Text style={styles.label}>Amount (KES)</Text>
            <TextInput
              style={styles.input} value={amount} onChangeText={setAmount}
              placeholder={`Recommended: ${formatKes(chama.contributionAmt)}`}
              placeholderTextColor={MNETI_GRAY} keyboardType="numeric"
            />
            <TouchableOpacity style={styles.btn}>
              <Text style={styles.btnText}>Contribute</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setContrib(false)} style={{ padding: 12, alignItems: "center" }}>
              <Text style={{ color: MNETI_GRAY }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1, backgroundColor: MNETI_DARK, paddingTop: 52 },
  header:          { paddingHorizontal: 16, paddingBottom: 8 },
  chamaName:       { color: "#fff", fontSize: 22, fontWeight: "800" },
  memberCount:     { color: MNETI_GRAY, fontSize: 13 },
  tabBar:          { flexDirection: "row", marginHorizontal: 16, backgroundColor: "#1F2937", borderRadius: 12, padding: 4, marginBottom: 8 },
  tabItem:         { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10 },
  tabActive:       { backgroundColor: MNETI_CARD },
  tabText:         { color: MNETI_GRAY, fontSize: 13, fontWeight: "600" },
  tabTextActive:   { color: "#fff" },
  scroll:          { flex: 1 },
  card:            { backgroundColor: MNETI_CARD, borderRadius: 16, margin: 16, marginBottom: 10, padding: 18 },
  cardLabel:       { color: MNETI_GRAY, fontSize: 12, marginBottom: 4 },
  bigAmt:          { color: "#fff", fontSize: 28, fontWeight: "800" },
  metaRow:         { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  metaLabel:       { color: MNETI_GRAY, fontSize: 11 },
  metaValue:       { color: "#fff", fontSize: 13, fontWeight: "600" },
  btn:             { backgroundColor: MNETI_GREEN, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 14 },
  btnText:         { color: "#fff", fontWeight: "700" },
  contributeBtn:   { marginHorizontal: 16, borderWidth: 1, borderColor: MNETI_GREEN, borderRadius: 14, padding: 14, alignItems: "center" },
  contributeBtnText:{ color: MNETI_GREEN, fontWeight: "700" },
  memberCard:      { flexDirection: "row", alignItems: "center", backgroundColor: MNETI_CARD, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 14 },
  memberPos:       { width: 32, height: 32, borderRadius: 16, backgroundColor: MNETI_GREEN + "22", alignItems: "center", justifyContent: "center", marginRight: 12 },
  memberPosText:   { color: MNETI_GREEN, fontWeight: "700", fontSize: 12 },
  memberName:      { color: "#fff", fontSize: 14, fontWeight: "600" },
  memberContrib:   { color: MNETI_GRAY, fontSize: 12 },
  nextBadge:       { backgroundColor: MNETI_GREEN + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  nextBadgeText:   { color: MNETI_GREEN, fontSize: 11, fontWeight: "700" },
  addMemberBtn:    { marginHorizontal: 16, borderWidth: 1, borderColor: MNETI_GREEN + "66", borderRadius: 14, padding: 14, alignItems: "center", borderStyle: "dashed", marginTop: 8 },
  addMemberText:   { color: MNETI_GREEN, fontWeight: "600" },
  proposalCard:    { backgroundColor: MNETI_CARD, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 16 },
  proposalType:    { color: "#fff", fontSize: 14, fontWeight: "700" },
  proposalStatus:  { fontSize: 12, fontWeight: "600" },
  proposalAmt:     { color: MNETI_GREEN, fontSize: 20, fontWeight: "800", marginBottom: 8 },
  voteBar:         { height: 8, borderRadius: 4, flexDirection: "row", overflow: "hidden", backgroundColor: "#1F2937", marginBottom: 6 },
  voteFor:         { backgroundColor: MNETI_GREEN },
  voteAgainst:     { backgroundColor: "#EF4444" },
  voteCount:       { color: MNETI_GRAY, fontSize: 12, marginBottom: 4 },
  expiry:          { color: MNETI_GRAY, fontSize: 11, marginBottom: 10 },
  voteRow:         { flexDirection: "row", gap: 10 },
  voteForBtn:      { flex: 1, backgroundColor: MNETI_GREEN, borderRadius: 10, padding: 10, alignItems: "center" },
  voteAgainstBtn:  { flex: 1, backgroundColor: "#EF4444", borderRadius: 10, padding: 10, alignItems: "center" },
  voteBtnText:     { color: "#fff", fontWeight: "700", fontSize: 13 },
  modalOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard:       { backgroundColor: MNETI_CARD, borderRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle:      { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 20 },
  label:           { color: MNETI_GRAY, fontSize: 12, marginBottom: 6 },
  input:           { backgroundColor: "#1F2937", borderRadius: 12, color: "#fff", padding: 14, marginBottom: 14 },
});
