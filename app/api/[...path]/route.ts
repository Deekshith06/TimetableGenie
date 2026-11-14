import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  ProblemSchema,
  AssignmentSchema,
  type Problem,
  type SolverResult,
} from "@/lib/domain";
import { canonical, verify } from "@/lib/verifier";
import { adaptTransit } from "@/lib/transit";
import { csv, xlsx, pdf, ics } from "@/lib/exports";
import { z } from "zod";

export const dynamic = "force-dynamic";
const terminal = new Set([
  "FEASIBLE",
  "OPTIMAL",
  "INFEASIBLE",
  "UNKNOWN",
  "MODEL_INVALID",
  "CANCELLED",
  "FAILED",
  "AUDIT_FAILED",
  "INTERRUPTED",
]);
type Row = {
  id: string;
  owner: string;
  problem: string;
  baseline: string | null;
  status: string;
  result: string | null;
  created: number;
  updated: number;
  budget: number;
};
type Context = { params: Promise<{ path: string[] }> };
const response = (data: unknown, status = 200) =>
  Response.json(data, { status });
const ResultInput = z.object({
  status: z.enum([
    "FEASIBLE",
    "OPTIMAL",
    "INFEASIBLE",
    "UNKNOWN",
    "MODEL_INVALID",
    "CANCELLED",
    "FAILED",
  ]),
  assignments: z.array(AssignmentSchema).max(250),
  elapsed_ms: z.number().nonnegative().max(1000000),
  branches: z.number().int().nonnegative().max(1e10),
  objective: z.number().finite().nullable(),
  optimal: z.boolean(),
  diagnostics: z.array(z.string().max(2000)).max(20),
});
async function handle(request: Request, context: Context) {
  try {
    const { path } = await context.params;
    const method = request.method;
    const route = path.join("/");
    if (route === "health")
      return response({ status: "ok", mode: "browser", schema_version: "1.0" });
    const user = await getChatGPTUser();
    if (!user)
      return response(
        {
          detail:
            "Sign in to save and verify in your private workspace. Preview-only results can be checked on this device.",
        },
        401,
      );
    if (!env.DB)
      return response({ detail: "Database binding is unavailable" }, 503);
    const db = env.DB;
    const owner = user.userId;
    if (method !== "GET") {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        return response({ detail: "Cross-origin mutation rejected" }, 403);
    }
    let data: Record<string, unknown> = {};
    if (method !== "GET") {
      const raw = await request.text();
      if (raw.length > 2000000)
        return response({ detail: "Upload exceeds 2 MB" }, 413);
      try {
        data = JSON.parse(raw);
      } catch {
        return response({ detail: "Invalid JSON" }, 422);
      }
      if (!data || typeof data !== "object" || Array.isArray(data))
        return response({ detail: "Expected a JSON object" }, 422);
    }
    const job = async (id: string) =>
      db
        .prepare("SELECT * FROM jobs WHERE id=? AND owner=?")
        .bind(id, owner)
        .first<Row>();
    const addEvent = async (id: string, event: unknown) =>
      db
        .prepare(
          "INSERT INTO job_events(job_id,owner,payload,created) VALUES(?,?,?,?)",
        )
        .bind(id, owner, JSON.stringify(event), Date.now())
        .run();
    if (route === "bootstrap" && method === "GET") {
      await db
        .prepare(
          "UPDATE jobs SET status='INTERRUPTED',updated=? WHERE owner=? AND status='RUNNING' AND updated<?",
        )
        .bind(Date.now(), owner, Date.now() - 60000)
        .run();
      const ps = await db
        .prepare(
          "SELECT id,payload,created FROM problems WHERE owner=? ORDER BY created DESC LIMIT 30",
        )
        .bind(owner)
        .all<{ id: string; payload: string; created: number }>();
      const js = await db
        .prepare(
          "SELECT id,status,result,created FROM jobs WHERE owner=? ORDER BY created DESC LIMIT 30",
        )
        .bind(owner)
        .all<{
          id: string;
          status: string;
          result: string | null;
          created: number;
        }>();
      return response({
        mode: "browser",
        user: { name: user.displayName },
        problems: ps.results.map((p) => ({
          id: p.id,
          problem: JSON.parse(p.payload),
          created: p.created,
        })),
        jobs: js.results.map((j) => ({
          job_id: j.id,
          status: j.status,
          result: j.result ? JSON.parse(j.result) : null,
          created: j.created,
        })),
      });
    }
    if (route === "validate" && method === "POST")
      return response({
        valid: true,
        problem: ProblemSchema.parse(data.problem),
      });
    if (route === "problems" && method === "POST") {
      const p = ProblemSchema.parse(data.problem),
        id = crypto.randomUUID(),
        created = Date.now();
      await db
        .prepare(
          "INSERT INTO problems(id,owner,payload,created) VALUES(?,?,?,?)",
        )
        .bind(id, owner, JSON.stringify(p), created)
        .run();
      return response({ id, problem: p, created }, 201);
    }
    if (path[0] === "problems" && path.length === 2 && method === "GET") {
      const row = await db
        .prepare(
          "SELECT id,payload,created FROM problems WHERE id=? AND owner=?",
        )
        .bind(path[1], owner)
        .first<{ id: string; payload: string; created: number }>();
      return row
        ? response({
            id: row.id,
            problem: JSON.parse(row.payload),
            created: row.created,
          })
        : response({ detail: "Problem not found" }, 404);
    }
    if (path[0] === "solve" && method === "POST") {
      if (
        !["nep-direct", "transit-proxy", "disruption-repair"].includes(path[1])
      )
        return response({ detail: "Unknown solver endpoint" }, 404);
      const p =
        path[1] === "transit-proxy"
          ? adaptTransit(data.transit).problem
          : ProblemSchema.parse(data.problem);
      let baseline = null;
      if (path[1] === "disruption-repair") {
        const original = ProblemSchema.parse(data.original_problem);
        baseline = z.array(AssignmentSchema).parse(data.baseline);
        if ((await verify(original, baseline)).status !== "PASS")
          return response(
            {
              detail:
                "Baseline fails independent audit against original problem",
            },
            422,
          );
        if (canonical(original.calendar) !== canonical(p.calendar))
          return response(
            {
              detail:
                "Calendar changes require a fresh solve; repair preserves the weekly time reference",
            },
            422,
          );
        if (
          original.events
            .map((e) => e.id)
            .sort()
            .join("/") !==
          p.events
            .map((e) => e.id)
            .sort()
            .join("/")
        )
          return response(
            {
              detail:
                "Repair must preserve event identifiers; use a new solve for structural changes",
            },
            422,
          );
      }
      const seconds = z
          .number()
          .min(0.05)
          .max(10)
          .parse(data.time_limit ?? 3),
        id = crypto.randomUUID(),
        now = Date.now();
      await db
        .prepare(
          "INSERT INTO jobs(id,owner,problem,baseline,status,result,created,updated,budget) VALUES(?,?,?,?,?,NULL,?,?,?)",
        )
        .bind(
          id,
          owner,
          JSON.stringify(p),
          baseline ? JSON.stringify(baseline) : null,
          "RUNNING",
          now,
          now,
          Math.round(seconds * 1000),
        )
        .run();
      await addEvent(id, {
        type: "started",
        message:
          "Browser worker job created; schedule is independently checked before acceptance",
      });
      return response(
        { job_id: id, problem: p, mode: "browser", status: "RUNNING" },
        202,
      );
    }
    if (path[0] === "jobs" && path.length >= 2) {
      const j = await job(path[1]);
      if (!j) return response({ detail: "Job not found" }, 404);
      if (path.length === 2 && method === "GET") {
        const events = await db
          .prepare(
            "SELECT id,payload,created FROM job_events WHERE job_id=? AND owner=? ORDER BY id DESC LIMIT 200",
          )
          .bind(j.id, owner)
          .all<{ id: number; payload: string; created: number }>();
        return response({
          job_id: j.id,
          status: j.status,
          problem: JSON.parse(j.problem),
          result: j.result ? JSON.parse(j.result) : null,
          created: j.created,
          events: events.results.reverse().map((e) => ({
            id: e.id,
            at: e.created,
            ...JSON.parse(e.payload),
          })),
        });
      }
      if (path[2] === "cancel" && method === "POST") {
        if (!terminal.has(j.status)) {
          await db
            .prepare(
              "UPDATE jobs SET status='CANCELLED',updated=? WHERE id=? AND owner=? AND status='RUNNING'",
            )
            .bind(Date.now(), j.id, owner)
            .run();
          await addEvent(j.id, {
            type: "cancelled",
            message: "Browser worker cancelled",
          });
        }
        return response({ status: (await job(j.id))!.status });
      }
      if (path[2] === "progress" && method === "POST") {
        if (j.status !== "RUNNING")
          return response({ detail: "Job is already terminal" }, 409);
        const event = z
          .object({
            type: z.enum(["search", "incumbent"]),
            branches: z.number().int().nonnegative(),
            elapsed_ms: z.number().nonnegative(),
            objective: z.number().nullable().optional(),
            incumbent: z.number().nullable().optional(),
            changed: z.number().int().optional(),
          })
          .parse(data);
        await addEvent(j.id, event);
        await db
          .prepare(
            "UPDATE jobs SET updated=? WHERE id=? AND owner=? AND status='RUNNING'",
          )
          .bind(Date.now(), j.id, owner)
          .run();
        return response({ ok: true });
      }
      if (path[2] === "complete" && method === "POST") {
        if (j.status !== "RUNNING")
          return response({ detail: "Job is already terminal" }, 409);
        const input = ResultInput.parse(data.result);
        const p = ProblemSchema.parse(JSON.parse(j.problem));
        const r: SolverResult = {
          ...input,
          engine: "Browser finite-domain search 1.0",
          diagnostics: input.diagnostics,
        };
        if (r.assignments.length) {
          r.audit = await verify(p, r.assignments);
          if (r.audit.status !== "PASS") r.status = "AUDIT_FAILED";
          else if (!["FEASIBLE", "OPTIMAL"].includes(r.status))
            return response(
              { detail: "Inconsistent solver status and schedule" },
              422,
            );
        } else if (["FEASIBLE", "OPTIMAL"].includes(r.status))
          return response(
            { detail: "A successful result requires a complete schedule" },
            422,
          );
        if (j.baseline && r.assignments.length) {
          const old = JSON.parse(j.baseline) as SolverResult["assignments"];
          r.changed_count = r.assignments.filter(
            (a) =>
              !old.some(
                (b) =>
                  a.event_id === b.event_id &&
                  a.room_id === b.room_id &&
                  a.faculty_id === b.faculty_id &&
                  a.day === b.day &&
                  a.period === b.period,
              ),
          ).length;
          r.unchanged_percent =
            (100 * (r.assignments.length - r.changed_count)) /
            r.assignments.length;
        }
        const updated = await db
          .prepare(
            "UPDATE jobs SET result=?,status=?,updated=? WHERE id=? AND owner=? AND status='RUNNING'",
          )
          .bind(JSON.stringify(r), r.status, Date.now(), j.id, owner)
          .run();
        if (!updated.meta.changes)
          return response(
            { detail: "Job was cancelled during verification" },
            409,
          );
        await addEvent(j.id, {
          type: "completed",
          status: r.status,
          message: r.audit
            ? `Independent server audit: ${r.audit.status}`
            : r.diagnostics.join("; "),
        });
        return response({ ...r, id: j.id, saved: true });
      }
    }
    if (route === "verify" && method === "POST") {
      const audit = await verify(data.problem, data.schedule);
      if (data.expected && typeof data.expected === "object") {
        const expected = data.expected as Record<string, unknown>;
        return response({
          ...audit,
          integrity_matches: ["problem_digest", "schedule_digest"]
            .filter((k) => k in expected)
            .every(
              (k) =>
                audit[k as "problem_digest" | "schedule_digest"] ===
                expected[k],
            ),
        });
      }
      return response(audit);
    }
    if (path[0] === "stream" && path.length === 2 && method === "GET") {
      const j = await job(path[1]);
      if (!j) return response({ detail: "Job not found" }, 404);
      let since = Number(
        request.headers.get("last-event-id") ||
          new URL(request.url).searchParams.get("after") ||
          0,
      );
      if (!Number.isSafeInteger(since) || since < 0)
        return response({ detail: "Invalid event cursor" }, 422);
      const encoder = new TextEncoder();
      let closed = false;
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for (let n = 0; n < 25 && !closed; n++) {
              if (request.signal.aborted) break;
              const rows = await db
                .prepare(
                  "SELECT id,payload FROM job_events WHERE job_id=? AND owner=? AND id>? ORDER BY id LIMIT 200",
                )
                .bind(j.id, owner, since)
                .all<{ id: number; payload: string }>();
              for (const e of rows.results) {
                controller.enqueue(
                  encoder.encode(`id: ${e.id}\ndata: ${e.payload}\n\n`),
                );
                since = e.id;
              }
              const latest = await job(j.id);
              if (!latest || terminal.has(latest.status)) {
                controller.enqueue(
                  encoder.encode(
                    `event: terminal\ndata: ${JSON.stringify({ status: latest?.status })}\n\n`,
                  ),
                );
                break;
              }
              controller.enqueue(encoder.encode(": heartbeat\n\n"));
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            if (!closed) controller.close();
          } catch {
            if (!closed) controller.close();
          }
        },
        cancel() {
          closed = true;
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }
    if (path[0] === "export" && path.length === 3 && method === "GET") {
      const j = await job(path[1]);
      if (!j?.result) return response({ detail: "Schedule not found" }, 404);
      const r = JSON.parse(j.result) as SolverResult,
        p = JSON.parse(j.problem) as Problem;
      if (!r.assignments.length)
        return response({ detail: "No schedule to export" }, 409);
      const a = await verify(p, r.assignments);
      if (a.status !== "PASS")
        return response({ detail: "Schedule fails independent audit" }, 409);
      r.audit = a;
      const kind = path[2];
      let content: string | Uint8Array, mime: string;
      if (kind === "json") {
        content = JSON.stringify({ problem: p, result: r, audit: a }, null, 2);
        mime = "application/json";
      } else if (kind === "csv") {
        content = csv(p, r.assignments);
        mime = "text/csv;charset=utf-8";
      } else if (kind === "xlsx") {
        content = xlsx(p, r.assignments, a);
        mime =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else if (kind === "pdf") {
        content = pdf(p, r.assignments, a);
        mime = "application/pdf";
      } else if (kind === "ics") {
        content = ics(p, r.assignments);
        mime = "text/calendar;charset=utf-8";
      } else return response({ detail: "Unknown export format" }, 404);
      return new Response(content as BodyInit, {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="TimetableGenie.${kind}"`,
        },
      });
    }
    return response({ detail: "Endpoint not found" }, 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return response(
        {
          detail: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        422,
      );
    return response(
      { detail: error instanceof Error ? error.message : "Request failed" },
      400,
    );
  }
}
export const GET = handle;
export const POST = handle;
