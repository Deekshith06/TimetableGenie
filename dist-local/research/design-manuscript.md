# TimetableGenie: Constraint-Based Multidisciplinary Timetabling with Independent Auditing and Transit-Derived Synthetic Instances

**Manuscript state:** methods and design draft, 30 October 2026. Bibliographic statements are supported by the linked evidence registry. Numerical performance, implementation coverage, and experimental conclusions must be read from the repository's actual execution evidence; this draft does not invent them. This is not a peer-reviewed publication or a regulatory certification.

## Abstract

Multidisciplinary course selections connect courses across departments and make traditional whole-cohort conflict assumptions insufficient. TimetableGenie specifies an event-based scheduling system in which student selections, room capabilities, faculty eligibility, contact requirements, institutional calendars, and synchronized elective offerings are explicit input data. A CP-SAT backend supplies the local optimization engine, with a separately identified bounded browser search engine for environments that cannot host Python. An independent checker reconstructs occupied intervals from authoritative problem data and audits the complete assignment. Revision-bound audit bundles separate scheduling feasibility from integrity checking and regulatory claims. A transit adapter is limited to a declared common resource-allocation representation; synthetic transit-derived instances are not evidence of university demand or teaching quality. This manuscript gives the model, assurance boundaries, restricted transformation argument, and a reproducible evaluation protocol. Empirical conclusions remain limited to recorded tests and experiments supplied with the implementation.

## 1. Motivation and contribution boundary

A timetable can satisfy room and instructor overlap rules while still preventing a student from attending a selected minor or elective. The correct conflict relation follows actual enrollment or groups with identical selected sections. Conversely, treating all alternative offerings as compulsory for an entire cohort introduces conflicts that do not exist. Configured elective windows and practical blocks add temporal relationships that must apply to every occupied period.

These modeling needs are established prior work, rather than new discoveries. ITC2019 combines course placement and student sectioning [P01, P02]. Teacher-education programs with two-subject choices have already motivated student-assignment models [P22]. UniTime handles substantial student and instructor scheduling functionality [P18, P19]. Domain-specific requirement languages [P17, P21] and comprehensible conflict explanation [P20] are also prior research. The contribution to evaluate is therefore a coherent, reproducible implementation with explicit policy provenance, independently checked outputs, and measurable revision/repair behavior. No first-of-kind or general superiority claim is made.

## 2. Research method and related work

The targeted search covers30October2016–30October2026, with official publisher, author-institution, and proceedings records. The registry contains25 scholarly publication records across24 evidence families. It distinguishes full journal papers, conference papers, a case report, an extended abstract, a system demonstration, a competition summary, and an invited solver talk. Access ranges from official full text to metadata/abstract only; a registry entry must not be read as evidence of a full-text critical review. The ALNS work with a2017 issue date but2016March online publication is recorded separately outside the rolling window [F01]. See [evidence.md](evidence.md) for searches, exclusions, and access restrictions.

MIP research demonstrates several alternative formulations: flow models [P04], daily patterns and valid inequalities [P10], and staged feasibility/improvement [P03]. Fix-and-optimize methods explore selected neighborhoods through mathematical programming [P05, P23]. MaxSAT with preprocessing and local search supplies another viable approach [P09]. Learned operator selection [P13] and robustness estimates [P14] motivate experiments, but their reported results do not establish gains on this application's datasets. CP-SAT's combination of integral propagation, SAT reasoning, LP support, and worker portfolios motivates its implementation role [P25].

Disruption repair requires a quality/stability trade-off rather than an unqualified unchanged-percentage guarantee. Quality recovering research explicitly studies this trade-off [P06]. Resource availability can also affect attainable quality [P07]. Travel/student flow and hybrid attendance formulations illustrate additional modeling choices [P11, P24]. These sources justify configurable objectives and explicit feature scope, not adding every possible constraint without a tested checker.

## 3. Domain assumptions and policy provenance

