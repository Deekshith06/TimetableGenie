# TimetableGenie

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![OR-Tools CP-SAT](https://img.shields.io/badge/Solver-OR--Tools%20CP--SAT-red.svg)](https://developers.google.com/optimization)
[![Technical Report](https://img.shields.io/badge/Academic%20Report-PDF-red.svg)](docs/report/TimetableGenie_Report.pdf)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black.svg)](https://timetablegenie.vercel.app)

**Author:** Seelaboyina Deekshith ([@Deekshith06](https://github.com/Deekshith06))  
**Academic Affiliation:** Department of Computer Science and Engineering  
**Smart India Hackathon:** Problem Statement SIH25091 (Multidisciplinary University Timetable Planner)

---

## Technical Report & Research Manuscript
The comprehensive academic research paper and technical report is available in Springer Nature format:
- **Compiled PDF Report:** [**`docs/report/TimetableGenie_Report.pdf`**](docs/report/TimetableGenie_Report.pdf)
- **Full LaTeX Source Code:** [**`docs/report/TimetableGenie_Report.tex`**](docs/report/TimetableGenie_Report.tex)
- **Report Documentation:** [**`docs/report/README.md`**](docs/report/README.md)

---

A working multidisciplinary weekly-timetable planner with real constraint solving, independently reconstructed audits, explicit student selections and measurable disruption repair. The frontend follows an architectural monochrome dimensional-drawing design system.

The private hosted application uses a bounded browser search engine and a server-side independent verifier. The supplied local application uses OR-Tools CP-SAT, FastAPI and the same React interface.

### Core Capabilities & Innovations
1. **Full-Semester 17-Week Calendar Engine (Weeks 1–17):**
   - Configures the institutional calendar spanning 3 August 2026 to 27 November 2026.
   - Dual Exam Blackout Windows: Week 8 Mid-Term (21–25 Sep 2026) and Week 17 End-Term (23–27 Nov 2026) suspend instruction and lock slots against scheduling.
   - Active Teaching Forward-Planning: Week 16 (16–20 Nov 2026) operates as a full teaching week for syllabus completion and laboratory revision before End-Term exams.
2. **Retrospective Completed-Date Locks & Immutability:**
   - Historical weeks (Weeks 1–11) and past dates are immutably locked with a `Completed` status badge.
   - Prevents retroactive corruption of past lecture logs while allowing agile schedule adjustments in active and upcoming weeks (Weeks 12–16).
3. **Real-Time Indian Standard Time (IST) Class Telemetry:**
   - 1-second continuous auto-sync against `Asia/Kolkata` (UTC+05:30) wall-clock time.
   - Evaluates active teaching periods (Periods 0–7) and highlights running classes (`live-running`) with status badges (*In Session*, *Break*, *Classes Concluded for Today*).
4. **Zero-Layout-Shift Fixed 2-Row Semester Navigator:**
   - Permanent 2-row navigation architecture preventing cumulative layout shift ($\text{CLS}=0$) between standard, break, and examination weeks.
   - Dedicated row 1 for stepper controls, date range indicators, compact status badges, and "Dates & Exams" modal triggers; dedicated row 2 for horizontal W1–W17 pills.
5. **Pre-Drag Availability Highlighting Matrix:**
   - Evaluates all grid cells $(d, p)$ on drag-start against 5 hard constraint dimensions (room occupancy, instructor availability, student pathways, lunch break continuity, and exam suspensions).
   - Valid clash-free slots glow green dashed borders (`valid-slot`); clashing slots glow red dashed borders (`clash-slot`) with precise hover tooltips.
6. **Independent Auditing & Cryptographic Integrity:**
   - 13 primary hard constraint categories (H1–H13) independently verified in both Python and TypeScript without accessing solver state.
   - Continuous recalculation of SHA-256 digests for problem revision, schedule assignment, and verification report.

## Run the full local application

Requirements: Python3.12, Node24 and pnpm11.25.0. From this directory:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm run build:local
ALLOW_DEMO_AUTH=true .venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. This explicit development mode bypasses login only for a loopback-only local demo. It uses persistent SQLite and isolated process workers. On Windows, use the virtual environment's `Scripts` executables and set environment variables with the shell's syntax.

For authenticated local use, leave `ALLOW_DEMO_AUTH` unset/false, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before first startup, then use **Workspace account → Local service login**. Passwords are Argon2id hashes; session cookies are HttpOnly and SameSite Strict. Account creation is administrator-configured. A changed environment password does not silently reset an existing account. Use TLS, a reverse proxy and `SESSION_COOKIE_SECURE=true` before exposing a local service. No credential or production exposure is created by this repository.

For separate frontend development, run the API on127.0.0.1:8000 and `pnpm exec vite --config vite.local.config.ts`; its `/api` proxy targets that API.

## PostgreSQL and Redis deployment configuration

```bash
cp backend/dev.env.example .env
# Edit .env: choose a database password and either local demo mode
# or an administrator password with ALLOW_DEMO_AUTH=false.
docker compose up --build
```

Compose binds the API to127.0.0.1:8000, starts PostgreSQL and Redis with durable volumes, and runs a separate queue worker. The first schema is created at bootstrap; the schema models are in `backend/app/store.py`. Back up PostgreSQL using `pg_dump` and retain matching source/dataset revisions. Future schema changes require an explicit migration; `create_all` does not migrate an existing table.

**Execution boundary:** the direct Python/API path and frontend builds were executed in the development environment. Docker was unavailable there, so the Compose/PostgreSQL/Redis path is supplied but is not reported as an executed integration test. Keep that distinction when using the project in a report.

## Use the planner

1. Inspect the recorded synthetic example:29 meetings,35 occupied periods, six rooms, six faculty, four enrollment groups, two baskets and all seven configured categories.
2. Edit courses, session requirements, faculty eligibility/availability, room capacity/equipment and actual student pathways. Draft changes do not overwrite an accepted timetable.
3. Configure basket alternatives and their synchronized session groups. A group selects one parallel alternative. A reserved basket window can also protect compulsory classes for eligible pathways.
4. Generate within the selected search budget. Read the actual status. Feasible is distinct from optimal; unknown is distinct from infeasible.
5. Inspect the independent certificate or run its deliberate broken-schedule check. Import an audit bundle to recompute its bound-data integrity.
6. Close a weekly room/faculty period, or drag a meeting to request a locked move, then repair. Failed repair preserves the previous accepted timetable.
7. Export actual results as PDF, XLSX, CSV, iCalendar or a reproducible JSON bundle.

**UI anatomy** opens the self-contained measured reference sheet in `public/design/ui-card-sheet.html`. The drawing kit is attributed under its MIT license. No skill is installed into the user's environment.

## Reproduce a result without a server

```bash
.venv/bin/python -m backend.cli solve datasets/nep2020_synthetic_data.json --seconds 3 --output my_bundle.json
.venv/bin/python -m backend.cli verify my_bundle.json
.venv/bin/python -m backend.cli export my_bundle.json --format xlsx --output my_timetable.xlsx
.venv/bin/python -m backend.cli solve datasets/transit_proxy_corpus.json --seconds 3 --output transit_bundle.json
```

The initial sample is a recorded real solve, not a hardcoded fake solver response. It can be re-audited with `datasets/demo_bundle.json`. Different wall-clock budgets or library/hardware versions may produce a different feasible schedule or unknown status.

## What the certificate establishes

H1–H11 cover every declared meeting, room/faculty/selected-group conflicts, basket synchronization, uninterrupted blocks, capacity, room equipment and faculty qualification, calendar/availability, workload and theory spread. H12 travel and H13 assignment locks are additional explicit rules. Disabled optional rules show “not applicable.” Unknown/malformed assignments and incomplete checks cannot pass.

The independent Python and TypeScript auditors do not import solver implementation code. They reconstruct all occupied periods, including a lab's second period. Their problem/schedule SHA-256 digests agree on the supported schema. Certificates are **unsigned integrity reports**, not signatures, encryption, privacy protection, zero-knowledge proofs or proof that the software models every real-world requirement. A trusted expected digest is needed for an integrity comparison. See `docs/architecture.md`.

Academic credits are separate metadata. The normalized event list is the authoritative contact requirement; an editor cannot infer a university curriculum from a credit number. Workload caps and category labels are configurable synthetic policies, not invented universal UGC limits.

## Supported scope and limits

- Repeated weekly templates, Monday-first day lists, equal-duration periods, explicit breaks and a term of at most 366 days. Holiday occurrences are excluded from calendar exports. Alternate-week timetables and co-teaching are outside this schema and are not silently accepted.
- Calendar export uses explicit UTC recurrence dates, preserving the institution's local time across timezone changes. Ambiguous/nonexistent local times need an explicit dated exception instead of an invented resolution.
- Repair preserves the calendar reference. A weekday/period closure affects the weekly template; it is not claimed to be a one-off dated closure.
- The hosted solver is capped at 100 events, bounded placement/bundle domains, a time budget and a node budget. It can return unknown even for a feasible instance. The local CP-SAT path also has bounded preprocessing/search.
- Infeasibility explanations are sufficient assumption cores when available, **not** claimed minimal IISs. No minimum-cardinality conflict shrinker is implemented.
- The synthetic transit fixture is not self-collected transport evidence. The adapter preserves a restricted explicitly supplied resource-allocation representation; it is not a general GTFS/crew/vehicle-continuity optimizer.
- FYUGP/B.Tech/ITEP/B.Ed./M.Ed. profile entries are configuration starting points requiring institutional review, not regulator-certified implementations.
- No external competition baseline was executed, no GNN/RL model was trained, and no research novelty or universal speed/optimality guarantee is claimed.
- Hosted owner identity is platform-provided. Native D1 migrations are included. Development preview can work without a signed-in account, with results explicitly labeled device-only; it cannot save another owner's records.

## Tests and raw evidence

```bash
.venv/bin/python scripts/run-checks.py
.venv/bin/python benchmarks/run.py
pnpm run build
```

`docs/validation.json` records observed command exit codes and summaries. Tests include targeted mutations for each rule, malformed/forged events, lunch and second-period closures, small independent feasibility bounds, repair, cancellation, owner isolation, API jobs/exports, cross-language digests and the HTTP-preview hashing regression. Browser interaction observations are recorded separately in `docs/implementation-report.md`.

The27-run pilot uses three sizes and three seeds. It keeps positive results, unknown statuses and a greedy baseline together. At the tested1.5-second CP-SAT budget, larger cases returned unknown; this is not evidence of infeasibility. See `benchmarks/results/summary.md`, `runs.json`, the environment record and input/witness files. Planted witnesses establish fixture feasibility and are never supplied to the algorithms.

## Source map

| Area | Files |
|---|---|
| Frontend | `components/`, `hooks/use-planner.ts`, `app/globals.css`, `app/dimensional.css` |
| Shared browser contract | `lib/domain.ts` |
| Hosted search | `public/solver-worker.js` |
| Hosted audit/persistence/API | `lib/verifier.ts`, `app/api/[...path]/route.ts`, `db/`, `drizzle/` |
| Local CP-SAT and independent audit | `backend/app/solver.py`, `backend/app/verifier.py` |
| Local API/jobs/auth/exports | `backend/app/main.py`, `jobs.py`, `store.py`, `exports.py` |
| Data and generators | `datasets/` |
| Test and experiment evidence | `backend/tests/`, `tests/`, `benchmarks/results/`, `docs/validation.json` |
| Research and manuscript | `docs/research/` |
| Architecture and traceability | `docs/architecture.md`, `docs/traceability.md` |
| Requested frontend reference | `docs/design-source.md`, `vendor/dimensional-drawing/LICENSE` |

## API entry points

The local service exposes interactive API documentation at `/docs`, JSON Schema at `/api/contracts` and OpenAPI at `/openapi.json`.

- Problem validation and immutable revision creation: `/api/validate`, `/api/problems`, `/api/problems/{id}`.
- Jobs: `/api/solve/nep-direct`, `/api/solve/transit-proxy`, `/api/solve/disruption-repair`, `/api/jobs/{id}`, `/api/jobs/{id}/cancel`.
- SSE: `/api/stream/{id}`, supporting `Last-Event-ID`/`after` cursors and bounded retained events.
- Independent audit: `/api/verify`.
- Audited downloads: `/api/export/{job_id}/{pdf|xlsx|csv|ics|json}`.

Hosted jobs are executed in a browser worker, with owned progress and results persisted through the hosted API. An abandoned page is not treated as a durably running server-side optimization job; stale hosted jobs become interrupted.
