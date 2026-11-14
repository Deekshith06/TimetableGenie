"""Finite-domain CP-SAT model. Verification lives in an independent module."""

from collections import defaultdict
from time import monotonic
import json, threading
from ortools.sat.python import cp_model
import ortools
from .schemas import Problem


def placements(p, e):
    periods = p["calendar"]["periods"]
    D = len(p["calendar"]["days"])
    P = len(periods)
    gs = {g["id"]: g for g in p["groups"]}
    enrollment = sum(gs[g]["size"] for g in e["group_ids"])
    basket = next((b for b in p["baskets"] if b["id"] == e["basket_id"]), None)
    lock = next((a for a in p["policies"]["locked"] if a["event_id"] == e["id"]), None)
    for d in range(D):
        for t in range(P - e["duration"] + 1):
            slot = dict(day=d, period=t)
            occ = list(range(t, t + e["duration"]))
            if any(periods[k - 1]["end"] != periods[k]["start"] for k in occ[1:]):
                continue
            if e["allowed_starts"] is not None and slot not in e["allowed_starts"]:
                continue
            if basket and slot not in basket["allowed_starts"]:
                continue
            if any(
                dict(day=d, period=k) in gs[g]["unavailable"]
                for g in e["group_ids"]
                for k in occ
            ):
                continue
            for r in p["rooms"]:
                if (
                    r["capacity"] < enrollment
                    or r["type"] not in e["room_types"]
                    or not set(e["equipment"]) <= set(r["equipment"])
                    or any(dict(day=d, period=k) in r["unavailable"] for k in occ)
                ):
                    continue
                for f in p["faculty"]:
                    if (
                        f["id"] not in e["faculty_ids"]
                        or e["course_id"] not in f["course_ids"]
                        or any(dict(day=d, period=k) in f["unavailable"] for k in occ)
                    ):
                        continue
                    a = dict(
                        event_id=e["id"],
                        room_id=r["id"],
                        faculty_id=f["id"],
                        day=d,
                        period=t,
                    )
                    if lock and lock != a:
                        continue
                    yield a


def quality(p, schedule):
    es = {e["id"]: e for e in p["events"]}
    rs = {r["id"]: r for r in p["rooms"]}
    fs = {f["id"]: f for f in p["faculty"]}
    gs = {g["id"]: g for g in p["groups"]}
    w = p["policies"]["weights"]
    score = 0
    resource = defaultdict(dict)
    loads = defaultdict(int)
    for a in schedule:
        e = es[a["event_id"]]
        r = rs[a["room_id"]]
        f = fs[a["faculty_id"]]
        score += (
            e["duration"]
            * w["seat_slack"]
            * (r["capacity"] - sum(gs[g]["size"] for g in e["group_ids"]))
        )
        for t in range(a["period"], a["period"] + e["duration"]):
            if dict(day=a["day"], period=t) in f["preferred"]:
                score -= w["preference"]
            for key in ["f:" + f["id"]] + ["g:" + g for g in e["group_ids"]]:
                resource[(key, a["day"])][t] = r["building"]
        loads[f["id"]] += sum(
            p["calendar"]["periods"][t]["end"] - p["calendar"]["periods"][t]["start"]
            for t in range(a["period"], a["period"] + e["duration"])
        )
    for occ in resource.values():
        ts = sorted(occ)
        score += w["idle"] * (ts[-1] - ts[0] + 1 - len(ts))
        score += w["travel"] * sum(occ[a] != occ[b] for a, b in zip(ts, ts[1:]))
    ls = [loads[f["id"]] for f in p["faculty"]]
    return score + w["balance"] * (max(ls) - min(ls))