Academic credit is not stored as an event duration. Lecture, tutorial, practical, studio, and supervision contact requirements are expanded under an identified program profile. UGC's CCFUP section3.2.4 describes lecture/tutorial versus practicum contact-hour relationships in its stated context; section3.2.5 retains institutional decisions about credit distribution. This supports explicit conversion metadata, not silently guessing the meaning of “2P.” ITEP has a separate NCTE framework, and other professional/teacher-education programs require their applicable versions. Synthetic faculty workload limits in a demonstration are institutional inputs, not verified universal statutory caps.

A finite teaching calendar defines actual period boundaries and interruptions. Two neighboring indices are contiguous only when their end/start times meet and no forbidden break intervenes. The present model assumes each event has an integer number of compatible periods; dates/weeks and exceptions must be included explicitly when enabled. A weekly repeating fixture does not validate all term-calendar behavior.

Student groups are disjoint groups of students with identical selected-section sets. If group splitting or student sectioning itself is optimized, it becomes an additional decision problem requiring additional variables and capacity constraints. A fixed-enrollment model must not be advertised as solving arbitrary sectioning merely because its inputs contain groups.

## 4. Event-placement formulation

LetE be the required meeting events, R rooms, F faculty, K attendee groups, and T the finite set of teaching periods, each with a day, start, and end. For evente, the finite domainA_e contains allowed placements. A placementa specifies a roomr(a), faculty assignmentf(a), startt(a), and the full occupied-period setO(e,a). It is prefiltered by duration, calendar continuity, capacity, resource capability, eligibility, availability, and any fixed assignment. Prefiltering does not replace independent output checking.

Introducez_(e,a)∈{0,1}. Exactly one placement is selected:

\[
\sum_{a\in A_e}z_{e,a}=1\qquad(e\in E).
\]

For roomr and periodt, enforce:

\[
\sum_{e\in E}\sum_{a\in A_e:\,r(a)=r,\,t\in O(e,a)}z_{e,a}\leq1.
\]

The analogous inequality applies to each assigned faculty member and each attendee group of an event. With co-teaching, every listed instructor appears in this occupancy relation. Room capacity uses authoritative event enrollment, not metadata supplied by an output assignment.

For a synchronization groupb containing paired alternative-offering events, require equal selected starts, or an explicitly specified equal occupancy pattern. Compatible duration/count requirements are validated before solving. No student may be assigned simultaneous alternatives that their enrollment treats as mutually exclusive. If the institution reserves the entire window for a pathway, its compulsory events must also avoid that reserved window.

Faculty contact-minute caps are:

\[
\sum_{e,a:\,f\in f(a)}\mathrm{minutes}(e)z_{e,a}\leq W_f.
\]

Configured theory spread limits apply to theory events of the same section/day; they do not accidentally restrict double practicals or independent tutorials. Locked events retain their exact placement. Enabled building-travel constraints compare actual end/start times and required movement time. Any added hard rule belongs in the verifier registry as well as the solver.

The named registryH1–H11 groups event fulfillment, room exclusivity, faculty exclusivity, attendee exclusivity, synchronization, contiguous blocks, capacity, resource compatibility, availability/calendar, workload, and pedagogical spread. A grouped identifier may contain several concrete checks; audit completeness must cover every enabled check.

### Feasibility argument

Under the defined domains and inequalities, selecting one placement per event satisfies required event fulfillment. Resource occupancy inequalities exclude every simultaneous resource pair. Domain construction excludes invalid individual placements, while synchronization, workload, spread, locks, and enabled travel constraints exclude their corresponding relational violations. Thus an assignment satisfying all constraints is feasible for the encoded instance. This argument concerns the formulation; it does not prove that a particular implementation correctly generated every constraint.

### Soft objective and repair

Quality terms may penalize preference misses, seat slack, avoidable travel burden, gaps, room changes, or load imbalance with documented units and weights. Required travel feasibility remains hard. An unconstrained scalar weighted sum does not automatically mean a stated priority is lexicographic.

