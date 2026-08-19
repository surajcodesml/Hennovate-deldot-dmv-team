"""Data loader: reads real case_predictions.csv + evidence timeline + model metrics.
Kept in-memory for fast queries. Reviewer state persists in Mongo.
"""
import csv
import gzip
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Optional

DATA_DIR = Path(__file__).parent / "data"

# Normalize CSV class value -> internal key
CLASS_MAP = {
    "review_warranted": "review_warranted",
    "review_not_warranted": "review_not_warranted",
    "insufficient_evidence": "insufficient_information",
}
# For CSV export, reverse:
CLASS_MAP_INV = {v: k for k, v in CLASS_MAP.items()}

SOURCE_MAP = {
    "license": "credential",
    "address": "address",
    "title": "vehicle_title",
    "work": "work",
    "external": "external",
}

EVIDENCE_KEYS = ["address", "credential", "vehicle_title", "work", "external"]


def _confidence(row) -> float:
    return max(row["prob_review_warranted"], row["prob_review_not_warranted"], row["prob_insufficient_information"])


def _entropy(row) -> float:
    ps = [row["prob_review_warranted"], row["prob_review_not_warranted"], row["prob_insufficient_information"]]
    ps = [p for p in ps if p > 0]
    if not ps:
        return 0.0
    e = -sum(p * math.log(p) for p in ps)
    return e / math.log(3)  # normalized 0..1