def solve(
    problem,
    time_limit=3,
    seed=42,
    baseline=None,
    progress=None,
    cancelled=None,
    enhanced=True,
):
    started = monotonic()
    p = Problem.model_validate(problem).model_dump()
    model = cp_model.CpModel()
    P = len(p["calendar"]["periods"])
    D = len(p["calendar"]["days"])
    unit = p["calendar"]["periods"][0]["end"] - p["calendar"]["periods"][0]["start"]
    w = p["policies"]["weights"]
    z = {}
    domains = {}
    occupancy = defaultdict(list)
    starts = {}
    daytheory = defaultdict(list)
    loads = defaultdict(list)
    atbuilding = defaultdict(list)
    labels = {}
    costs = {}
    baskets = {b["id"]: b for b in p["baskets"]}
    rs = {r["id"]: r for r in p["rooms"]}
    fs = {f["id"]: f for f in p["faculty"]}
    gs = {g["id"]: g for g in p["groups"]}
    events = {e["id"]: e for e in p["events"]}
    for e in p["events"]:
        ds = []
        for a in placements(p, e):
            ds.append(a)
            if (
                len(ds) > 20000
                or len(z) + len(ds) > 200000
                or monotonic() - started > max(5, float(time_limit))
            ):
                return dict(
                    status="UNKNOWN",
                    assignments=[],
                    engine=f"OR-Tools CP-SAT {ortools.__version__}",
                    elapsed_ms=round(1000 * (monotonic() - started)),
                    branches=0,
                    objective=None,
                    optimal=False,
                    diagnostics=[
                        "Placement preprocessing exceeded the configured resource budget. Reduce the instance or use a larger worker budget; infeasibility has not been established."
                    ],
                )
        domains[e["id"]] = ds
        if not ds:
            return dict(
                status="INFEASIBLE",
                assignments=[],
                engine=f"OR-Tools CP-SAT {ortools.__version__}",
                elapsed_ms=round(1000 * (monotonic() - started)),
                branches=0,
                objective=None,
                optimal=False,
                diagnostics=[
                    f"{e['id']} has no feasible placement after capacity, equipment, qualification, availability, continuity, basket and lock checks."
                ],
            )
        vs = []
        co = []
        for j, a in enumerate(ds):
            v = model.new_bool_var(f"{e['id']}/{j}")
            z[(e["id"], j)] = v
            vs.append(v)
            r = rs[a["room_id"]]
            f = fs[a["faculty_id"]]
            c = e["duration"] * w["seat_slack"] * (
                r["capacity"] - sum(gs[g]["size"] for g in e["group_ids"])
            ) - w["preference"] * sum(
                dict(day=a["day"], period=t) in f["preferred"]
                for t in range(a["period"], a["period"] + e["duration"])
            )
            co.append(c)
            costs[(e["id"], j)] = c
            loads[f["id"]].append((e["duration"] * unit, v))
            for t in range(a["period"], a["period"] + e["duration"]):
                for key in ["r:" + r["id"], "f:" + f["id"]] + [
                    "g:" + g for g in e["group_ids"]
                ]:
                    occupancy[(key, a["day"], t)].append(v)
                for key in ["f:" + f["id"]] + ["g:" + g for g in e["group_ids"]]:
                    atbuilding[(key, a["day"], t, r["building"])].append(v)
            if e["kind"] == "L":
                daytheory[(e["section_id"], a["day"])].append(v)
        required = model.new_bool_var("require/" + e["id"])
        model.add(sum(vs) == 1).only_enforce_if(required)
        model.add_assumption(required)
        labels[required.index] = e["id"]
        st = model.new_int_var(0, D * P - 1, "start/" + e["id"])
        model.add(
            st == sum((a["day"] * P + a["period"]) * vs[j] for j, a in enumerate(ds))
        )
        starts[e["id"]] = st
    for vs in occupancy.values():
        model.add(sum(vs) <= 1)
    for f in p["faculty"]:
        model.add(sum(n * v for n, v in loads[f["id"]]) <= f["max_minutes"])
    for vs in daytheory.values():
        model.add(sum(vs) <= p["policies"]["max_theory_per_day"])
    sync = defaultdict(list)
    for e in p["events"]:
        if e["sync_group"]:
            sync[e["sync_group"]].append(e)
    for es in sync.values():
        for e in es[1:]:
            model.add(starts[e["id"]] == starts[es[0]["id"]])
        rep = es[0]
        b = baskets[rep["basket_id"]]
        for j, a in enumerate(domains[rep["id"]]):
            for t in range(a["period"], a["period"] + rep["duration"]):
                for group in b["reserved_groups"]:
                    other = []
                    for h in p["events"]:
                        if h["basket_id"] == b["id"] or group not in h["group_ids"]:
                            continue
                        other.extend(
                            z[(h["id"], k)]
                            for k, ha in enumerate(domains[h["id"]])
                            if ha["day"] == a["day"]
                            and ha["period"] <= t < ha["period"] + h["duration"]
                        )
                    if other:
                        model.add(sum(other) + z[(rep["id"], j)] <= 1)
    objective = [cost * v for key, v in z.items() if (cost := costs[key])]
    keys = ["f:" + f["id"] for f in p["faculty"]] + [
        "g:" + g["id"] for g in p["groups"]
    ]
    buildings = sorted({r["building"] for r in p["rooms"]})
    # Resource occupancy and building indicators derive from assignment variables.
    for key in keys:
        for d in range(D):
            occ = []
            bs = {}
            for t in range(P):
                ov = model.new_bool_var(f"occ/{key}/{d}/{t}")
                model.add(ov == sum(occupancy[(key, d, t)]))
                occ.append(ov)
                for b in buildings:
                    bv = model.new_bool_var(f"bld/{key}/{d}/{t}/{b}")
                    model.add(bv == sum(atbuilding[(key, d, t, b)]))
                    bs[(t, b)] = bv
            if w["idle"]:
                firsts = []
                lasts = []
                for t, o in enumerate(occ):
                    first = model.new_int_var(0, P, f"first/{key}/{d}/{t}")
                    model.add(first == t).only_enforce_if(o)
                    model.add(first == P).only_enforce_if(o.Not())
                    firsts.append(first)
                    last = model.new_int_var(0, P, f"last/{key}/{d}/{t}")
                    model.add(last == t + 1).only_enforce_if(o)
                    model.add(last == 0).only_enforce_if(o.Not())
                    lasts.append(last)
                lo = model.new_int_var(0, P, "lo")
                hi = model.new_int_var(0, P, "hi")
                span = model.new_int_var(0, P, "span")
                model.add_min_equality(lo, firsts)
                model.add_max_equality(hi, lasts)
                model.add_max_equality(span, [0, hi - lo])
                objective.append(w["idle"] * (span - sum(occ)))
            for t in range(P):
                for u in range(t + 1, P):
                    gap = (
                        p["calendar"]["periods"][u]["start"]
                        - p["calendar"]["periods"][t]["end"]
                    )
                    for b in buildings:
                        for c in buildings:
                            if b == c:
                                continue
                            if gap < p["policies"]["min_travel_minutes"]:
                                model.add(bs[(t, b)] + bs[(u, c)] <= 1)
                            if w["travel"]:
                                change = model.new_bool_var("transition")
                                model.add(
                                    change
                                    >= bs[(t, b)] + bs[(u, c)] - sum(occ[t + 1 : u]) - 1
                                )
                                objective.append(w["travel"] * change)
    if w["balance"]:
        lv = []
        for f in p["faculty"]:
            load = model.new_int_var(0, 10080, "load")
            model.add(load == sum(n * v for n, v in loads[f["id"]]))
            lv.append(load)
        high = model.new_int_var(0, 10080, "maxload")
        low = model.new_int_var(0, 10080, "minload")
        model.add_max_equality(high, lv)
        model.add_min_equality(low, lv)
        objective.append(w["balance"] * (high - low))
    if enhanced:
        # Symmetry only between identical section events with identical placement domains.
        signatures = defaultdict(list)
        for e in p["events"]:
            if (
                e["sync_group"]
                or any(a["event_id"] == e["id"] for a in p["policies"]["locked"])
                or baseline
            ):
                continue
            sig = json.dumps({k: v for k, v in e.items() if k != "id"}, sort_keys=True)
            signatures[sig].append(e["id"])
        for ids in signatures.values():
            for left, right in zip(ids, ids[1:]):
                model.add(starts[left] <= starts[right])
    if baseline:
        old = {a["event_id"]: a for a in baseline}
        # Seed still-valid assignments; hints are suggestions, never hard locks.
        for eid, ds in domains.items():
            if eid in old and old[eid] in ds:
                for j, a in enumerate(ds):
                    model.add_hint(z[(eid, j)], int(a == old[eid]))
        span = sum(
            max(costs[(eid, j)] for j in range(len(ds)))
            - min(costs[(eid, j)] for j in range(len(ds)))
            for eid, ds in domains.items()
        )
        dominance = (
            1
            + span
            + len(keys) * D * (w["idle"] * P + w["travel"] * (P - 1))
            + w["balance"] * 10080
        )
        for eid, ds in domains.items():
            if eid in old:
                objective.append(
                    dominance
                    * (1 - sum(z[(eid, j)] for j, a in enumerate(ds) if a == old[eid]))
                )
    model.minimize(sum(objective))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.01, min(float(time_limit), 120))
    solver.parameters.random_seed = seed
    solver.parameters.num_search_workers = 1

    class Callback(cp_model.CpSolverSolutionCallback):
        def __init__(self):
            super().__init__()
            self.last = 0

        def on_solution_callback(self):
            if cancelled and cancelled():
                self.stop_search()
                return
            now = monotonic()
            if progress and now - self.last > 0.2:
                self.last = now
                progress(
                    dict(
                        type="incumbent",
                        elapsed_ms=round(self.wall_time * 1000),
                        branches=self.num_branches,
                        objective=self.objective_value,
                    )
                )

    callback = Callback()
    invalid = model.validate()
    if invalid:
        return dict(
            status="MODEL_INVALID",
            assignments=[],
            engine=f"OR-Tools CP-SAT {ortools.__version__}",
            elapsed_ms=round((monotonic() - started) * 1000),
            branches=0,
            objective=None,
            optimal=False,
            diagnostics=[invalid],
        )
    stop_monitor = threading.Event()

    def monitor():
        while not stop_monitor.wait(0.1):
            if cancelled and cancelled():
                solver.stop_search()
                return

    watcher = threading.Thread(target=monitor, daemon=True)
    if cancelled:
        watcher.start()
    try:
        status = solver.solve(model, callback)
    finally:
        stop_monitor.set()
        if cancelled:
            watcher.join(timeout=1)
    name = solver.status_name(status)
    out = []
    diagnostics = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for eid, ds in domains.items():
            out.extend(a for j, a in enumerate(ds) if solver.value(z[(eid, j)]))
    elif status == cp_model.INFEASIBLE:
        # Separate satisfaction solve: assumption-core explanation is sufficient, not minimal.
        model.clear_objective()
        diag = cp_model.CpSolver()
        diag.parameters.max_time_in_seconds = min(2, float(time_limit))
        diag.parameters.num_search_workers = 1
        if diag.solve(model) == cp_model.INFEASIBLE:
            core = [
                labels[i]
                for i in diag.sufficient_assumptions_for_infeasibility()
                if i in labels
            ]
            diagnostics = (
                [
                    "Sufficient required-event conflict core (not proven minimal): "
                    + ", ".join(core)
                ]
                if core
                else [
                    "Global resource/policy constraints conflict; no assumption-level explanation available."
                ]
            )
    else:
        diagnostics = [
            "Search stopped without a feasible schedule; this does not establish infeasibility."
        ]
    if cancelled and cancelled():
        name = "CANCELLED"
        out = []
    result = dict(
        status=name,
        assignments=out,
        engine=f"OR-Tools CP-SAT {ortools.__version__}",
        elapsed_ms=round((monotonic() - started) * 1000),
        branches=solver.num_branches,
        objective=quality(p, out) if out else None,
        best_bound=solver.best_objective_bound if out else None,
        optimal=name == "OPTIMAL",
        diagnostics=diagnostics,
    )
    result.update(
        search_objective=solver.objective_value if out else None,
        best_bound_scope=(
            "Encoded repair-and-quality objective" if baseline else "Quality objective"
        ),
    )
    if baseline and out:
        old = {a["event_id"]: a for a in baseline}
        changed = sum(old.get(a["event_id"]) != a for a in out)
        result.update(
            changed_count=changed,
            unchanged_percent=100 * (len(out) - changed) / len(out),
        )
    return result
