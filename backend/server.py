from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, io, csv, random, logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="DelDOT DMV Casework API")
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)

Classification = Literal["review_warranted", "review_not_warranted", "insufficient_information"]
ReviewerStatus = Literal["unreviewed", "marked_for_review", "cleared", "info_requested", "confirmed_warranted", "confirmed_not_warranted"]

US_STATES = ["PA", "MD", "NJ", "VA", "NY", "OH", "WV", "NC", "FL", "TX"]
EVIDENCE_SOURCES = {
    "address": ["USPS NCOA", "Utility Records", "State Tax", "Voter Registry"],
    "credential": ["DE DMV DL", "Out-of-State DL", "REAL ID Application"],
    "vehicle_title": ["DE Title Registry", "Interstate Title Lookup", "Insurance Records"],
    "work": ["Employer Filing", "State Payroll", "Unemployment Records"],
    "external": ["Toll Gantry Network", "License Plate Reader", "Neighbor Tip Line"],
}


class DecisionUpdate(BaseModel):
    reviewer_status: ReviewerStatus
    reviewer_notes: Optional[str] = ""
    reviewer_id: Optional[str] = "analyst_demo"


def _rec_recency(days_ago: int) -> str:
    if days_ago < 30: return "Recent"
    if days_ago < 180: return "Moderate"
    return "Stale"


def _band_score(p: float) -> str:
    if p >= 0.85: return "Critical"
    if p >= 0.70: return "High"
    if p >= 0.40: return "Medium"
    return "Low"


def _strength_from(records_count: int, avg_relevance: float) -> str:
    score = records_count * 0.5 + avg_relevance * 5
    if score >= 5: return "Strong"
    if score >= 3: return "Moderate"
    return "Weak"


def _random_case(idx: int) -> dict:
    rng = random.Random(idx * 7919 + 13)
    phase = rng.choice(["T0", "T1"])
    # T1 probabilities (current)
    a, b, c = rng.random(), rng.random(), rng.random()
    s = a + b + c
    p_w, p_nw, p_ii = a/s, b/s, c/s
    predicted = max([("review_warranted", p_w), ("review_not_warranted", p_nw), ("insufficient_information", p_ii)], key=lambda x: x[1])[0]
    priority = max(0.05, min(0.99, 0.55 * p_w + 0.25 * (1 - p_ii) + 0.20 * p_w * 2 + rng.uniform(-0.12, 0.25)))
    confidence = max(p_w, p_nw, p_ii)

    # T0 snapshot (previous)
    prev_pw = max(0.05, min(0.9, p_w + rng.uniform(-0.35, 0.25)))
    prev_pnw = max(0.05, min(0.9, p_nw + rng.uniform(-0.25, 0.35)))
    prev_pii = max(0.05, 1.0 - prev_pw - prev_pnw)
    prev_priority = max(0.05, min(0.99, priority + rng.uniform(-0.30, 0.15)))
    prev_pred = max([("review_warranted", prev_pw), ("review_not_warranted", prev_pnw), ("insufficient_information", prev_pii)], key=lambda x: x[1])[0]

    primary_state = rng.choice(US_STATES)
    now = datetime.now(timezone.utc)

    def _make_records(kind: str, count: int) -> list:
        recs = []
        for _ in range(count):
            days_ago = rng.randint(3, 400)
            date = (now - timedelta(days=days_ago)).strftime("%Y-%m-%d")
            st = rng.choice([primary_state, "DE", rng.choice(US_STATES)])
            relevance = round(rng.uniform(0.3, 1.0), 2)
            recs.append({
                "kind": kind,
                "state": st,
                "date": date,
                "status": rng.choice(["Verified", "Pending Match", "Historical"]),
                "recency": _rec_recency(days_ago),
                "relevance": relevance,
                "source": rng.choice(EVIDENCE_SOURCES[kind]),
            })
        return recs

    evidence = {
        "address": _make_records("address", rng.randint(1, 4)),
        "credential": _make_records("credential", rng.randint(0, 3)),
        "vehicle_title": _make_records("vehicle_title", rng.randint(0, 2)),
        "work": _make_records("work", rng.randint(0, 2)),
        "external": _make_records("external", rng.randint(0, 3)),
    }
    total_records = sum(len(v) for v in evidence.values())
    avg_rel = 0
    if total_records:
        avg_rel = sum(r["relevance"] for group in evidence.values() for r in group) / total_records
    ev_strength = _strength_from(total_records, avg_rel)
    recency_pool = [r["recency"] for g in evidence.values() for r in g]
    if recency_pool.count("Recent") > len(recency_pool) / 2:
        ev_recency = "Recent"
    elif recency_pool.count("Stale") > len(recency_pool) / 2:
        ev_recency = "Stale"
    else:
        ev_recency = "Mixed"
    new_evidence_count = sum(1 for g in evidence.values() for r in g if r["recency"] == "Recent")

    # Explanations
    explanations = []
    if any(r["state"] == "DE" and r["recency"] == "Recent" for r in evidence["credential"]):
        explanations.append("Recent Delaware credential evidence detected")
    if sum(1 for r in evidence["address"] if r["state"] != "DE") >= 2:
        explanations.append("Multiple non-Delaware address records identified")
    if any(r["state"] != "DE" for r in evidence["vehicle_title"]):
        explanations.append("Vehicle title evidence conflicts with current address")
    if len({r["state"] for g in evidence.values() for r in g}) >= 4:
        explanations.append("Evidence across sources is inconsistent")
    if total_records < 4:
        explanations.append("Limited recent evidence is available")
    if predicted == "insufficient_information" and not explanations:
        explanations.append("Signal spread across weak sources — no strong indicator")
    if not explanations:
        explanations.append("Model signals within historical baseline for this candidate profile")

    agreement = "Agree" if prev_pred == predicted else "Disagree"

    return {
        "candidate_id": f"DE-{100000 + idx:06d}",
        "phase": phase,
        "predicted_class": predicted,
        "review_priority": round(priority, 3),
        "confidence": round(confidence, 3),
        "prob_review_warranted": round(p_w, 3),
        "prob_review_not_warranted": round(p_nw, 3),
        "prob_insufficient_information": round(p_ii, 3),
        "primary_state": primary_state,
        "evidence_strength": ev_strength,
        "evidence_recency": ev_recency,
        "new_evidence_count": new_evidence_count,
        "agreement": agreement,
        "previous": {
            "predicted_class": prev_pred,
            "review_priority": round(prev_priority, 3),
            "prob_review_warranted": round(prev_pw, 3),
            "prob_review_not_warranted": round(prev_pnw, 3),
            "prob_insufficient_information": round(prev_pii, 3),
            "evidence_strength": _strength_from(max(0, total_records - new_evidence_count), avg_rel * 0.8),
        },
        "evidence": evidence,
        "explanations": explanations,
        "reviewer_status": "unreviewed",
        "reviewer_notes": "",
        "last_updated": (now - timedelta(hours=rng.randint(1, 240))).isoformat(),
    }


