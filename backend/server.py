from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import csv
import json
import random
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="DelDOT DMV Casework API")
api_router = APIRouter(prefix="/api")

Classification = Literal["review_warranted", "review_not_warranted", "insufficient_evidence"]
ReviewerStatus = Literal["unreviewed", "confirmed_warranted", "confirmed_not_warranted", "flagged_insufficient", "dismissed"]


# --------- Models ---------
class T0Evidence(BaseModel):
    days_observed: int
    out_of_state_tag_days: int
    primary_state_detected: str
    toll_gantry_hits: int
    dl_state_match: bool
    neighborhood_parking_frequency: float  # 0..1
    vehicle_registration_status: str  # e.g. "out_of_state", "delaware", "unknown"


class T1Evidence(BaseModel):
    days_observed: int
    out_of_state_tag_days: int
    primary_state_detected: str
    toll_gantry_hits: int
    dl_state_match: bool
    neighborhood_parking_frequency: float
    vehicle_registration_status: str


class CaseModel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    candidate_id: str
    review_priority: float  # 0..1
    prob_review_warranted: float
    prob_review_not_warranted: float
    prob_insufficient_evidence: float
    predicted_class: Classification
    t0: T0Evidence
    t1: T1Evidence
    reviewer_status: ReviewerStatus = "unreviewed"
    reviewer_notes: str = ""
    reviewer_tags: List[str] = []
    last_updated: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DecisionUpdate(BaseModel):
    reviewer_status: ReviewerStatus
    reviewer_notes: Optional[str] = ""
    reviewer_tags: Optional[List[str]] = []
    reviewer_id: Optional[str] = "analyst_demo"


class AuditEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    candidate_id: str
    action: str
    reviewer_id: str
    from_status: str
    to_status: str
    notes: str = ""
    timestamp: str


# --------- Mock data seeding ---------
US_STATES = ["PA", "MD", "NJ", "VA", "NY", "OH", "WV", "DC", "NC"]

