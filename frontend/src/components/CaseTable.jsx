import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, Eye } from "lucide-react";
import { CLASSIFICATIONS, priorityBand, REVIEWER_STATUS_META } from "../lib/api";
import { Button } from "./ui/button";

function PriorityBar({ value }) {
  const band = priorityBand(value);
  return (
    <div className="flex items-center gap-2 min-w-[130px]">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full gauge-fill rounded-full"
          style={{ width: `${value * 100}%`, background: band.color }}
        />
      </div>
      <span className="mono text-xs font-semibold text-slate-800 w-9 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function ClassBadge({ cls }) {
  const meta = CLASSIFICATIONS[cls];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ${meta.bg} ${meta.text} ${meta.border}`}
      data-testid={`class-badge-${cls}`}
    >
      <span className="badge-dot" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

function ProbMini({ w, nw, ie }) {
  return (
    <div className="flex w-full min-w-[140px] h-1.5 rounded-full overflow-hidden bg-slate-100">
      <div style={{ width: `${w * 100}%`, background: CLASSIFICATIONS.review_warranted.dot }} title={`W ${(w*100).toFixed(1)}%`} />
      <div style={{ width: `${nw * 100}%`, background: CLASSIFICATIONS.review_not_warranted.dot }} title={`NW ${(nw*100).toFixed(1)}%`} />
      <div style={{ width: `${ie * 100}%`, background: CLASSIFICATIONS.insufficient_evidence.dot }} title={`IE ${(ie*100).toFixed(1)}%`} />
    </div>
  );
}

function shiftLabel(t0, t1) {
  if (!t0 || !t1) return "-";
  if (t0.primary_state_detected !== t1.primary_state_detected) return "State Shift";
  if (t1.out_of_state_tag_days - t0.out_of_state_tag_days > 15) return "Escalating";
  if (t0.out_of_state_tag_days - t1.out_of_state_tag_days > 5) return "Resolving";
  return "Stable";
}

function SortHeader({ label, k, sortBy, sortDir, onSort }) {
  return (
    <button
      className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-slate-500 hover:text-slate-800"
      onClick={() => onSort(k)}
      data-testid={`sort-${k}`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
      {sortBy === k && <span className="text-slate-400">{sortDir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

export default function CaseTable({ cases, sortBy, sortDir, onSort }) {
  const navigate = useNavigate();
  const sh = (label, k) => (
    <SortHeader label={label} k={k} sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden" data-testid="case-table">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left">
              <th className="px-4 py-3">{sh("Candidate ID", "candidate_id")}</th>
              <th className="px-4 py-3">{sh("Priority", "review_priority")}</th>
              <th className="px-4 py-3">{sh("Predicted Class", "predicted_class")}</th>
              <th className="px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Probabilities</th>
              <th className="px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-500">T0 → T1</th>
              <th className="px-4 py-3">{sh("Reviewer Status", "reviewer_status")}</th>
              <th className="px-4 py-3 text-right text-[11px] uppercase tracking-wider font-semibold text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-16 text-slate-400" data-testid="empty-cases">
                  No cases matching filters.
                </td>
              </tr>
            )}
            {cases.map((c) => (
              <tr
                key={c.candidate_id}
                className="border-b border-slate-100 last:border-b-0 row-hover cursor-pointer"
                data-testid={`case-row-${c.candidate_id}`}
                onClick={() => navigate(`/case/${c.candidate_id}`)}
              >
                <td className="px-4 py-3 mono font-semibold text-slate-900">{c.candidate_id}</td>
                <td className="px-4 py-3"><PriorityBar value={c.review_priority} /></td>
                <td className="px-4 py-3"><ClassBadge cls={c.predicted_class} /></td>
                <td className="px-4 py-3">
                  <ProbMini
                    w={c.prob_review_warranted}
                    nw={c.prob_review_not_warranted}
                    ie={c.prob_insufficient_evidence}
                  />
                </td>
                <td className="px-4 py-3">
                  <span className="mono text-xs font-medium text-slate-700 px-2 py-0.5 rounded border border-slate-200 bg-slate-50">
                    {shiftLabel(c.t0, c.t1)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                    <span
                      className="badge-dot"
                      style={{ background: REVIEWER_STATUS_META[c.reviewer_status]?.color || "#64748B" }}
                    />
                    {REVIEWER_STATUS_META[c.reviewer_status]?.label || c.reviewer_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/case/${c.candidate_id}`);
                    }}
                    data-testid={`inspect-${c.candidate_id}`}
                    className="h-8"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> Inspect
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
