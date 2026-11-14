import os, json, time, uuid, asyncio, threading
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
from .schemas import Problem, Assignment, Calendar
from .verifier import verify
from .transit_adapter import adapt_transit
from . import store, jobs
from .exports import export


@asynccontextmanager
async def lifespan(app):
    store.initialize()
    yield
    if jobs.pool:
        jobs.pool.shutdown(wait=False, cancel_futures=True)
        jobs.pool = None


app = FastAPI(title="TimetableGenie CP-SAT API", version="1.0.0", lifespan=lifespan)
login_attempts = {}
login_lock = threading.Lock()


@app.middleware("http")
async def request_guards(request, call_next):
    if int(request.headers.get("content-length", "0")) > 2_000_000:
        return JSONResponse({"detail": "Request exceeds 2 MB"}, 413)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        allowed = os.environ.get(
            "ALLOWED_ORIGINS", str(request.base_url).rstrip("/")
        ).split(",")
        if origin and origin not in allowed:
            return JSONResponse({"detail": "Cross-origin mutation rejected"}, 403)
    return await call_next(request)


def owner(request: Request):
    if os.environ.get("ALLOW_DEMO_AUTH") == "true":
        return "local-development-demo"
    who = store.owner_for(request.cookies.get("tg_session"))
    if not who:
        raise HTTPException(401, "Sign in to the local service")
    return who


async def body(request):
    raw = await request.body()
    if len(raw) > 2_000_000:
        raise HTTPException(413, "Request exceeds 2 MB")
    try:
        return json.loads(raw)
    except Exception:
        raise HTTPException(422, "Invalid JSON")


def valid(raw):
    try:
        return Problem.model_validate(raw).model_dump()
    except Exception as exc:
        raise HTTPException(422, str(exc)[:2000])


@app.get("/api/health")
def health():
    return {"status": "ok", "engine": "CP-SAT", "schema_version": "1.0"}


@app.post("/api/auth/login")
async def login(request: Request):
    address = request.client.host if request.client else "unknown"
    with login_lock:
        recent = [
            t for t in login_attempts.get(address, []) if time.monotonic() - t < 60
        ]
        if len(recent) >= 10:
            raise HTTPException(429, "Too many login attempts; retry in a minute")
        login_attempts[address] = recent + [time.monotonic()]
    data = await body(request)
    token = store.login(str(data.get("email", "")), str(data.get("password", "")))
    if not token:
        raise HTTPException(401, "Invalid credentials")
    response = JSONResponse({"ok": True})
    response.set_cookie(
        "tg_session",
        token,
        httponly=True,
        samesite="strict",
        secure=os.environ.get("SESSION_COOKIE_SECURE") == "true",
        max_age=86400,
    )
    return response


@app.post("/api/auth/logout")
def logout(request: Request):
    store.logout(request.cookies.get("tg_session"))
    response = JSONResponse({"ok": True})
    response.delete_cookie("tg_session")
    return response


@app.get("/api/contracts")
def contracts():
    return {
        "problem": Problem.model_json_schema(),
        "assignment": Assignment.model_json_schema(),
        "notes": "Runtime reference and policy validators apply in addition to structural JSON Schema.",
    }


@app.get("/api/bootstrap")
def bootstrap(who=Depends(owner)):
    jobs.recover(who)
    return {
        "mode": "cpsat",
        "user": {"name": who},
        "problems": store.listed(who, "problem"),
        "jobs": [
            {
                k: v
                for k, v in j.items()
                if k not in ("problem", "events", "baseline", "owner")
            }
            for j in store.listed(who, "job")
        ],
    }


@app.post("/api/problems")
async def save_problem(request: Request, who=Depends(owner)):
    data = await body(request)
    p = valid(data["problem"])
    id = str(uuid.uuid4())
    result = dict(id=id, problem=p, created=time.time())
    store.put(id, who, "problem", result)
    return result


@app.get("/api/problems/{id}")
def read_problem(id: str, who=Depends(owner)):
    row = store.get(id, who)
    if not row or "problem" not in row:
        raise HTTPException(404, "Problem not found")
    return row


@app.post("/api/validate")
async def validate(request: Request, who=Depends(owner)):
    data = await body(request)
    return {"problem": valid(data["problem"]), "valid": True}