class DataStore:
    def __init__(self):
        self.cases: Dict[str, dict] = {}  # candidate_id -> case doc (with t0/t1)
        self.evidence: Dict[str, List[dict]] = defaultdict(list)  # candidate_id -> [records]
        self.metrics: dict = {}
        self.metadata: dict = {}
        self.validation: dict = {}
        self.loaded = False

    def load(self):
        self._load_metadata()
        self._load_predictions()
        self._load_evidence()
        self._enrich_cases()
        self._load_metrics()
        self._validate()
        self.loaded = True

    def _load_metadata(self):
        p = DATA_DIR / "prediction_metadata.json"
        if p.exists():
            self.metadata = json.loads(p.read_text())

    def _load_predictions(self):
        p = DATA_DIR / "case_predictions.csv"
        with p.open() as f:
            r = csv.DictReader(f)
            for row in r:
                cid = row["candidate_record_id"]
                phase = row["phase"]
                pred = {
                    "predicted_class": CLASS_MAP.get(row["predicted_class"], row["predicted_class"]),
                    "prob_review_warranted": float(row["p_review_warranted"]),
                    "prob_review_not_warranted": float(row["p_review_not_warranted"]),
                    "prob_insufficient_information": float(row["p_insufficient_evidence"]),
                    "review_priority": float(row["review_priority"]),
                }
                pred["confidence"] = _confidence(pred)
                if cid not in self.cases:
                    self.cases[cid] = {"candidate_id": cid, "t0": None, "t1": None}
                self.cases[cid][phase.lower()] = pred

    def _load_evidence(self):
        p = DATA_DIR / "evidence_timeline.csv.gz"
        if not p.exists():
            return
        with gzip.open(p, "rt") as f:
            r = csv.DictReader(f)
            for row in r:
                cid = row["candidate_record_id"]
                if cid not in self.cases:
                    continue
                dom = SOURCE_MAP.get(row["source_domain"])
                if not dom:
                    continue
                self.evidence[cid].append({
                    "kind": dom,
                    "source_domain": row["source_domain"],
                    "source_record_id": row.get("source_record_id", ""),
                    "state": row.get("state", "") or "UNK",
                    "date": row.get("event_date") or row.get("observed_date") or "",
                    "event_type": row.get("event_type", ""),
                    "status": row.get("status", "") or "active",
                    "quality": row.get("quality", ""),
                    "record_action": row.get("record_action", ""),
                    "match_confidence": float(row.get("match_confidence") or 0),
                    "phase_available": row.get("phase_available", "T0"),
                })

    def _enrich_cases(self):
        # Derive current (T1 preferred) + previous (T0) + evidence summary + explanations
        for cid, c in self.cases.items():
            t0 = c["t0"] or c["t1"]
            t1 = c["t1"] or c["t0"]
            c["previous"] = {
                "predicted_class": t0["predicted_class"],
                "review_priority": t0["review_priority"],
                "prob_review_warranted": t0["prob_review_warranted"],
                "prob_review_not_warranted": t0["prob_review_not_warranted"],
                "prob_insufficient_information": t0["prob_insufficient_information"],
                "confidence": t0["confidence"],
            }
            # Copy T1 fields to top-level for compatibility
            c["phase"] = "T1"
            for k in ["predicted_class", "prob_review_warranted", "prob_review_not_warranted",
                      "prob_insufficient_information", "review_priority", "confidence"]:
                c[k] = t1[k]

            # Evidence summary per source
            records = self.evidence.get(cid, [])
            grouped = defaultdict(list)
            for r in records:
                grouped[r["kind"]].append(r)
            ev_counts = {k: len(grouped.get(k, [])) for k in EVIDENCE_KEYS}
            c["evidence_counts"] = ev_counts
            total_records = sum(ev_counts.values())

            # Strength: from record count + mean match_confidence
            avg_conf = 0.0
            if records:
                avg_conf = sum(r["match_confidence"] for r in records) / len(records)
            score = total_records * 0.5 + avg_conf * 5
            if score >= 12:
                c["evidence_strength"] = "Strong"
            elif score >= 6:
                c["evidence_strength"] = "Moderate"
            else:
                c["evidence_strength"] = "Weak"

            # Recency: newest event_date bucket
            dates = [r["date"] for r in records if r["date"]]
            latest = max(dates) if dates else None
            c["latest_evidence_date"] = latest
            recent_count = sum(1 for r in records if r["phase_available"] == "T1")
            c["new_evidence_count"] = recent_count
            older = len(records) - recent_count
            if recent_count > older:
                c["evidence_recency"] = "Recent"
            elif older > 2 * max(1, recent_count):
                c["evidence_recency"] = "Stale"
            else:
                c["evidence_recency"] = "Mixed"

            # Agreement
            c["agreement"] = "Agree" if t0["predicted_class"] == t1["predicted_class"] else "Disagree"

            # Primary state (majority state in evidence)
            states = [r["state"] for r in records if r["state"] and r["state"] != "UNK"]
            if states:
                c["primary_state"] = Counter(states).most_common(1)[0][0]
            else:
                c["primary_state"] = "UNK"

            # Explanations
            ex = []
            de_cred = [r for r in grouped.get("credential", []) if r["state"] == "DE"]
            non_de_addr = [r for r in grouped.get("address", []) if r["state"] and r["state"] != "DE"]
            title_states = {r["state"] for r in grouped.get("vehicle_title", [])}
            addr_states = {r["state"] for r in grouped.get("address", [])}
            all_states = {r["state"] for r in records if r["state"]}
            if de_cred:
                ex.append(f"Recent Delaware credential evidence detected ({len(de_cred)} record{'s' if len(de_cred)>1 else ''})")
            if len(non_de_addr) >= 2:
                nonde = Counter(r["state"] for r in non_de_addr).most_common(1)[0][0]
                ex.append(f"Multiple non-Delaware address records identified (primary: {nonde})")
            if title_states and addr_states and not (title_states & addr_states):
                ex.append("Vehicle title evidence conflicts with current address")
            if len(all_states) >= 4:
                ex.append("Evidence across sources is inconsistent")
            if total_records < 4:
                ex.append("Limited recent evidence is available")
            if not ex:
                if c["predicted_class"] == "insufficient_information":
                    ex.append("Signal spread across weak sources — no strong indicator")
                else:
                    ex.append("Model signals within historical baseline for this candidate profile")
            c["explanations"] = ex

    def _load_metrics(self):
        p = DATA_DIR / "model_metrics.json"
        if not p.exists():
            return
        raw = json.loads(p.read_text())
        selected = raw["selection"]["model_name"]
        sel = raw["models"][selected]
        # Aggregate across T0/T1
        def avg(k):
            return (sel["T0"][k] + sel["T1"][k]) / 2
        # Confusion matrix aggregate
        cm0 = sel["T0"]["confusion_matrix"]
        cm1 = sel["T1"]["confusion_matrix"]
        cm = [[cm0[i][j] + cm1[i][j] for j in range(3)] for i in range(3)]
        # Per-class aggregate
        def avg_pc(cls, k):
            return (sel["T0"]["per_class"][cls][k] + sel["T1"]["per_class"][cls][k]) / 2
        def sup(cls):
            return sel["T0"]["per_class"][cls]["support"] + sel["T1"]["per_class"][cls]["support"]

        # Calibration from oof predictions
        calibration = self._compute_calibration(selected)

        leaderboard = raw["selection"]["leaderboard"]
        self.metrics = {
            "version": self.metadata.get("model_version", selected),
            "selected_model": selected,
            "trained_at": self.metadata.get("prediction_timestamp", ""),
            "metrics": {
                "multiclass_log_loss": round(avg("log_loss"), 4),
                "brier_score": round(avg("multiclass_brier"), 4),
                "macro_f1": round(avg("macro_f1"), 4),
                "expected_calibration_error": round(avg("ece_10_bin"), 4),
                "accuracy": round(avg("accuracy"), 4),
            },
            "confusion_matrix": {
                "labels": ["review_warranted", "review_not_warranted", "insufficient_information"],
                "matrix": cm,
            },
            "per_class": {
                "review_warranted": {"precision": round(avg_pc("review_warranted","precision"),3),
                                     "recall": round(avg_pc("review_warranted","recall"),3),
                                     "f1": round(avg_pc("review_warranted","f1"),3),
                                     "support": sup("review_warranted")},
                "review_not_warranted": {"precision": round(avg_pc("review_not_warranted","precision"),3),
                                     "recall": round(avg_pc("review_not_warranted","recall"),3),
                                     "f1": round(avg_pc("review_not_warranted","f1"),3),
                                     "support": sup("review_not_warranted")},
                "insufficient_information": {"precision": round(avg_pc("insufficient_evidence","precision"),3),
                                     "recall": round(avg_pc("insufficient_evidence","recall"),3),
                                     "f1": round(avg_pc("insufficient_evidence","f1"),3),
                                     "support": sup("insufficient_evidence")},
            },
            "calibration": calibration,
            "model_comparison": [
                {"name": lb["model_name"],
                 "macro_f1": round(lb["mean_macro_f1"], 4),
                 "accuracy": round(1 - lb["mean_log_loss"]/2, 4) if lb["mean_log_loss"] < 2 else 0,
                 "log_loss": round(lb["mean_log_loss"], 4),
                 "brier": round(lb["mean_brier"], 4),
                 "ece": round(lb["mean_ece"], 4),
                 "current": lb["model_name"] == selected}
                for lb in leaderboard
            ],
        }

    def _compute_calibration(self, model_name: str) -> list:
        p = DATA_DIR / "oof_predictions.csv"
        if not p.exists():
            return []
        # Bin max-prob confidence vs observed accuracy
        bins = [[] for _ in range(10)]
        with p.open() as f:
            r = csv.DictReader(f)
            for row in r:
                if row.get("model_name") != model_name:
                    continue
                probs = [float(row["p_review_warranted"]), float(row["p_review_not_warranted"]), float(row["p_insufficient_evidence"])]
                pred_idx = probs.index(max(probs))
                pred_cls = ["review_warranted", "review_not_warranted", "insufficient_evidence"][pred_idx]
                actual = row["actual_class"]
                conf = max(probs)
                b = min(9, int(conf * 10))
                bins[b].append((conf, 1 if pred_cls == actual else 0))
        cal = []
        for i, b in enumerate(bins):
            if not b:
                continue
            exp = sum(x[0] for x in b) / len(b)
            obs = sum(x[1] for x in b) / len(b)
            cal.append({"bin": round((i + 0.5) / 10, 2), "expected": round(exp, 3), "observed": round(obs, 3), "n": len(b)})
        return cal

    def _validate(self):
        total_rows = sum((1 if c["t0"] else 0) + (1 if c["t1"] else 0) for c in self.cases.values())
        expected = self.metadata.get("rows", 0)
        t0 = sum(1 for c in self.cases.values() if c["t0"])
        t1 = sum(1 for c in self.cases.values() if c["t1"])
        class_counts = Counter(c["predicted_class"] for c in self.cases.values())
        # Also class counts by phase from raw
        t0_classes = Counter(c["t0"]["predicted_class"] for c in self.cases.values() if c["t0"])
        t1_classes = Counter(c["t1"]["predicted_class"] for c in self.cases.values() if c["t1"])
        self.validation = {
            "total_prediction_rows": total_rows,
            "expected_rows": expected,
            "unique_candidates": len(self.cases),
            "t0_records": t0,
            "t1_records": t1,
            "evidence_records": sum(len(v) for v in self.evidence.values()),
            "by_class_t1": dict(t1_classes),
            "by_class_t0": dict(t0_classes),
            "warnings": [],
        }
        if expected and total_rows != expected:
            self.validation["warnings"].append(
                f"Dataset validation issue: only {total_rows} of {expected} expected rows were loaded."
            )
        if len(self.cases) != t0 or len(self.cases) != t1:
            self.validation["warnings"].append(
                f"Phase mismatch: {t0} T0 records, {t1} T1 records, {len(self.cases)} candidates."
            )


store = DataStore()
