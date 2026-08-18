# DelDOT DMV Casework — Product Requirements

## Original Problem Statement
Build a modern, polished hackathon decision-support web interface for the DelDOT DMV Potential Out-of-State Tag Holder Review challenge, using the NSF-DARSE/Deldot-DMV-team repository as foundation. Government-operations dashboard with clear info hierarchy, T0/T1 phase views, three classifications (review_warranted, review_not_warranted, insufficient_evidence), class probabilities, 0-to-1 review-priority indicator, case queue for prioritization, and T0→T1 evidence diff view. Non-determinative; case_predictions.csv compatible.

## User Personas
- DelDOT DMV compliance officer / case analyst — reviews prioritized queue, inspects evidence, logs decisions.
- Hackathon judge — evaluates operational usefulness and demo quality.

## Core Requirements (static)
- Case queue with filters (class, priority band, reviewer status, search) and sorting.
- Case detail workspace: candidate ID, T0/T1 phase views, three-class probabilities, 0–1 priority indicator, T0→T1 diff.
- CSV import/export round-tripping the case_predictions.csv schema.
- Decision logging + audit trail.
- Non-determinative disclaimer visible everywhere.
- Clean, high-trust government-ops light theme.

## Implemented (2026-02)
- Backend (FastAPI + MongoDB): `/api/stats`, `/api/cases` (filter/sort/search), `/api/cases/{id}`, `PATCH /api/cases/{id}`, `/api/audit`, `POST /api/cases/import` (CSV), `GET /api/cases/export/csv`, `POST /api/cases/reset`. 60 mock cases seeded on startup.
- Frontend (React + Tailwind + Shadcn + Recharts): Overview, Case Queue, Case Detail, Import/Export, Audit Log. Priority semi-gauge, probability bars, T0→T1 diff table with Escalating/Resolving/Changed/Unchanged tagging, decision buttons, notes textarea, CSV dropzone + download.
- No auth; analyst identity fixed as `analyst_demo` for audit logging.
- Testing agent iteration 1 = 100% pass (backend + frontend).

## Prioritized Backlog
- **P1** Bulk selection + bulk decisions from queue.
- **P1** Reviewer tag chips (e.g., "residency-dispute", "toll-heavy") for filtering.
- **P2** Compare case A vs B side-by-side.
- **P2** Confidence-calibration overlay on histogram.
- **P2** Roles + JWT (currently open demo).
- **P2** Real ingestion pipeline hookup to the NSF-DARSE model output.
