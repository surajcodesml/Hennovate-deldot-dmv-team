import React, { useRef, useState } from "react";
import { Upload, Download, RefreshCcw, FileCheck2, AlertTriangle } from "lucide-react";
import { importCsv, exportCsvUrl, resetSeed } from "../lib/api";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

const REQUIRED_COLS = [
  "candidate_id", "review_priority",
  "prob_review_warranted", "prob_review_not_warranted", "prob_insufficient_evidence",
  "predicted_class",
  "t0_days_observed", "t0_out_of_state_tag_days", "t0_primary_state_detected", "t0_toll_gantry_hits",
  "t0_dl_state_match", "t0_neighborhood_parking_frequency", "t0_vehicle_registration_status",
  "t1_days_observed", "t1_out_of_state_tag_days", "t1_primary_state_detected", "t1_toll_gantry_hits",
  "t1_dl_state_match", "t1_neighborhood_parking_frequency", "t1_vehicle_registration_status",
];

export default function ImportExport() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [replace, setReplace] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const onUpload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await importCsv(file, replace);
      setResult(r);
      toast.success(`Imported ${r.imported} case${r.imported === 1 ? "" : "s"}`, {
        description: r.errors?.length ? `${r.errors.length} row error${r.errors.length === 1 ? "" : "s"}` : "All rows accepted",
      });
    } catch (e) {
      toast.error("Import failed", { description: e?.message || "Check the file format" });
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    setBusy(true);
    try {
      await resetSeed();
      toast.success("Mock data restored");
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="import-export-page">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Import & Export</h1>
        <p className="text-sm text-slate-500 mt-1">
          Round-trip <code className="mono">case_predictions.csv</code> — upload predictions from your model
          pipeline, or export the current queue with analyst decisions attached.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Import */}
        <div className="bg-white rounded-lg border border-slate-200 p-6" data-testid="import-panel">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Upload className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Model → Dashboard</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Import case_predictions.csv</h3>
            </div>
          </div>

          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-slate-400 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
            data-testid="dropzone"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              data-testid="csv-file-input"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <FileCheck2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            {file ? (
              <div>
                <div className="mono text-sm font-semibold text-slate-900">{file.name}</div>
                <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div>
                <div className="text-sm text-slate-700 font-medium">Click to choose CSV file</div>
                <div className="text-xs text-slate-500 mt-1">Must include required columns below</div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4 mb-4">
            <div className="flex items-center gap-2">
              <Switch id="replace-toggle" checked={replace} onCheckedChange={setReplace} data-testid="replace-toggle" />
              <Label htmlFor="replace-toggle" className="text-sm text-slate-700">
                Replace existing cases (otherwise upsert by <code className="mono">candidate_id</code>)
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={onUpload} disabled={!file || busy} data-testid="upload-button" className="bg-slate-900 hover:bg-slate-800">
              <Upload className="w-4 h-4 mr-1.5" /> {busy ? "Uploading…" : "Upload & Import"}
            </Button>
            <Button variant="outline" onClick={onReset} disabled={busy} data-testid="reset-mock">
              <RefreshCcw className="w-4 h-4 mr-1.5" /> Reset to Mock Data
            </Button>
          </div>

          {result && (
            <div className="mt-4 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm" data-testid="import-result">
              <div className="font-semibold text-emerald-800">Import complete</div>
              <div className="text-emerald-700 mt-0.5">
                {result.imported} case{result.imported === 1 ? "" : "s"} imported
                {result.errors?.length ? ` · ${result.errors.length} row error${result.errors.length === 1 ? "" : "s"}` : ""}
              </div>
              {result.errors?.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-emerald-800 cursor-pointer">View error details</summary>
                  <pre className="mt-2 text-[11px] bg-white p-2 rounded border border-emerald-100 max-h-40 overflow-auto mono">
                    {JSON.stringify(result.errors, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Export */}
        <div className="bg-white rounded-lg border border-slate-200 p-6" data-testid="export-panel">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <Download className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Dashboard → Submission</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Export case_predictions.csv</h3>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Download the full case set including original model outputs and analyst decisions.
            The exported CSV matches the required submission schema and includes reviewer status, notes, and timestamps
            for full auditability.
          </p>

          <a
            href={exportCsvUrl()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
            data-testid="export-download"
          >
            <Download className="w-4 h-4" /> Download CSV
          </a>

          <div className="mt-6 rounded-md bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900 leading-relaxed">
              Ensure downstream consumers understand these outputs are triage aids — not automated legal, residency,
              tax, fee, or enforcement determinations.
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="text-[11px] uppercase tracking-wider font-medium text-slate-500">Schema</div>
        <h3 className="font-display text-lg font-semibold text-slate-900 mb-3">Required CSV Columns</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {REQUIRED_COLS.map((c) => (
            <div key={c} className="mono text-xs px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-700">
              {c}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Optional analyst columns: <span className="mono">reviewer_status</span>,{" "}
          <span className="mono">reviewer_notes</span>, <span className="mono">last_updated</span>. Boolean fields
          accept <span className="mono">true/false</span>, <span className="mono">1/0</span>, or <span className="mono">yes/no</span>.
        </p>
      </div>
    </div>
  );
}
