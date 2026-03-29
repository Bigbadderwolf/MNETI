/**
 * MNETI Web Dashboard — SME View
 * web/src/app/sme/page.tsx
 *
 * Treasury P&L, payroll manager, invoice tracker, tax reserve, PoBF AI score.
 */

"use client";

import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { quoteSupplierPayment } from "../../lib/api";

const MOCK_PNL = [
  { month: "Jan", inflow: 2_400_000, outflow: 1_800_000 },
  { month: "Feb", inflow: 2_800_000, outflow: 2_100_000 },
  { month: "Mar", inflow: 3_200_000, outflow: 2_300_000 },
];

const MOCK_INVOICES = [
  { ref: "INV-001", supplier: "Savanna Supplies",   amount: 150_000, condition: "None",    status: "ready"   },
  { ref: "INV-002", supplier: "Tech Parts Ltd",      amount: 80_000,  condition: "Date",    status: "pending" },
  { ref: "INV-003", supplier: "Cloud Services KE",   amount: 45_000,  condition: "Oracle",  status: "pending" },
];

const MOCK_PAYROLL = {
  schedule: "MNETI Payroll", recipients: 12, gross: 600_000,
  nextRun: "Apr 7 2026", lastRun: "Mar 31 2026",
};

function formatKes(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}

