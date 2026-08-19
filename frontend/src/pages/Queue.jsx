import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, X, RefreshCw, Download, SlidersHorizontal } from "lucide-react";
import { fetchCases, CLASSIFICATIONS, REVIEWER_STATUS_META, exportCsvUrl } from "../lib/api";
import CaseTable from "../components/CaseTable";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Button } from "../components/ui/button";

export default function Queue({ presetClass, title = "Review Queue", accent = "#60A5FA" }) {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [predicted, setPredicted] = useState(presetClass || sp.get("predicted_class") || "all");
  const [status, setStatus] = useState(sp.get("reviewer_status") || "all");
  const [band, setBand] = useState(sp.get("band") || "all");
  const [phase, setPhase] = useState(sp.get("phase") || "all");
  const [evStrength, setEvStrength] = useState(sp.get("evidence_strength") || "all");
  const [sortBy, setSortBy] = useState(sp.get("sort_by") || "review_priority");
  const [sortDir, setSortDir] = useState(sp.get("sort_dir") || "desc");
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 15;

  useEffect(() => { setPredicted(presetClass || "all"); }, [presetClass]);

  const load = async () => {
    setLoading(true);
    const params = { sort_by: sortBy, sort_dir: sortDir };
    if (q) params.q = q;
    if (predicted !== "all") params.predicted_class = predicted;
    if (status !== "all") params.reviewer_status = status;
    if (band !== "all") params.priority_band = band;
    if (phase !== "all") params.phase = phase;
    if (evStrength !== "all") params.evidence_strength = evStrength;
    const data = await fetchCases(params);
    setCases(data.cases);
    setLoading(false);
    setPage(1);
  };

  useEffect(() => {
    load();
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (!presetClass && predicted !== "all") p.set("predicted_class", predicted);
    if (status !== "all") p.set("reviewer_status", status);
    if (band !== "all") p.set("band", band);
    if (phase !== "all") p.set("phase", phase);
    if (evStrength !== "all") p.set("evidence_strength", evStrength);
    p.set("sort_by", sortBy); p.set("sort_dir", sortDir);
    setSp(p, { replace: true });
  }, [q, predicted, status, band, phase, evStrength, sortBy, sortDir]); // eslint-disable-line

  const onSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  };
  const clear = () => { setQ(""); if (!presetClass) setPredicted("all"); setStatus("all"); setBand("all"); setPhase("all"); setEvStrength("all"); };
  const active = (q ? 1 : 0) + ((!presetClass && predicted !== "all") ? 1 : 0) + (status !== "all" ? 1 : 0) + (band !== "all" ? 1 : 0) + (phase !== "all" ? 1 : 0) + (evStrength !== "all" ? 1 : 0);

  const pageCount = Math.max(1, Math.ceil(cases.length / perPage));
  const paged = useMemo(() => cases.slice((page - 1) * perPage, page * perPage), [cases, page]);

  return (
    <div className="space-y-5" data-testid="queue-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Operations</div>
          <h1 className="font-display text-2xl font-bold text-white" style={{ color: accent }}>{title}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {loading ? "Loading…" : `${cases.length} case${cases.length === 1 ? "" : "s"} shown`}
            {active > 0 && ` · ${active} active filter${active > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={exportCsvUrl()} data-testid="export-csv" className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-[#121821] border border-[#232C3B] text-sm font-medium text-slate-300 hover:bg-[#1B222E] hover:text-white transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </a>
          <Button variant="outline" size="sm" onClick={load} data-testid="refresh-queue" className="bg-[#121821] border-[#232C3B] text-slate-300 hover:bg-[#1B222E] hover:text-white">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="card-surface p-4">
        <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-widest text-slate-500 font-semibold">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidate ID"
              className="pl-9 h-10 bg-[#0F141C] border-[#1E2633] text-slate-200 placeholder:text-slate-500" data-testid="filter-search" />
          </div>
          {!presetClass && (
            <Select value={predicted} onValueChange={setPredicted}>
              <SelectTrigger className="h-10 bg-[#0F141C] border-[#1E2633] text-slate-200" data-testid="filter-class"><SelectValue placeholder="Recommendation" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Recommendations</SelectItem>
                {Object.entries(CLASSIFICATIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={band} onValueChange={setBand}>
            <SelectTrigger className="h-10 bg-[#0F141C] border-[#1E2633] text-slate-200" data-testid="filter-band"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical (≥ 0.85)</SelectItem>
              <SelectItem value="high">High (0.70 – 0.84)</SelectItem>
              <SelectItem value="medium">Medium (0.40 – 0.69)</SelectItem>
              <SelectItem value="low">Low (&lt; 0.40)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={phase} onValueChange={setPhase}>
            <SelectTrigger className="h-10 bg-[#0F141C] border-[#1E2633] text-slate-200" data-testid="filter-phase"><SelectValue placeholder="Phase" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Phases</SelectItem><SelectItem value="T0">T0</SelectItem><SelectItem value="T1">T1</SelectItem></SelectContent>
          </Select>
          <Select value={evStrength} onValueChange={setEvStrength}>
            <SelectTrigger className="h-10 bg-[#0F141C] border-[#1E2633] text-slate-200" data-testid="filter-evstrength"><SelectValue placeholder="Evidence Strength" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Strengths</SelectItem>
              <SelectItem value="Strong">Strong</SelectItem><SelectItem value="Moderate">Moderate</SelectItem><SelectItem value="Weak">Weak</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 bg-[#0F141C] border-[#1E2633] text-slate-200" data-testid="filter-status"><SelectValue placeholder="Reviewer Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(REVIEWER_STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {active > 0 && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={clear} data-testid="clear-filters" className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5 mr-1" /> Clear filters
            </Button>
          </div>
        )}
      </div>

      <CaseTable cases={paged} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />

      {cases.length > perPage && (
        <div className="flex items-center justify-between text-xs text-slate-500" data-testid="pagination">
          <div>Showing {(page-1)*perPage + 1}–{Math.min(page*perPage, cases.length)} of {cases.length}</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page===1} onClick={() => setPage(p=>p-1)} data-testid="page-prev"
              className="h-8 bg-[#121821] border-[#232C3B] text-slate-300 disabled:opacity-40">Prev</Button>
            <span className="px-3 mono">{page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page===pageCount} onClick={() => setPage(p=>p+1)} data-testid="page-next"
              className="h-8 bg-[#121821] border-[#232C3B] text-slate-300 disabled:opacity-40">Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
