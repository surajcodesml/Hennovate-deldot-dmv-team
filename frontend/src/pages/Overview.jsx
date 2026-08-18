import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchStats, fetchCases, CLASSIFICATIONS, priorityBand } from "../lib/api";
import { AlertTriangle, TrendingUp, MapPin, Activity, ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

function StatCard({ label, value, sub, accent, testId }) {
  return (
    <div
      className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-sm transition-shadow"
      data-testid={testId}
    >
      <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">{label}</div>
      <div className="stat-value text-slate-900 mt-1" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [topCases, setTopCases] = useState([]);

  useEffect(() => {
    (async () => {
      const s = await fetchStats();
      setStats(s);
      const c = await fetchCases({ sort_by: "review_priority", sort_dir: "desc", limit: 5, priority_band: "high" });
      setTopCases(c.cases);
    })();
  }, []);

  if (!stats) return <div className="p-10 text-slate-400" data-testid="loading">Loading operational overview...</div>;

  const classData = Object.entries(stats.by_class).map(([k, v]) => ({
    name: CLASSIFICATIONS[k]?.label || k,
    key: k,
    count: v,
    color: CLASSIFICATIONS[k]?.dot,
  }));

  const priorityData = (stats.priority_bins || []).map((n, i) => ({
    bin: `${(i / 10).toFixed(1)}`,
    count: n,
  }));

  return (
    <div className="space-y-6" data-testid="overview-page">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Operations Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Prioritized triage of candidate out-of-state tag holders across T0 and T1 evidence phases.
          </p>
        </div>
        <Link
          to="/queue"
          data-testid="overview-open-queue"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          Open Case Queue <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="stat-total" label="Total Candidate Cases" value={stats.total} sub="Across all phases" />
        <StatCard
          testId="stat-high"
          label="High Priority (≥ 0.70)"
          value={stats.priority.high}
          sub="Recommended for immediate review"
          accent="#DC2626"
        />
        <StatCard
          testId="stat-warranted"
          label="Review Warranted"
          value={stats.by_class.review_warranted}
          sub="Flagged by model triage"
          accent="#B45309"
        />
        <StatCard
          testId="stat-shift"
          label="T0 → T1 State Shifts"
          value={stats.shift_delta_count}
          sub="Primary state changed between phases"
          accent="#1E3A8A"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Distribution</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Priority Score Histogram</h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Activity className="w-4 h-4" /> 0.0 → 1.0 bins
            </div>
          </div>
          <div className="h-64" data-testid="chart-priority-histogram">
            <ResponsiveContainer>
              <BarChart data={priorityData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="bin" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "#F1F5F9" }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {priorityData.map((entry, i) => {
                    const p = i / 10;
                    const c = priorityBand(p).color;
                    return <Cell key={i} fill={c} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Classification Mix</div>
          <h3 className="font-display text-lg font-semibold text-slate-900 mb-4">Predicted Class Breakdown</h3>
          <div className="space-y-4" data-testid="class-breakdown">
            {classData.map((d) => {
              const pct = stats.total ? (d.count / stats.total) * 100 : 0;
              return (
                <div key={d.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="badge-dot" style={{ background: d.color }} />
                      <span className="text-sm font-medium text-slate-700">{d.name}</span>
                    </div>
                    <span className="mono text-sm font-semibold text-slate-900">
                      {d.count} <span className="text-slate-400 text-xs font-normal">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full gauge-fill" style={{ width: `${pct}%`, background: d.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-medium text-slate-500">
            <MapPin className="w-3.5 h-3.5" /> Top States (T1)
          </div>
          <h3 className="font-display text-lg font-semibold text-slate-900 mb-4">Detected Primary States</h3>
          <div className="space-y-2" data-testid="top-states">
            {stats.top_states.map((s) => (
              <div key={s.state} className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="mono text-xs font-bold text-slate-700 px-2 py-0.5 bg-white border border-slate-200 rounded">{s.state}</span>
                </div>
                <span className="mono text-sm font-semibold text-slate-900">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-medium text-slate-500">
                <TrendingUp className="w-3.5 h-3.5" /> Highest Priority
              </div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Top Cases Requiring Attention</h3>
            </div>
            <Link to="/queue?band=high" className="text-xs font-semibold text-blue-700 hover:underline" data-testid="link-view-all-high">
              View all →
            </Link>
          </div>
          <div className="space-y-2" data-testid="top-cases">
            {topCases.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">No high priority cases</div>}
            {topCases.map((c) => {
              const band = priorityBand(c.review_priority);
              const meta = CLASSIFICATIONS[c.predicted_class];
              return (
                <Link
                  key={c.candidate_id}
                  to={`/case/${c.candidate_id}`}
                  data-testid={`top-case-${c.candidate_id}`}
                  className="flex items-center justify-between p-3 rounded-md border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="mono font-semibold text-slate-900">{c.candidate_id}</div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ${meta.bg} ${meta.text} ${meta.border}`}>
                      <span className="badge-dot" style={{ background: meta.dot }} />
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full gauge-fill" style={{ width: `${c.review_priority * 100}%`, background: band.color }} />
                    </div>
                    <span className="mono text-sm font-semibold w-10 text-right" style={{ color: band.color }}>
                      {c.review_priority.toFixed(2)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 flex items-start gap-3" data-testid="ops-notice">
        <AlertTriangle className="w-4 h-4 text-blue-700 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <span className="font-semibold uppercase tracking-wider">Reminder — </span>
          These indicators are triage aids only. Case priority reflects statistical likelihood based on phase evidence deltas
          and does not represent a legal, residency, tax, fee, or enforcement determination. Analyst validation is required.
        </div>
      </div>
    </div>
  );
}
