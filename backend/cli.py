"""Reproduce solves, audits and exports without running a web server."""

import argparse, json, sys
from pathlib import Path
from .app.schemas import Problem
from .app.solver import solve
from .app.verifier import verify
from .app.transit_adapter import adapt_transit
from .app.exports import export


def main():
    parser = argparse.ArgumentParser(
        description="TimetableGenie independent local tools"
    )
    parser.add_argument("action", choices=["solve", "verify", "export"])
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--seconds", type=float, default=3)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--format", choices=["pdf", "xlsx", "ics", "csv", "json"], default="json"
    )
    args = parser.parse_args()
    raw = json.loads(args.input.read_text())
    if args.action == "solve":
        p = (
            adapt_transit(raw)
            if "service_blocks" in raw
            else Problem.model_validate(raw).model_dump()
        )
        r = solve(p, args.seconds, args.seed)
        a = verify(p, r["assignments"])
        r["audit"] = a
        bundle = dict(problem=p, result=r, audit=a)
        path = args.output or Path("TimetableGenie_bundle.json")
        path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False))
        print(
            json.dumps(
                dict(
                    status=r["status"],
                    audit=a["status"],
                    meetings=len(r["assignments"]),
                    output=str(path),
                )
            )
        )
        return 0 if r["assignments"] and a["status"] == "PASS" else 1
    p = raw["problem"]
    r = raw["result"]
    a = verify(p, r["assignments"])
    expected = raw.get("audit", r.get("audit", {}))
    integrity = all(
        expected.get(k, a[k]) == a[k] for k in ("problem_digest", "schedule_digest")
    )
    if args.action == "verify":
        report = {**a, "integrity_matches": integrity}
        print(json.dumps(report, indent=2))
        if args.output:
            args.output.write_text(json.dumps(report, indent=2))
        return 0 if a["status"] == "PASS" and integrity else 1
    if a["status"] != "PASS" or not integrity:
        raise ValueError("Export refused: audit or bound-data integrity check failed")
    content, mime = export(p, {**r, "audit": a}, args.format)
    path = args.output or Path("TimetableGenie." + args.format)
    path.write_bytes(content)
    print(json.dumps(dict(output=str(path), mime=mime, audit="PASS")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
