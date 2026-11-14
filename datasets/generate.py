"""Deterministic, explicitly synthetic fixtures; no observed transport data."""

import json, copy, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def generate(seed=42):
    rng = random.Random(seed)
    cs = [
        ("CS201", "Algorithms", "DSC", 4),
        ("CS202L", "Operating Systems Lab", "DSC", 1),
        ("EC201", "Macroeconomics", "DSC", 3),
        ("DS201", "Data Foundations", "DSC", 3),
        ("AI_MIN_1", "ML for Non-CS", "MIC", 2),
        ("FIN_MIN_1", "Computational Finance", "MIC", 2),
        ("PSY101", "Cognitive Psychology", "MDC", 2),
        ("ENV105", "Climate Systems", "MDC", 2),
        ("SEC_WEB", "Full-Stack Studio", "SEC", 1),
        ("VAC_ETH", "Ethics & Constitutional Values", "VAC", 2),
        ("AEC_COM", "Communication Skills", "AEC", 2),
        ("INT_RES", "Research & Teaching Practice", "INT", 1),
    ]
    p = dict(
        schema_version="1.0",
        id=f"NEP_DEMO_{seed}",
        title="Multidisciplinary undergraduate timetable",
        institution="Northbridge Institute · synthetic demonstration",
        provenance=dict(
            kind="synthetic",
            description="Seeded example. Credits, workload limits and pathways are illustrative institutional policies, not regulatory certification.",
            seed=seed,
            source_url=None,
        ),
        calendar=dict(
            days=["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            periods=[dict(start=s, end=s + 60) for s in (540, 600, 660, 780, 840)],
            timezone="Asia/Kolkata",
            term_start="2026-11-02",
            term_end="2026-11-27",
            holidays=["2026-11-12"],
        ),
        courses=[
            dict(
                id=i,
                title=t,
                category=c,
                credits=n,
                profile="Configurable synthetic undergraduate profile",
            )
            for i, t, c, n in cs
        ],
        rooms=[],
        faculty=[],
        groups=[],
        events=[],
        baskets=[],
        policies=dict(
            max_theory_per_day=1,
            min_travel_minutes=0,
            locked=[],
            weights=dict(preference=20, seat_slack=1, idle=3, travel=5, balance=0),
            notes=[
                "Credits are separate from event contact minutes.",
                "One practical meeting occupies two uninterrupted 60-minute periods.",
                "Weekly template; holidays suppress calendar occurrences without automatic makeup.",
                "Program labels are examples, not a legal compliance determination.",
            ],
        ),
    )
    for i, name, typ, cap, bld, eq in [
        ("HALL_101", "Lecture Hall 101", "LECTURE_HALL", 100, "Main", ["projector"]),
        ("HALL_102", "Lecture Hall 102", "LECTURE_HALL", 60, "Main", ["projector"]),
        (
            "COMP_LAB_201",
            "Computing Lab 201",
            "COMPUTER_LAB",
            30,
            "Technology",
            ["computers", "projector"],
        ),
        (
            "SKILL_LAB_202",
            "Studio Lab 202",
            "SKILL_STUDIO",
            30,
            "Technology",
            ["computers", "projector"],
        ),
        (
            "SEM_301",
            "Seminar Room 301",
            "SEMINAR_ROOM",
            50,
            "Humanities",
            ["projector"],
        ),
        (
            "SEM_302",
            "Seminar Room 302",
            "SEMINAR_ROOM",
            40,
            "Humanities",
            ["projector"],
        ),
    ]:
        p["rooms"].append(
            dict(
                id=i,
                name=name,
                type=typ,
                capacity=cap,
                building=bld,
                equipment=eq,
                unavailable=[],
            )
        )
    for i, name, dep, qual in [
        ("F01", "Dr. Mira Shah", "Computer Science", ["CS201", "DS201"]),
        ("F02", "Dr. Arjun Rao", "Computing & AI", ["CS202L", "AI_MIN_1"]),
        ("F03", "Dr. Leena Das", "Economics", ["EC201", "FIN_MIN_1"]),
        ("F04", "Dr. Nisha Sen", "Psychology & Languages", ["PSY101", "AEC_COM"]),
        ("F05", "Dr. Kabir Mehta", "Environment & Humanities", ["ENV105", "VAC_ETH"]),
        ("F06", "Prof. Tara Iyer", "Applied Learning", ["SEC_WEB", "INT_RES"]),
    ]:
        p["faculty"].append(
            dict(
                id=i,
                name=name,
                department=dep,
                max_minutes=720,
                course_ids=qual,
                unavailable=[dict(day=rng.randrange(5), period=0)],
                preferred=[dict(day=d, period=t) for d in range(5) for t in (0, 1, 2)],
            )
        )
    for i, name, size, major, minor, mdc in [
        (
            "CS_FIN_PSY",
            "CS · Finance · Psychology",
            24,
            "Computer Science",
            "Finance",
            "Psychology",
        ),
        (
            "CS_FIN_ENV",
            "CS · Finance · Climate",
            18,
            "Computer Science",
            "Finance",
            "Climate Systems",
        ),
        (
            "EC_AI_PSY",
            "Economics · AI · Psychology",
            20,
            "Economics",
            "Artificial Intelligence",
            "Psychology",
        ),
        (
            "DS_AI_ENV",
            "Data Science · AI · Climate",
            16,
            "Data Science",
            "Artificial Intelligence",
            "Climate Systems",
        ),
    ]:
        p["groups"].append(
            dict(
                id=i,
                name=name,
                size=size,
                program="Undergraduate demonstration",
                major=major,
                minor=minor,
                mdc=mdc,
                unavailable=[],
            )
        )
    gs = [g["id"] for g in p["groups"]]

    def add(c, n, f, groups, kind="L", duration=1, types=None, basket=None):
        for k in range(n):
            p["events"].append(
                dict(
                    id=f"{c}_{'_'.join(groups) if kind=='P' else 'ALL'}_{kind}_{k+1}",
                    course_id=c,
                    section_id=f"{c}_{'_'.join(groups) if kind=='P' else 'ALL'}",
                    kind=kind,
                    duration=duration,
                    faculty_ids=[f],
                    group_ids=groups,
                    room_types=types or ["LECTURE_HALL", "SEMINAR_ROOM"],
                    equipment=["computers"] if kind == "P" else ["projector"],
                    allowed_starts=None,
                    basket_id=basket,
                    sync_group=f"{basket}_{k+1}" if basket else None,
                )
            )

    add("CS201", 3, "F01", gs[:2])
    add("CS201", 1, "F01", gs[:2], "T")
    for g in gs[:2]:
        add("CS202L", 1, "F02", [g], "P", 2, ["COMPUTER_LAB"])
    add("EC201", 3, "F03", [gs[2]])
    add("DS201", 3, "F01", [gs[3]])
    add("AI_MIN_1", 2, "F02", gs[2:], basket="BASKET_MINOR")
    add("FIN_MIN_1", 2, "F03", gs[:2], basket="BASKET_MINOR")
    add("PSY101", 2, "F04", [gs[0], gs[2]], basket="BASKET_MDC_A")
    add("ENV105", 2, "F05", [gs[1], gs[3]], basket="BASKET_MDC_A")
    for g in gs:
        add("SEC_WEB", 1, "F06", [g], "P", 2, ["COMPUTER_LAB", "SKILL_STUDIO"])
    add("AEC_COM", 2, "F04", gs)
    add("VAC_ETH", 2, "F05", gs)
    add("INT_RES", 1, "F06", [gs[0]], "INT")
    for bid, name, cs, days, period in [
        (
            "BASKET_MINOR",
            "Cross-department minors",
            ["AI_MIN_1", "FIN_MIN_1"],
            [1, 3],
            1,
        ),
        (
            "BASKET_MDC_A",
            "Multidisciplinary electives",
            ["PSY101", "ENV105"],
            [0, 2],
            3,
        ),
    ]:
        p["baskets"].append(
            dict(
                id=bid,
                name=name,
                course_ids=cs,
                reserved_groups=gs,
                allowed_starts=[dict(day=d, period=period) for d in days],
            )
        )
    return p


def transit_from(p):
    q = copy.deepcopy(p)
    return dict(
        schema_version="1.0",
        title="Synthetic multimodal dispatch proxy",
        provenance=dict(
            kind="synthetic",
            description="Generated structural proxy, not self-collected public transit records. Vehicle equipment, passenger conflicts and synchronization are synthetic.",
            seed=p["provenance"]["seed"],
            source_url=None,
        ),
        calendar=q["calendar"],
        vehicles=q["rooms"],
        operators=q["faculty"],
        passenger_groups=q["groups"],
        service_types=q["courses"],
        service_blocks=q["events"],
        transfer_groups=q["baskets"],
        policies=q["policies"],
        corridors=[
            dict(id=f"COR_{i+1}", name=g["major"]) for i, g in enumerate(q["groups"])
        ],
    )


def write():
    p = generate()
    (ROOT / "nep2020_synthetic_data.json").write_text(
        json.dumps(p, indent=2, ensure_ascii=False)
    )
    (ROOT / "transit_proxy_corpus.json").write_text(
        json.dumps(transit_from(p), indent=2, ensure_ascii=False)
    )
    for name, edit in [
        ("capacity_shortage", lambda q: [r.update(capacity=1) for r in q["rooms"]]),
        ("faculty_overload", lambda q: q["faculty"][0].update(max_minutes=60)),
        ("no_windows", lambda q: q["events"][0].update(allowed_starts=[])),
    ]:
        q = copy.deepcopy(p)
        q["id"] = "NEG_" + name
        edit(q)
        (ROOT / (name + ".json")).write_text(json.dumps(q, indent=2))
    profiles = [
        dict(
            id=i,
            description="Configuration example requiring institution-specific policy review",
            credit_contact_policy="Explicit meetings and minutes; no universal credit conversion",
            source_status="Not a certified regulatory profile",
        )
        for i in ["FYUGP", "BTECH", "ITEP", "BED", "MED"]
    ]
    (ROOT / "program_profiles.json").write_text(json.dumps(profiles, indent=2))


if __name__ == "__main__":
    write()
