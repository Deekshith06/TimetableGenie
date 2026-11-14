"""Independent audit: no solver imports, placement domains or CP-SAT state."""

import json, hashlib
from datetime import datetime, timezone
from .schemas import Problem, Assignment

RULES = [
    ("H1", "Session fulfillment"),
    ("H2", "Room exclusivity"),
    ("H3", "Faculty exclusivity"),
    ("H4", "Student pathway conflicts"),
    ("H5", "Elective synchronization"),
    ("H6", "Contiguous practical blocks"),
    ("H7", "Room capacity"),
    ("H8", "Equipment & qualifications"),
    ("H9", "Availability & calendar"),
    ("H10", "Faculty workload"),
    ("H11", "Theory spread"),
    ("H12", "Building travel time"),
    ("H13", "Locked assignments"),
]


def normalized(v):
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, dict):
        return {k: normalized(x) for k, x in v.items()}
    if isinstance(v, list):
        return [normalized(x) for x in v]
    return v


def canonical(v):
    return json.dumps(
        normalized(v),
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    )


def digest(domain, v):
    return hashlib.sha256(
        (f"TimetableGenie/{domain}/v1\n" + canonical(v)).encode()
    ).hexdigest()


def verify(raw_problem, raw_schedule):
    vs = []
    complete = True

    def add(rule, message, ids=None):
        vs.append(dict(rule=rule, message=message, event_ids=ids or []))

    try:
        p = Problem.model_validate(raw_problem).model_dump()
    except Exception as exc:
        p = None
        complete = False
        add("H1", f"Invalid problem: {exc}")
    aa = []
    if not isinstance(raw_schedule, list) or len(raw_schedule) > 500:
        complete = False
        add("H1", "Schedule must be an array of at most 500 assignments")
    else:
        for i, row in enumerate(raw_schedule):
            try:
                aa.append(Assignment.model_validate(row).model_dump())
            except Exception:
                complete = False
                add("H1", f"Malformed assignment at index {i}")
    if p:
        events = {e["id"]: e for e in p["events"]}
        rooms = {r["id"]: r for r in p["rooms"]}
        fs = {f["id"]: f for f in p["faculty"]}
        gs = {g["id"]: g for g in p["groups"]}
        periods = p["calendar"]["periods"]
        for eid in events:
            count = sum(a["event_id"] == eid for a in aa)
            if count != 1:
                add("H1", f"{eid}: expected one event, found {count}", [eid])
        for a in aa:
            if a["event_id"] not in events:
                complete = False
                add("H1", f"Unexpected event {a['event_id']}", [a["event_id"]])
        rows = []
        for a in aa:
            if a["event_id"] not in events:
                continue
            e = events[a["event_id"]]
            r = rooms.get(a["room_id"])
            f = fs.get(a["faculty_id"])
            occ = list(range(a["period"], a["period"] + e["duration"]))
            rows.append((a, e, r, f, occ))
            bad = a["day"] >= len(p["calendar"]["days"]) or any(
                t >= len(periods) for t in occ
            )
            if bad:
                complete = False
                add("H6", f"{e['id']}: interval outside calendar", [e["id"]])
                add("H9", f"{e['id']}: invalid teaching slot", [e["id"]])
            elif any(
                periods[occ[j - 1]]["end"] != periods[occ[j]]["start"]
                for j in range(1, len(occ))
            ):
                add("H6", f"{e['id']}: block crosses a break", [e["id"]])
            if not r or not f:
                complete = False
                add("H8", f"{e['id']}: unknown room or faculty", [e["id"]])
                continue
            enrollment = sum(gs[g]["size"] for g in e["group_ids"])
            if enrollment > r["capacity"]:
                add("H7", f"{e['id']}: capacity overflow", [e["id"]])
            if (
                r["type"] not in e["room_types"]
                or not set(e["equipment"]) <= set(r["equipment"])
                or f["id"] not in e["faculty_ids"]
                or e["course_id"] not in f["course_ids"]
            ):
                add("H8", f"{e['id']}: incompatible resource/qualification", [e["id"]])
            if (
                e["allowed_starts"] is not None
                and dict(day=a["day"], period=a["period"]) not in e["allowed_starts"]
            ):
                add("H9", f"{e['id']}: start outside allowed windows", [e["id"]])
            unavailable = (
                r["unavailable"]
                + f["unavailable"]
                + sum([gs[g]["unavailable"] for g in e["group_ids"]], [])
            )
            if any(dict(day=a["day"], period=t) in unavailable for t in occ):
                add("H9", f"{e['id']}: blackout or closure", [e["id"]])

        def overlap(x, y):
            return x[0]["day"] == y[0]["day"] and bool(set(x[4]) & set(y[4]))

        for i, x in enumerate(rows):
            for y in rows[i + 1 :]:
                a, e, r, f, occ = x
                b, h, s, k, occ2 = y
                shared = bool(set(e["group_ids"]) & set(h["group_ids"]))
                ids = [e["id"], h["id"]]
                if overlap(x, y):
                    if a["room_id"] == b["room_id"]:
                        add("H2", "Overlapping room assignments", ids)
                    if a["faculty_id"] == b["faculty_id"]:
                        add("H3", "Overlapping faculty assignments", ids)
                    if shared:
                        add("H4", "Overlapping student assignments", ids)
                travel = p["policies"]["min_travel_minutes"]
                if (
                    travel
                    and a["day"] == b["day"]
                    and not overlap(x, y)
                    and r
                    and s
                    and r["building"] != s["building"]
                    and (shared or a["faculty_id"] == b["faculty_id"])
                ):
                    left, right = (x, y) if a["period"] < b["period"] else (y, x)
                    end = left[4][-1]
                    start = right[4][0]
                    if (
                        end < len(periods)
                        and start < len(periods)
                        and periods[start]["start"] - periods[end]["end"] < travel
                    ):
                        add("H12", "Insufficient building transfer time", ids)
        sync = {}
        for row in rows:
            if row[1]["sync_group"]:
                sync.setdefault(row[1]["sync_group"], []).append(row)
        for sid, rs in sync.items():
            if len({(r[0]["day"], r[0]["period"]) for r in rs}) > 1:
                add(
                    "H5",
                    f"{sid}: alternatives not synchronized",
                    [r[1]["id"] for r in rs],
                )
        for basket in p["baskets"]:
            for x in [r for r in rows if r[1]["basket_id"] == basket["id"]]:
                if (
                    dict(day=x[0]["day"], period=x[0]["period"])
                    not in basket["allowed_starts"]
                ):
                    add("H5", "Event outside basket windows", [x[1]["id"]])
                for y in rows:
                    if (
                        y[1]["basket_id"] != basket["id"]
                        and set(y[1]["group_ids"]) & set(basket["reserved_groups"])
                        and overlap(x, y)
                    ):
                        add(
                            "H5",
                            "Reserved pathway window is blocked",
                            [x[1]["id"], y[1]["id"]],
                        )
        for f in p["faculty"]:
            selected = [x for x in rows if x[0]["faculty_id"] == f["id"]]
            load = sum(
                periods[t]["end"] - periods[t]["start"]
                for x in selected
                for t in x[4]
                if t < len(periods)
            )
            if load > f["max_minutes"]:
                add(
                    "H10",
                    f"{f['id']}: workload {load} > {f['max_minutes']}",
                    [x[1]["id"] for x in selected],
                )
        spread = {}
        for x in rows:
            if x[1]["kind"] == "L":
                spread.setdefault((x[1]["section_id"], x[0]["day"]), []).append(
                    x[1]["id"]
                )
        for ids in spread.values():
            if len(ids) > p["policies"]["max_theory_per_day"]:
                add("H11", "Theory daily limit exceeded", ids)
        for lock in p["policies"]["locked"]:
            if lock not in aa:
                add(
                    "H13",
                    f"Locked event {lock['event_id']} moved or missing",
                    [lock["event_id"]],
                )
    rules = []
    for rid, label in RULES:
        count = sum(v["rule"] == rid for v in vs)
        na = p and (
            (rid == "H12" and not p["policies"]["min_travel_minutes"])
            or (rid == "H13" and not p["policies"]["locked"])
            or (rid == "H5" and not p["baskets"])
        )
        rules.append(
            dict(
                id=rid,
                label=label,
                status=(
                    "NOT_EVALUATED"
                    if not p
                    else (
                        "NOT_APPLICABLE"
                        if na
                        else (
                            "FAIL" if count else "PASS" if complete else "NOT_EVALUATED"
                        )
                    )
                ),
                violations=count,
            )
        )
    payload = dict(
        schema_version="1.0",
        checker_version="python-independent-1.0",
        status="PASS" if complete and not vs else "FAIL",
        complete=complete,
        total_violations=len(vs),
        rules=rules,
        violations=vs,
        problem_digest=digest("problem", p or raw_problem),
        schedule_digest=digest(
            "schedule",
            (
                sorted(raw_schedule, key=canonical)
                if isinstance(raw_schedule, list)
                else raw_schedule
            ),
        ),
    )
    return {
        **payload,
        "payload_digest": digest("audit", payload),
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "signature_status": "Unsigned integrity digest; independently recomputable",
    }
