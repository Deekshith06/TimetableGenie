# Requirements traceability

| Requirement | Implementation | Evidence |
|---|---|---|
| Typed normalized requirements and policy validation | `lib/domain.ts`, `backend/app/schemas.py` | Shared fixtures, invalid selection tests, cross-language checker cases |
| CP-SAT scheduling and real statuses | `backend/app/solver.py` | Tiny feasibility counting cases; recorded synthetic solves |
| Hosted bounded solver | `public/solver-worker.js` | Browser tests and actual UI generation; explicit engine label |
| H1–H11 plus travel/locks | Both independent verifier modules | Targeted mutations for all 13 rules |
| Actual pathway selections and synchronized alternatives | Event/group/basket schemas and both models | Parallel basket UI; schema rejection of double selections |
| Contiguous practicals across every occupied period | Domain construction and independent occupancy reconstruction | Lunch-crossing and second-period closure tests |
| Transit structural adapter and provenance | `lib/transit.ts`, `backend/app/transit_adapter.py` | Restricted-field preservation test; labeled synthetic fixture |
| Repair and disruption measurement | Both engines and repair API | Tiny proved minimum; full29-meeting example in `benchmarks/results/repair.json` |
| Independent audit bundles and integrity | `lib/verifier.ts`, `backend/app/verifier.py` | Python/TS problem and schedule digest agreement; permutation regression |
| Persistent owned records | Hosted API/D1; FastAPI/SQLAlchemy | SQL owner-isolation API test; hosted migrations and deployment checks |
| Job lifecycle, cancellation and telemetry | `backend/app/jobs.py`, hosted job API, planner hook | Process worker API test; cancellation-race test; real worker telemetry |
| SSE with resume cursor | Both API implementations; local frontend integration | Completed-job stream test; ownership checks |
| JSON/PDF/XLSX/CSV/iCalendar exports | Both export modules | Workbook parsed with openpyxl, PDF parsed with Poppler, calendar parsed with icalendar |
| UI editors, import and multiple timetable perspectives | `components/`, planner hook | TypeScript/build checks plus interactive browser observations |
| New dimensional frontend reference | `app/dimensional.css`, `PlanningSketch`, drawing sheet | Source/measurement notes, retained MIT notice, browser rendering |
| Literature and baseline audit | `docs/research/` |25 scholarly records across24 evidence families and15 official sources, access depth recorded |
| Reproducible local deployment | Local Vite build, FastAPI, Dockerfile, Compose | Local build/API tested; Docker/PostgreSQL/Redis execution separately disclosed |

This is a feature map, not a declaration that every deployment path or institutional rule has been verified. See `docs/validation.json` and `docs/implementation-report.md` for actual observed checks and limitations.
