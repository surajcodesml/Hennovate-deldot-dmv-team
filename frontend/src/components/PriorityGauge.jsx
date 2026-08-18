import React from "react";
import { priorityBand } from "../lib/api";

// Semi-circular gauge for 0..1 priority
export default function PriorityGauge({ value = 0, size = 180 }) {
  const clamped = Math.max(0, Math.min(1, value));
  const band = priorityBand(clamped);
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const circ = Math.PI * r; // semicircle length
  const dashOffset = circ * (1 - clamped);

  return (
    <div className="flex flex-col items-center" data-testid="priority-gauge">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={band.color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          className="font-display"
          style={{ fontSize: 34, fontWeight: 800, fill: "#0F172A", letterSpacing: "-0.02em" }}
        >
          {clamped.toFixed(2)}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          style={{ fontSize: 11, fill: "#64748B", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}
        >
          Priority Index
        </text>
      </svg>
      <div
        className={`mt-1 px-3 py-1 rounded-full text-xs font-semibold border ${band.bg} ${band.text} ${band.border}`}
        data-testid="priority-band-label"
      >
        {band.label} Priority
      </div>
    </div>
  );
}
