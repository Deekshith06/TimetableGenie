"""Pilot experiments on explicitly synthetic, seed-controlled inputs.
No planted schedule is supplied to either algorithm.
"""

import json, sys, random, copy, time, platform, resource
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.solver import solve, placements, quality
from backend.app.verifier import verify
from backend.app.schemas import Problem
from datasets.generate import generate


def planted(seed, count, resources):
    rng = random.Random(seed)
    p = generate(seed)
    n = resources
    p["id"] = f"BENCH_{count}_{seed}"
    p["title"] = f"Synthetic resource-allocation pilot: {count} meetings"
    p["baskets"] = []
    p["events"] = []
    p["courses"] = []
    p["groups"] = []
    p["faculty"] = []
    p["rooms"] = []
    for i in range(n):
        p["rooms"].append(
            dict(
                id=f"R{i}",
                name=f"Room {i}",
                type="COMPUTER_LAB" if i < 2 else "LECTURE_HALL",
                capacity=40 if i < 2 else 100,
                building="Technology" if i < 2 else "Main",
                equipment=["projector", "computers"] if i < 2 else ["projector"],
                unavailable=[],
            )
        )
        p["faculty"].append(
            dict(
                id=f"F{i}",
                name=f"Synthetic teacher {i}",
                department="Synthetic",
                max_minutes=1500,
                course_ids=[],
                unavailable=[],
                preferred=[dict(day=d, period=t) for d in range(5) for t in (0, 1, 2)],
            )
        )
    for i in range(n * 2):
        p["groups"].append(
            dict(
                id=f"G{i}",
                name=f"Synthetic pathway {i}",
                size=16,
                program="Synthetic benchmark",
                major="Synthetic",
                minor="Synthetic",
                mdc="Synthetic",
                unavailable=[],
            )
        )
    used = set()
    witness = []
    for i in range(count):
        for attempt in range(10000):
            practical = rng.random() < 0.16
            r = rng.randrange(2) if practical else rng.randrange(2, n)
            duration = 2 if practical else 1
            t = rng.choice([0, 1, 3]) if practical else rng.randrange(5)
            d = rng.randrange(5)
            f = rng.randrange(n)
            g = rng.randrange(n * 2)
            keys = [
                (kind, id, d, k)
                for k in range(t, t + duration)
                for kind, id in [("r", r), ("f", f), ("g", g)]
            ]
            if not any(k in used for k in keys):
                break
        else:
            raise RuntimeError(
                "Generator could not plant the requested fixture within its attempt limit"
            )
        used.update(keys)
        cid = f"C{i}"
        fid = f"F{f}"
        gid = f"G{g}"
        p["courses"].append(
            dict(
                id=cid,
                title=f"Synthetic course {i}",
                category="SEC" if practical else "DSC",
                credits=1,
                profile="Synthetic benchmark; no credit conversion inferred",
            )
        )
        p["faculty"][f]["course_ids"].append(cid)
        p["events"].append(
            dict(
                id=f"E{i}",
                course_id=cid,
                section_id=cid,
                kind="P" if practical else "L",
                duration=duration,
                faculty_ids=[fid],
                group_ids=[gid],
                room_types=[p["rooms"][r]["type"]],
                equipment=["computers"] if practical else ["projector"],
                allowed_starts=None,
                basket_id=None,
                sync_group=None,
            )
        )
        witness.append(
            dict(event_id=f"E{i}", room_id=f"R{r}", faculty_id=fid, day=d, period=t)
        )
    p["provenance"].update(
        description="Synthetic planted-feasible resource-allocation pilot. Hidden witness used only to establish generator feasibility; no university generalization claimed."
    )
    p = Problem.model_validate(p).model_dump()
    assert verify(p, witness)["status"] == "PASS"
    return p, witness


