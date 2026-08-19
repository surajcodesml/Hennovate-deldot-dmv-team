import React, { useRef, useState } from "react";
import { Upload, Download, RefreshCcw, FileCheck2, AlertTriangle } from "lucide-react";
import { importCsv, exportCsvUrl, resetSeed } from "../lib/api";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { toast } from "sonner";

export default function ImportExport() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [replace, setReplace] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const onUpload = async () => {
    if (!file) return;
    setBusy(true);
    try { const r = await importCsv(file, replace); setResult(r); toast.success(`Imported ${r.imported} cases`); }
    catch (e) { toast.error("Import failed"); } finally { setBusy(false); }
  };
  const onReset = async () => {
    setBusy(true);
    try { await resetSeed(); toast.success("Mock data restored"); setResult(null); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="import-export-page">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Data Operations</div>
        <h1 className="font-display text-2xl font-bold text-white">Import & Export</h1>
        <p className="text-sm text-slate-400 mt-1">
          Round-trip <code className="mono text-slate-300">case_predictions.csv</code> — upload predictions or export the current queue with analyst decisions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card-surface-elevated p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-md bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
              <Upload className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Model → Dashboard</div>
              <h3 className="font-display text-base font-semibold text-white">Import case_predictions.csv</h3>
            </div>
          </div>

          <div className="border-2 border-dashed border-[#232C3B] rounded-lg p-6 text-center hover:border-blue-500/40 transition-colors cursor-pointer bg-[#0F141C]"
            onClick={() => fileRef.current?.click()} data-testid="dropzone">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" data-testid="csv-file-input"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <FileCheck2 className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            {file ? (
              <div><div className="mono text-sm font-semibold text-white">{file.name}</div>
                <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</div></div>
            ) : (
              <div><div className="text-sm text-slate-300 font-medium">Click to choose CSV file</div>
                <div className="text-xs text-slate-500 mt-1">Required column: candidate_id</div></div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4 mb-4">
            <Switch id="replace-toggle" checked={replace} onCheckedChange={setReplace} data-testid="replace-toggle" />
            <Label htmlFor="replace-toggle" className="text-sm text-slate-300">Replace existing cases</Label>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={onUpload} disabled={!file || busy} data-testid="upload-button" className="bg-blue-600 hover:bg-blue-500 text-white">
              <Upload className="w-4 h-4 mr-1.5" /> {busy ? "Uploading…" : "Upload & Import"}
            </Button>
            <Button variant="outline" onClick={onReset} disabled={busy} data-testid="reset-mock"
              className="bg-[#121821] border-[#232C3B] text-slate-300 hover:bg-[#1B222E] hover:text-white">
              <RefreshCcw className="w-4 h-4 mr-1.5" /> Reset to Mock Data
            </Button>
          </div>

          {result && (
            <div className="mt-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-sm" data-testid="import-result">
              <div className="font-semibold text-emerald-300">Import complete — {result.imported} case{result.imported === 1 ? "" : "s"}</div>
            </div>
          )}
        </div>

        <div className="card-surface-elevated p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Download className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Dashboard → Submission</div>
              <h3 className="font-display text-base font-semibold text-white">Export case_predictions.csv</h3>
            </div>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed mb-4">
            Download the full case set including original model outputs and analyst decisions. Matches the submission schema.
          </p>
          <a href={exportCsvUrl()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
            data-testid="export-download">
            <Download className="w-4 h-4" /> Download CSV
          </a>
          <div className="mt-6 rounded-md bg-amber-950/30 border border-amber-800/30 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-200/80">
              These outputs are triage aids — not automated legal, residency, tax, fee, or enforcement determinations.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
