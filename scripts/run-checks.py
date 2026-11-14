"""Record observed check outcomes; no inferred test passes."""

import subprocess, sys, json, time, platform
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / "outputs"
out.mkdir(exist_ok=True)
commands = [
    ("python-tests", [sys.executable, "-m", "pytest", "backend/tests", "-q"]),
    ("typescript", ["node", "node_modules/typescript/bin/tsc", "--noEmit"]),
    (
        "browser-engine-tests",
        ["node", "--import", "tsx", "--test", "tests/engine.test.ts"],
    ),
    (
        "local-frontend-build",
        [
            "node",
            "node_modules/vite/bin/vite.js",
            "build",
            "--config",
            "vite.local.config.ts",
        ],
    ),
]
records = []
for name, cmd in commands:
    start = time.monotonic()
    r = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    text = r.stdout + r.stderr
    (out / (name + ".log")).write_text(text)
    record = dict(
        check=name,
        command=cmd,
        exit_code=r.returncode,
        elapsed_seconds=round(time.monotonic() - start, 3),
        summary=text[-1800:],
    )
    records.append(record)
    print(
        name,
        "PASS" if r.returncode == 0 else "FAIL",
        record["elapsed_seconds"],
        flush=True,
    )
data = dict(
    observed_at=__import__("datetime")
    .datetime.now(__import__("datetime").timezone.utc)
    .isoformat(),
    python=platform.python_version(),
    checks=records,
    all_passed=all(r["exit_code"] == 0 for r in records),
    scope_note="These checks do not establish correctness of every possible input, hosted account behavior, regulatory compliance, or an unexecuted Docker stack.",
)
(ROOT / "docs/validation.json").write_text(json.dumps(data, indent=2))
raise SystemExit(0 if data["all_passed"] else 1)
