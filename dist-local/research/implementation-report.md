# Implementation and verification report

Observed 30 October 2026 (Asia/Kolkata). This report records the implemented scope and evidence; it is not a formal proof of software correctness, a regulatory certification or a peer-reviewed research result.

## Delivered behavior

The application includes editable academic resources and explicit meeting requirements, selected student pathways, synchronized elective baskets, a weekly timetable, faculty/room/basket/master views, disruption repair, independent auditing and real PDF/XLSX/CSV/iCalendar/JSON exports. Draft changes and failed repairs preserve the accepted schedule. The recorded example contains 29 meetings occupying 35 periods; it was produced by an actual CP-SAT solve and independently rechecked.

The hosted application runs a bounded finite-domain solver in a browser Worker. Its server validates submitted results using an independent auditor before owner-scoped persistence. The full local application uses Python OR-Tools CP-SAT, FastAPI, persistent SQL storage and isolated solver processes. The hosted Worker is not claimed to run Python or CP-SAT.

The frontend adapts the requested dimensional-drawing repository: monochrome linework, thin rules, hatching, a technical title block and an exploded sketch derived from actual pathway occupancy. A separate measured, self-contained UI anatomy sheet retains the upstream MIT notice. See `design-source.md`.

## Executed checks

`validation.json` records commands, exit codes, timings and output summaries:

| Check | Observed result |
|---|---|
| Python engine and API tests | 54 passed; one dependency deprecation warning |
| TypeScript engine, auditor and export tests | 30 passed |
| TypeScript type validation | Passed |
| Standalone local frontend production build | Passed |

The 84 automated tests cover targeted hard-rule violations, incomplete and forged assignments, multi-period availability, session fulfillment, synchronization, workload, repair, cancellation, ownership, jobs, exports, digest agreement and selected time-zone cases. Passing these tests establishes behavior for the exercised cases; it does not establish correctness for every possible input.

Additional checks: the CLI independently verified the recorded audit bundle; openpyxl parsed the generated XLSX; an iCalendar parser read 29 event components; Poppler identified the generated two-page PDF. Python and TypeScript recomputed matching canonical problem and schedule digests.

## Browser observations

The managed preview successfully generated 29 assignments and independently audited them with zero violations. The audit control deliberately corrupted a schedule, detected the resulting violations and preserved the accepted schedule. Faculty and basket views displayed the real selected assignments and synchronized alternatives. Phone (390 CSS pixels) and tablet (760 CSS pixels) layouts were inspected; the timetable retains intentional horizontal scrolling. The measured card sheet was inspected separately.

Preview HTTP initially lacked Web Crypto. A SHA-256 fallback was implemented and tested against the native digest. A transient JSX syntax error was corrected; subsequent type validation and production builds passed.

Authenticated hosted account persistence was not exercised in the unsigned preview session. Local API tests exercise owner isolation and the process-backed job path. Publication state is established by the native deployment response, not inferred from these preview observations.

## Measured experiment limits

The 27-run synthetic pilot retains successful, unknown and baseline results together. With a 1.5-second CP-SAT search budget, all small cases found verified solutions, while the medium and large CP-SAT cases returned UNKNOWN. The greedy baseline found feasible schedules for these planted cases. Retained witnesses independently establish that those instances are feasible and were not provided to the algorithms. No universal solver ranking follows.

A separate repair changed exactly one of 29 full assignment tuples (96.55% unchanged), returned OPTIMAL and passed the independent audit. The affected original placement was made invalid, so one change was necessary for that specific instance. See `../benchmarks/results/summary.md` and its raw evidence.

## Boundaries requiring further validation

- Docker was unavailable. Compose, PostgreSQL and Redis configuration is supplied but was not executed as an integrated stack. Queue delivery/recovery under Redis crashes, multiworker load and production backup/restore require testing; exactly-once distributed execution is not claimed.
- The contract models weekly templates, equal-duration periods, explicit breaks and declared disjoint pathway groups. Alternate-week teaching, co-teaching, undisclosed overlapping memberships and one-off dated repair are outside this schema.
- Browser search is capped at 100 events with explicit domain, time and node budgets. CP-SAT preprocessing and search are also bounded. UNKNOWN is not an infeasibility proof.
- Infeasibility assumption cores, when available, are sufficient explanations, not guaranteed minimal IISs.
- Certificates contain independently recomputable SHA-256 integrity digests. They are unsigned; a digest does not authenticate its issuer or prove that every real-world policy was modeled.
- Academic credits are metadata separate from declared contact meetings. Program profiles and synthetic institutional policies require institutional review. No universal UGC/NCTE compliance is certified.
- The transit adapter preserves only the declared restricted resource-allocation structure. It does not claim general transport, GTFS or crew-continuity equivalence.
- Research records disclose access depth. No external competition benchmark, trained GNN/RL model, state-of-the-art advantage or first-ever novelty was established.
