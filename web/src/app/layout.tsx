/**
 * MNETI Web Dashboard — Root Layout
 * web/src/app/layout.tsx
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title:       "MNETI Protocol — Dashboard",
  description: "Africa's Sovereign Financial Operating System",
};

const NAV_ITEMS = [
  { href: "/",            icon: "📊", label: "Dashboard"   },
  { href: "/sme",         icon: "🏢", label: "SME"         },
  { href: "/chama",       icon: "👥", label: "Chama"       },
  { href: "/remittance",  icon: "✈️", label: "Remittance"  },
  { href: "/compliance",  icon: "🔐", label: "Compliance"  },
  { href: "/admin",       icon: "⚙️", label: "Admin"       },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-mneti-dark text-white min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-56 bg-mneti-card border-r border-mneti-border flex flex-col fixed h-full z-10">
          {/* Logo */}
          <div className="p-6 border-b border-mneti-border">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌍</span>
              <div>
                <p className="font-bold text-white text-sm">MNETI</p>
                <p className="text-mneti-gray text-xs">Protocol Dashboard</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-4 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-mneti-gray hover:text-white hover:bg-mneti-border transition-colors text-sm font-medium"
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-mneti-border">
            <p className="text-mneti-gray text-xs">StableHacks 2026</p>
            <p className="text-mneti-gray text-xs">Anchor 0.30.1 · Solana</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 ml-56 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