export default function SmePage() {
  const [quoteAmt, setQuoteAmt] = useState("");
  const [quote,    setQuote]    = useState<any>(null);
  const [pobfScore, setPobf]    = useState<number | null>(null);
  const [loading,  setLoading]  = useState(false);

  const handleQuote = async () => {
    const amt = parseInt(quoteAmt);
    if (!amt) return;
    try {
      const r = await quoteSupplierPayment(amt);
      setQuote(r?.quote);
    } catch {
      setQuote({ gross_amount_kesh: amt, fee_kesh: Math.floor(amt * 20 / 10000), net_amount_kesh: amt - Math.floor(amt * 20 / 10000), fee_pct: "0.20%", travel_rule_required: amt >= 13_000_000 });
    }
  };

  const handlePobf = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL?.replace("4000","8000") ?? "http://localhost:8000"}/api/pobf/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: "demo_sme_wallet", vault_balance: 3_200_000, months: 3 }),
      });
      const data = await res.json();
      setPobf(data?.pobf_score ?? 72);
    } catch {
      setPobf(72); // fallback demo score
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">SME Treasury</h1>
        <p className="page-sub">Business vault · Payroll · Supplier payments · AI credit scoring</p>
      </div>

      <div className="p-8 space-y-8">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <p className="stat-label">Treasury Balance</p>
            <p className="stat-value text-mneti-green">KES 3.2M</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Payroll Reserve</p>
            <p className="stat-value">KES 600K</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Tax Reserve (KRA)</p>
            <p className="stat-value">KES 320K</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Operating Balance</p>
            <p className="stat-value text-blue-400">KES 2.28M</p>
          </div>
        </div>

        {/* P&L Chart + Payroll */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card lg:col-span-2">
            <h2 className="text-sm font-bold text-white mb-4">Monthly Cash Flow (KES)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={MOCK_PNL}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={false} tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`} />
                <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #1F2937", borderRadius: 8 }} />
                <Bar dataKey="inflow"  fill="#00875A" radius={[4,4,0,0]} name="Inflow" />
                <Bar dataKey="outflow" fill="#3B82F6" radius={[4,4,0,0]} name="Outflow" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">Payroll Schedule</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-mneti-gray text-sm">Schedule</span>
                <span className="text-white text-sm font-medium">{MOCK_PAYROLL.schedule}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mneti-gray text-sm">Employees</span>
                <span className="text-white text-sm font-bold">{MOCK_PAYROLL.recipients}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mneti-gray text-sm">Monthly Gross</span>
                <span className="text-white text-sm font-bold">{formatKes(MOCK_PAYROLL.gross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mneti-gray text-sm">Next Run</span>
                <span className="text-mneti-green text-sm font-bold">{MOCK_PAYROLL.nextRun}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mneti-gray text-sm">Last Run</span>
                <span className="text-mneti-gray text-sm">{MOCK_PAYROLL.lastRun}</span>
              </div>
              <button className="btn-primary w-full mt-2">Run Payroll Now</button>
            </div>
          </div>
        </div>

        {/* Invoice Tracker + Supplier Quote */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">Invoice Tracker</h2>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Ref</th>
                  <th className="table-th">Supplier</th>
                  <th className="table-th">Amount</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_INVOICES.map((inv) => (
                  <tr key={inv.ref}>
                    <td className="table-td font-mono text-xs text-white">{inv.ref}</td>
                    <td className="table-td text-mneti-gray text-sm">{inv.supplier}</td>
                    <td className="table-td text-white font-medium">{formatKes(inv.amount)}</td>
                    <td className="table-td">
                      <span className={inv.status === "ready" ? "badge-green" : "badge-yellow"}>
                        {inv.status === "ready" ? "Ready" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn-outline w-full mt-4">+ New Supplier Payment</button>
          </div>

          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">Payment Fee Calculator</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-mneti-gray mb-1 block">Amount (KESH units)</label>
                <input
                  className="w-full bg-mneti-dark border border-mneti-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-mneti-green"
                  value={quoteAmt} onChange={(e) => setQuoteAmt(e.target.value)}
                  placeholder="e.g. 1500000 = KES 15,000" type="number"
                />
              </div>
              <button className="btn-primary w-full" onClick={handleQuote}>Get Quote</button>
              {quote && (
                <div className="bg-mneti-dark rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-mneti-gray">Gross</span>
                    <span className="text-white font-bold">{formatKes(quote.gross_amount_kesh / 100)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-mneti-gray">Fee ({quote.fee_pct})</span>
                    <span className="text-yellow-400">{formatKes(quote.fee_kesh / 100)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-mneti-border pt-2">
                    <span className="text-mneti-gray">Supplier Receives</span>
                    <span className="text-mneti-green font-bold">{formatKes(quote.net_amount_kesh / 100)}</span>
                  </div>
                  {quote.travel_rule_required && (
                    <p className="text-yellow-400 text-xs">⚠️ FATF Travel Rule applies — IVMS101 payload required</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PoBF AI Score */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">PoBF Score — AI Business Credit</h2>
              <p className="text-xs text-mneti-gray mt-1">
                TensorFlow Proof-of-Business-Finance model · Combines ZK credit + on-chain vault behaviour + industry risk
              </p>
            </div>
            <button className="btn-primary" onClick={handlePobf} disabled={loading}>
              {loading ? "Scoring..." : "Generate PoBF Score"}
            </button>
          </div>
          {pobfScore && (
            <div className="mt-4 flex items-center gap-6">
              <div className="text-center">
                <p className="text-5xl font-extrabold text-mneti-green">{pobfScore}</p>
                <p className="text-mneti-gray text-xs mt-1">/ 100</p>
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-mneti-gray">ZK Credit Score (40%)</span>
                    <span className="text-white">720/850</span>
                  </div>
                  <div className="h-2 bg-mneti-border rounded"><div className="h-2 bg-mneti-green rounded" style={{ width: "85%" }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-mneti-gray">Vault Behaviour (35%)</span>
                    <span className="text-white">Good</span>
                  </div>
                  <div className="h-2 bg-mneti-border rounded"><div className="h-2 bg-blue-400 rounded" style={{ width: "70%" }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-mneti-gray">Industry Risk (25%)</span>
                    <span className="text-white">Low</span>
                  </div>
                  <div className="h-2 bg-mneti-border rounded"><div className="h-2 bg-yellow-400 rounded" style={{ width: "60%" }} /></div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-mneti-gray text-xs">Recommended Credit Line</p>
                <p className="text-mneti-green font-bold text-lg">KES 500,000</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
