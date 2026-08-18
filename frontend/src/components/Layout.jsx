import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Shield, LayoutDashboard, Table2, Upload, ClipboardList, AlertTriangle } from "lucide-react";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard, testId: "nav-overview", exact: true },
  { to: "/queue", label: "Case Queue", icon: Table2, testId: "nav-queue" },
  { to: "/import-export", label: "Import / Export", icon: Upload, testId: "nav-import-export" },
  { to: "/audit", label: "Audit Log", icon: ClipboardList, testId: "nav-audit" },
];

export default function Layout({ children }) {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" data-testid="app-layout">
      <header
        className="sticky top-0 z-50 backdrop-blur-md bg-white/90 border-b border-slate-200"
        data-testid="app-header"
      >
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-[15px] font-bold text-slate-900 tracking-tight">
                DelDOT DMV Casework
              </div>
              <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">
                Out-of-State Tag Holder Review
              </div>
            </div>
          </div>

          <nav className="flex items-center gap-1" data-testid="main-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  data-testid={item.testId}
                  className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors duration-200 ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-medium text-emerald-800">System Operational</span>
            </div>
            <div className="text-right leading-tight">
              <div className="text-xs text-slate-500">Analyst</div>
              <div className="text-sm font-semibold text-slate-800 mono">analyst_demo</div>
            </div>
          </div>
        </div>
      </header>

      {/* Non-determinative disclaimer banner */}
      <div className="bg-amber-50 border-b border-amber-200" data-testid="disclaimer-banner">
        <div className="max-w-[1600px] mx-auto px-6 py-2 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <p className="text-[12px] leading-relaxed text-amber-900">
            <span className="font-semibold uppercase tracking-wider">Non-determinative decision support:</span>{" "}
            Probabilities and priority indicators shown here are triage assistance based on statistical models
            and phase evidence deltas. They do <span className="font-semibold">not</span> constitute automated
            legal, residency, tax, fee assessment, or enforcement actions. All decisions require human analyst
            validation per DelDOT DMV administrative policy.
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-6 py-6">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between text-xs text-slate-500">
          <div>
            © 2026 Delaware Department of Transportation — DMV Casework Division · Hackathon Prototype
          </div>
          <div className="mono">v0.1.0 · NSF-DARSE Deldot-DMV-team</div>
        </div>
      </footer>
    </div>
  );
}
