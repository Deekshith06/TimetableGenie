import copy, json, itertools, sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.app.schemas import Problem
from backend.app.solver import solve
from backend.app.verifier import verify, canonical
from backend.app.transit_adapter import adapt_transit

P = json.loads((ROOT / "datasets/nep2020_synthetic_data.json").read_text())
A = json.loads((ROOT / "datasets/demo_schedule.json").read_text())["assignments"]


def mutations():
    cases = []

    def add(name, rule, fn):
        p = copy.deepcopy(P)
        a = copy.deepcopy(A)
        fn(p, a)
        cases.append(dict(name=name, rule=rule, problem=p, schedule=a))

    add("missing", "H1", lambda p, a: a.pop())
    add("duplicate", "H1", lambda p, a: a.append(copy.deepcopy(a[0])))
    add("unknown_event", "H1", lambda p, a: a[0].update(event_id="FORGED"))
    add("forged_duration", "H1", lambda p, a: a[0].update(duration=2))
    add("boolean_day", "H1", lambda p, a: a[0].update(day=True))
    add(
        "room_collision",
        "H2",
        lambda p, a: a[1].update(
            room_id=a[0]["room_id"], day=a[0]["day"], period=a[0]["period"]
        ),
    )
    add(
        "faculty_collision",
        "H3",
        lambda p, a: a[1].update(
            faculty_id=a[0]["faculty_id"], day=a[0]["day"], period=a[0]["period"]
        ),
    )

    def pathway(p, a):
        es = {e["id"]: e for e in p["events"]}
        left, right = next(
            (x, y)
            for i, x in enumerate(a)
            for y in a[i + 1 :]
            if set(es[x["event_id"]]["group_ids"]) & set(es[y["event_id"]]["group_ids"])
        )
        right.update(day=left["day"], period=left["period"])

    add("pathway_collision", "H4", pathway)

    def basket(p, a):
        e = next(e for e in p["events"] if e["sync_group"])
        x = next(x for x in a if x["event_id"] == e["id"])
        x["day"] = (x["day"] + 1) % 5

    add("basket_unsynced", "H5", basket)

    def lab(p, a):
        e = next(e for e in p["events"] if e["kind"] == "P")
        next(x for x in a if x["event_id"] == e["id"]).update(period=2)

    add("lab_across_lunch", "H6", lab)
    add(
        "capacity_overflow",
        "H7",
        lambda p, a: [r.update(capacity=0) for r in p["rooms"]],
    )
    add("unqualified_faculty", "H8", lambda p, a: a[0].update(faculty_id="F06"))

    def blackout(p, a):
        x = a[0]
        next(f for f in p["faculty"] if f["id"] == x["faculty_id"])[
            "unavailable"
        ].append(dict(day=x["day"], period=x["period"]))

    add("faculty_blackout", "H9", blackout)

    def second_period(p, a):
        e = next(e for e in p["events"] if e["kind"] == "P")
        x = next(x for x in a if x["event_id"] == e["id"])
        next(r for r in p["rooms"] if r["id"] == x["room_id"])["unavailable"].append(
            dict(day=x["day"], period=x["period"] + 1)
        )

    add("lab_second_period_closure", "H9", second_period)
    add(
        "faculty_workload",
        "H10",
        lambda p, a: [f.update(max_minutes=0) for f in p["faculty"]],
    )

    def spread(p, a):
        ee = [e for e in p["events"] if e["course_id"] == "CS201" and e["kind"] == "L"]
        for i, e in enumerate(ee[:2]):
            next(x for x in a if x["event_id"] == e["id"]).update(day=0, period=i)

    add("theory_spread", "H11", spread)

    def travel(p, a):
        p["policies"]["min_travel_minutes"] = 10
        es = {e["id"]: e for e in p["events"]}
        left, right = next(
            (x, y)
            for i, x in enumerate(a)
            for y in a[i + 1 :]
            if es[x["event_id"]]["duration"] == es[y["event_id"]]["duration"] == 1
            and set(es[x["event_id"]]["group_ids"])
            & set(es[y["event_id"]]["group_ids"])
        )
        left.update(room_id="HALL_101", day=0, period=0)
        right.update(room_id="SEM_301", day=0, period=1)

    add("building_transfer", "H12", travel)

    def lock(p, a):
        p["policies"]["locked"] = [copy.deepcopy(a[0])]
        a[0]["day"] = (a[0]["day"] + 1) % 5

    add("locked_assignment", "H13", lock)
    return cases


@pytest.mark.parametrize("case", mutations(), ids=lambda c: c["name"])
def test_each_rule_rejects_targeted_mutation(case):
    audit = verify(case["problem"], case["schedule"])
    assert audit["status"] == "FAIL"
    assert any(v["rule"] == case["rule"] for v in audit["violations"]), audit


