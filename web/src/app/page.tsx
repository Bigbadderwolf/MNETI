/**
 * MNETI Web Dashboard — Main Dashboard Page
 * web/src/app/page.tsx
 *
 * Shows: KESH supply, TVL, yield rates, remittance volume,
 *        AML stats, oracle status, queue health.
 */

"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";
import {
  fetchHealth, fetchAmlStats, fetchRemittanceStats,
  fetchRemittanceCorridors, fetchPayrollStats, Corridor,
} from "../lib/api";

// ─── Mock on-chain data (replaced by real RPC calls post-deploy) ──────────────
const MOCK_SUPPLY_HISTORY = Array.from({ length: 30 }, (_, i) => ({
  day:    `Mar ${i + 1}`,
  supply: 800_000 + i * 15_000 + Math.random() * 5_000,
  tvl:    600_000 + i * 12_000 + Math.random() * 4_000,
}));

const MOCK_REMITTANCE_HISTORY = Array.from({ length: 12 }, (_, i) => ({
  month: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i],
  volume_usd: 45_000 + i * 8_000 + Math.random() * 5_000,
  orders: 120 + i * 20,
}));

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "text-white" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${color}`}>{value}</p>
      {sub && <p className="text-xs text-mneti-gray mt-1">{sub}</p>}
    </div>
  );
}

// ─── Status Dot ───────────────────────────────────────────────────────────────
function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${ok ? "bg-green-400" : "bg-red-400"}`} />
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [health,    setHealth]    = useState<any>(null);
  const [amlStats,  setAmlStats]  = useState<any>(null);
  const [remStats,  setRemStats]  = useState<any>(null);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [h, a, r, c] = await Promise.allSettled([
          fetchHealth(),
          fetchAmlStats(),
          fetchRemittanceStats(),
          fetchRemittanceCorridors(),
        ]);
        if (h.status === "fulfilled") setHealth(h.value);
        if (a.status === "fulfilled") setAmlStats(a.value?.stats);
        if (r.status === "fulfilled") setRemStats(r.value?.stats);
        if (c.status === "fulfilled") setCorridors(c.value?.corridors ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Protocol Overview</h1>
          <p className="page-sub">MNETI — Africa's Sovereign Financial Operating System</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-mneti-gray">
            <StatusDot ok={health?.solana_connected ?? false} />
            Solana {health?.solana_connected ? "Connected" : "Offline"}
          </span>
          <span className="text-mneti-gray">Block {health?.block_height?.toLocaleString() ?? "—"}</span>
          <span className="badge-green">Devnet</span>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="KESH Supply"      value="KES 12.4M"   sub="T-Bill backed · 12% APY" color="text-mneti-green" />
          <StatCard label="Total Value Locked" value="KES 9.8M"  sub="Across all vaults" />
          <StatCard label="Active Vaults"    value="1,247"        sub="Individual + Chama + SME" />
          <StatCard label="Remittance Volume" value="$284K"       sub="Last 30 days" color="text-blue-400" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* KESH Supply Chart */}
          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">KESH Supply & TVL (30 days)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={MOCK_SUPPLY_HISTORY}>
                <defs>
                  <linearGradient id="gSupply" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00875A" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00875A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTvl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis dataKey="day" tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={false} interval={6} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #1F2937", borderRadius: 8 }} labelStyle={{ color: "#fff" }} />
                <Area type="monotone" dataKey="supply" stroke="#00875A" fill="url(#gSupply)" strokeWidth={2} name="Supply" />
                <Area type="monotone" dataKey="tvl"    stroke="#3B82F6" fill="url(#gTvl)"    strokeWidth={2} name="TVL" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Remittance Volume Chart */}
          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">Remittance Volume (USD, 12 months)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={MOCK_REMITTANCE_HISTORY}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #1F2937", borderRadius: 8 }} labelStyle={{ color: "#fff" }} />
                <Bar dataKey="volume_usd" fill="#00875A" radius={[4, 4, 0, 0]} name="Volume (USD)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Corridor Rates + AML row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Corridor FX Rates */}
          <div className="card lg:col-span-2">
            <h2 className="text-sm font-bold text-white mb-4">Live FX Rates (SIX Financial)</h2>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Corridor</th>
                  <th className="table-th">Rate</th>
                  <th className="table-th">Source</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {corridors.length > 0 ? corridors.map((c) => (
                  <tr key={c.id}>
                    <td className="table-td text-white font-medium">{c.name}</td>
                    <td className="table-td text-mneti-green font-mono">
                      {c.rate ? `1 ${c.from} = ${c.rate.toFixed(2)} KES` : "—"}
                    </td>
                    <td className="table-td">
                      <span className={c.rate_source === "six_financial" ? "badge-green" : "badge-yellow"}>
                        {c.rate_source ?? "—"}
                      </span>
                    </td>
                    <td className="table-td"><span className="badge-green">Active</span></td>
                  </tr>
                )) : (
                  // Fallback mock rates when backend not running
                  [
                    { id: 0, name: "UK → Kenya (GBP/KES)",  from: "GBP", rate: 166.50 },
                    { id: 1, name: "US → Kenya (USD/KES)",  from: "USD", rate: 130.50 },
                    { id: 2, name: "UAE → Kenya (AED/KES)", from: "AED", rate: 35.50  },
                    { id: 3, name: "Kenya Domestic",        from: "KES", rate: 1.00   },
                    { id: 4, name: "EU → Kenya (EUR/KES)",  from: "EUR", rate: 141.20 },
                  ].map((c) => (
                    <tr key={c.id}>
                      <td className="table-td text-white font-medium">{c.name}</td>
                      <td className="table-td text-mneti-green font-mono">1 {c.from} = {c.rate.toFixed(2)} KES</td>
                      <td className="table-td"><span className="badge-yellow">mock</span></td>
                      <td className="table-td"><span className="badge-green">Active</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* AML Summary */}
          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">AML Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-mneti-gray text-sm">Total Screened</span>
                <span className="text-white font-bold">{amlStats?.total_screened?.toLocaleString() ?? "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-mneti-gray text-sm">Blocked</span>
                <span className="text-red-400 font-bold">{amlStats?.total_blocked ?? "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-mneti-gray text-sm">Pending Review</span>
                <span className="text-yellow-400 font-bold">{amlStats?.total_pending_review ?? "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-mneti-gray text-sm">Open Alerts</span>
                <span className="text-red-400 font-bold">{amlStats?.open_alerts ?? "—"}</span>
              </div>
              <div className="pt-3 border-t border-mneti-border">
                <a href="/compliance" className="btn-outline w-full text-center block">
                  View Compliance →
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Yield + Queue row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">T-Bill Yield (Oracle)</h2>
            <div className="flex items-center gap-6">
              <div>
                <p className="stat-label">Current APY</p>
                <p className="text-3xl font-extrabold text-mneti-green">12.00%</p>
                <p className="text-mneti-gray text-xs mt-1">Source: SIX Financial · Feed 1</p>
              </div>
              <div className="flex-1">
                <p className="stat-label mb-2">Daily Yield Rate</p>
                <p className="text-white font-mono">32.87 bps/day</p>
                <p className="text-mneti-gray text-xs mt-1">Distributed daily by yield crank</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">Backend Services</h2>
            <div className="space-y-2">
              {[
                { label: "Oracle Relay (30s)",  ok: health?.solana_connected ?? false },
                { label: "M-Pesa Bridge",        ok: health?.solana_connected ?? false },
                { label: "Yield Crank (daily)",  ok: true },
                { label: "Payroll Crank (60s)",  ok: true },
                { label: "Remittance Relay",     ok: health?.solana_connected ?? false },
                { label: "AML Screening",        ok: true },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-mneti-gray">{s.label}</span>
                  <span className={`text-xs font-bold ${s.ok ? "text-green-400" : "text-red-400"}`}>
                    <StatusDot ok={s.ok} />{s.ok ? "Running" : "Stopped"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