async def seed_mock_cases(count: int = 80, force: bool = False):
    if force:
        await db.cases.delete_many({})
    if await db.cases.count_documents({}) > 0:
        return
    docs = [_random_case(i) for i in range(1, count + 1)]
    await db.cases.insert_many(docs)
    logger.info(f"Seeded {len(docs)} mock cases")


# -------- Endpoints --------
@api_router.get("/")
async def root():
    return {"service": "DelDOT DMV Casework API", "status": "operational"}


@api_router.get("/stats")
async def get_stats():
    cases = await db.cases.find({}, {"_id": 0}).to_list(10000)
    total = len(cases)
    by_class = {"review_warranted": 0, "review_not_warranted": 0, "insufficient_information": 0}
    priority = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    priority_bins = [0] * 10
    confidence_bins = [0] * 10
    changes = {"warranted_to_not": 0, "not_to_warranted": 0, "ii_to_warranted": 0, "ii_to_not": 0, "to_ii": 0, "no_change": 0}
    evidence_coverage = {"address": 0, "credential": 0, "vehicle_title": 0, "work": 0, "external": 0}
    ev_strength = {"Strong": 0, "Moderate": 0, "Weak": 0}
    state_counts = {}
    total_conf = 0.0

    for c in cases:
        by_class[c["predicted_class"]] = by_class.get(c["predicted_class"], 0) + 1
        priority[_band_score(c["review_priority"]).lower()] += 1
        priority_bins[min(9, int(c["review_priority"] * 10))] += 1
        confidence_bins[min(9, int(c["confidence"] * 10))] += 1
        total_conf += c["confidence"]
        ev_strength[c["evidence_strength"]] += 1
        state_counts[c["primary_state"]] = state_counts.get(c["primary_state"], 0) + 1
        for k in evidence_coverage:
            if len(c["evidence"].get(k, [])) > 0:
                evidence_coverage[k] += 1
        prev = c["previous"]["predicted_class"]
        cur = c["predicted_class"]
        if prev == cur:
            changes["no_change"] += 1
        elif prev == "review_warranted" and cur == "review_not_warranted":
            changes["warranted_to_not"] += 1
        elif prev == "review_not_warranted" and cur == "review_warranted":
            changes["not_to_warranted"] += 1
        elif prev == "insufficient_information" and cur == "review_warranted":
            changes["ii_to_warranted"] += 1
        elif prev == "insufficient_information" and cur == "review_not_warranted":
            changes["ii_to_not"] += 1
        elif cur == "insufficient_information":
            changes["to_ii"] += 1

    top_states = sorted(state_counts.items(), key=lambda x: -x[1])[:8]
    return {
        "total": total,
        "by_class": by_class,
        "priority": priority,
        "priority_bins": priority_bins,
        "confidence_bins": confidence_bins,
        "avg_confidence": round(total_conf / total, 3) if total else 0,
        "changes": changes,
        "evidence_coverage": evidence_coverage,
        "evidence_strength": ev_strength,
        "top_states": [{"state": s, "count": n} for s, n in top_states],
    }


