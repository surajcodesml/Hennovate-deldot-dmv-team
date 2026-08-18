import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, X, RefreshCw } from "lucide-react";
import { fetchCases, CLASSIFICATIONS, REVIEWER_STATUS_META } from "../lib/api";
import CaseTable from "../components/CaseTable";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Button } from "../components/ui/button";

export default function Queue() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") || "");
  const [predicted, setPredicted] = useState(searchParams.get("predicted_class") || "all");
  const [status, setStatus] = useState(searchParams.get("reviewer_status") || "all");
  const [band, setBand] = useState(searchParams.get("band") || "all");
  const [sortBy, setSortBy] = useState(searchParams.get("sort_by") || "review_priority");
  const [sortDir, setSortDir] = useState(searchParams.get("sort_dir") || "desc");
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const params = {
      sort_by: sortBy,
      sort_dir: sortDir,
    };
    if (q) params.q = q;
    if (predicted !== "all") params.predicted_class = predicted;
    if (status !== "all") params.reviewer_status = status;
    if (band !== "all") params.priority_band = band;
    const data = await fetchCases(params);
    setCases(data.cases);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (predicted !== "all") sp.set("predicted_class", predicted);
    if (status !== "all") sp.set("reviewer_status", status);
    if (band !== "all") sp.set("band", band);
    sp.set("sort_by", sortBy);
    sp.set("sort_dir", sortDir);
    setSearchParams(sp, { replace: true });
  }, [q, predicted, status, band, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearFilters = () => {
    setQ("");
    setPredicted("all");
    setStatus("all");
    setBand("all");
  };

  const onSort = (col) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const activeFilterCount =
    (q ? 1 : 0) + (predicted !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0) + (band !== "all" ? 1 : 0);

  return (
    <div className="space-y-5" data-testid="queue-page">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Case Queue</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loading ? "Loading..." : `${cases.length} case${cases.length === 1 ? "" : "s"} shown`}
            {activeFilterCount > 0 && ` · ${activeFilterCount} active filter${activeFilterCount > 1 ? "s" : ""}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} data-testid="refresh-queue">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search candidate ID (e.g. DE-100042)"
              className="pl-9 h-10"
              data-testid="filter-search"
            />
          </div>

          <Select value={predicted} onValueChange={setPredicted}>
            <SelectTrigger className="h-10" data-testid="filter-class"><SelectValue placeholder="Classification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {Object.entries(CLASSIFICATIONS).map(([k, v]) => (
                <SelectItem key={k} value={k} data-testid={`class-opt-${k}`}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={band} onValueChange={setBand}>
            <SelectTrigger className="h-10" data-testid="filter-band"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High (≥ 0.70)</SelectItem>
              <SelectItem value="medium">Moderate (0.40 – 0.69)</SelectItem>
              <SelectItem value="low">Low (&lt; 0.40)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10" data-testid="filter-status"><SelectValue placeholder="Reviewer Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(REVIEWER_STATUS_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeFilterCount > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-filters">
              <X className="w-3.5 h-3.5 mr-1" /> Clear filters
            </Button>
          </div>
        )}
      </div>

      <CaseTable cases={cases} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
    </div>
  );
}