For repair, defineδ_e=1 when the event's time, room, or faculty differs from its baseline placement. Minimize∑δ_e first, fixing that optimum before minimizing ordinary quality when the first stage is proven optimal. With a time-limited first stage, report the incumbent disruption count without calling it a minimum. Locks and already-executed events remain fixed. A repaired schedule is checked against the changed immutable problem revision. No universal unchanged-percentage guarantee follows.

## 5. Restricted transit transformation

Define a common finite resource-allocation representationG containing demand events, capacities/capabilities, eligible operators, explicit conflicting attendee groups, allowed intervals, durations, workload bounds, and optional equality synchronization. A transit record belongs to the reversible subset only when these data and their semantics are explicit; vehicle-continuity, depot/deadheading, directional transfers, and other additional transit restrictions are either represented or excluded from the subset.

**Proposition.** If a transit instance and an academic instance are both encodings ofG and their entity/time identifiers are mapped bijectively while preserving every domain, occupancy relation, capacity/capability relation, bound, and synchronization constraint, the mapping preserves and reflects feasibility.

**Argument.** Apply the bijection to each selected placement. A violated academic constraint would map back to an identical violatedG/transit constraint, contradicting feasibility; the inverse reasoning establishes completeness. Constructing identifier maps and translating explicitly listed records/relations is polynomial in the complete input size, including domain and relation entries. It is not necessarily linear only in the trip count. Objective equality requires additionally preserving every cost term and weight.

This restricted renaming result is not an isomorphism of all public-transit and university scheduling problems, a new complexity theorem, or a guarantee of equal practical hardness. GTFS timetable records alone do not supply all required driver, resource, or academic conflict data. Synthesized supplementary fields remain labeled synthetic. Real collection requires source, retrieval date, permissions/license, raw checksum, and field-level transformations.

## 6. Independent auditing and integrity

A checker reads the authoritative problem revision and raw output, reconstructs every event interval, and validates identifiers, duplicates, completeness, assignments, and all enabled invariants independently of solver state. The checker may share schemas but should not reuse the solver's placement generator as its sole correctness test. Malformed or unsupported inputs cannot receive a passing result. A checker failure must remain distinguishable from a scheduling violation and from “not applicable.”

A complete passing report is an executable audit of an encoded instance. Assurance depends on checker correctness and input adequacy; mutation tests and differential small-instance enumeration are therefore required evidence. A digest does not close either gap. Canonicalization supports stable payload identity [RFC8785]; SHA-256 comparisons bind content only relative to a trusted expected digest. Authenticated issuance additionally needs a signature and public-key trust design. Argon2id belongs to password-hashing requirements [RFC9106], not to claims of a zero-violation mathematical proof.

## 7. Architecture and implementation claims

The intended local service separates a typed input/API layer, bounded optimization workers, immutable problem/schedule storage, an independent audit module, exports, and a responsive multidimensional timetable interface. The hosted browser engine and CP-SAT engine must be labeled separately. Matching input/output contracts do not establish matching search performance or optimization guarantees. Cancellation, limits, errors, and terminal statuses must be tested for each engine.

Actual implementation coverage, library versions, source commit, data sizes, job durability, identity guarantees, and deployment restrictions must be stated by the implementation report. This design draft does not assert that PostgreSQL, a distributed queue, authentication, an export format, or a live event stream exists merely because it was requested.

## 8. Evaluation protocol and results boundary

Use valid synthetic academic and transit-derived fixtures, deliberately infeasible cases, and deterministic scalable generators. Record seeds, schema/profile versions, hardware, workers, deadlines, and exact source/library versions. If a planted schedule establishes generator feasibility, keep it outside ordinary solver inputs unless warm starts are explicitly compared.

Evaluate a transparent greedy baseline, plain CP-SAT, and only the enhancements actually implemented under matching constraints, objective terms, and budgets. Report feasibility rate, time to first feasible assignment, wall time, objective components, valid bounds/gaps, checker time, detected violations, and repair changes. Differences in which constraints a baseline represents prevent unqualified score comparisons.

