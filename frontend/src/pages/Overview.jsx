import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchStats, fetchDataStatus, searchEvidence, CLASSIFICATIONS } from "../lib/api";
import {
  Activity, AlertOctagon, ShieldCheck, HelpCircle, TrendingUp, Layers, ArrowRight,
  MapPin, IdCard, Car, Briefcase, Radio, Database, CheckCircle2, AlertTriangle, Search, Filter
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

function Kpi({ label, value, sub, icon: Icon, accent, testId }) {
  return (
    <div className="card-surface-elevated p-5 hover-elevate" data-testid={testId}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">{label}</div>
          <div className="stat-value text-3xl mt-2" style={{ color: accent || "#F3F4F6" }}>{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${accent || "#3B82F6"}18`, border: `1px solid ${accent || "#3B82F6"}33` }}>
          <Icon className="w-4.5 h-4.5" style={{ color: accent || "#60A5FA" }} />
        </div>
      </div>
    </div>
  );
}

const CHANGE_LABELS = [
  { key: "warranted_to_not", label: "Warranted → Not Warranted", color: "#10B981" },
  { key: "not_to_warranted", label: "Not Warranted → Warranted", color: "#EF4444" },
  { key: "ii_to_warranted", label: "Insufficient → Warranted", color: "#F97316" },
  { key: "ii_to_not", label: "Insufficient → Not Warranted", color: "#22D3EE" },
  { key: "to_ii", label: "Any → Insufficient", color: "#F59E0B" },
  { key: "no_change", label: "No Change", color: "#6B7280" },
];
const EV_ICONS = { address: MapPin, credential: IdCard, vehicle_title: Car, work: Briefcase, external: Radio };
const EV_COLORS = { address: "#3B82F6", credential: "#8B5CF6", vehicle_title: "#06B6D4", work: "#F59E0B", external: "#EC4899" };
const EV_LABELS = { address: "Address", credential: "Credential", vehicle_title: "Vehicle Title", work: "Work", external: "External" };

const SOURCE_META_EMB = {
  address: { label: "Address", icon: MapPin, color: "#3B82F6" },
  credential: { label: "Credential", icon: IdCard, color: "#8B5CF6" },
  vehicle_title: { label: "Vehicle Title", icon: Car, color: "#06B6D4" },
  work: { label: "Work", icon: Briefcase, color: "#F59E0B" },
  external: { label: "External", icon: Radio, color: "#EC4899" },
};
const US_STATES_EMB = ["all", "DE", "PA", "MD", "NJ", "VA", "NY", "OH", "WV", "NC", "FL", "TX"];

function EvidenceSearchPanel() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [state, setState] = useState("all");
  const [results, setResults] = useState({ records: [], total_matches: 0, candidates_matched: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q && source === "all" && state === "all") { setResults({ records: [], total_matches: 0, candidates_matched: 0 }); return; }
      setLoading(true);
      const params = { limit: 25 };
      if (q) params.q = q;
      if (source !== "all") params.source = source;
      if (state !== "all") params.state = state;
      const r = await searchEvidence(params);
      setResults(r); setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, source, state]);

  return (
    <div className="card-surface-elevated p-5" data-testid="evidence-search-panel">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Investigation</div>
          <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-cyan-400" /> Evidence Search
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Search across <span className="text-white font-semibold">216,000</span> evidence records — candidate IDs,
            source records (LIC-, ADR-, TTL-, WRK-, EXT-), vehicle refs, states, and event types.
          </p>
        </div>
        <div className="text-xs text-slate-400" data-testid="evidence-counts">
          {loading ? "Searching…" : results.total_matches > 0 ? (
            <>
              <span className="mono font-semibold text-white">{results.total_matches.toLocaleString()}</span> records ·{" "}
              <span className="mono font-semibold text-cyan-300">{results.candidates_matched.toLocaleString()}</span> candidates
              {results.total_matches >= 25 && <span className="text-slate-500"> · first 25</span>}
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. CAN-B6WV6HQ3JW, LIC-874Z2AAGZU, VH-49369, DE"
            className="pl-9 h-10 bg-[#0F141C] border-[#1E2633] text-slate-200 placeholder:text-slate-500" data-testid="evidence-search-input" />
        </div>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-10 bg-[#0F141C] border-[#1E2633] text-slate-200" data-testid="evidence-source-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {Object.entries(SOURCE_META_EMB).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="h-10 bg-[#0F141C] border-[#1E2633] text-slate-200" data-testid="evidence-state-filter"><SelectValue /></SelectTrigger>
          <SelectContent>{US_STATES_EMB.map(s => <SelectItem key={s} value={s}>{s === "all" ? "All States" : s}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-[#1E2633] overflow-hidden" data-testid="evidence-results">
        <div className="grid grid-cols-12 bg-[#0F141C] border-b border-[#1E2633] px-4 py-2 text-[10px] uppercase tracking-widest font-semibold text-slate-500">
          <div className="col-span-3">Candidate</div>
          <div className="col-span-2">Source</div>
          <div className="col-span-3">Source Record</div>
          <div className="col-span-1">State</div>
          <div className="col-span-2">Event</div>
          <div className="col-span-1 text-right">Date</div>
        </div>
        {results.records.length === 0 && !loading && (
          <div className="text-center py-10 text-slate-500 text-xs" data-testid="empty-search">
            {q || source !== "all" || state !== "all"
              ? "No evidence records matched."
              : "Enter a search term or filter to explore evidence records."}
          </div>
        )}
        {results.records.map((r, i) => {
          const meta = SOURCE_META_EMB[r.kind];
          const Icon = meta?.icon || Search;
          return (
            <Link key={i} to={`/case/${r.candidate_id}`}
              className="grid grid-cols-12 px-4 py-2 border-b border-[#151B25] last:border-b-0 items-center text-xs row-hover"
              data-testid={`evidence-row-${i}`}>
              <div className="col-span-3 mono font-semibold text-white truncate">{r.candidate_id}</div>
              <div className="col-span-2 flex items-center gap-1.5">
                <Icon className="w-3 h-3" style={{ color: meta?.color }} />
                <span className="text-slate-300">{meta?.label || r.kind}</span>
              </div>
              <div className="col-span-3 mono text-slate-400 truncate">
                {r.source_record_id}
                {r.vehicle_ref && <span className="ml-1.5 text-cyan-400">{r.vehicle_ref}</span>}
              </div>
              <div className="col-span-1">
                <span className={`mono text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                  r.state === "DE" ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                  : "border-slate-500/30 bg-slate-500/10 text-slate-300"
                }`}>{r.state}</span>
              </div>
              <div className="col-span-2 text-slate-400 truncate">{r.event_type || "—"}</div>
              <div className="col-span-1 mono text-[10px] text-slate-500 text-right">{r.date}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState(null);
  useEffect(() => {
    (async () => {
      const [s, st] = await Promise.all([fetchStats("T1"), fetchDataStatus()]);
      setStats(s); setStatus(st);
    })();
  }, []);
  if (!stats || !status) return <div className="p-10 text-slate-500" data-testid="loading">Loading dataset…</div>;

  const donutData = Object.entries(stats.by_class).map(([k, v]) => ({
    name: CLASSIFICATIONS[k].label, key: k, value: v, color: CLASSIFICATIONS[k].color,
  }));
  const priorityBarData = [
    { name: "Critical", count: stats.priority.critical, color: "#EF4444" },
    { name: "High", count: stats.priority.high, color: "#F97316" },
    { name: "Medium", count: stats.priority.medium, color: "#F59E0B" },
    { name: "Low", count: stats.priority.low, color: "#10B981" },
  ];
  const confidenceData = (stats.confidence_bins || []).map((n, i) => ({ bin: `${(i/10).toFixed(1)}`, count: n }));
  const validationOk = status.warnings.length === 0 && status.total_prediction_rows === status.expected_rows;

  return (
    <div className="space-y-6" data-testid="overview-page">
      {/* Data Status Panel */}
      <div className="card-surface-elevated p-5" data-testid="data-status">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-md flex items-center justify-center ${validationOk ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-amber-500/10 border border-amber-500/30"}`}>
              {validationOk ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-amber-400" />}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Data Status</div>
              <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-400" /> Live Dataset Validated
              </h3>
            </div>
          </div>
          <div className="text-right text-xs mono">
            <div className="text-slate-500">Model</div>
            <div className="text-slate-300 font-semibold">{status.model_version?.split("-").slice(-1)[0] || "—"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Prediction Rows", value: status.total_prediction_rows, sub: `expected ${status.expected_rows}` },
            { label: "Unique Candidates", value: status.unique_candidates },
            { label: "T0 Records", value: status.t0_records },
            { label: "T1 Records", value: status.t1_records },
            { label: "Evidence Records", value: status.evidence_records.toLocaleString() },
            { label: "T1 Warranted", value: status.by_class_t1.review_warranted || 0, accent: "#EF4444" },
            { label: "T1 Insufficient", value: status.by_class_t1.insufficient_information || 0, accent: "#F59E0B" },
          ].map((k) => (
            <div key={k.label} className="p-3 rounded-md bg-[#0F141C] border border-[#1B222E]">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">{k.label}</div>
              <div className="stat-value text-xl mt-0.5" style={{ color: k.accent || "#F3F4F6" }}>
                {typeof k.value === "number" ? k.value.toLocaleString() : k.value}
              </div>
              {k.sub && <div className="text-[10px] text-slate-500 mt-0.5">{k.sub}</div>}
            </div>
          ))}
        </div>
        {status.warnings.length > 0 && (
          <div className="mt-3 rounded-md bg-amber-950/30 border border-amber-800/30 p-3 text-xs text-amber-200/90" data-testid="status-warnings">
            {status.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi testId="kpi-total" label="Total Candidates" value={stats.total.toLocaleString()} sub="Unique candidates loaded" icon={Layers} accent="#60A5FA" />
        <Kpi testId="kpi-warranted" label="Review Warranted" value={stats.by_class.review_warranted.toLocaleString()}
          sub={`${((stats.by_class.review_warranted/stats.total)*100 || 0).toFixed(1)}% of total`} icon={AlertOctagon} accent="#EF4444" />
        <Kpi testId="kpi-not-warranted" label="Not Warranted" value={stats.by_class.review_not_warranted.toLocaleString()}
          sub={`${((stats.by_class.review_not_warranted/stats.total)*100 || 0).toFixed(1)}% of total`} icon={ShieldCheck} accent="#10B981" />
        <Kpi testId="kpi-insufficient" label="Insufficient" value={stats.by_class.insufficient_information.toLocaleString()}
          sub={`${((stats.by_class.insufficient_information/stats.total)*100 || 0).toFixed(1)}% of total`} icon={HelpCircle} accent="#F59E0B" />
        <Kpi testId="kpi-high" label="High Priority" value={(stats.priority.critical + stats.priority.high).toLocaleString()}
          sub={`${stats.priority.critical} critical`} icon={TrendingUp} accent="#F97316" />
        <Kpi testId="kpi-conf" label="Avg Confidence" value={`${(stats.avg_confidence*100).toFixed(1)}%`}
          sub="Model max-probability" icon={Activity} accent="#22D3EE" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card-surface-elevated p-5">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Distribution (T1)</div>
          <h3 className="font-display text-base font-semibold text-white mt-1 mb-3">Case Distribution</h3>
          <div className="h-56" data-testid="donut-chart">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={donutData} innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value">
                  {donutData.map((d) => <Cell key={d.key} fill={d.color} stroke="#0B0F16" strokeWidth={2} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#121821", border: "1px solid #1E2633", borderRadius: 8, fontSize: 12 }} itemStyle={{ color: "#E5E7EB" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 mt-2">
            {donutData.map((d) => (
              <div key={d.key} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-300"><span className="badge-dot" style={{ background: d.color }} />{d.name}</span>
                <span className="mono font-semibold text-white">{d.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card-surface-elevated p-5 lg:col-span-2">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Priority Distribution</div>
          <h3 className="font-display text-base font-semibold text-white mt-1 mb-3">Review Priority Bands</h3>
          <div className="h-64" data-testid="priority-bar-chart">
            <ResponsiveContainer>
              <BarChart data={priorityBarData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2633" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#161D27" }} contentStyle={{ background: "#121821", border: "1px solid #1E2633", borderRadius: 8, fontSize: 12 }} itemStyle={{ color: "#E5E7EB" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {priorityBarData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card-surface-elevated p-5">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">T0 → T1</div>
          <h3 className="font-display text-base font-semibold text-white mt-1 mb-4">Classification Changes</h3>
          <div className="space-y-2.5" data-testid="changes-list">
            {CHANGE_LABELS.map((c) => {
              const v = stats.changes[c.key] || 0;
              const pct = stats.total ? (v / stats.total) * 100 : 0;
              return (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-2 text-slate-300"><span className="badge-dot" style={{ background: c.color }} />{c.label}</span>
                    <span className="mono font-semibold text-white">{v.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#1B222E] overflow-hidden">
                    <div className="h-full gauge-fill" style={{ width: `${pct}%`, background: c.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card-surface-elevated p-5">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Model</div>
          <h3 className="font-display text-base font-semibold text-white mt-1 mb-4">Confidence Distribution</h3>
          <div className="h-56" data-testid="confidence-chart">
            <ResponsiveContainer>
              <BarChart data={confidenceData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2633" vertical={false} />
                <XAxis dataKey="bin" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#161D27" }} contentStyle={{ background: "#121821", border: "1px solid #1E2633", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#22D3EE" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Evidence Search */}
      <EvidenceSearchPanel />

      {/* Evidence coverage */}
      <div className="card-surface-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Evidence</div>
            <h3 className="font-display text-base font-semibold text-white">Coverage by Source</h3>
          </div>
          <Link to="/queue" data-testid="link-queue" className="text-xs font-semibold text-blue-400 hover:text-blue-300 inline-flex items-center gap-1">
            Open Review Queue <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="evidence-coverage">
          {Object.entries(stats.evidence_coverage).map(([k, n]) => {
            const Icon = EV_ICONS[k]; const pct = stats.total ? (n / stats.total) * 100 : 0; const color = EV_COLORS[k];
            return (
              <div key={k} className="p-4 rounded-lg bg-[#0F141C] border border-[#1E2633]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: `${color}18`, border: `1px solid ${color}44` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div><div className="text-[10px] uppercase tracking-widest text-slate-500">Evidence</div>
                    <div className="text-xs font-semibold text-white">{EV_LABELS[k]}</div></div>
                </div>
                <div className="stat-value text-2xl mt-3 text-white">{n.toLocaleString()}</div>
                <div className="text-[11px] text-slate-500">{pct.toFixed(0)}% of cases</div>
                <div className="h-1 rounded-full bg-[#1B222E] mt-2 overflow-hidden">
                  <div className="h-full gauge-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
