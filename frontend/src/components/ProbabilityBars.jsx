import React from "react";
import { CLASSIFICATIONS } from "../lib/api";

const ORDER = ["review_warranted", "review_not_warranted", "insufficient_evidence"];

export default function ProbabilityBars({ probs, predicted }) {
  const values = {
    review_warranted: probs.prob_review_warranted ?? 0,
    review_not_warranted: probs.prob_review_not_warranted ?? 0,
    insufficient_evidence: probs.prob_insufficient_evidence ?? 0,
  };
  return (
    <div className="space-y-3" data-testid="probability-bars">
      {ORDER.map((k) => {
        const v = values[k];
        const meta = CLASSIFICATIONS[k];
        const isPred = predicted === k;
        return (
          <div key={k} data-testid={`prob-row-${k}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="badge-dot" style={{ background: meta.dot }} />
                <span className={`text-sm font-medium text-slate-700 ${isPred ? "font-semibold" : ""}`}>
                  {meta.label}
                </span>
                {isPred && (
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 px-1.5 py-0.5 border border-slate-300 rounded">
                    Predicted
                  </span>
                )}
              </div>
              <span className="mono text-sm font-semibold text-slate-900">{(v * 100).toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full gauge-fill"
                style={{ width: `${v * 100}%`, background: meta.dot }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
