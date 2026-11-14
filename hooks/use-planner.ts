"use client";
import { useState, useEffect, useRef } from "react";
import fixture from "@/datasets/nep2020_synthetic_data.json";
import example from "@/datasets/demo_schedule.json";
import {
  ProblemSchema,
  type Problem,
  type SolverResult,
  type Assignment,
} from "@/lib/domain";
import { canonical, verify } from "@/lib/verifier";
export type Log = {
  type: string;
  message?: string;
  branches?: number;
  elapsed_ms?: number;
  objective?: number | null;
  incumbent?: number | null;
  status?: string;
  at?: number;
};
export type History = {
  job_id: string;
  status: string;
  created: number;
  result?: SolverResult;
};
export const initialProblem = ProblemSchema.parse(fixture);
const initialResult = example as unknown as SolverResult;
export async function api<T = unknown>(
  path: string,
  data?: unknown,
): Promise<T> {
  const r = await fetch("/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = (await r.json()) as unknown;
  if (!r.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? (body as { detail: unknown }).detail
        : body;
    throw new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail),
    );
  }
  return body as T;
}
const pause = (n: number) => new Promise((resolve) => setTimeout(resolve, n));
export function usePlanner() {
  const [problem, setProblem] = useState<Problem>(initialProblem),
    [accepted, setAccepted] = useState<{
      problem: Problem;
      result: SolverResult;
    }>({ problem: initialProblem, result: initialResult }),
    [busy, setBusy] = useState(false),
    [logs, setLogs] = useState<Log[]>([]),
    [lastResult, setLastResult] = useState<SolverResult | null>(null),
    [history, setHistory] = useState<History[]>([]),
    [savedProblems, setSavedProblems] = useState<
      { id: string; problem: Problem }[]
    >([]),
    [authenticated, setAuthenticated] = useState(false),
    [mode, setMode] = useState("browser"),
    [name, setName] = useState("Academic planner"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [budget, setBudget] = useState(3),
    [jobId, setJobId] = useState("");
  const worker = useRef<Worker | null>(null),
    active = useRef(0),
    job = useRef(""),
    eventStream = useRef<EventSource | null>(null);
  const dirty = canonical(problem) !== canonical(accepted.problem);
  async function refresh() {
    try {
      const d = await api<{
        mode: string;
        user: { name: string };
        jobs: History[];
        problems: { id: string; problem: Problem }[];
      }>("bootstrap");
      setAuthenticated(true);
      setMode(d.mode);
      setName(d.user.name);
      setHistory(d.jobs);
      setSavedProblems(d.problems);
    } catch {
      setAuthenticated(false);
    }
  }
  useEffect(() => {
    refresh();
    verify(initialProblem, initialResult.assignments)
      .then((a) =>
        setAccepted({
          problem: initialProblem,
          result: { ...initialResult, audit: a },
        }),
      )
      .catch((e) => {
        setAccepted({
          problem: initialProblem,
          result: { ...initialResult, audit: undefined },
        });
        setError("Independent audit could not complete: " + String(e));
      });
    return () => {
      worker.current?.terminate();
      eventStream.current?.close();
    };
  }, []);
  function log(e: Log) {
    setLogs((l) => [...l.slice(-119), { ...e, at: Date.now() }]);
  }
  async function run(
    input: Problem = problem,
    repair?: { original: Problem; baseline: Assignment[] },
  ) {
    if (busy) return;
    const token = ++active.current;
    setError("");
    setNotice("");
    setBusy(true);
    setLogs([]);
    setLastResult(null);
    job.current = "";
    setJobId("");
    let p: Problem;
    try {
      p = ProblemSchema.parse(input);
    } catch (e) {
      setBusy(false);
      setError(String(e));
      return;
    }
    log({
      type: "validation",
      message: `Validated ${p.events.length} meetings, ${p.rooms.length} rooms and actual pathway selections`,
    });
    let id = "";
    let engine = mode;
    try {
      if (authenticated) {
        const d = await api<{ job_id: string; mode: string }>(
          "solve/" + (repair ? "disruption-repair" : "nep-direct"),
          {
            problem: p,
            time_limit: budget,
            seed: 42,
            ...(repair
              ? { original_problem: repair.original, baseline: repair.baseline }
              : {}),
          },
        );
        id = d.job_id;
        engine = d.mode;
        job.current = id;
        setJobId(id);
        if (active.current !== token) {
          await api(`jobs/${id}/cancel`, {});
          return;
        }
      }
      async function finish(r: SolverResult) {
        if (active.current !== token) return;
        if (r.assignments.length) {
          log({
            type: "audit",
            message:
              "Reconstructing occupancy independently and checking every enabled rule",
          });
          r.audit = await verify(p, r.assignments);
          if (r.audit.status !== "PASS") r.status = "AUDIT_FAILED";
        }
        if (id && engine === "browser") {
          try {
            r = await api<SolverResult>(`jobs/${id}/complete`, { result: r });
          } catch (e) {
            r.saved = false;
            setNotice(
              "Schedule computed and checked on this device. Saving failed: " +
                String(e),
            );
          }
        }
        if (id && engine === "cpsat") r = { ...r, id, saved: true };
        if (active.current !== token) return;
        setLastResult(r);
        setBusy(false);
        eventStream.current?.close();
        worker.current?.terminate();
        worker.current = null;
        if (
          ["FEASIBLE", "OPTIMAL"].includes(r.status) &&
          r.audit?.status === "PASS"
        ) {
          setAccepted({ problem: p, result: r });
          setProblem(p);
          setNotice(
            r.changed_count !== undefined
              ? `Repair verified: ${r.changed_count} meetings changed; ${r.unchanged_percent?.toFixed(1)}% unchanged.`
              : `${r.assignments.length} meetings scheduled. Independent audit passed. ${r.optimal ? "Search proved the optimum." : "Optimality has not been proved."}`,
          );
        } else
          setError(
            r.diagnostics.join(" ") ||
              `Job ended with ${r.status}. The previous accepted schedule is preserved.`,
          );
        log({
          type: "completed",
          status: r.status,
          message: r.audit
            ? `Audit ${r.audit.status}: ${r.audit.total_violations} violations`
            : r.diagnostics.join(" ") || r.status,
        });
        if (authenticated) refresh();
      }
      if (engine === "cpsat" && id) {
        log({
          type: "started",
          message: "Queued for the local OR-Tools CP-SAT worker",
        });
        const received = new Set<number>();
        const source = new EventSource(`/api/stream/${id}`);
        eventStream.current = source;
        source.onmessage = (event) => {
          try {
            const item = JSON.parse(event.data) as Log & { id?: number };
            const n = Number(event.lastEventId || item.id);
            if (!received.has(n)) {
              received.add(n);
              log(item);
            }
          } catch {
            log({
              type: "stream_error",
              message:
                "A malformed live event was ignored; polling the authoritative job record.",
            });
          }
        };
        source.addEventListener("terminal", () => source.close());
        const until = Date.now() + budget * 1000 + 90000;
        while (active.current === token) {
          const d = await api<{
            events: (Log & { id: number })[];
            result?: SolverResult;
            status: string;
            error?: string;
          }>(`jobs/${id}`);
          for (const e of d.events || [])
            if (!received.has(e.id)) {
              received.add(e.id);
              log(e);
            }
          if (d.result) {
            await finish(d.result);
            return;
          }
          if (["FAILED", "CANCELLED", "INTERRUPTED"].includes(d.status)) {
            await finish({
              status: d.status,
              assignments: [],
              engine: "OR-Tools CP-SAT",
              elapsed_ms: 0,
              branches: 0,
              objective: null,
              optimal: false,
              diagnostics: [d.error || d.status],
            });
            return;
          }
          if (Date.now() > until)
            throw new Error(
              "Connection deadline reached. Check the saved job before starting another run.",
            );
          await pause(500);
        }
        return;
      }
      log({
        type: "started",
        message: "Bounded finite-domain search in an isolated browser worker",
      });
      const w = new Worker("/solver-worker.js", { type: "module" });
      worker.current = w;
      let writes = Promise.resolve();
      const watchdog = setTimeout(
        () => {
          if (active.current === token && worker.current === w) {
            w.terminate();
            finish({
              status: "UNKNOWN",
              assignments: [],
              engine: "Browser finite-domain search 1.0",
              elapsed_ms: budget * 1000 + 5000,
              branches: 0,
              objective: null,
              optimal: false,
              diagnostics: [
                "The worker exceeded its preprocessing/search deadline; infeasibility has not been established.",
              ],
            });
          }
        },
        budget * 1000 + 5000,
      );
      w.onmessage = async ({ data }) => {
        if (active.current !== token) return;
        if (data.type === "progress") {
          log(data.data);
          if (id)
            writes = writes.then(() =>
              api(`jobs/${id}/progress`, data.data)
                .then(() => undefined)
                .catch(() => undefined),
            );
        } else if (data.type === "result") {
          clearTimeout(watchdog);
          await writes;
          await finish(data.result);
        }
      };
      w.onerror = (e) => {
        clearTimeout(watchdog);
        finish({
          status: "FAILED",
          assignments: [],
          engine: "Browser finite-domain search 1.0",
          elapsed_ms: 0,
          branches: 0,
          objective: null,
          optimal: false,
          diagnostics: [e.message || "Worker failed"],
        });
      };
      w.postMessage({
        problem: p,
        options: {
          budget_ms: budget * 1000,
          baseline: repair?.baseline || null,
          max_nodes: 150000,
        },
      });
    } catch (e) {
      if (active.current === token) {
        setBusy(false);
        eventStream.current?.close();
        setError(String(e));
        log({ type: "failed", message: String(e) });
      }
    }
  }
  async function cancel() {
    active.current++;
    eventStream.current?.close();
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    log({
      type: "cancelled",
      message: "Cancellation requested. Accepted timetable preserved.",
    });
    if (job.current)
      try {
        await api(`jobs/${job.current}/cancel`, {});
        refresh();
      } catch (e) {
        setError(
          "Worker stopped on this device; server cancellation could not be confirmed: " +
            String(e),
        );
      }
  }
  async function saveDraft() {
    try {
      ProblemSchema.parse(problem);
      if (!authenticated) {
        setNotice(
          "Draft is held on this device until you sign in. Download its JSON to retain a copy.",
        );
        return;
      }
      await api("problems", { problem });
      setNotice("A new problem revision was saved.");
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }
  async function restore(id: string) {
    try {
      const j = await api<{
        problem: Problem;
        result?: SolverResult;
        status: string;
        events: Log[];
      }>("jobs/" + id);
      if (j.result?.assignments?.length) {
        const a = await verify(j.problem, j.result.assignments);
        if (a.status !== "PASS")
          throw new Error("Stored schedule failed a fresh independent audit");
        setAccepted({
          problem: j.problem,
          result: { ...j.result, audit: a, id, saved: true },
        });
        setProblem(j.problem);
        setNotice("Saved timetable loaded and independently checked again.");
      } else {
        setLastResult(j.result || null);
        setLogs(j.events || []);
        setNotice("Job " + j.status + "; no accepted timetable was replaced.");
      }
    } catch (e) {
      setError(String(e));
    }
  }
  function loadExample() {
    setProblem(initialProblem);
    setAccepted({ problem: initialProblem, result: initialResult });
    setLastResult(null);
    setNotice(
      "Loaded the recorded CP-SAT example. It is synthetic and independently audited.",
    );
  }
  return {
    problem,
    setProblem,
    accepted,
    setAccepted,
    busy,
    logs,
    lastResult,
    history,
    savedProblems,
    authenticated,
    mode,
    name,
    notice,
    setNotice,
    error,
    setError,
    budget,
    setBudget,
    jobId,
    dirty,
    run,
    cancel,
    saveDraft,
    restore,
    loadExample,
    refresh,
  };
}
