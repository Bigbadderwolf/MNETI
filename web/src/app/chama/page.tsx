/**
 * MNETI Web Dashboard — Chama View
 * web/src/app/chama/page.tsx
 *
 * Member contributions, active proposals, rotation schedule.
 */

"use client";

import { useState } from "react";

const MNETI_CHAMA = {
  name: "MamaFund Nairobi", balance: 1_250_000, memberCount: 12,
  contributionAmt: 20_000, interval: "Weekly",
  nextRotation: { name: "Alice Wanjiku", position: 1, amount: 240_000 },
};

const MEMBERS = [
  { name: "Alice Wanjiku",  contributed: 480_000, joinDate: "Jan 2026", pos: 1,  active: true  },
  { name: "Betty Kamau",    contributed: 480_000, joinDate: "Jan 2026", pos: 2,  active: true  },
  { name: "Clara Mwangi",   contributed: 460_000, joinDate: "Jan 2026", pos: 3,  active: true  },
  { name: "Diana Odhiambo", contributed: 480_000, joinDate: "Jan 2026", pos: 4,  active: true  },
  { name: "Grace Njoroge",  contributed: 420_000, joinDate: "Feb 2026", pos: 5,  active: true  },
  { name: "Helen Mutua",    contributed: 480_000, joinDate: "Jan 2026", pos: 6,  active: false },
];

const PROPOSALS = [
  { id: 0, type: "Withdrawal",  amount: 100_000, for: 8, against: 2, total: 12, expires: "Apr 2 2026",  status: "passing" },
  { id: 1, type: "Add Member",  amount: 0,       for: 10, against: 0, total: 12, expires: "Apr 5 2026", status: "passing" },
  { id: 2, type: "Rule Change", amount: 0,       for: 4,  against: 3, total: 12, expires: "Apr 8 2026", status: "pending" },
];

const ROTATION = [
  { pos: 1, name: "Alice Wanjiku",   received: false, scheduled: "Apr 14 2026" },
  { pos: 2, name: "Betty Kamau",     received: false, scheduled: "Apr 21 2026" },
  { pos: 3, name: "Clara Mwangi",    received: false, scheduled: "Apr 28 2026" },
  { pos: 4, name: "Diana Odhiambo",  received: false, scheduled: "May 5 2026"  },
];

function formatKes(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}

export default function ChamaPage() {
  const [tab, setTab] = useState<"members" | "proposals" | "rotation">("members");

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">{MNETI_CHAMA.name}</h1>
          <p className="page-sub">{MNETI_CHAMA.memberCount} members · {MNETI_CHAMA.interval} contributions · {formatKes(MNETI_CHAMA.contributionAmt)}</p>
        </div>
        <div className="text-right">
          <p className="text-mneti-gray text-xs">Pool Balance</p>
          <p className="text-mneti-green text-2xl font-extrabold">{formatKes(MNETI_CHAMA.balance)}</p>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Rotation spotlight */}
        <div className="card border-mneti-green bg-mneti-green/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-mneti-gray mb-1">Next Rotation Payout</p>
              <p className="text-white text-xl font-bold">{MNETI_CHAMA.nextRotation.name}</p>
              <p className="text-mneti-green font-bold">{formatKes(MNETI_CHAMA.nextRotation.amount)}</p>
            </div>
            <button className="btn-primary text-sm px-6 py-3">Trigger Payout</button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-2">
          {(["members", "proposals", "rotation"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t ? "bg-mneti-green text-white" : "bg-mneti-card text-mneti-gray hover:text-white"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Members */}
        {tab === "members" && (
          <div className="card">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Member</th>
                  <th className="table-th">Joined</th>
                  <th className="table-th">Total Contributed</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {MEMBERS.map((m) => (
                  <tr key={m.pos}>
                    <td className="table-td text-mneti-gray">{m.pos}</td>
                    <td className="table-td text-white font-medium">{m.name}</td>
                    <td className="table-td text-mneti-gray text-xs">{m.joinDate}</td>
                    <td className="table-td text-mneti-green font-bold">{formatKes(m.contributed)}</td>
                    <td className="table-td">
                      <span className={m.active ? "badge-green" : "badge-gray"}>
                        {m.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn-outline w-full mt-4">+ Propose New Member</button>
          </div>
        )}

        {/* Proposals */}
        {tab === "proposals" && (
          <div className="space-y-4">
            {PROPOSALS.map((p) => {
              const pct = (p.for / p.total) * 100;
              return (
                <div key={p.id} className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white font-bold">{p.type}</p>
                      {p.amount > 0 && <p className="text-mneti-green font-bold">{formatKes(p.amount)}</p>}
                    </div>
                    <span className={p.status === "passing" ? "badge-green" : "badge-yellow"}>
                      {p.status === "passing" ? "Passing ✓" : "Pending"}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-mneti-border rounded-full mb-2">
                    <div className="h-2 bg-mneti-green rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-mneti-gray mb-3">
                    <span>{p.for} for · {p.against} against · {p.total} total</span>
                    <span>Expires: {p.expires}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1 text-xs py-2">✓ Vote For</button>
                    <button className="flex-1 text-xs py-2 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/20 transition-colors">
                      ✗ Vote Against
                    </button>
                    {p.status === "passing" && (
                      <button className="btn-outline flex-1 text-xs py-2">Execute</button>
                    )}
                  </div>
                </div>
              );
            })}
            <button className="btn-outline w-full">+ Create Proposal</button>
          </div>
        )}

        {/* Rotation Schedule */}
        {tab === "rotation" && (
          <div className="card">
            <h2 className="text-sm font-bold text-white mb-4">Rotation Queue</h2>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Position</th>
                  <th className="table-th">Member</th>
                  <th className="table-th">Scheduled</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {ROTATION.map((r) => (
                  <tr key={r.pos}>
                    <td className="table-td text-mneti-gray">#{r.pos}</td>
                    <td className="table-td text-white font-medium">{r.name}</td>
                    <td className="table-td text-mneti-gray text-sm">{r.scheduled}</td>
                    <td className="table-td">
                      <span className={r.received ? "badge-green" : r.pos === 1 ? "badge-yellow" : "badge-gray"}>
                        {r.received ? "Received" : r.pos === 1 ? "Next Up" : "Queued"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