def tiny(periods=3, count=2):
    p = copy.deepcopy(P)
    p["calendar"].update(
        days=["Monday"],
        periods=[dict(start=540 + i * 60, end=600 + i * 60) for i in range(periods)],
        term_start="2026-11-02",
        term_end="2026-11-02",
        holidays=[],
    )
    p["rooms"] = p["rooms"][:1]
    p["rooms"][0].update(capacity=100, unavailable=[])
    p["groups"] = p["groups"][:1]
    p["groups"][0]["unavailable"] = []
    p["faculty"] = p["faculty"][:1]
    p["faculty"][0].update(
        unavailable=[],
        preferred=[],
        course_ids=[c["id"] for c in p["courses"]],
        max_minutes=1000,
    )
    p["baskets"] = []
    p["events"] = []
    p["policies"].update(locked=[], min_travel_minutes=0)
    p["policies"]["weights"].update(idle=0, travel=0)
    for i in range(count):
        p["events"].append(
            dict(
                id=f"E{i}",
                course_id=p["courses"][i]["id"],
                section_id=f"S{i}",
                kind="L",
                duration=1,
                faculty_ids=["F01"],
                group_ids=[p["groups"][0]["id"]],
                room_types=["LECTURE_HALL"],
                equipment=["projector"],
                allowed_starts=None,
                basket_id=None,
                sync_group=None,
            )
        )
    return p


@pytest.mark.parametrize(
    "periods,count,blocked",
    [(t, n, b) for t in (1, 2, 3, 4) for n in (1, 2, 3) for b in (0, 1)],
)
def test_tiny_feasibility_against_independent_counting_bound(periods, count, blocked):
    p = tiny(periods, count)
    if blocked:
        p["rooms"][0]["unavailable"] = [dict(day=0, period=0)]
    expected = periods - blocked >= count
    r = solve(p, time_limit=0.2)
    assert (r["status"] in ("FEASIBLE", "OPTIMAL")) == expected, r
    if expected:
        assert verify(p, r["assignments"])["status"] == "PASS"


def test_sample_is_actually_valid_and_permutation_independent():
    a = verify(P, A)
    b = verify(P, list(reversed(A)))
    assert a["status"] == "PASS"
    assert a["schedule_digest"] == b["schedule_digest"]


def test_transit_explicit_constraints_survive():
    t = json.loads((ROOT / "datasets/transit_proxy_corpus.json").read_text())
    p = adapt_transit(t)
    for key in ("events", "rooms", "faculty", "groups", "baskets", "policies"):
        assert p[key] == P[key]
    assert p["provenance"]["kind"] == "adapted"
    assert verify(p, A)["status"] == "PASS"


def test_conflicting_alternatives_rejected():
    p = copy.deepcopy(P)
    es = [e for e in p["events"] if e["basket_id"] == "BASKET_MINOR"]
    for e in es:
        e["group_ids"] = [p["groups"][0]["id"]]
    with pytest.raises(ValueError):
        Problem.model_validate(p)


def test_no_shared_occupancy_in_solved_fixture():
    r = solve(P, time_limit=0.5)
    assert r["status"] in ("FEASIBLE", "OPTIMAL")
    assert verify(P, r["assignments"])["status"] == "PASS"


def test_joint_infeasibility_with_nonempty_individual_domains():
    p = tiny(2, 2)
    for e in p["events"]:
        e["allowed_starts"] = [dict(day=0, period=1)]
    r = solve(p, time_limit=0.3)
    assert r["status"] == "INFEASIBLE"
    assert "Sufficient" in r["diagnostics"][0]


def test_repair_proves_minimum_one_change_in_tiny_instance():
    p = tiny(3, 2)
    p["rooms"].append({**copy.deepcopy(p["rooms"][0]), "id": "ALT"})
    baseline = solve(p, time_limit=0.5)
    assert verify(p, baseline["assignments"])["status"] == "PASS"
    q = copy.deepcopy(p)
    a = baseline["assignments"][0]
    next(r for r in q["rooms"] if r["id"] == a["room_id"])["unavailable"] = [
        dict(day=a["day"], period=a["period"])
    ]
    r = solve(q, time_limit=0.5, baseline=baseline["assignments"])
    assert r["status"] == "OPTIMAL"
    assert r["changed_count"] == 1
    assert verify(q, r["assignments"])["status"] == "PASS"


def test_cancel_before_incumbent():
    r = solve(P, time_limit=2, cancelled=lambda: True)
    assert r["status"] == "CANCELLED"
    assert not r["assignments"]


def test_large_empty_domains_are_infeasible_not_fake_success():
    p = copy.deepcopy(P)
    p["events"][0]["allowed_starts"] = []
    r = solve(p, 0.1)
    assert r["status"] == "INFEASIBLE"
    assert not r["assignments"]


def test_write_cross_language_cases():
    out = ROOT / "outputs"
    out.mkdir(exist_ok=True)
    (out / "mutation_cases.json").write_text(
        json.dumps(mutations(), ensure_ascii=False)
    )
    (out / "digest_reference.json").write_text(json.dumps(verify(P, A)))
