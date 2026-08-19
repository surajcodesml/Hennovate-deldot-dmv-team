import os, io, pytest, requests

BASE = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE:
    # Fallback to reading frontend .env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE}/api"


@pytest.fixture(scope="session", autouse=True)
def reset_state():
    r = requests.post(f"{API}/cases/reset", timeout=30)
    assert r.status_code == 200
    assert r.json().get("seeded") == 80


# ---- stats ----
def test_stats_shape():
    r = requests.get(f"{API}/stats", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 80
    assert set(d["by_class"].keys()) == {"review_warranted", "review_not_warranted", "insufficient_information"}
    assert sum(d["by_class"].values()) == 80
    assert set(d["priority"].keys()) == {"critical", "high", "medium", "low"}
    assert len(d["priority_bins"]) == 10
    assert len(d["confidence_bins"]) == 10
    assert 0 <= d["avg_confidence"] <= 1
    assert len(d["changes"]) == 6
    assert set(d["evidence_coverage"].keys()) == {"address", "credential", "vehicle_title", "work", "external"}
    assert "evidence_strength" in d


# ---- cases list ----
def test_cases_list_80():
    r = requests.get(f"{API}/cases", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 80
    c0 = d["cases"][0]
    for k in ["candidate_id", "prob_insufficient_information", "confidence", "evidence_strength",
              "evidence_recency", "agreement", "previous", "evidence", "explanations"]:
        assert k in c0


@pytest.mark.parametrize("cls", ["review_warranted", "review_not_warranted", "insufficient_information"])
def test_filter_class(cls):
    r = requests.get(f"{API}/cases", params={"predicted_class": cls})
    assert r.status_code == 200
    for c in r.json()["cases"]:
        assert c["predicted_class"] == cls


@pytest.mark.parametrize("band,lo,hi", [("critical", 0.85, 1.01), ("high", 0.70, 0.85),
                                          ("medium", 0.40, 0.70), ("low", 0.0, 0.40)])
def test_priority_band(band, lo, hi):
    r = requests.get(f"{API}/cases", params={"priority_band": band})
    assert r.status_code == 200
    for c in r.json()["cases"]:
        assert lo <= c["review_priority"] < hi


@pytest.mark.parametrize("ph", ["T0", "T1"])
def test_phase_filter(ph):
    r = requests.get(f"{API}/cases", params={"phase": ph})
    assert r.status_code == 200
    for c in r.json()["cases"]:
        assert c["phase"] == ph


def test_evstrength_filter():
    r = requests.get(f"{API}/cases", params={"evidence_strength": "Strong"})
    for c in r.json()["cases"]:
        assert c["evidence_strength"] == "Strong"


# ---- case detail ----
def test_case_detail():
    lst = requests.get(f"{API}/cases").json()["cases"]
    cid = lst[0]["candidate_id"]
    r = requests.get(f"{API}/cases/{cid}")
    assert r.status_code == 200
    d = r.json()
    assert d["candidate_id"] == cid
    for k in ["address", "credential", "vehicle_title", "work", "external"]:
        assert k in d["evidence"]
    assert isinstance(d["explanations"], list) and d["explanations"]


def test_case_404():
    assert requests.get(f"{API}/cases/DE-999999").status_code == 404


# ---- patch decisions ----
@pytest.mark.parametrize("status", ["marked_for_review", "cleared", "info_requested"])
def test_patch_case(status):
    cid = requests.get(f"{API}/cases").json()["cases"][0]["candidate_id"]
    r = requests.patch(f"{API}/cases/{cid}", json={"reviewer_status": status, "reviewer_notes": f"TEST_{status}"})
    assert r.status_code == 200, r.text
    assert r.json()["reviewer_status"] == status


def test_audit_after_patch():
    r = requests.get(f"{API}/audit")
    assert r.status_code == 200
    entries = r.json()["entries"]
    assert len(entries) >= 3
    e0 = entries[0]
    assert "snapshot" in e0
    snap = e0["snapshot"]
    assert "predicted_class" in snap and "probs" in snap
    # get single
    r2 = requests.get(f"{API}/audit/{e0['id']}")
    assert r2.status_code == 200
    assert r2.json()["id"] == e0["id"]


# ---- model performance ----
def test_model_performance():
    r = requests.get(f"{API}/model/performance")
    assert r.status_code == 200
    d = r.json()
    m = d["metrics"]
    for k in ["multiclass_log_loss", "brier_score", "macro_f1", "expected_calibration_error", "accuracy"]:
        assert k in m
    cm = d["confusion_matrix"]
    assert len(cm["labels"]) == 3
    assert len(cm["matrix"]) == 3 and all(len(r) == 3 for r in cm["matrix"])
    for c in ["review_warranted", "review_not_warranted", "insufficient_information"]:
        assert c in d["per_class"]
    assert isinstance(d["calibration"], list) and len(d["calibration"]) > 0
    assert isinstance(d["model_comparison"], list) and len(d["model_comparison"]) >= 1


# ---- CSV round-trip ----
def test_csv_export_import():
    r = requests.get(f"{API}/cases/export/csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    content = r.content
    assert b"candidate_id" in content
    files = {"file": ("cases.csv", content, "text/csv")}
    r2 = requests.post(f"{API}/cases/import", files=files, params={"replace": "true"})
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["imported"] == 80
    assert d2["errors"] == []