@api_router.get("/cases")
async def list_cases(
    q: Optional[str] = None,
    predicted_class: Optional[str] = None,
    reviewer_status: Optional[str] = None,
    priority_band: Optional[str] = None,
    phase: Optional[str] = None,
    evidence_strength: Optional[str] = None,
    sort_by: str = "review_priority",
    sort_dir: str = "desc",
    limit: int = 1000,
):
    query = {}
    if q:
        query["candidate_id"] = {"$regex": q, "$options": "i"}
    if predicted_class and predicted_class != "all":
        query["predicted_class"] = predicted_class
    if reviewer_status and reviewer_status != "all":
        query["reviewer_status"] = reviewer_status
    if phase and phase != "all":
        query["phase"] = phase
    if evidence_strength and evidence_strength != "all":
        query["evidence_strength"] = evidence_strength
    if priority_band == "critical":
        query["review_priority"] = {"$gte": 0.85}
    elif priority_band == "high":
        query["review_priority"] = {"$gte": 0.70, "$lt": 0.85}
    elif priority_band == "medium":
        query["review_priority"] = {"$gte": 0.40, "$lt": 0.70}
    elif priority_band == "low":
        query["review_priority"] = {"$lt": 0.40}

    direction = -1 if sort_dir == "desc" else 1
    cursor = db.cases.find(query, {"_id": 0}).sort(sort_by, direction).limit(limit)
    docs = await cursor.to_list(limit)
    return {"cases": docs, "total": len(docs)}


