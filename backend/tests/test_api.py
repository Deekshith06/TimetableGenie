import os, sys, time, json, copy, uuid, tempfile
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///" + str(
    Path(tempfile.gettempdir()) / f"timetablegenie-api-test-{os.getpid()}.db"
)
os.environ["ALLOW_DEMO_AUTH"] = "true"
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app import store, jobs

P = json.loads((ROOT / "datasets/nep2020_synthetic_data.json").read_text())


def test_api_job_lifecycle_exports_and_negative_verification():
    with TestClient(app) as c:
        assert c.get("/api/health").status_code == 200
        assert c.get("/api/bootstrap").json()["mode"] == "cpsat"
        saved = c.post("/api/problems", json={"problem": P})
        assert saved.status_code == 200
        assert (
            c.get("/api/problems/" + saved.json()["id"]).json()["problem"]["id"]
            == P["id"]
        )
        j = c.post("/api/solve/nep-direct", json={"problem": P, "time_limit": 3})
        assert j.status_code == 202, j.text
        id = j.json()["job_id"]
        for _ in range(250):
            row = c.get("/api/jobs/" + id).json()
            if row["status"] in jobs.TERMINAL:
                break
            time.sleep(0.05)
        assert row["status"] in ("FEASIBLE", "OPTIMAL"), row
        assert row["result"]["audit"]["status"] == "PASS"
        for kind in ("pdf", "xlsx", "ics", "csv", "json"):
            out = c.get(f"/api/export/{id}/{kind}")
            assert out.status_code == 200, out.text[:200]
            assert len(out.content) > 100
        with c.stream("GET", "/api/stream/" + id) as stream:
            txt = "".join(stream.iter_text())
            assert "event: terminal" in txt
        bad = copy.deepcopy(row["result"]["assignments"])
        bad.pop()
        assert (
            c.post("/api/verify", json={"problem": P, "schedule": bad}).json()["status"]
            == "FAIL"
        )
        assert (
            c.post(
                "/api/problems",
                json={"problem": P},
                headers={"Origin": "https://attacker.invalid"},
            ).status_code
            == 403
        )
        assert c.get("/api/jobs/missing").status_code == 404
        # Another owner's persisted ID cannot be read by changing the URL.
        foreign = str(uuid.uuid4())
        store.put(
            foreign,
            "another-owner",
            "job",
            dict(job_id=foreign, status="RUNNING", problem=P),
        )
        assert c.get("/api/jobs/" + foreign).status_code == 404


def test_auth_required_when_demo_mode_disabled(monkeypatch):
    monkeypatch.setenv("ALLOW_DEMO_AUTH", "false")
    with TestClient(app) as c:
        assert c.get("/api/bootstrap").status_code == 401
        assert (
            c.post("/api/verify", json={"problem": P, "schedule": []}).status_code
            == 401
        )
        assert (
            c.post(
                "/api/auth/login", json={"email": "none", "password": "wrong"}
            ).status_code
            == 401
        )


def test_cancel_flag_survives_heartbeat():
    store.initialize()
    id = str(uuid.uuid4())
    owner = "test-owner"
    j = dict(
        job_id=id,
        owner=owner,
        status="RUNNING",
        problem=P,
        time_limit=3,
        created=time.time(),
        events=[],
        cancel_requested=False,
    )
    store.put(id, owner, "job", j)
    store.mutate(
        id, lambda current: current.update(cancel_requested=True, status="CANCELLED")
    )
    jobs.append(id, dict(type="heartbeat", message="late heartbeat"))
    actual = store.get(id)
    assert actual["status"] == "CANCELLED" and actual["cancel_requested"]