async def create_job(request, who, kind):
    data = await body(request)
    try:
        p = valid(
            adapt_transit(data["transit"]) if kind == "transit" else data["problem"]
        )
    except (ValueError, KeyError) as exc:
        raise HTTPException(422, str(exc))
    baseline = None
    if kind == "repair":
        original = valid(data.get("original_problem"))
        baseline = data.get("baseline")
        if verify(original, baseline)["status"] != "PASS":
            raise HTTPException(
                422, "Baseline fails independent audit against original problem"
            )
        if original["calendar"] != p["calendar"]:
            raise HTTPException(
                422,
                "Calendar changes require a fresh solve; repair preserves the weekly time reference",
            )
        if {e["id"] for e in original["events"]} != {e["id"] for e in p["events"]}:
            raise HTTPException(
                422,
                "Repair must preserve the event set; use a fresh solve for structural changes",
            )
    limit = data.get("time_limit", 3)
    if (
        isinstance(limit, bool)
        or not isinstance(limit, (int, float))
        or not 0.05 <= limit <= 120
    ):
        raise HTTPException(422, "time_limit must be between 0.05 and 120 seconds")
    seed = data.get("seed", 42)
    if (
        isinstance(seed, bool)
        or not isinstance(seed, int)
        or not 0 <= seed <= 2147483647
    ):
        raise HTTPException(422, "seed must be an integer from 0 to 2147483647")
    id = str(uuid.uuid4())
    j = dict(
        job_id=id,
        owner=who,
        status="QUEUED",
        problem=p,
        baseline=baseline,
        created=time.time(),
        heartbeat=time.time(),
        time_limit=limit,
        seed=seed,
        events=[],
        next_event=1,
        cancel_requested=False,
    )
    store.put(id, who, "job", j)
    try:
        jobs.enqueue(id)
    except Exception as exc:
        j.update(status="FAILED", error="Queue unavailable")
        store.put(id, who, "job", j)
        raise HTTPException(503, "Queue unavailable") from exc
    return {"job_id": id, "problem": p, "mode": "cpsat", "status": "QUEUED"}


@app.post("/api/solve/nep-direct", status_code=202)
async def direct(request: Request, who=Depends(owner)):
    return await create_job(request, who, "direct")


@app.post("/api/solve/transit-proxy", status_code=202)
async def transit(request: Request, who=Depends(owner)):
    return await create_job(request, who, "transit")


@app.post("/api/solve/disruption-repair", status_code=202)
async def repair(request: Request, who=Depends(owner)):
    return await create_job(request, who, "repair")


@app.get("/api/jobs/{id}")
def get_job(id: str, who=Depends(owner)):
    jobs.recover(who)
    j = store.get(id, who)
    if not j or "job_id" not in j:
        raise HTTPException(404, "Job not found")
    return {k: v for k, v in j.items() if k != "owner"}


@app.post("/api/jobs/{id}/cancel")
def cancel_job(id: str, who=Depends(owner)):
    j = store.get(id, who)
    if not j or "job_id" not in j:
        raise HTTPException(404, "Job not found")

    def change(current):
        if current["status"] not in jobs.TERMINAL:
            current.update(cancel_requested=True, status="CANCELLED")

    j = store.mutate(id, change, who)
    return {"status": j["status"]}


@app.get("/api/stream/{id}")
async def stream(id: str, request: Request, who=Depends(owner)):
    if not store.get(id, who):
        raise HTTPException(404, "Job not found")
    try:
        since = max(
            0,
            int(
                request.headers.get(
                    "last-event-id", request.query_params.get("after", "0")
                )
            ),
        )
    except ValueError:
        raise HTTPException(422, "Invalid event cursor")

    async def events():
        nonlocal since
        for _ in range(30):
            if await request.is_disconnected():
                return
            j = store.get(id, who)
            for e in j.get("events", []):
                if e["id"] > since:
                    yield f"id: {e['id']}\ndata: {json.dumps(e)}\n\n"
                    since = e["id"]
            if j["status"] in jobs.TERMINAL:
                yield f"event: terminal\ndata: {json.dumps({'status':j['status']})}\n\n"
                return
            yield ": heartbeat\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )


@app.post("/api/update-calendar")
async def update_calendar(request: Request, who=Depends(owner)):
    data = await body(request)
    cal = data.get("calendar", data)
    try:
        validated = Calendar.model_validate(cal)
        return {"status": "ok", "calendar": validated.model_dump()}
    except Exception as e:
        raise HTTPException(400, f"Invalid calendar: {e}")


@app.post("/api/verify")
async def audit(request: Request, who=Depends(owner)):
    data = await body(request)
    a = verify(data.get("problem"), data.get("schedule"))
    if data.get("expected"):
        a["integrity_matches"] = all(
            a.get(k) == v
            for k, v in data["expected"].items()
            if k in ("problem_digest", "schedule_digest")
        )
    return a