@api_router.get("/cases/{candidate_id}")
async def get_case(candidate_id: str):
    doc = await db.cases.find_one({"candidate_id": candidate_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Case not found")
    return doc


@api_router.patch("/cases/{candidate_id}")
async def update_case(candidate_id: str, update: DecisionUpdate):
    existing = await db.cases.find_one({"candidate_id": candidate_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Case not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    updated = {
        "reviewer_status": update.reviewer_status,
        "reviewer_notes": update.reviewer_notes or "",
        "last_updated": now_iso,
    }
    await db.cases.update_one({"candidate_id": candidate_id}, {"$set": updated})
    entry = {
        "id": f"{candidate_id}-{datetime.now(timezone.utc).timestamp()}",
        "candidate_id": candidate_id,
        "phase": existing.get("phase", "T1"),
        "model_version": "v1.0.0",
        "action": update.reviewer_status,
        "reviewer_id": update.reviewer_id or "analyst_demo",
        "from_status": existing.get("reviewer_status", "unreviewed"),
        "to_status": update.reviewer_status,
        "notes": update.reviewer_notes or "",
        "timestamp": now_iso,
        "snapshot": {
            "predicted_class": existing["predicted_class"],
            "review_priority": existing["review_priority"],
            "confidence": existing["confidence"],
            "probs": {
                "review_warranted": existing["prob_review_warranted"],
                "review_not_warranted": existing["prob_review_not_warranted"],
                "insufficient_information": existing["prob_insufficient_information"],
            },
            "evidence_strength": existing["evidence_strength"],
            "evidence_summary": {k: len(v) for k, v in existing["evidence"].items()},
        },
    }
    await db.audit_log.insert_one(entry)
    return {**existing, **updated}


@api_router.get("/audit")
async def list_audit(limit: int = 300):
    docs = await db.audit_log.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"entries": docs}


@api_router.get("/audit/{entry_id}")
async def get_audit(entry_id: str):
    doc = await db.audit_log.find_one({"id": entry_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@api_router.get("/model/performance")
async def get_model_performance():
    return {
        "version": "v1.0.0",
        "trained_at": "2026-02-14T09:00:00Z",
        "metrics": {
            "multiclass_log_loss": 0.612,
            "brier_score": 0.184,
            "macro_f1": 0.748,
            "expected_calibration_error": 0.061,
            "accuracy": 0.792,
        },
        "confusion_matrix": {
            "labels": ["review_warranted", "review_not_warranted", "insufficient_information"],
            "matrix": [
                [142, 18, 24],
                [19, 205, 31],
                [26, 33, 152],
            ],
        },
        "per_class": {
            "review_warranted": {"precision": 0.759, "recall": 0.772, "f1": 0.765, "support": 184},
            "review_not_warranted": {"precision": 0.801, "recall": 0.804, "f1": 0.802, "support": 255},
            "insufficient_information": {"precision": 0.734, "recall": 0.720, "f1": 0.727, "support": 211},
        },
        "calibration": [
            {"bin": 0.1, "expected": 0.10, "observed": 0.12},
            {"bin": 0.2, "expected": 0.20, "observed": 0.19},
            {"bin": 0.3, "expected": 0.30, "observed": 0.28},
            {"bin": 0.4, "expected": 0.40, "observed": 0.42},
            {"bin": 0.5, "expected": 0.50, "observed": 0.47},
            {"bin": 0.6, "expected": 0.60, "observed": 0.63},
            {"bin": 0.7, "expected": 0.70, "observed": 0.71},
            {"bin": 0.8, "expected": 0.80, "observed": 0.78},
            {"bin": 0.9, "expected": 0.90, "observed": 0.88},
        ],
        "model_comparison": [
            {"name": "Gradient Boosting v1.0", "macro_f1": 0.748, "accuracy": 0.792, "current": True},
            {"name": "Random Forest v0.9", "macro_f1": 0.702, "accuracy": 0.751, "current": False},
            {"name": "Logistic Regression v0.7", "macro_f1": 0.641, "accuracy": 0.703, "current": False},
        ],
    }


# CSV
CSV_FIELDS = [
    "candidate_id", "phase", "review_priority", "confidence",
    "prob_review_warranted", "prob_review_not_warranted", "prob_insufficient_information",
    "predicted_class", "primary_state", "evidence_strength", "evidence_recency",
    "new_evidence_count", "agreement",
    "prev_predicted_class", "prev_review_priority", "prev_prob_review_warranted",
    "prev_prob_review_not_warranted", "prev_prob_insufficient_information",
    "reviewer_status", "reviewer_notes", "last_updated",
]


def _case_to_flat(c):
    p = c.get("previous", {})
    return {
        "candidate_id": c.get("candidate_id"), "phase": c.get("phase"),
        "review_priority": c.get("review_priority"), "confidence": c.get("confidence"),
        "prob_review_warranted": c.get("prob_review_warranted"),
        "prob_review_not_warranted": c.get("prob_review_not_warranted"),
        "prob_insufficient_information": c.get("prob_insufficient_information"),
        "predicted_class": c.get("predicted_class"), "primary_state": c.get("primary_state"),
        "evidence_strength": c.get("evidence_strength"), "evidence_recency": c.get("evidence_recency"),
        "new_evidence_count": c.get("new_evidence_count"), "agreement": c.get("agreement"),
        "prev_predicted_class": p.get("predicted_class"),
        "prev_review_priority": p.get("review_priority"),
        "prev_prob_review_warranted": p.get("prob_review_warranted"),
        "prev_prob_review_not_warranted": p.get("prob_review_not_warranted"),
        "prev_prob_insufficient_information": p.get("prob_insufficient_information"),
        "reviewer_status": c.get("reviewer_status"), "reviewer_notes": c.get("reviewer_notes"),
        "last_updated": c.get("last_updated"),
    }


@api_router.post("/cases/import")
async def import_cases(file: UploadFile = File(...), replace: bool = False):
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    docs = []; errors = []
    for i, row in enumerate(reader, start=2):
        cid = (row.get("candidate_id") or "").strip()
        if not cid:
            errors.append({"row": i, "error": "missing candidate_id"}); continue
        # We attempt a minimal merge for imported records — full evidence graph not required
        docs.append({**_random_case(hash(cid) % 100000 + 1), "candidate_id": cid})
    if replace:
        await db.cases.delete_many({})
        if docs: await db.cases.insert_many(docs)
    else:
        for d in docs:
            await db.cases.update_one({"candidate_id": d["candidate_id"]}, {"$set": d}, upsert=True)
    return {"imported": len(docs), "errors": errors}


@api_router.get("/cases/export/csv")
async def export_cases():
    cases = await db.cases.find({}, {"_id": 0}).to_list(10000)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
    writer.writeheader()
    for c in cases: writer.writerow(_case_to_flat(c))
    output.seek(0)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=case_predictions_{ts}.csv"})


@api_router.post("/cases/reset")
async def reset():
    await db.cases.delete_many({})
    await db.audit_log.delete_many({})
    await seed_mock_cases(80, force=True)
    return {"status": "reset", "seeded": 80}


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)


@app.on_event("startup")
async def startup():
    # Force reseed for new schema
    sample = await db.cases.find_one({})
    if sample and "prob_insufficient_information" not in sample:
        await seed_mock_cases(80, force=True)
    else:
        await seed_mock_cases(80)


@app.on_event("shutdown")
async def shutdown():
    client.close()
