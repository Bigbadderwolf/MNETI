/**
 * MNETI Web Dashboard — Compliance Officer View
 * web/src/app/compliance/page.tsx
 *
 * AML alerts, wallet screening history, risk scores, freeze/unfreeze controls.
 */

"use client";

import { useEffect, useState } from "react";
import {
  fetchAmlStats, fetchOpenAlerts, fetchWalletScreeningHistory,
  resolveAlert, screenWallet, AmlAlert, ScreeningResult,
} from "../../lib/api";

const SEVERITY_BADGE: Record<string, string> = {
  critical: "badge-red",
  high:     "badge-red",
  medium:   "badge-yellow",
  low:      "badge-gray",
};

const FLAG_LABELS: Record<string, string> = {
  ofac_hit:               "OFAC SDN",
  un_sanctions_hit:       "UN Sanctions",
  chainalysis_high_risk:  "Chainalysis KYT",
  structuring_suspected:  "Structuring",
  velocity_breach:        "Velocity",
  pep_match:              "PEP",
};

function AlertRow({ alert, onResolve }: { alert: AmlAlert; onResolve: (id: number) => void }) {
  const age = Math.floor((Date.now() / 1000 - alert.created_at) / 3600);
  return (
    <tr>
      <td className="table-td">
        <span className={SEVERITY_BADGE[alert.severity] ?? "badge-gray"}>
          {alert.severity.toUpperCase()}
        </span>
      </td>
      <td className="table-td font-mono text-xs text-white">
        {alert.wallet.slice(0, 8)}...{alert.wallet.slice(-6)}
      </td>
      <td className="table-td">
        <span className="badge-yellow">{FLAG_LABELS[alert.flag_type] ?? alert.flag_type}</span>
      </td>
      <td className="table-td text-mneti-gray text-xs max-w-xs truncate">{alert.detail}</td>
      <td className="table-td text-mneti-gray text-xs">{age}h ago</td>
      <td className="table-td">
        <button className="btn-outline text-xs px-3 py-1" onClick={() => onResolve(alert.id)}>
          Resolve
        </button>
      </td>
    </tr>
  );
}

export default function CompliancePage() {
  const [stats,   setStats]   = useState<any>(null);
  const [alerts,  setAlerts]  = useState<AmlAlert[]>([]);
  const [wallet,  setWallet]  = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [screenWal, setScreenWal] = useState("");
  const [screenAmt, setScreenAmt] = useState("");
  const [screenRes, setScreenRes] = useState<ScreeningResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [s, a] = await Promise.allSettled([fetchAmlStats(), fetchOpenAlerts(50)]);
    if (s.status === "fulfilled") setStats(s.value?.stats);
    if (a.status === "fulfilled") setAlerts(a.value?.alerts ?? []);
  };

  useEffect(() => { load(); }, []);

  const handleResolve = async (id: number) => {
    await resolveAlert(id, "compliance_officer");
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setStats((s: any) => s ? { ...s, open_alerts: Math.max(0, s.open_alerts - 1) } : s);
  };

  const handleLookup = async () => {
    if (!wallet.trim()) return;
    const res = await fetchWalletScreeningHistory(wallet.trim());
    setHistory(res?.history ?? []);
  };

  const handleScreen = async () => {
    if (!screenWal.trim() || !screenAmt.trim()) return;
    setLoading(true);
    try {
      const res = await screenWallet(screenWal.trim(), parseInt(screenAmt), "deposit");
      setScreenRes(res?.result ?? null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Compliance Dashboard</h1>
        <p className="page-sub">AML screening · Wallet risk · FATF compliance</p>
      </div>

      <div className="p-8 space-y-8">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <p className="stat-label">Total Screened</p>
            <p className="stat-value">{stats?.total_screened?.toLocaleString() ?? "—"}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Blocked</p>
            <p className="stat-value text-red-400">{stats?.total_blocked ?? "—"}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Pending Review</p>
            <p className="stat-value text-yellow-400">{stats?.total_pending_review ?? "—"}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Open Alerts</p>
            <p className="stat-value text-red-400">{stats?.open_alerts ?? "—"}</p>
          </div>
        </div>

        {/* Open Alerts Table */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Open AML Alerts</h2>
            <button className="btn-outline text-xs" onClick={load}>Refresh</button>
          </div>
          {alerts.length === 0 ? (
            <p className="text-mneti-gray text-sm text-center py-8">No open alerts 🎉</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Severity</th>
                  <th className="table-th">Wallet</th>
                  <th className="table-th">Flag</th>
                  <th className="table-th">Detail</th>
                  <th className="table-th">Age</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <AlertRow key={a.id} alert={a} onResolve={handleResolve} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Manual Screen + Wallet Lookup */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Manual Screen */}
          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">Screen Wallet</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-mneti-gray mb-1 block">Wallet Address</label>
                <input
                  className="w-full bg-mneti-dark border border-mneti-border rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-mneti-green"
                  value={screenWal} onChange={(e) => setScreenWal(e.target.value)}
                  placeholder="Solana public key (base58)"
                />
              </div>
              <div>
                <label className="text-xs text-mneti-gray mb-1 block">Amount (KESH units)</label>
                <input
                  className="w-full bg-mneti-dark border border-mneti-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-mneti-green"
                  value={screenAmt} onChange={(e) => setScreenAmt(e.target.value)}
                  placeholder="e.g. 50000 = KES 500"
                  type="number"
                />
              </div>
              <button className="btn-primary w-full" onClick={handleScreen} disabled={loading}>
                {loading ? "Screening..." : "Run AML Screen"}
              </button>
              {screenRes && (
                <div className={`rounded-lg p-3 mt-2 ${screenRes.passed ? "bg-green-900/20 border border-green-800" : "bg-red-900/20 border border-red-800"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-bold text-sm ${screenRes.passed ? "text-green-400" : "text-red-400"}`}>
                      {screenRes.passed ? "✅ PASSED" : "❌ BLOCKED"}
                    </span>
                    <span className="text-mneti-gray text-xs">Risk: {screenRes.risk_score}/100</span>
                  </div>
                  {screenRes.flags.map((f, i) => (
                    <div key={i} className="text-xs text-mneti-gray mt-1">
                      <span className={SEVERITY_BADGE[f.severity]}>{f.severity}</span> {f.detail}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Wallet History Lookup */}
          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">Wallet History Lookup</h2>
            <div className="flex gap-2 mb-4">
              <input
                className="flex-1 bg-mneti-dark border border-mneti-border rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-mneti-green"
                value={wallet} onChange={(e) => setWallet(e.target.value)}
                placeholder="Wallet public key"
              />
              <button className="btn-primary" onClick={handleLookup}>Lookup</button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {history.map((h: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-mneti-border">
                  <div>
                    <span className={h.passed ? "badge-green" : "badge-red"}>{h.passed ? "PASS" : "BLOCK"}</span>
                    <span className="text-xs text-mneti-gray ml-2">{h.tx_type}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white">Risk: {h.risk_score}</p>
                    <p className="text-xs text-mneti-gray">{new Date(h.screened_at * 1000).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {history.length === 0 && wallet && (
                <p className="text-mneti-gray text-sm text-center py-4">No history found</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
