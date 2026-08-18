import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, ShieldCheck, ShieldX, HelpCircle, Ban, MapPin, Clock } from "lucide-react";
import { fetchCase, updateCase, CLASSIFICATIONS, REVIEWER_STATUS_META, priorityBand } from "../lib/api";
import PriorityGauge from "../components/PriorityGauge";
import ProbabilityBars from "../components/ProbabilityBars";
import T0T1Diff from "../components/T0T1Diff";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

const DECISIONS = [
  { key: "confirmed_warranted", label: "Confirm — Review Warranted", icon: ShieldX, color: "bg-amber-600 hover:bg-amber-700" },
  { key: "confirmed_not_warranted", label: "Confirm — Not Warranted", icon: ShieldCheck, color: "bg-emerald-600 hover:bg-emerald-700" },
  { key: "flagged_insufficient", label: "Flag — Insufficient Evidence", icon: HelpCircle, color: "bg-slate-600 hover:bg-slate-700" },
  { key: "dismissed", label: "Dismiss Case", icon: Ban, color: "bg-slate-500 hover:bg-slate-600" },
];

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setCase] = useState(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await fetchCase(id);
      setCase(data);
      setNotes(data.reviewer_notes || "");
    })();
  }, [id]);

  const applyDecision = async (statusKey) => {
    setSaving(true);
    try {
      const updated = await updateCase(id, {
        reviewer_status: statusKey,
        reviewer_notes: notes,
        reviewer_tags: c.reviewer_tags || [],
        reviewer_id: "analyst_demo",
      });
      setCase(updated);
      toast.success("Decision logged", {
        description: `${REVIEWER_STATUS_META[statusKey].label} · saved to audit log`,
      });
    } catch (e) {
      toast.error("Failed to save decision");
    } finally {
      setSaving(false);
    }
  };

  const saveNotesOnly = async () => {
    if (!c) return;
    setSaving(true);
    try {
      const updated = await updateCase(id, {
        reviewer_status: c.reviewer_status,
        reviewer_notes: notes,
        reviewer_tags: c.reviewer_tags || [],
        reviewer_id: "analyst_demo",
      });
      setCase(updated);
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  if (!c) return <div className="p-10 text-slate-400" data-testid="loading">Loading case...</div>;

  const clsMeta = CLASSIFICATIONS[c.predicted_class];
  const statusMeta = REVIEWER_STATUS_META[c.reviewer_status] || { label: c.reviewer_status, color: "#64748B" };
  const band = priorityBand(c.review_priority);

  return (
    <div className="space-y-5" data-testid="case-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="back-button">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
            <Link to="/queue" className="hover:text-slate-800">Case Queue</Link> · Detail
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="mono text-slate-500">Last updated</span>
          <span className="mono font-semibold text-slate-800">
            {new Date(c.last_updated).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Candidate Record ID</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mono" data-testid="case-candidate-id">
            {c.candidate_id}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center px-3 py-1.5 rounded-md border text-sm font-semibold ${clsMeta.bg} ${clsMeta.text} ${clsMeta.border}`}
            data-testid="case-class-badge"
          >
            <span className="badge-dot" style={{ background: clsMeta.dot }} />
            {clsMeta.label}
          </span>
          <span
            className="inline-flex items-center px-3 py-1.5 rounded-md border text-sm font-semibold border-slate-300 bg-slate-50 text-slate-700"
            data-testid="case-status-badge"
          >
            <span className="badge-dot" style={{ background: statusMeta.color }} />
            {statusMeta.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Left column */}
        <div className="col-span-12 lg:col-span-4 space-y-5">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Priority</div>
            <h3 className="font-display text-lg font-semibold text-slate-900 mb-2">Review Priority Index</h3>
            <PriorityGauge value={c.review_priority} />
            <div className="mt-3 text-xs text-slate-500 text-center leading-relaxed">
              Model priority (0.00 – 1.00) synthesizes classification probabilities and phase-delta evidence.
              This is a triage aid, not a determination.
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Model Output</div>
            <h3 className="font-display text-lg font-semibold text-slate-900 mb-4">Classification Probabilities</h3>
            <ProbabilityBars probs={c} predicted={c.predicted_class} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Snapshot</div>
            <h3 className="font-display text-lg font-semibold text-slate-900 mb-3">T1 Evidence Snapshot</h3>
            <div className="space-y-2 text-sm">
              <Row icon={<MapPin className="w-3.5 h-3.5 text-slate-400" />} k="Primary State (T1)" v={c.t1.primary_state_detected} />
              <Row icon={<Clock className="w-3.5 h-3.5 text-slate-400" />} k="Days Observed (T1)" v={c.t1.days_observed} />
              <Row k="Out-of-State Tag Days" v={c.t1.out_of_state_tag_days} />
              <Row k="Toll Gantry Hits" v={c.t1.toll_gantry_hits} />
              <Row k="Vehicle Registration" v={c.t1.vehicle_registration_status.replace("_", " ")} />
              <Row k="Priority Band" v={<span style={{ color: band.color, fontWeight: 600 }}>{band.label}</span>} />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-12 lg:col-span-8 space-y-5">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Phase Comparison</div>
                <h3 className="font-display text-lg font-semibold text-slate-900">T0 → T1 Evidence Diff</h3>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  <span className="text-slate-600">T0 Initial</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-900" />
                  <span className="text-slate-600">T1 Subsequent</span>
                </div>
              </div>
            </div>
            <T0T1Diff t0={c.t0} t1={c.t1} />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Analyst Decision</div>
            <h3 className="font-display text-lg font-semibold text-slate-900 mb-1">Log Decision & Notes</h3>
            <p className="text-xs text-slate-500 mb-4">
              Human-in-the-loop validation. Your decision and notes are timestamped and appended to the audit log.
            </p>

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter reviewer notes: observed evidence, cross-checks performed, next actions, or context…"
              className="min-h-[110px] mb-4 font-normal"
              data-testid="reviewer-notes"
            />

            <div className="flex flex-wrap gap-2">
              {DECISIONS.map((d) => {
                const Icon = d.icon;
                const active = c.reviewer_status === d.key;
                return (
                  <button
                    key={d.key}
                    onClick={() => applyDecision(d.key)}
                    disabled={saving}
                    data-testid={`decision-${d.key}`}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-semibold text-white transition-colors ${d.color} ${
                      active ? "ring-2 ring-offset-2 ring-slate-900" : ""
                    } ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <Icon className="w-4 h-4" />
                    {d.label}
                  </button>
                );
              })}
              <Button
                variant="outline"
                onClick={saveNotesOnly}
                disabled={saving}
                data-testid="save-notes"
                className="ml-auto"
              >
                <Save className="w-4 h-4 mr-1.5" /> Save Notes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, k, v }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 last:border-b-0 py-1.5">
      <div className="text-slate-500 flex items-center gap-2">{icon}{k}</div>
      <div className="mono font-semibold text-slate-900">{v}</div>
    </div>
  );
}
