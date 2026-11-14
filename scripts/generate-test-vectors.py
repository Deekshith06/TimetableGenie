"""Refresh reusable cross-language audit test vectors from the Python oracle."""

import runpy, json, sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
module = runpy.run_path(str(root / "backend/tests/test_engine.py"))
from backend.app.verifier import verify

output = {
    "generated_by": "Python independent verifier and targeted mutation definitions",
    "cases": module["mutations"](),
    "digest_reference": verify(module["P"], module["A"]),
}
(root / "datasets/audit_test_vectors.json").write_text(
    json.dumps(output, ensure_ascii=False, separators=(",", ":"))
)
print("Wrote", len(output["cases"]), "targeted mutation vectors")