@app.get("/api/running-class")
def running_class():
    """
    Computes present running teaching period on the backend matching Indian Standard Time (Asia/Kolkata).
    Calculates current academic semester week index for Nov 14 (Week 15).
    If within active Mon-Fri teaching hours, returns real-time active day and period index.
    If outside academic hours (weekend/evening), returns scheduled teaching session (Monday Period 0: 09:00 - 10:00)
    and current IST calendar metadata so the running class is consistently highlighted in light green shade.
    """
    import datetime
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo("Asia/Kolkata")
        now = datetime.datetime.now(tz)
    except Exception:
        now = datetime.datetime.now()

    weekday = now.weekday()  # 0=Monday ... 5=Saturday, 6=Sunday
    days_map = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_name = days_map[weekday]
    minutes_now = now.hour * 60 + now.minute

    # Calculate week index from term start (2026-08-03)
    term_start = datetime.date(2026, 8, 3)
    today_date = now.date()
    diff_days = (today_date - term_start).days
    week_idx = max(0, min(16, diff_days // 7))  # 14 for 2026-11-14 (Week 15)
    # When today is weekend (Saturday/Sunday), teaching dates for the week have completed;
    # active forward planning moves to the upcoming week (Week 16: 16-20 Nov)
    planning_week_idx = min(16, week_idx + 1) if weekday >= 5 else week_idx

    periods = [
        (0, 540, 600),   # 09:00 - 10:00
        (1, 600, 660),   # 10:00 - 11:00
        (2, 660, 720),   # 11:00 - 12:00
        (3, 780, 840),   # 13:00 - 14:00
        (4, 840, 900),   # 14:00 - 15:00
        (5, 900, 960),   # 15:00 - 16:00
        (6, 960, 1020),  # 16:00 - 17:00
    ]

    current_period = None
    is_live_now = False
    if weekday < 5:  # Monday through Friday only
        for p_idx, start_m, end_m in periods:
            if start_m <= minutes_now < end_m:
                current_period = p_idx
                is_live_now = True
                break

    if weekday >= 5:
        status_message = f"Weekend / Holiday ({day_name}) — No classes in session"
    elif not is_live_now:
        if minutes_now < 540:
            status_message = "Early morning before teaching starts (09:00)"
        elif 720 <= minutes_now < 780:
            status_message = "Lunch break (12:00 – 13:00) — No classes in session"
        else:
            status_message = "Teaching concluded for the day"
    else:
        status_message = f"In Session: Period {current_period + 1} ({day_name})"

    return {
        "is_live_now": is_live_now,
        "timezone": "Asia/Kolkata (IST)",
        "today_date": now.strftime("%Y-%m-%d"),
        "today_time": now.strftime("%H:%M:%S"),
        "today_formatted": now.strftime("%a, %d %b %Y"),
        "day_name": day_name,
        "week_index": planning_week_idx,
        "week_number": planning_week_idx + 1,
        "calendar_week_index": week_idx,
        "calendar_week_number": week_idx + 1,
        "day": weekday if is_live_now else None,
        "period": current_period if is_live_now else None,
        "status_message": status_message,
        "source": "backend_realtime_clock" if is_live_now else "backend_idle",
    }


@app.get("/api/export/{id}/{kind}")
def download(id: str, kind: str, who=Depends(owner)):
    j = store.get(id, who)
    if not j or not j.get("result", {}).get("assignments"):
        raise HTTPException(404, "Verified schedule not found")
    r = j["result"]
    a = verify(j["problem"], r["assignments"])
    if a["status"] != "PASS":
        raise HTTPException(409, "Schedule no longer passes independent audit")
    try:
        content, mime = export(j["problem"], {**r, "audit": a}, kind)
    except ValueError:
        raise HTTPException(404, "Unknown export type")
    return Response(
        content,
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="TimetableGenie.{kind}"'
        },
    )


static = Path(
    os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "dist-local")
)
if static.is_dir():
    app.mount("/", StaticFiles(directory=static, html=True), name="frontend")


def documented_openapi():
    from fastapi.openapi.utils import get_openapi

    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    problem = Problem.model_json_schema(ref_template="#/components/schemas/{model}")
    components.update(problem.pop("$defs", {}))
    components["Problem"] = problem
    direct = {
        "type": "object",
        "properties": {
            "problem": {"$ref": "#/components/schemas/Problem"},
            "time_limit": {
                "type": "number",
                "minimum": 0.05,
                "maximum": 120,
                "default": 3,
            },
            "seed": {"type": "integer", "default": 42},
        },
        "required": ["problem"],
    }
    for route in ("/api/solve/nep-direct", "/api/problems", "/api/validate"):
        schema["paths"][route]["post"]["requestBody"] = {
            "required": True,
            "content": {"application/json": {"schema": direct}},
        }
    app.openapi_schema = schema
    return schema


app.openapi = documented_openapi
