/**
 * MNETI Web Dashboard — Remittance View
 * web/src/app/remittance/page.tsx
 */

"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fetchRemittanceCorridors, fetchRemittanceStats, Corridor } from "../../lib/api";

const MOCK_FX_HISTORY = Array.from({ length: 24 }, (_, i) => ({
  time:  `${String(i).padStart(2, "0")}:00`,
  usd:   130.0 + (Math.random() - 0.5) * 2,
  gbp:   166.0 + (Math.random() - 0.5) * 3,
}));

const MOCK_ORDERS = [
  { id: "ORD-001", sender: "8xKm...3fPq", recipient: "254712345678", corridor: "USD/KES", amount: "$250", kesh: "KES 32,250", status: "completed", ts: "2 min ago" },
  { id: "ORD-002", sender: "4Rtz...9mWq", recipient: "254722987654", corridor: "GBP/KES", amount: "£100", kesh: "KES 16,650", status: "completed", ts: "14 min ago" },
  { id: "ORD-003", sender: "2Vbn...7yXp", recipient: "254733112233", corridor: "AED/KES", amount: "AED 500", kesh: "KES 17,750", status: "processing",ts: "23 min ago" },
];

function formatKes(n: number) { return `KES ${n.toLocaleString("en-KE")}`; }

export default function RemittancePage() {
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [stats,     setStats]     = useState<any>(null);

  useEffect(() => {
    fetchRemittanceCorridors().then((r) => setCorridors(r?.corridors ?? [])).catch(() => {});
    fetchRemittanceStats().then((r) => setStats(r?.stats)).catch(() => {});
    const t = setInterval(() => {
      fetchRemittanceCorridors().then((r) => setCorridors(r?.corridors ?? [])).catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Remittance Corridor</h1>
        <p className="page-sub">Pan-African transfers · 0.30% flat fee · SIX Financial FX rates</p>
      </div>

      <div className="p-8 space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <p className="stat-label">Total Orders</p>
            <p className="stat-value">{stats?.total_orders ?? "—"}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Completed</p>
            <p className="stat-value text-mneti-green">{stats?.total_completed ?? "—"}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">USDC Volume</p>
            <p className="stat-value">{stats?.total_volume_usdc ? `$${(stats.total_volume_usdc / 1_000_000).toFixed(0)}K` : "—"}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Fees Collected</p>
            <p className="stat-value text-yellow-400">{stats?.total_fees_collected ? `$${(stats.total_fees_collected / 1_000_000).toFixed(0)}` : "—"}</p>
          </div>
        </div>

        {/* FX Chart + Corridor Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">FX Rate (24h)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={MOCK_FX_HISTORY}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis dataKey="time" tick={{ fill: "#9CA3AF", fontSize: 10 }} tickLine={false} interval={5} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 10 }} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #1F2937", borderRadius: 8 }} />
                <Line type="monotone" dataKey="usd" stroke="#00875A" strokeWidth={2} dot={false} name="USD/KES" />
                <Line type="monotone" dataKey="gbp" stroke="#3B82F6" strokeWidth={2} dot={false} name="GBP/KES" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">Corridor Rates</h2>
            <div className="space-y-3">
              {(corridors.length > 0 ? corridors : [
                { id: 1, name: "US → Kenya",  from: "USD", rate: 130.50, rate_source: "mock" },
                { id: 0, name: "UK → Kenya",  from: "GBP", rate: 166.50, rate_source: "mock" },
                { id: 2, name: "UAE → Kenya", from: "AED", rate: 35.50,  rate_source: "mock" },
                { id: 4, name: "EU → Kenya",  from: "EUR", rate: 141.20, rate_source: "mock" },
              ] as any[]).map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-mneti-border last:border-0">
                  <div>
                    <p className="text-white text-sm font-medium">{c.name}</p>
                    <p className="text-mneti-gray text-xs">{c.from} → KES</p>
                  </div>
                  <div className="text-right">
                    <p className="text-mneti-green font-bold font-mono">{c.rate?.toFixed(2)} KES</p>
                    <span className={c.rate_source === "six_financial" ? "badge-green" : "badge-yellow"}>
                      {c.rate_source ?? "mock"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="card">
          <h2 className="text-sm font-bold text-white mb-4">Recent Orders</h2>
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Order</th>
                <th className="table-th">Sender</th>
                <th className="table-th">Recipient</th>
                <th className="table-th">Corridor</th>
                <th className="table-th">Amount</th>
                <th className="table-th">KES</th>
                <th className="table-th">Status</th>
                <th className="table-th">Time</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_ORDERS.map((o) => (
                <tr key={o.id}>
                  <td className="table-td font-mono text-xs text-mneti-gray">{o.id}</td>
                  <td className="table-td font-mono text-xs text-white">{o.sender}</td>
                  <td className="table-td font-mono text-xs text-white">{o.recipient}</td>
                  <td className="table-td text-xs text-mneti-gray">{o.corridor}</td>
                  <td className="table-td text-white font-bold">{o.amount}</td>
                  <td className="table-td text-mneti-green font-bold">{o.kesh}</td>
                  <td className="table-td">
                    <span className={o.status === "completed" ? "badge-green" : "badge-yellow"}>
                      {o.status}
                    </span>
                  </td>
                  <td className="table-td text-mneti-gray text-xs">{o.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