def _random_case(idx: int) -> dict:
    rng = random.Random(idx * 7919 + 13)
    # generate probability distribution
    a = rng.random()
    b = rng.random()
    c = rng.random()
    s = a + b + c
    p_w, p_nw, p_ie = a/s, b/s, c/s
    # predicted = argmax
    classes = [("review_warranted", p_w), ("review_not_warranted", p_nw), ("insufficient_evidence", p_ie)]
    predicted = max(classes, key=lambda x: x[1])[0]
    # priority is combination weighted toward warranted probability
    priority = round(min(1.0, 0.65 * p_w + 0.15 * (1 - p_ie) + rng.uniform(-0.1, 0.15)), 3)
    priority = max(0.02, priority)

    primary_state_t0 = rng.choice(US_STATES)
    # T1 sometimes shifts
    same_state = rng.random() > 0.25
    primary_state_t1 = primary_state_t0 if same_state else rng.choice(US_STATES)

    t0_days = rng.randint(20, 90)
    t1_days = t0_days + rng.randint(20, 120)
    t0_oos = rng.randint(0, t0_days)
    # T1 tends to have more info; potentially resolving
    if predicted == "review_not_warranted":
        t1_oos = max(0, t0_oos - rng.randint(0, 20))
    else:
        t1_oos = min(t1_days, t0_oos + rng.randint(0, 60))

    t0 = {
        "days_observed": t0_days,
        "out_of_state_tag_days": t0_oos,
        "primary_state_detected": primary_state_t0,
        "toll_gantry_hits": rng.randint(0, 25),
        "dl_state_match": rng.random() > 0.4,
        "neighborhood_parking_frequency": round(rng.uniform(0, 1), 2),
        "vehicle_registration_status": rng.choice(["out_of_state", "delaware", "unknown"]),
    }
    t1 = {
        "days_observed": t1_days,
        "out_of_state_tag_days": t1_oos,
        "primary_state_detected": primary_state_t1,
        "toll_gantry_hits": t0["toll_gantry_hits"] + rng.randint(0, 40),
        "dl_state_match": t0["dl_state_match"] if rng.random() > 0.25 else not t0["dl_state_match"],
        "neighborhood_parking_frequency": round(min(1.0, max(0.0, t0["neighborhood_parking_frequency"] + rng.uniform(-0.2, 0.25))), 2),
        "vehicle_registration_status": t0["vehicle_registration_status"] if rng.random() > 0.3 else rng.choice(["out_of_state", "delaware", "unknown"]),
    }

    return {
        "candidate_id": f"DE-{100000 + idx:06d}",
        "review_priority": priority,
        "prob_review_warranted": round(p_w, 3),
        "prob_review_not_warranted": round(p_nw, 3),
        "prob_insufficient_evidence": round(p_ie, 3),
        "predicted_class": predicted,
        "t0": t0,
        "t1": t1,
        "reviewer_status": "unreviewed",
        "reviewer_notes": "",
        "reviewer_tags": [],
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


async def seed_mock_cases(count: int = 60):
    existing = await db.cases.count_documents({})
    if existing > 0:
        return
    docs = [_random_case(i) for i in range(1, count + 1)]
    await db.cases.insert_many(docs)
    logger.info(f"Seeded {len(docs)} mock cases")


# --------- Helpers ---------
def _strip_id(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


async def _log_audit(candidate_id: str, action: str, reviewer_id: str, from_status: str, to_status: str, notes: str = ""):
    entry = {
        "id": f"{candidate_id}-{datetime.now(timezone.utc).timestamp()}",
        "candidate_id": candidate_id,
        "action": action,
        "reviewer_id": reviewer_id,
        "from_status": from_status,
        "to_status": to_status,
        "notes": notes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_log.insert_one(entry)


# --------- Endpoints ---------
@api_router.get("/")
async def root():
    return {"service": "DelDOT DMV Casework API", "status": "operational"}


@api_router.get("/stats")
async def get_stats():
    cases = await db.cases.find({}, {"_id": 0}).to_list(10000)
    total = len(cases)
    by_class = {"review_warranted": 0, "review_not_warranted": 0, "insufficient_evidence": 0}
    high_priority = 0
    med_priority = 0
    low_priority = 0
    shift_delta_count = 0
    state_counts = {}
    priority_bins = [0] * 10  # 10 bins of 0.1
    for c in cases:
        by_class[c["predicted_class"]] = by_class.get(c["predicted_class"], 0) + 1
        p = c["review_priority"]
        if p >= 0.70:
            high_priority += 1
        elif p >= 0.40:
            med_priority += 1
        else:
            low_priority += 1
        bin_idx = min(9, int(p * 10))
        priority_bins[bin_idx] += 1
        if c["t0"]["primary_state_detected"] != c["t1"]["primary_state_detected"]:
            shift_delta_count += 1
        st = c["t1"]["primary_state_detected"]
        state_counts[st] = state_counts.get(st, 0) + 1

    reviewer_counts = {}
    for c in cases:
        reviewer_counts[c["reviewer_status"]] = reviewer_counts.get(c["reviewer_status"], 0) + 1

    top_states = sorted(state_counts.items(), key=lambda x: -x[1])[:6]
    return {
        "total": total,
        "by_class": by_class,
        "priority": {"high": high_priority, "medium": med_priority, "low": low_priority},
        "priority_bins": priority_bins,
        "shift_delta_count": shift_delta_count,
        "top_states": [{"state": s, "count": n} for s, n in top_states],
        "reviewer_status": reviewer_counts,
    }


@api_router.get("/cases")
async def list_cases(
    q: Optional[str] = None,
    predicted_class: Optional[str] = None,
    reviewer_status: Optional[str] = None,
    priority_band: Optional[str] = None,  # high|medium|low
    sort_by: str = "review_priority",
    sort_dir: str = "desc",
    limit: int = 500,
):
    query = {}
    if q:
        query["candidate_id"] = {"$regex": q, "$options": "i"}
    if predicted_class and predicted_class != "all":
        query["predicted_class"] = predicted_class
    if reviewer_status and reviewer_status != "all":
        query["reviewer_status"] = reviewer_status
    if priority_band == "high":
        query["review_priority"] = {"$gte": 0.70}
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
        "reviewer_tags": update.reviewer_tags or [],
        "last_updated": now_iso,
    }
    await db.cases.update_one({"candidate_id": candidate_id}, {"$set": updated})
    await _log_audit(
        candidate_id=candidate_id,
        action="decision_update",
        reviewer_id=update.reviewer_id or "analyst_demo",
        from_status=existing.get("reviewer_status", "unreviewed"),
        to_status=update.reviewer_status,
        notes=update.reviewer_notes or "",
    )
    return {**existing, **updated}


@api_router.get("/audit")
async def list_audit(limit: int = 200):
    docs = await db.audit_log.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return {"entries": docs}


# CSV upload — flat case_predictions.csv schema
CSV_FIELDS = [
    "candidate_id", "review_priority",
    "prob_review_warranted", "prob_review_not_warranted", "prob_insufficient_evidence",
    "predicted_class",
    "t0_days_observed", "t0_out_of_state_tag_days", "t0_primary_state_detected",
    "t0_toll_gantry_hits", "t0_dl_state_match", "t0_neighborhood_parking_frequency", "t0_vehicle_registration_status",
    "t1_days_observed", "t1_out_of_state_tag_days", "t1_primary_state_detected",
    "t1_toll_gantry_hits", "t1_dl_state_match", "t1_neighborhood_parking_frequency", "t1_vehicle_registration_status",
    "reviewer_status", "reviewer_notes", "last_updated",
]


def _flat_to_case(row: dict) -> dict:
    def fnum(k, default=0.0):
        try:
            return float(row.get(k, default) or default)
        except ValueError:
            return default
    def fint(k, default=0):
        try:
            return int(float(row.get(k, default) or default))
        except ValueError:
            return default
    def fbool(k):
        v = str(row.get(k, "")).strip().lower()
        return v in ("true", "1", "yes", "y")
    return {
        "candidate_id": row.get("candidate_id", "").strip(),
        "review_priority": fnum("review_priority"),
        "prob_review_warranted": fnum("prob_review_warranted"),
        "prob_review_not_warranted": fnum("prob_review_not_warranted"),
        "prob_insufficient_evidence": fnum("prob_insufficient_evidence"),
        "predicted_class": row.get("predicted_class", "insufficient_evidence").strip(),
        "t0": {
            "days_observed": fint("t0_days_observed"),
            "out_of_state_tag_days": fint("t0_out_of_state_tag_days"),
            "primary_state_detected": row.get("t0_primary_state_detected", "").strip() or "UNK",
            "toll_gantry_hits": fint("t0_toll_gantry_hits"),
            "dl_state_match": fbool("t0_dl_state_match"),
            "neighborhood_parking_frequency": fnum("t0_neighborhood_parking_frequency"),
            "vehicle_registration_status": row.get("t0_vehicle_registration_status", "unknown").strip() or "unknown",
        },
        "t1": {
            "days_observed": fint("t1_days_observed"),
            "out_of_state_tag_days": fint("t1_out_of_state_tag_days"),
            "primary_state_detected": row.get("t1_primary_state_detected", "").strip() or "UNK",
            "toll_gantry_hits": fint("t1_toll_gantry_hits"),
            "dl_state_match": fbool("t1_dl_state_match"),
            "neighborhood_parking_frequency": fnum("t1_neighborhood_parking_frequency"),
            "vehicle_registration_status": row.get("t1_vehicle_registration_status", "unknown").strip() or "unknown",
        },
        "reviewer_status": row.get("reviewer_status", "unreviewed").strip() or "unreviewed",
        "reviewer_notes": row.get("reviewer_notes", "") or "",
        "reviewer_tags": [],
        "last_updated": row.get("last_updated") or datetime.now(timezone.utc).isoformat(),
    }


def _case_to_flat(c: dict) -> dict:
    t0 = c.get("t0", {})
    t1 = c.get("t1", {})
    return {
        "candidate_id": c.get("candidate_id", ""),
        "review_priority": c.get("review_priority", 0),
        "prob_review_warranted": c.get("prob_review_warranted", 0),
        "prob_review_not_warranted": c.get("prob_review_not_warranted", 0),
        "prob_insufficient_evidence": c.get("prob_insufficient_evidence", 0),
        "predicted_class": c.get("predicted_class", ""),
        "t0_days_observed": t0.get("days_observed", 0),
        "t0_out_of_state_tag_days": t0.get("out_of_state_tag_days", 0),
        "t0_primary_state_detected": t0.get("primary_state_detected", ""),
        "t0_toll_gantry_hits": t0.get("toll_gantry_hits", 0),
        "t0_dl_state_match": t0.get("dl_state_match", False),
        "t0_neighborhood_parking_frequency": t0.get("neighborhood_parking_frequency", 0),
        "t0_vehicle_registration_status": t0.get("vehicle_registration_status", ""),
        "t1_days_observed": t1.get("days_observed", 0),
        "t1_out_of_state_tag_days": t1.get("out_of_state_tag_days", 0),
        "t1_primary_state_detected": t1.get("primary_state_detected", ""),
        "t1_toll_gantry_hits": t1.get("toll_gantry_hits", 0),
        "t1_dl_state_match": t1.get("dl_state_match", False),
        "t1_neighborhood_parking_frequency": t1.get("neighborhood_parking_frequency", 0),
        "t1_vehicle_registration_status": t1.get("vehicle_registration_status", ""),
        "reviewer_status": c.get("reviewer_status", "unreviewed"),
        "reviewer_notes": c.get("reviewer_notes", ""),
        "last_updated": c.get("last_updated", ""),
    }


@api_router.post("/cases/import")
async def import_cases(file: UploadFile = File(...), replace: bool = False):
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    docs = []
    errors = []
    for i, row in enumerate(reader, start=2):
        try:
            doc = _flat_to_case(row)
            if not doc["candidate_id"]:
                errors.append({"row": i, "error": "missing candidate_id"})
                continue
            docs.append(doc)
        except Exception as e:
            errors.append({"row": i, "error": str(e)})

    if not docs:
        return {"imported": 0, "errors": errors}

    if replace:
        await db.cases.delete_many({})
        await db.cases.insert_many(docs)
    else:
        for d in docs:
            await db.cases.update_one({"candidate_id": d["candidate_id"]}, {"$set": d}, upsert=True)

    await _log_audit(
        candidate_id="BULK",
        action="csv_import",
        reviewer_id="analyst_demo",
        from_status="-",
        to_status=f"imported_{len(docs)}",
        notes=f"replace={replace}",
    )
    return {"imported": len(docs), "errors": errors}


@api_router.get("/cases/export/csv")
async def export_cases():
    cases = await db.cases.find({}, {"_id": 0}).to_list(10000)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
    writer.writeheader()
    for c in cases:
        writer.writerow(_case_to_flat(c))
    output.seek(0)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"case_predictions_{ts}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@api_router.post("/cases/reset")
async def reset_mock_data():
    await db.cases.delete_many({})
    await db.audit_log.delete_many({})
    await seed_mock_cases(60)
    await _log_audit("SYSTEM", "reset_seed", "analyst_demo", "-", "seeded")
    return {"status": "reset", "seeded": 60}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await seed_mock_cases(60)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
