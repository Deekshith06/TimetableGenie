"""Create a reproducible local-development source download, excluding runtime state."""
from pathlib import Path
import hashlib
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
roots = ["app", "backend", "benchmarks", "components", "datasets", "db", "docs", "drizzle", "hooks", "lib", "local", "public", "scripts", "tests", "vendor", "worker"]
files = ["README.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "vite.config.ts", "vite.local.config.ts", "next.config.ts", "drizzle.config.ts", "compose.yaml", "components.json", "eslint.config.mjs", "postcss.config.mjs", "cloudflare-env.d.ts", ".gitignore", ".dockerignore"]
skip = {"__pycache__", ".pytest_cache", "node_modules", "downloads", ".venv"}
paths = set()
for name in roots:
    for p in (root / name).rglob("*"):
        if not p.is_file() or any(part in skip for part in p.relative_to(root).parts):
            continue
        if p.suffix in {".pyc", ".db", ".pem"} or p.name.startswith(".env"):
            continue
        paths.add(p)
for name in files:
    p = root / name
    if p.is_file(): paths.add(p)
out = root / "public/downloads/TimetableGenie-source.zip"
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for p in sorted(paths):
        info = zipfile.ZipInfo("TimetableGenie/" + p.relative_to(root).as_posix(), (2026, 10, 30, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, p.read_bytes())
    info = zipfile.ZipInfo("TimetableGenie/.openai/hosting.json", (2026, 10, 30, 0, 0, 0))
    archive.writestr(info, '{"d1":"DB","r2":null}\n')
    info = zipfile.ZipInfo("TimetableGenie/SOURCE-EXPORT.txt", (2026, 10, 30, 0, 0, 0))
    archive.writestr(info, "Local-development source export. Site identity, credentials, dependencies, runtime databases and build output are intentionally excluded. Follow README.md to install and run.\n")
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
(root / "outputs").mkdir(exist_ok=True)
shutil.copy2(out, root / "outputs" / out.name)
print(f"{len(paths)} source files; {out.stat().st_size} bytes; SHA-256 {hashlib.sha256(out.read_bytes()).hexdigest()}")