Mutation tests must cover every enabled invariant, including a collision in the second period of a lab, lunch crossing, duplicate/missing events, false attendee metadata, and stale revisions. Tiny-instance exhaustive enumeration can compare feasibility with the solver and checker. A repaired instance must be independently audited and its changed-event denominator reported. Negative cases should include both simple empty-domain failures and jointly infeasible resource competition.

**Results status:** The following pilot results are backed by the repository's recorded runs. They do not establish competitive superiority, general scalability, regulatory compliance, or publication acceptance. Validation command outcomes are recorded separately in `../validation.json`.

## 9. Limitations and threats to validity

Synthetic instances can exercise stated rules but cannot establish external validity at a real university. A transit proxy provides structural test variety, not educational validity. Fixed student selections differ from jointly optimized sectioning. A weekly fixture may omit term exceptions, variable periods, or multiday teaching practice. Shared data-contract assumptions can affect both independent checkers. Time-limited search gives weaker optimality evidence than exhaustive/proven completion. Official project documentation is not an exhaustive baseline source audit. Applicable Indian policy must be reviewed by the institution before operational use.

## 10. Conclusion

The defensible outcome is an inspectable scheduling application whose feasibility witnesses, checker coverage, integrity metadata, failure states, and repair measurements can be reproduced. Published prior work supports the component choices while limiting novelty claims. Stronger empirical, regulatory, or formal-verification claims require separate evidence.

## References and reproducibility

Publication keysP01–P25 andF01 resolve to [sources.json](sources.json) and [references.bib](references.bib). The RFC and policy references resolve through that registry's official-documents section. Research access depth and exclusions are preserved in [evidence.md](evidence.md). No DOI, author expansion, external benchmark result, or numerical experiment was invented to complete a citation or table.


## 11. Recorded implementation pilot

### Synthetic pilot results

Observed on 30 October 2026. These are seed-controlled synthetic pilots, not a state-of-the-art comparison. The CP-SAT search budget was 1.5 seconds, one worker, seeds 11/29/42. Elapsed times below include model preparation, so they can exceed the search budget.

| Size | Variant | Verified solutions | Median elapsed ms | Median quality among feasible runs |
|---|---|---:|---:|---:|
| small (29) | greedy | 3/3 | 6 | 1846 |
| small (29) | cp_sat_no_symmetry | 3/3 | 1617 | 1779 |
| small (29) | cp_sat_safe_symmetry | 3/3 | 1633 | 1779 |
| medium (60) | greedy | 3/3 | 26 | 3975 |
| medium (60) | cp_sat_no_symmetry | 0/3 | 1754 | — |
| medium (60) | cp_sat_safe_symmetry | 0/3 | 1607 | — |
| large (100) | greedy | 3/3 | 101 | 6719 |
| large (100) | cp_sat_no_symmetry | 0/3 | 2360 | — |
| large (100) | cp_sat_safe_symmetry | 0/3 | 2132 | — |

The medium/large CP-SAT runs returned UNKNOWN, with no feasible incumbent within the tested budget. Their generator witnesses independently pass the verifier, so unknown must not be reported as infeasible. The greedy baseline found feasible solutions for these particular planted instances. No universal algorithm ranking is supported.

The generated pilot courses have unique event signatures, so the safe-symmetry variant has no interchangeable-event group to reduce on these cases. Its timing differences do not establish a symmetry-breaking advantage. The main multidisciplinary fixture separately exercises repeated section events and baskets.

The separate 29-meeting repair example changed 1 meeting(s), preserved 96.55% of full assignment tuples, returned OPTIMAL, and independently passed its audit. It used valid baseline assignment hints. The previous placement of the affected meeting became invalid, so at least one change was necessary; the one-change result is a concrete minimum-disruption witness for this case.

Memory records are cumulative peak RSS of the experiment process, not isolated per-run allocations. Incumbent timestamps come from solver callbacks and exclude Python model construction. No gap is reported for incomparable/missing bounds.

Raw evidence: `../../benchmarks/results/runs.json`, `../../benchmarks/results/environment.json`, `../../benchmarks/results/repair.json`, input/witness pairs. Witnesses were retained only for feasibility validation, not provided as hints or solver inputs.
