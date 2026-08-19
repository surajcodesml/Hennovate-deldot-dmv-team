"""Backend API tests for DelDOT DMV Casework - real repository data integration.

Covers: /data/status, /stats (T0+T1), /cases pagination/filter/search/sort, /cases/{id} detail,
PATCH reviewer state + audit, tag add/remove/list/filter, /cases/compare, /model/performance,
/cases/export/csv.
"""
import os, pytest, requests, io, csv

BASE = os.environ.get('REACT_APP_BACKEND_URL')
if not BASE:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE = line.split('=', 1)[1].strip()
BASE = BASE.rstrip('/')
API = f"{BASE}/api"

SAMPLE = "CAN-B6WV6HQ3JW"


# ---- Data Status ----
def test_data_status():
    r = requests.get(f"{API}/data/status", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["total_prediction_rows"] == 24000
    assert d["expected_rows"] == 24000
    assert d["unique_candidates"] == 12000
    assert d["t0_records"] == 12000
    assert d["t1_records"] == 12000
    assert d["evidence_records"] == 216000
    assert set(d["by_class_t1"].keys()) == {"review_warranted", "review_not_warranted", "insufficient_information"}
    assert d["warnings"] == []
    assert d["model_version"]


# ---- Stats T1 ----
def test_stats_t1():
    r = requests.get(f"{API}/stats", params={"phase": "T1"}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 12000
    assert sum(d["by_class"].values()) == 12000
    assert set(d["by_class"].keys()) == {"review_warranted", "review_not_warranted", "insufficient_information"}
    assert set(d["priority"].keys()) == {"critical", "high", "medium", "low"}
    assert len(d["priority_bins"]) == 10
    assert len(d["confidence_bins"]) == 10
    assert 0 <= d["avg_confidence"] <= 1
    assert len(d["changes"]) == 6
    assert set(d["evidence_coverage"].keys()) == {"address", "credential", "vehicle_title", "work", "external"}
    assert set(d["evidence_strength"].keys()) >= {"Strong", "Moderate", "Weak"}


def test_stats_t0_differs_from_t1():
    t0 = requests.get(f"{API}/stats", params={"phase": "T0"}).json()
    t1 = requests.get(f"{API}/stats", params={"phase": "T1"}).json()
    assert t0["total"] == 12000
    # by_class should differ between phases
    assert t0["by_class"] != t1["by_class"]


# ---- Cases list ----
def test_cases_list_pagination():
    r = requests.get(f"{API}/cases", params={"limit": 25, "sort_by": "review_priority", "sort_dir": "desc"}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 12000
    assert len(d["cases"]) == 25
    # Sorted desc
    priorities = [c["review_priority"] for c in d["cases"]]
    assert priorities == sorted(priorities, reverse=True)


def test_cases_search_substring():
    r = requests.get(f"{API}/cases", params={"q": "CAN-B6", "limit": 25})
    assert r.status_code == 200
    for c in r.json()["cases"]:
        assert "CAN-B6" in c["candidate_id"].upper()


@pytest.mark.parametrize("cls", ["review_warranted", "review_not_warranted", "insufficient_information"])
def test_cases_filter_class(cls):
    r = requests.get(f"{API}/cases", params={"predicted_class": cls, "limit": 10})
    assert r.status_code == 200
    for c in r.json()["cases"]:
        assert c["predicted_class"] == cls


def test_cases_filter_evidence_strength():
    r = requests.get(f"{API}/cases", params={"evidence_strength": "Strong", "limit": 10})
    for c in r.json()["cases"]:
        assert c["evidence_strength"] == "Strong"


def test_cases_phase_t0():
    r = requests.get(f"{API}/cases", params={"phase": "T0", "limit": 5})
    assert r.status_code == 200
    for c in r.json()["cases"]:
        assert c["phase"] == "T0"


# ---- Case detail ----
def test_case_detail_sample():
    r = requests.get(f"{API}/cases/{SAMPLE}", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["candidate_id"] == SAMPLE
    assert d.get("t0") and d.get("t1")
    for k in ["address", "credential", "vehicle_title", "work", "external"]:
        assert k in d["evidence"]
    assert isinstance(d["explanations"], list)


def test_case_404():
    assert requests.get(f"{API}/cases/CAN-DOESNOTEXIST").status_code == 404


# ---- PATCH + Audit ----
def test_patch_and_audit():
    r = requests.patch(f"{API}/cases/{SAMPLE}", json={
        "reviewer_status": "marked_for_review", "reviewer_notes": "TEST_pytest"})
    assert r.status_code == 200, r.text
    assert r.json()["reviewer_status"] == "marked_for_review"

    a = requests.get(f"{API}/audit").json()["entries"]
    assert len(a) >= 1
    top = a[0]
    assert "snapshot" in top
    assert "predicted_class" in top["snapshot"]


# ---- Tags ----
def test_tag_lifecycle():
    tag = "TEST_Address_Conflict"
    # Add
    r = requests.post(f"{API}/cases/{SAMPLE}/tags", json={"tag": tag})
    assert r.status_code == 200
    assert tag in r.json()["reviewer_tags"]

    # List tags
    tl = requests.get(f"{API}/tags").json()["tags"]
    assert any(t["tag"] == tag for t in tl)

    # Filter by tag
    fl = requests.get(f"{API}/cases", params={"tag": tag, "limit": 10}).json()
    assert any(c["candidate_id"] == SAMPLE for c in fl["cases"])

    # Remove
    r2 = requests.delete(f"{API}/cases/{SAMPLE}/tags/{tag}")
    assert r2.status_code == 200
    assert tag not in r2.json()["reviewer_tags"]


# ---- Compare ----
def test_compare():
    lst = requests.get(f"{API}/cases", params={"limit": 2}).json()["cases"]
    a_id, b_id = lst[0]["candidate_id"], lst[1]["candidate_id"]
    r = requests.get(f"{API}/cases/compare/{a_id}/{b_id}", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["a"]["candidate_id"] == a_id
    assert d["b"]["candidate_id"] == b_id
    assert "evidence" in d["a"] and "evidence" in d["b"]


# ---- Model Performance ----
def test_model_performance():
    r = requests.get(f"{API}/model/performance", timeout=15)
    assert r.status_code == 200
    d = r.json()
    m = d["metrics"]
    # Real metrics ~
    assert 0.9 <= m["multiclass_log_loss"] <= 1.0
    assert 0.5 <= m["brier_score"] <= 0.6
    assert 0.5 <= m["macro_f1"] <= 0.6
    assert 0.05 <= m["expected_calibration_error"] <= 0.1
    cm = d["confusion_matrix"]
    assert len(cm["labels"]) == 3
    assert len(cm["matrix"]) == 3
    assert "insufficient_information" in d["per_class"]
    assert isinstance(d["calibration"], list) and len(d["calibration"]) > 0
    assert isinstance(d["model_comparison"], list) and len(d["model_comparison"]) >= 1


# ---- CSV export ----
def test_csv_export():
    r = requests.get(f"{API}/cases/export/csv", timeout=60)
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    text = r.content.decode()
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    header = rows[0]
    assert header == ["candidate_record_id", "phase", "predicted_class",
                      "p_review_warranted", "p_review_not_warranted",
                      "p_insufficient_evidence", "review_priority"]
    assert len(rows) - 1 == 24000
    # 'insufficient_evidence' value preserved in raw CSV (not renamed)
    classes = {r[2] for r in rows[1:]}
    assert "insufficient_evidence" in classes
