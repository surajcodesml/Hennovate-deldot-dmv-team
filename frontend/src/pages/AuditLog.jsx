import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAudit, REVIEWER_STATUS_META } from "../lib/api";
import { ClipboardList, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await fetchAudit();
    setEntries(data.entries);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5" data-testid="audit-log-page">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">
            Timestamped, append-only record of analyst decisions and system events.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} data-testid="refresh-audit">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500">
          <div className="col-span-3">Timestamp</div>
          <div className="col-span-2">Candidate</div>
          <div className="col-span-2">Reviewer</div>
          <div className="col-span-2">Action</div>
          <div className="col-span-3">Transition · Notes</div>
        </div>
        {entries.length === 0 && (
          <div className="text-center py-14 text-slate-400" data-testid="empty-audit">
            <ClipboardList className="w-8 h-8 mx-auto mb-2" />
            No audit entries yet — log a decision from any case to populate this feed.
          </div>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className="grid grid-cols-12 px-4 py-3 border-b border-slate-100 last:border-b-0 items-start text-sm row-hover"
            data-testid={`audit-row-${e.id}`}
          >
            <div className="col-span-3 mono text-xs text-slate-700">
              {new Date(e.timestamp).toLocaleString()}
            </div>
            <div className="col-span-2 mono text-xs font-semibold text-slate-900">
              {e.candidate_id === "BULK" || e.candidate_id === "SYSTEM" ? (
                <span className="text-slate-500">{e.candidate_id}</span>
              ) : (
                <Link to={`/case/${e.candidate_id}`} className="text-blue-700 hover:underline">
                  {e.candidate_id}
                </Link>
              )}
            </div>
            <div className="col-span-2 mono text-xs text-slate-700">{e.reviewer_id}</div>
            <div className="col-span-2 text-xs">
              <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 mono">{e.action}</span>
            </div>
            <div className="col-span-3 text-xs text-slate-700">
              <div className="flex items-center gap-2 mono">
                <span className="text-slate-500">{REVIEWER_STATUS_META[e.from_status]?.label || e.from_status}</span>
                <span className="text-slate-400">→</span>
                <span className="font-semibold text-slate-900">{REVIEWER_STATUS_META[e.to_status]?.label || e.to_status}</span>
              </div>
              {e.notes && <div className="text-slate-500 mt-1 line-clamp-2">{e.notes}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
