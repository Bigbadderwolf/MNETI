/**
 * MNETI Web Dashboard — Admin View
 * web/src/app/admin/page.tsx
 *
 * Protocol statistics, program IDs, VASP registry, oracle status.
 */

"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "../../lib/api";

const PROGRAM_IDS = [
  { name: "mneti-rbac",           id: "6YxDrhp2pwSTmPWdPuCobwTvtrB3YuivKRdc1A7ypFLB", phase: 1 },
  { name: "mneti-vault-registry", id: "GirQCGWXDnhLC6KZxEGuFmY38nZMfVWTg7L8QgFU9Yhp", phase: 1 },
  { name: "mneti-kesh",           id: "AuTWVK7aWU1RZ2fESWmaWX1oPExAtqNMmJ8m8TerXXMR", phase: 1 },
  { name: "mneti-oracle",         id: "4XQ2yp1pxQsypbAQposX1a8jLzFZFbjar28Sf7ruiSRU", phase: 2 },
  { name: "mneti-compliance",     id: "PLACEHOLDER_COMPLIANCE",                          phase: 3 },
  { name: "mneti-vault",          id: "Vau1tSMARTmneti5Ph4seXXXXXXXXXXXXXXXXXXXXXX",  phase: 5 },
  { name: "mneti-payments",       id: "PAY6mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",  phase: 6 },
  { name: "mneti-travel-rule",    id: "TRL6mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",  phase: 6 },
  { name: "mneti-remittance",     id: "REM7mnetiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",  phase: 7 },
];

const ORACLE_FEEDS = [
  { index: 0, name: "KES/USD",     value: "130.50",  unit: "KES per USD × 1M", age: "28s" },
  { index: 1, name: "T-Bill Yield",value: "1200 bps", unit: "12.00% APY",       age: "28s" },
  { index: 2, name: "XAU/USD",     value: "2,180.00", unit: "USD per Troy oz",  age: "28s" },
];

export default function AdminPage() {
  const [health, setHealth] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {});
    const t = setInterval(() => fetchHealth().then(setHealth).catch(() => {}), 15_000);
    return () => clearInterval(t);
  }, []);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Protocol Admin</h1>
          <p className="page-sub">Program IDs · Oracle feeds · VASP registry · Network status</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold ${health?.solana_connected ? "text-green-400" : "text-red-400"}`}>
            ● {health?.solana_connected ? "Solana Connected" : "Solana Offline"}
          </span>
          {health?.block_height && (
            <span className="badge-gray">Block {health.block_height.toLocaleString()}</span>
          )}
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Program IDs */}
        <div className="card">
          <h2 className="text-sm font-bold text-white mb-4">Deployed Programs (9 total)</h2>
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Phase</th>
                <th className="table-th">Program</th>
                <th className="table-th">Program ID</th>
                <th className="table-th">Action</th>
              </tr>
            </thead>
            <tbody>
              {PROGRAM_IDS.map((p) => (
                <tr key={p.name}>
                  <td className="table-td">
                    <span className="badge-gray">P{p.phase}</span>
                  </td>
                  <td className="table-td text-white font-mono text-xs">{p.name}</td>
                  <td className="table-td font-mono text-xs text-mneti-gray">
                    {p.id.includes("XXX") ? (
                      <span className="badge-yellow">Placeholder — update after deploy</span>
                    ) : (
                      `${p.id.slice(0, 12)}...${p.id.slice(-8)}`
                    )}
                  </td>
                  <td className="table-td">
                    {!p.id.includes("XXX") && (
                      <button
                        className="text-xs text-mneti-green hover:underline"
                        onClick={() => copy(p.id, p.name)}
                      >
                        {copied === p.name ? "Copied!" : "Copy"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Oracle Feeds */}
        <div className="card">
          <h2 className="text-sm font-bold text-white mb-4">Oracle Feeds (mneti-oracle)</h2>
          <div className="grid grid-cols-3 gap-4">
            {ORACLE_FEEDS.map((f) => (
              <div key={f.index} className="bg-mneti-dark rounded-xl p-4 border border-mneti-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge-gray">Feed {f.index}</span>
                  <span className="text-xs text-green-400">● {f.age} ago</span>
                </div>
                <p className="text-mneti-gray text-xs mb-1">{f.name}</p>
                <p className="text-white text-xl font-extrabold font-mono">{f.value}</p>
                <p className="text-mneti-gray text-xs mt-1">{f.unit}</p>
              </div>
            ))}
          </div>
        </div>

        {/* VASP Registry */}
        <div className="card">
          <h2 className="text-sm font-bold text-white mb-4">VASP Registry (mneti-travel-rule)</h2>
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">VASP</th>
                <th className="table-th">Jurisdiction</th>
                <th className="table-th">DID</th>
                <th className="table-th">Originator</th>
                <th className="table-th">Beneficiary</th>
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "MNETI Kenya",   jurisdiction: "KE", did: "did:mneti:ke:safaricom", orig: true, benef: true  },
                { name: "MNETI UK",      jurisdiction: "GB", did: "did:mneti:gb:monzo",     orig: false, benef: true  },
                { name: "MNETI UAE",     jurisdiction: "AE", did: "did:mneti:ae:exchange",  orig: false, benef: true  },
              ].map((v) => (
                <tr key={v.name}>
                  <td className="table-td text-white font-medium">{v.name}</td>
                  <td className="table-td"><span className="badge-gray">{v.jurisdiction}</span></td>
                  <td className="table-td font-mono text-xs text-mneti-gray">{v.did}</td>
                  <td className="table-td text-center">{v.orig ? "✅" : "—"}</td>
                  <td className="table-td text-center">{v.benef ? "✅" : "—"}</td>
                  <td className="table-td"><span className="badge-green">Active</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Backend Health */}
        <div className="card">
          <h2 className="text-sm font-bold text-white mb-4">Backend Health</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-mneti-dark rounded-xl p-4 border border-mneti-border">
              <p className="text-mneti-gray text-xs mb-2">Solana RPC</p>
              <p className={`font-bold ${health?.solana_connected ? "text-green-400" : "text-red-400"}`}>
                {health?.solana_connected ? "● Connected" : "● Offline"}
              </p>
              {health?.block_height && <p className="text-xs text-mneti-gray mt-1">Block {health.block_height.toLocaleString()}</p>}
            </div>
            <div className="bg-mneti-dark rounded-xl p-4 border border-mneti-border">
              <p className="text-mneti-gray text-xs mb-2">M-Pesa Queue</p>
              <p className="text-white font-bold">{health?.queue_stats?.pending ?? "—"} pending</p>
              <p className="text-xs text-mneti-gray mt-1">{health?.queue_stats?.completed ?? "—"} completed</p>
            </div>
            <div className="bg-mneti-dark rounded-xl p-4 border border-mneti-border">
              <p className="text-mneti-gray text-xs mb-2">API Version</p>
              <p className="text-white font-bold font-mono">{health?.version ?? "—"}</p>
              <p className="text-xs text-mneti-gray mt-1">Phase 8 — StableHacks 2026</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