def greedy(p):
    started = time.monotonic()
    es = {e["id"]: e for e in p["events"]}
    rs = {r["id"]: r for r in p["rooms"]}
    fs = {f["id"]: f for f in p["faculty"]}
    domains = {e["id"]: list(placements(p, e)) for e in p["events"]}
    as_ = []
    attempts = 0

    def compatible(a):
        e = es[a["event_id"]]
        load = e["duration"] * 60
        for b in as_:
            h = es[b["event_id"]]
            over = (
                a["day"] == b["day"]
                and a["period"] < b["period"] + h["duration"]
                and b["period"] < a["period"] + e["duration"]
            )
            if a["faculty_id"] == b["faculty_id"]:
                load += h["duration"] * 60
            if over and (
                a["room_id"] == b["room_id"]
                or a["faculty_id"] == b["faculty_id"]
                or set(e["group_ids"]) & set(h["group_ids"])
            ):
                return False
            if (
                e["sync_group"]
                and e["sync_group"] == h["sync_group"]
                and (a["day"], a["period"]) != (b["day"], b["period"])
            ):
                return False
            if (
                e["kind"] == h["kind"] == "L"
                and e["section_id"] == h["section_id"]
                and a["day"] == b["day"]
            ):
                return False
            if over and e["basket_id"] != h["basket_id"]:
                eb = next((x for x in p["baskets"] if x["id"] == e["basket_id"]), None)
                hb = next((x for x in p["baskets"] if x["id"] == h["basket_id"]), None)
                if (eb and set(h["group_ids"]) & set(eb["reserved_groups"])) or (
                    hb and set(e["group_ids"]) & set(hb["reserved_groups"])
                ):
                    return False
        return load <= fs[a["faculty_id"]]["max_minutes"]

    for e in sorted(
        p["events"],
        key=lambda e: (len(domains[e["id"]]), e["sync_group"] or "", e["id"]),
    ):
        found = None
        for a in domains[e["id"]]:
            attempts += 1
            if compatible(a):
                found = a
                break
        if found is None:
            return dict(
                status="GREEDY_FAILED",
                assignments=[],
                engine="One-pass first-fit greedy",
                elapsed_ms=round((time.monotonic() - started) * 1000),
                branches=attempts,
                objective=None,
                optimal=False,
                diagnostics=["No compatible next placement; no infeasibility claim."],
            )
        as_.append(found)
    a = verify(p, as_)
    return dict(
        status="FEASIBLE" if a["status"] == "PASS" else "AUDIT_FAILED",
        assignments=as_,
        engine="One-pass first-fit greedy",
        elapsed_ms=round((time.monotonic() - started) * 1000),
        branches=attempts,
        objective=quality(p, as_),
        optimal=False,
        diagnostics=[],
    )


def main():
    out = ROOT / "benchmarks/results"
    out.mkdir(exist_ok=True)
    runs = []
    budget = 1.5
    manifest = dict(
        date="2026-10-30",
        hardware=dict(
            platform=platform.platform(),
            processor=platform.processor(),
            logical_cpu=__import__("os").cpu_count(),
        ),
        python=platform.python_version(),
        seed_set=[11, 29, 42],
        cp_sat_search_seconds=budget,
        workers=1,
        note="Pilot synthetic results, not external competition benchmarks. No performance superiority is inferred.",
    )
    (out / "environment.json").write_text(json.dumps(manifest, indent=2))
    for size, count, n in [("small", 29, 6), ("medium", 60, 8), ("large", 100, 12)]:
        for seed in manifest["seed_set"]:
            p, witness = planted(seed, count, n)
            (out / f"{size}-{seed}.input.json").write_text(json.dumps(p))
            (out / f"{size}-{seed}.witness.json").write_text(json.dumps(witness))
            for variant in ["greedy", "cp_sat_no_symmetry", "cp_sat_safe_symmetry"]:
                first = []
                start = time.monotonic()
                r = (
                    greedy(p)
                    if variant == "greedy"
                    else solve(
                        p,
                        budget,
                        seed,
                        progress=lambda e: (
                            first.append(e["elapsed_ms"]) if not first else None
                        ),
                        enhanced=variant == "cp_sat_safe_symmetry",
                    )
                )
                astart = time.monotonic()
                audit = verify(p, r["assignments"])
                verify_ms = round((time.monotonic() - astart) * 1000, 3)
                if r["assignments"]:
                    assert audit["status"] == "PASS", audit
                row = dict(
                    size=size,
                    events=count,
                    seed=seed,
                    variant=variant,
                    status=r["status"],
                    verified=bool(r["assignments"]) and audit["status"] == "PASS",
                    objective=r["objective"],
                    elapsed_ms=r["elapsed_ms"],
                    total_ms=round((time.monotonic() - start) * 1000),
                    first_incumbent_ms=first[0] if first else None,
                    branches=r["branches"],
                    best_bound=r.get("best_bound"),
                    verification_ms=verify_ms,
                    process_peak_rss_kib=resource.getrusage(
                        resource.RUSAGE_SELF
                    ).ru_maxrss,
                )
                runs.append(row)
                (out / "runs.json").write_text(json.dumps(runs, indent=2))
                print(json.dumps(row), flush=True)
    p = generate()
    baseline = solve(p, 3)
    a = verify(p, baseline["assignments"])
    assert a["status"] == "PASS"
    q = copy.deepcopy(p)
    m = baseline["assignments"][0]
    next(r for r in q["rooms"] if r["id"] == m["room_id"])["unavailable"].append(
        dict(day=m["day"], period=m["period"])
    )
    r = solve(q, 3, baseline=baseline["assignments"])
    audit = verify(q, r["assignments"])
    (out / "repair.json").write_text(
        json.dumps(
            dict(
                original_problem=p,
                baseline=baseline,
                changed_problem=q,
                result=r,
                audit=audit,
            ),
            indent=2,
        )
    )
    print("repair", r["status"], r.get("changed_count"), audit["status"], flush=True)


if __name__ == "__main__":
    main()
