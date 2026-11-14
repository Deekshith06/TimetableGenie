# Pilot experiment results

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

Raw evidence: `runs.json`, `environment.json`, `repair.json`, input/witness pairs. Witnesses were retained only for feasibility validation, not provided as hints or solver inputs.
