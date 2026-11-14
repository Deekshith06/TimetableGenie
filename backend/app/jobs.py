import time, os, threading, copy
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from . import store
from .solver import solve
from .verifier import verify

TERMINAL = {
    "FEASIBLE",
    "OPTIMAL",
    "INFEASIBLE",
    "UNKNOWN",
    "MODEL_INVALID",
    "CANCELLED",
    "FAILED",
    "AUDIT_FAILED",
    "INTERRUPTED",
}
pool = None


def append(job_id, event):
    def change(j):
        if event["type"] == "heartbeat" and j["status"] in TERMINAL:
            return
        seq = j.get("next_event", 1)
        j.setdefault("events", []).append({"id": seq, "at": time.time(), **event})
        j["events"] = j["events"][-200:]
        j["next_event"] = seq + 1
        j["heartbeat"] = time.time()

    store.mutate(job_id, change)


def run_job(job_id):
    def start(j):
        if j["status"] != "CANCELLED":
            j["status"] = "RUNNING"

    j = store.mutate(job_id, start)
    if not j or j["status"] == "CANCELLED":
        return
    append(job_id, {"type": "started", "message": "CP-SAT worker started"})
    stop = threading.Event()

    def heartbeat():
        while not stop.wait(1):
            try:
                append(
                    job_id,
                    {
                        "type": "heartbeat",
                        "message": "Worker alive; search may not yet have an incumbent",
                    },
                )
            except Exception:
                stop.set()

    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        r = solve(
            j["problem"],
            j["time_limit"],
            j["seed"],
            j.get("baseline"),
            lambda e: append(job_id, e),
            lambda: bool((store.get(job_id) or {}).get("cancel_requested")),
        )
        if r["assignments"]:
            r["audit"] = verify(j["problem"], r["assignments"])
            if r["audit"]["status"] != "PASS":
                r["status"] = "AUDIT_FAILED"
        stop.set()
        thread.join(timeout=2)

        def finish(current):
            if current.get("cancel_requested"):
                r.update(status="CANCELLED", assignments=[], optimal=False)
                r.pop("audit", None)
            current.update(
                status=r["status"],
                result=r,
                finished=time.time(),
                heartbeat=time.time(),
            )

        store.mutate(job_id, finish)
        append(
            job_id,
            {
                "type": "completed",
                "status": r["status"],
                "message": (
                    "Independent audit completed"
                    if r.get("audit")
                    else "; ".join(r["diagnostics"])
                ),
            },
        )
    except Exception as exc:
        stop.set()
        thread.join(timeout=2)
        current = store.get(job_id) or j
        current.update(status="FAILED", error=str(exc)[:500], finished=time.time())
        store.put(job_id, current["owner"], "job", current)
        append(job_id, {"type": "failed", "message": str(exc)[:500]})


def enqueue(job_id):
    global pool
    if os.environ.get("QUEUE_MODE") == "redis":
        import redis

        redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0")).rpush(
            "timetablegenie:jobs", job_id
        )
    else:
        if pool is None:
            pool = ProcessPoolExecutor(
                max_workers=2, mp_context=multiprocessing.get_context("spawn")
            )
        pool.submit(run_job, job_id)


def recover(owner):
    for j in store.listed(owner, "job"):
        if (
            j["status"] not in TERMINAL
            and j["status"] != "QUEUED"
            and time.time() - j.get("heartbeat", j["created"])
            > max(60, j["time_limit"] + 30)
        ):
            j.update(
                status="INTERRUPTED",
                error="Worker heartbeat expired. Previous accepted timetables remain unchanged.",
            )
            store.put(j["job_id"], owner, "job", j)
