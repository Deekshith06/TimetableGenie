"""Redis-backed isolated worker; run more processes for bounded concurrency."""

import os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import redis
from backend.app import store
from backend.app.jobs import run_job

store.initialize()
client = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"))
while True:
    item = client.blpop("timetablegenie:jobs", timeout=5)
    if item:
        run_job(item[1].decode())
