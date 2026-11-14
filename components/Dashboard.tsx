"use client";
import { useState, useEffect, useRef } from "react";
import {
  CalendarDays,
  BookOpen,
  Users,
  Building2,
  Layers3,
  GraduationCap,
  ShieldCheck,
  Activity,
  FlaskConical,
  Settings2,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Upload,
  Download,
  Sparkles,
  Check,
  CheckCircle2,
  Clock3,
  Plus,
  Pencil,
  Menu,
  X,
  Info,
  LoaderCircle,
  RefreshCw,
  FileCheck2,
  ArrowUpRight,
  LockKeyhole,
  TriangleAlert,
  SlidersHorizontal,
  Square,
  Copy,
  GitCompareArrows,
  Waypoints,
  FileJson,
  LogIn,
  MapPin,
} from "lucide-react";
import Timetable from "./Timetable";
import PlanningSketch from "./PlanningSketch";
import Modal from "./Modal";
import EntityEditor, { type EntityKey } from "./EntityEditor";
import Research from "./Research";
import { usePlanner, api, initialProblem } from "@/hooks/use-planner";
import {
  ProblemSchema,
  type Problem,
  type Assignment,
  type Audit,
  type SolverResult,
  minutes,
} from "@/lib/domain";
import { verify, metrics, canonical, digest } from "@/lib/verifier";
import { csv, xlsx, pdf, ics } from "@/lib/exports";
import { adaptTransit } from "@/lib/transit";
import transitFixture from "@/datasets/transit_proxy_corpus.json";

const navigation = [
  {
    section: "WORKSPACE",
    items: [
      { id: "timetable", label: "Timetable", icon: CalendarDays },
      { id: "courses", label: "Courses & sections", icon: BookOpen },
      { id: "faculty", label: "Faculty", icon: Users },
      { id: "rooms", label: "Rooms & labs", icon: Building2 },
      { id: "groups", label: "Student pathways", icon: GraduationCap },
      { id: "baskets", label: "Elective baskets", icon: Layers3 },
    ],
  },
  {
    section: "INSIGHTS",
    items: [
      { id: "audit", label: "Constraint audit", icon: ShieldCheck },
      { id: "activity", label: "Solver activity", icon: Activity },
      { id: "research", label: "Research & evidence", icon: FlaskConical },
    ],
  },
];
const entityTitles: Record<EntityKey, string> = {
  courses: "Courses & sections",
  faculty: "Faculty",
  rooms: "Rooms & labs",
  groups: "Student pathways",
  events: "Session requirements",
  baskets: "Elective baskets",
};
type ImportPreview = {
  problem: Problem;
  mapping?: { source: string; target: string; count: number }[];
  bundle?: { result: SolverResult; audit?: Audit };
};
export default function Dashboard() {
  const planner = usePlanner();
  const {
    problem,
    accepted,
    busy,
    dirty,
    logs,
    lastResult,
    history,
    authenticated,
    mode,
    name,
    notice,
    error,
    budget,
    jobId,
  } = planner;
  const [page, setPage] = useState("timetable"),
    [sidebar, setSidebar] = useState(false),
    [modal, setModal] = useState<string | null>(null),
    [editor, setEditor] = useState<{
      kind: EntityKey;
      index: number | null;
    } | null>(null),
    [query, setQuery] = useState(""),
    [entityQuery, setEntityQuery] = useState(""),
    [event, setEvent] = useState<Assignment | null>(null),
    [importText, setImportText] = useState(""),
    [importPreview, setImportPreview] = useState<ImportPreview | null>(null),
    [importError, setImportError] = useState(""),
    [checking, setChecking] = useState(false),
    [negativeAudit, setNegativeAudit] = useState<Audit | null>(null),
    [move, setMove] = useState<Assignment | null>(null),
    [repairType, setRepairType] = useState("room"),
    [repairTarget, setRepairTarget] = useState(""),
    [repairDay, setRepairDay] = useState(0),
    [repairPeriod, setRepairPeriod] = useState(0),
    [beforeRepair, setBeforeRepair] = useState<Assignment[] | null>(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const p = accepted.problem,
    r = accepted.result,
    stats = metrics(p, r.assignments),
    audit = r.audit;
  const go = (id: string) => {
    setPage(id);
    setSidebar(false);
    setEntityQuery("");
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal("search");
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const title =
    page === "settings"
      ? "Workspace settings"
      : navigation.flatMap((n) => n.items).find((i) => i.id === page)?.label ||
        "Session requirements";
  function showImport(text = "") {
    setImportText(text);
    setImportPreview(null);
    setImportError("");
    setModal("import");
  }
  function previewImport(text = importText) {
    try {
      const raw = JSON.parse(text);
      if (raw.service_blocks) {
        const x = adaptTransit(raw);
        setImportPreview(x);
      } else {
        const parsed = ProblemSchema.parse(raw.problem || raw);
        setImportPreview({
          problem: parsed,
          ...(raw.result?.assignments
            ? {
                bundle: {
                  result: raw.result,
                  audit: raw.audit || raw.result.audit,
                },
              }
            : {}),
        });
      }
      setImportError("");
    } catch (e) {
      setImportPreview(null);
      setImportError(String(e));
    }
  }
  async function applyImport() {
    if (!importPreview) return;
    try {
      if (importPreview.bundle) {
        const b = importPreview.bundle;
        const a = await verify(importPreview.problem, b.result.assignments);
        if (a.status !== "PASS")
          throw new Error(
            `Imported schedule has ${a.total_violations} violations: ${a.violations[0]?.message}`,
          );
        if (
          b.audit &&
          (b.audit.problem_digest !== a.problem_digest ||
            b.audit.schedule_digest !== a.schedule_digest)
        )
          throw new Error(
            "The bundle digests do not match its problem and schedule. Integrity check failed.",
          );
        planner.setAccepted({
          problem: importPreview.problem,
          result: {
            ...b.result,
            status: "FEASIBLE",
            engine: "Imported independently audited schedule",
            optimal: false,
            audit: a,
            id: undefined,
            saved: false,
          },
        });
        planner.setNotice(
          "Imported schedule independently audited; no optimality or authenticated-issuer claim was accepted.",
        );
      } else
        planner.setNotice(
          "Dataset imported as a draft. Generate a timetable to apply it.",
        );
      planner.setProblem(importPreview.problem);
      setModal(null);
      go("timetable");
    } catch (e) {
      setImportError(String(e));
    }
  }
  async function download(kind: string) {
    try {
      const a = await verify(p, r.assignments);
      if (a.status !== "PASS")
        throw new Error("Export refused: independent audit failed");
      let content: string | Uint8Array, mime: string;
      if (kind === "json") {
        content = JSON.stringify(
          { problem: p, result: { ...r, audit: a }, audit: a },
          null,
          2,
        );
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
      } else {
        content = ics(p, r.assignments);
        mime = "text/calendar;charset=utf-8";
      }
      const url = URL.createObjectURL(
        new Blob([content as BlobPart], { type: mime }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `TimetableGenie.${kind}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      planner.setNotice(
        `Exported ${kind.toUpperCase()} from a freshly audited schedule.`,
      );
      setModal(null);
    } catch (e) {
      planner.setError(String(e));
    }
  }
  function downloadDraft() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(problem, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "TimetableGenie_problem.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function recheck() {
    setChecking(true);
    try {
      const a = authenticated
        ? await api<Audit>("verify", { problem: p, schedule: r.assignments })
        : await verify(p, r.assignments);
      if (a.status !== "PASS")
        throw new Error(`${a.total_violations} violations found`);
      if (
        audit &&
        (audit.problem_digest !== a.problem_digest ||
          audit.schedule_digest !== a.schedule_digest)
      )
        throw new Error(
          "Stored integrity digests do not match the current data",
        );
      planner.setAccepted({ problem: p, result: { ...r, audit: a } });
      planner.setNotice(
        "Fresh independent audit passed. Problem and schedule digests match.",
      );
    } catch (e) {
      planner.setError(String(e));
    } finally {
      setChecking(false);
    }
  }
  async function handleReschedule(a: Assignment) {
    const nextAssignments = r.assignments.map((x) =>
      x.event_id === a.event_id ? a : x,
    );
    try {
      const auditResult = await verify(p, nextAssignments);
      if (auditResult.status === "PASS" && auditResult.total_violations === 0) {
        planner.setAccepted({
          problem: p,
          result: { ...r, assignments: nextAssignments, audit: auditResult },
        });
        planner.setNotice(
          `✓ Rescheduled ${a.event_id} to ${p.calendar.days[a.day]} (0 hard violations verified).`,
        );
      } else {
        const msg =
          auditResult.violations[0]?.message ||
          "Constraint violation detected in destination slot";
        planner.setError(`Move rejected: ${msg}`);
      }
    } catch (e) {
      planner.setError(String(e));
    }
  }
  async function handleUpdateCalendar(newCalendar: Problem["calendar"]) {
    const nextProblem: Problem = {
      ...p,
      calendar: newCalendar,
    };
    try {
      ProblemSchema.parse(nextProblem);
      const auditResult = await verify(nextProblem, r.assignments);
      planner.setProblem(nextProblem);
      planner.setAccepted({
        problem: nextProblem,
        result: { ...r, audit: auditResult },
      });
      planner.setNotice(
        `✓ Academic calendar & exam dates updated. Term: ${newCalendar.term_start} to ${newCalendar.term_end}. Audit: ${auditResult.status} (${auditResult.total_violations} violations).`,
      );
    } catch (e) {
      planner.setError(String(e));
    }
  }
  function startRepair(a?: Assignment) {
    const sample = a || r.assignments[0];
    if (!sample) return;
    setMove(a || null);
    setRepairTarget(sample.room_id);
    setRepairDay(sample.day);
    setRepairPeriod(sample.period);
    setRepairType("room");
    setModal("repair");
  }
  async function applyRepair() {
    const np = structuredClone(p);
    if (move) {
      np.policies.locked = np.policies.locked.filter(
        (a) => a.event_id !== move.event_id,
      );
      np.policies.locked.push(move);
    } else {
      const collection = repairType === "room" ? np.rooms : np.faculty;
      const target = collection.find((x) => x.id === repairTarget);
      if (!target) {
        planner.setError("Select a resource to close");
        return;
      }
      if (
        !target.unavailable.some(
          (s) => s.day === repairDay && s.period === repairPeriod,
        )
      )
        target.unavailable.push({ day: repairDay, period: repairPeriod });
    }
    try {
      ProblemSchema.parse(np);
      setBeforeRepair(r.assignments);
      planner.setProblem(np);
      setModal(null);
      go("timetable");
      await planner.run(np, { original: p, baseline: r.assignments });
    } catch (e) {
      planner.setError(String(e));
    }
  }
  function applyDraft(np: Problem) {
    planner.setProblem(np);
    setEditor(null);
    planner.setNotice(
      "Draft updated. The accepted timetable stays intact until a new solve passes its audit.",
    );
  }
  const changes =
    beforeRepair && r.changed_count !== undefined
      ? r.assignments.filter(
          (a) => !beforeRepair.some((b) => canonical(a) === canonical(b)),
        )
      : [];
  function renderAudit(full = false) {
    return (
      <>
        <div
          className={`audit-summary ${audit?.status === "PASS" ? "pass" : "fail"}`}
        >
          <div className="audit-medallion">
            <ShieldCheck size={full ? 32 : 25} />
          </div>
          <div>
            <h2>
              {audit?.status === "PASS"
                ? "Independent audit passed"
                : "No passing certificate"}
            </h2>
            <p>
              {audit
                ? `${audit.rules.filter((x) => x.status === "PASS").length} rules passed · ${audit.rules.filter((x) => x.status === "NOT_APPLICABLE").length} not applicable · ${audit.total_violations} violations`
                : "Generate and verify a schedule first."}
            </p>
          </div>
          <span className="status-pill">{audit?.status || "UNVERIFIED"}</span>
        </div>
        <div className="audit-rules">
          {audit?.rules.map((rule) => (
            <div key={rule.id}>
              <span
                className={`rule-icon ${rule.status === "NOT_APPLICABLE" ? "na" : rule.status === "PASS" ? "good" : "bad"}`}
              >
                {rule.status === "PASS" ? (
                  <Check size={14} />
                ) : rule.status === "NOT_APPLICABLE" ? (
                  <span>—</span>
                ) : (
                  <X size={14} />
                )}
              </span>
              <b>{rule.id}</b>
              <span>{rule.label}</span>
              <small>
                {rule.status === "NOT_APPLICABLE"
                  ? "Not enabled"
                  : rule.status === "PASS"
                    ? "Passed"
                    : `${rule.violations} violations`}
              </small>
            </div>
          ))}
        </div>
        <div className="audit-scope">
          <Info size={16} />
          <p>
            This audit covers the declared constraints and supplied data. It is
            not regulatory certification, a software correctness proof, or a
            digital signature.
          </p>
        </div>
        {full && audit && (
          <>
            <div className="digest-block">
              <label>PROBLEM · SHA-256</label>
              <code>{audit.problem_digest}</code>
              <label>SCHEDULE · SHA-256</label>
              <code>{audit.schedule_digest}</code>
              <small>
                {audit.checker_version} · {audit.signature_status}
              </small>
            </div>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={async () => {
                  const bad = r.assignments.map((a) => ({ ...a }));
                  if (bad.length > 1) bad[1].event_id = bad[0].event_id;
                  setNegativeAudit(await verify(p, bad));
                }}
              >
                Test a broken schedule
              </button>
              <div className="spacer" />
              <button
                className="button secondary"
                onClick={() => download("json")}
              >
                <Download size={14} />
                Audit bundle
              </button>
              <button
                className="button primary"
                onClick={recheck}
                disabled={checking}
              >
                {checking ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                Verify again
              </button>
            </div>
            {negativeAudit && (
              <div className="negative-result">
                <TriangleAlert size={18} />
                <div>
                  <b>Negative check rejected as expected</b>
                  <p>
                    Duplicate/missing event test:{" "}
                    {negativeAudit.total_violations} violations detected.
                    Accepted schedule was not changed.
                  </p>
                  <small>
                    {negativeAudit.violations
                      .slice(0, 3)
                      .map((v) => v.rule + ": " + v.message)
                      .join(" · ")}
                  </small>
                </div>
              </div>
            )}
          </>
        )}
      </>
    );
  }
  return (
    <div className="app-shell">
      {sidebar && (
        <div className="sidebar-scrim" onClick={() => setSidebar(false)} />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("timetable");
          }}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
            <Check size={14} />
          </span>
          <span>
            Timetable<span className="brand-light">Genie</span>
            <small>ACADEMIC PLANNING</small>
          </span>
        </a>
        <button
          className="workspace-selector"
          onClick={() => setModal("workspace")}
        >
          <span className="institute-icon">
            <GraduationCap size={19} />
          </span>
          <span>
            <b>Academic workspace</b>
            <small>Multidisciplinary programs</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <nav>
          {navigation.map((section) => (
            <div className="nav-section" key={section.section}>
              <p>{section.section}</p>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  className={page === item.id ? "active" : ""}
                >
                  <item.icon size={18} />
                  {item.label}
                  {item.id === "baskets" && (
                    <span className="nav-count">{problem.baskets.length}</span>
                  )}
                  {item.id === "audit" && audit?.status === "PASS" && (
                    <span className="nav-status" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">
              <Sparkles size={17} />
            </span>
            <b>A clearer week starts here</b>
            <p>Explore the verified example, then make it your own.</p>
            <button onClick={() => setModal("help")}>
              Quick walkthrough <ArrowUpRight size={13} />
            </button>
          </div>
          <button
            className={
              page === "settings" ? "settings-nav active" : "settings-nav"
            }
            onClick={() => go("settings")}
          >
            <Settings2 size={17} />
            Workspace settings
          </button>
          <div className="sidebar-private">
            <LockKeyhole size={12} />
            {authenticated
              ? "Private, saved workspace"
              : "Preview · device-only changes"}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <b>{title}</b>
          </div>
          <div className="topbar-right">
            <button
              className="global-search"
              onClick={() => setModal("search")}
            >
              <Search size={15} />
              <span>Search workspace</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <span className="term-tag">
              <CalendarDays size={14} />
              Nov 2026
            </span>
            <button
              className="avatar"
              aria-label="Workspace account"
              onClick={() => setModal("workspace")}
            >
              {name
                .split(/[ @]+/)
                .slice(0, 2)
                .map((s) => s[0])
                .join("")
                .toUpperCase() || "AP"}
            </button>
          </div>
        </header>
        <main className="main-content">
          {notice && (
            <div className="notice" role="status">
              <CheckCircle2 size={16} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss notice"
                onClick={() => planner.setNotice("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {error && (
            <div className="error-box top-error" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <button
                aria-label="Dismiss error"
                onClick={() => planner.setError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {page === "timetable" && (
            <>
              <div className="page-heading dimensional-heading">
                <PlanningSketch problem={p} assignments={r.assignments} />
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-dot" />
                    TIMETABLEGENIE / PLANNING WORKSPACE{" "}
                    <span className="heading-tag">
                      {p.provenance.kind.toUpperCase()} DATA
                    </span>
                  </div>
                  <h1>
                    A clear week.
                    <br />
                    Precisely planned<span>.</span>
                  </h1>
                  <p>
                    Every department, pathway and constraint. One considered
                    plan.
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button secondary"
                    onClick={() => showImport()}
                    disabled={busy}
                  >
                    <Upload size={15} />
                    Import data
                  </button>
                  {busy ? (
                    <button className="button primary" onClick={planner.cancel}>
                      <Square size={13} />
                      Cancel search
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      onClick={() => planner.run()}
                    >
                      <Sparkles size={16} />
                      Generate timetable
                    </button>
                  )}
                </div>
              </div>
              <div className="planning-titleblock">
                <div>
                  <span>PLANNING RECORD</span>
                  <b>{p.id}</b>
                </div>
                <div>
                  <span>TERM</span>
                  <b>
                    {p.calendar.term_start} — {p.calendar.term_end}
                  </b>
                </div>
                <div>
                  <span>RESOURCES</span>
                  <b>
                    {p.rooms.length} rooms / {p.faculty.length} faculty
                  </b>
                </div>
                <div>
                  <span>PATHWAYS</span>
                  <b>{p.groups.length} selected groups</b>
                </div>
                <div>
                  <span>CHECK STATUS</span>
                  <b>
                    {audit?.status === "PASS"
                      ? "Independently audited"
                      : "Unverified"}
                  </b>
                </div>
              </div>
              {dirty && (
                <div className="draft-banner">
                  <Pencil size={15} />
                  <span>
                    You have draft changes. The timetable below is the last
                    accepted revision.
                  </span>
                  <button onClick={() => planner.run()} disabled={busy}>
                    Generate draft <ArrowRight size={13} />
                  </button>
                </div>
              )}
              <div className="stats-grid">
                <Stat
                  icon={CalendarDays}
                  tone="purple"
                  label="Meetings scheduled"
                  value={String(stats.meetings)}
                  detail={`of ${stats.required} required meetings`}
                  extra={`${stats.occupied} contact periods`}
                />
                <Stat
                  icon={ShieldCheck}
                  tone="green"
                  label="Hard violations"
                  value={audit ? String(audit.total_violations) : "—"}
                  detail={
                    audit?.status === "PASS"
                      ? "Independently checked"
                      : "Awaiting full audit"
                  }
                  extra={
                    audit?.status === "PASS" ? "Audit passed" : "Unverified"
                  }
                />
                <Stat
                  icon={Building2}
                  tone="blue"
                  label="Room utilization"
                  value={`${stats.roomUtil.toFixed(1)}%`}
                  detail="Booked / available room periods"
                  extra={`${p.rooms.length} rooms & labs`}
                />
                <Stat
                  icon={Layers3}
                  tone="amber"
                  label="Electives synchronized"
                  value={
                    stats.sync === null ? "—" : `${stats.sync.toFixed(0)}%`
                  }
                  detail={`${p.baskets.length} cross-department baskets`}
                  extra="Selected pathways respected"
                />
              </div>
              <div className="workspace-toolbar">
                <div>
                  <h2>Weekly timetable</h2>
                  <span className="outline-chip">
                    {p.provenance.kind === "adapted"
                      ? "Transit proxy"
                      : "Academic dataset"}
                  </span>
                  <span className="saved-label">
                    <span />
                    {r.saved
                      ? "Saved revision"
                      : "Verified example / device result"}
                  </span>
                </div>
                <div>
                  <button
                    className="text-button anatomy-button"
                    onClick={() => setModal("design")}
                  >
                    <SlidersHorizontal size={14} />
                    UI anatomy
                  </button>
                  <button
                    className="text-button"
                    onClick={() => startRepair()}
                    disabled={busy || !r.assignments.length}
                  >
                    <GitCompareArrows size={15} />
                    Simulate disruption
                  </button>
                  <button
                    className="button secondary compact"
                    onClick={() => setModal("export")}
                    disabled={!r.assignments.length}
                  >
                    <Download size={14} />
                    Export
                    <ChevronDown size={12} />
                  </button>
                </div>
              </div>
              <Timetable
                problem={p}
                assignments={r.assignments}
                onEvent={setEvent}
                onMove={(a) => handleReschedule(a)}
                onUpdateCalendar={(cal) => handleUpdateCalendar(cal)}
              />
              <div
                className={`verification-strip ${audit?.status === "PASS" ? "" : "unverified"}`}
              >
                <span className="strip-icon">
                  <ShieldCheck size={21} />
                </span>
                <div>
                  <b>
                    {audit?.status === "PASS"
                      ? "A clear timetable. Independently checked."
                      : "A timetable awaiting verification."}
                  </b>
                  <p>
                    {audit?.status === "PASS"
                      ? `${audit.rules.filter((x) => x.status === "PASS").length} enabled checks passed against the full schedule. No solver state was trusted.`
                      : "Only a complete passing audit can approve this schedule."}
                  </p>
                </div>
                <button onClick={() => setModal("audit")}>
                  View certificate <ArrowRight size={15} />
                </button>
              </div>
              <div className="bottom-grid">
                <section className="panel compact-panel">
                  <div className="panel-heading">
                    <span className="mini-icon">
                      <Activity size={17} />
                    </span>
                    <h3>
                      {busy ? "Search in progress" : "Latest solver result"}
                    </h3>
                    <button
                      onClick={() => go("activity")}
                      aria-label="View solver activity"
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="solver-summary">
                    <div>
                      <span className={`status-dot ${busy ? "pulsing" : ""}`} />
                      <b>{busy ? "Running" : lastResult?.status || r.status}</b>
                      <small>
                        {busy
                          ? mode === "cpsat"
                            ? "Local CP-SAT worker"
                            : "Browser finite-domain search"
                          : lastResult?.engine || r.engine}
                      </small>
                    </div>
                    <span className="solver-time">
                      {busy ? (
                        <LoaderCircle className="spin" size={20} />
                      ) : (
                        <>
                          {((lastResult || r).elapsed_ms / 1000).toFixed(2)}
                          <small>seconds</small>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="subtle">
                    {busy
                      ? `${logs.at(-1)?.branches?.toLocaleString() || "—"} observed search branches · ${budget}s search budget`
                      : r.optimal
                        ? "Search reported a proven optimum."
                        : `Feasible does not mean optimal. ${r.branches.toLocaleString()} observed branches.`}
                  </p>
                </section>
                <section className="panel compact-panel">
                  <div className="panel-heading">
                    <span className="mini-icon amber">
                      <Waypoints size={17} />
                    </span>
                    <h3>Built for different pathways</h3>
                    <button
                      onClick={() => go("groups")}
                      aria-label="View student pathways"
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="pathway-preview">
                    <span className="pathway-node cat-DSC">CS Major</span>
                    <span>+</span>
                    <span className="pathway-node cat-MIC">Finance Minor</span>
                    <span>+</span>
                    <span className="pathway-node cat-MDC">Psychology</span>
                  </div>
                  <p className="subtle">
                    Parallel electives are checked against each group's actual
                    selections.
                  </p>
                </section>
              </div>
              {changes.length > 0 && (
                <section className="panel repair-report">
                  <h3>
                    Repair comparison · {r.changed_count} meetings changed
                  </h3>
                  <p>
                    {r.unchanged_percent?.toFixed(1)}% unchanged.{" "}
                    {r.optimal
                      ? "Minimum disruption proved under the configured objective."
                      : "Minimum disruption has not been proved."}
                  </p>
                  {changes.map((a) => {
                    const old = beforeRepair!.find(
                      (b) => b.event_id === a.event_id,
                    )!;
                    return (
                      <div key={a.event_id}>
                        <b>
                          {p.events.find((e) => e.id === a.event_id)?.course_id}
                        </b>
                        <span>
                          {p.calendar.days[old.day]}{" "}
                          {minutes(p.calendar.periods[old.period].start)} ·{" "}
                          {old.room_id}
                        </span>
                        <ArrowRight size={14} />
                        <span>
                          {p.calendar.days[a.day]}{" "}
                          {minutes(p.calendar.periods[a.period].start)} ·{" "}
                          {a.room_id}
                        </span>
                      </div>
                    );
                  })}
                </section>
              )}
            </>
          )}
          {(
            ["courses", "faculty", "rooms", "groups", "events"] as string[]
          ).includes(page) &&
            (() => {
              const kind = page as EntityKey;
              const rows = problem[kind]
                .map((row, i) => ({
                  row: row as unknown as Record<string, unknown>,
                  i,
                }))
                .filter(({ row }) =>
                  JSON.stringify(row)
                    .toLowerCase()
                    .includes(entityQuery.toLowerCase()),
                );
              return (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        CONFIGURE YOUR INSTITUTION
                      </span>
                      <h1>{entityTitles[kind]}</h1>
                      <p>
                        Explicit data, configurable policies, and no hidden
                        scheduling assumptions.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => setEditor({ kind, index: null })}
                    >
                      <Plus size={16} />
                      Add{" "}
                      {kind === "groups"
                        ? "pathway"
                        : kind === "events"
                          ? "session"
                          : kind.replace(/s$/, "")}
                    </button>
                  </div>
                  <div className="section-actions">
                    <label className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Search records"
                        value={entityQuery}
                        onChange={(e) => setEntityQuery(e.target.value)}
                        placeholder={`Search ${entityTitles[kind].toLowerCase()}`}
                      />
                    </label>
                    <span className="subtle">
                      {problem[kind].length} records
                    </span>
                    <div className="spacer" />
                    {kind === "courses" && (
                      <button
                        className="button secondary"
                        onClick={() => go("events")}
                      >
                        <Clock3 size={14} />
                        Manage session requirements
                      </button>
                    )}
                    <button
                      className="button secondary"
                      onClick={planner.saveDraft}
                    >
                      Save revision
                    </button>
                  </div>
                  <div className="panel table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Identifier / name</th>
                          <th>
                            {kind === "courses"
                              ? "Category / credits"
                              : kind === "faculty"
                                ? "Department / workload cap"
                                : kind === "rooms"
                                  ? "Type / capacity"
                                  : kind === "groups"
                                    ? "Program / students"
                                    : "Course / session"}
                          </th>
                          <th>
                            {kind === "courses"
                              ? "Required meetings"
                              : kind === "faculty"
                                ? "Qualified courses"
                                : kind === "rooms"
                                  ? "Equipment / building"
                                  : kind === "groups"
                                    ? "Major · minor · MDC"
                                    : "Selections / resources"}
                          </th>
                          <th>Configuration</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ row, i }) => (
                          <tr key={String(row.id)}>
                            <td>
                              <strong>
                                {String(row.title || row.name || row.id)}
                              </strong>
                              <small>{String(row.id)}</small>
                            </td>
                            <td>
                              {kind === "courses" ? (
                                <>
                                  <span
                                    className={`category cat-${row.category}`}
                                  >
                                    {String(row.category)}
                                  </span>
                                  <small>
                                    {String(row.credits)} academic credits
                                  </small>
                                </>
                              ) : kind === "faculty" ? (
                                <>
                                  {String(row.department)}
                                  <small>
                                    {Number(row.max_minutes) / 60} hours / week
                                  </small>
                                </>
                              ) : kind === "rooms" ? (
                                <>
                                  {String(row.type).replace(/_/g, " ")}
                                  <small>{String(row.capacity)} seats</small>
                                </>
                              ) : kind === "groups" ? (
                                <>
                                  {String(row.program)}
                                  <small>
                                    {String(row.size)} enrolled students
                                  </small>
                                </>
                              ) : (
                                <>
                                  {String(row.course_id)}
                                  <small>
                                    {String(row.kind)} · {String(row.duration)}{" "}
                                    period(s)
                                  </small>
                                </>
                              )}
                            </td>
                            <td>
                              {kind === "courses" ? (
                                `${problem.events.filter((e) => e.course_id === row.id).length} meetings`
                              ) : kind === "faculty" ? (
                                (row.course_ids as string[]).join(", ")
                              ) : kind === "rooms" ? (
                                <>
                                  {(row.equipment as string[]).join(", ")}
                                  <small>{String(row.building)}</small>
                                </>
                              ) : kind === "groups" ? (
                                <>
                                  {String(row.major)}
                                  <small>
                                    {String(row.minor)} · {String(row.mdc)}
                                  </small>
                                </>
                              ) : (
                                <>
                                  {(row.group_ids as string[]).join(", ")}
                                  <small>
                                    {(row.faculty_ids as string[]).join(", ")}
                                  </small>
                                </>
                              )}
                            </td>
                            <td>
                              {kind === "courses"
                                ? "Explicit contact requirements"
                                : kind === "events"
                                  ? String(
                                      row.sync_group || "Independent meeting",
                                    )
                                  : `${((row.unavailable as unknown[]) || []).length} unavailable periods`}
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Edit ${String(row.id)}`}
                                onClick={() => setEditor({ kind, index: i })}
                              >
                                <Pencil size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!rows.length && (
                          <tr>
                            <td colSpan={5} className="empty-state">
                              No records match. Add a record or adjust the
                              search.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="data-footnote">
                    <Info size={14} />
                    Edits are validated against all references. Timetable
                    approval requires a fresh solve and independent audit.
                  </p>
                </>
              );
            })()}
          {page === "baskets" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">MULTIDISCIPLINARY, BY DESIGN</span>
                  <h1>
                    Electives that fit together<span>.</span>
                  </h1>
                  <p>
                    Run alternatives in parallel while protecting each student's
                    chosen pathway.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setEditor({ kind: "baskets", index: null })}
                >
                  <Plus size={16} />
                  Add basket
                </button>
              </div>
              <div className="basket-grid">
                {problem.baskets.map((b, i) => (
                  <section className="panel basket-card" key={b.id}>
                    <div className="basket-top">
                      <span className="basket-icon">
                        <Layers3 size={23} />
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`Edit ${b.id}`}
                        onClick={() => setEditor({ kind: "baskets", index: i })}
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                    <span className="eyebrow">{b.id}</span>
                    <h2>{b.name}</h2>
                    <p>
                      {b.course_ids.length} alternative courses ·{" "}
                      {
                        new Set(
                          problem.events
                            .filter((e) => e.basket_id === b.id)
                            .map((e) => e.sync_group),
                        ).size
                      }{" "}
                      synchronized session groups
                    </p>
                    <div className="basket-courses">
                      {b.course_ids.map((c) => {
                        const course = problem.courses.find((x) => x.id === c)!;
                        return (
                          <div key={c}>
                            <span className={`category cat-${course.category}`}>
                              {course.category}
                            </span>
                            <div>
                              <b>{course.title}</b>
                              <small>{course.id}</small>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="basket-windows">
                      <Clock3 size={14} />
                      {b.allowed_starts
                        .map(
                          (s) =>
                            `${problem.calendar.days[s.day].slice(0, 3)} ${minutes(problem.calendar.periods[s.period].start)}`,
                        )
                        .join(" · ") || "No windows configured"}
                    </div>
                    <footer>
                      <Users size={14} />
                      {b.reserved_groups.length} pathways protected
                      <button onClick={() => go("events")}>
                        Linked sessions <ArrowRight size={13} />
                      </button>
                    </footer>
                  </section>
                ))}
              </div>
              <div className="evidence-note">
                <b>Parallel courses, distinct enrollments</b>
                <p>
                  The solver uses actual pathway selections. A student group
                  cannot enroll in two synchronized alternatives from a
                  choose-one basket. Basket windows can also reserve time
                  against compulsory classes for eligible pathways.
                </p>
              </div>
            </>
          )}
          {page === "audit" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">VERIFY, THEN TRUST</span>
                  <h1>
                    Every constraint, accounted for<span>.</span>
                  </h1>
                  <p>
                    Independent checks reconstruct the schedule from raw
                    assignments.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={recheck}
                  disabled={checking}
                >
                  <RefreshCw size={15} className={checking ? "spin" : ""} />
                  Verify again
                </button>
              </div>
              <section className="panel audit-page">
                {renderAudit(true)}
              </section>
            </>
          )}
          {page === "activity" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    ACTUAL SEARCH, VISIBLE PROGRESS
                  </span>
                  <h1>Solver activity</h1>
                  <p>
                    Observed incumbents and lifecycle events. Heartbeats are not
                    search improvements.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => (busy ? planner.cancel() : planner.run())}
                >
                  {busy ? <Square size={14} /> : <Sparkles size={15} />}{" "}
                  {busy ? "Cancel search" : "Generate timetable"}
                </button>
              </div>
              <div className="activity-layout">
                <section className="panel">
                  <div className="panel-heading">
                    <Activity size={18} />
                    <h3>{busy ? "Live search" : "Current session"}</h3>
                    <span className="outline-chip">
                      {mode === "cpsat"
                        ? "OR-Tools CP-SAT"
                        : "Browser finite-domain"}
                    </span>
                  </div>
                  <div className="activity-console">
                    {logs.length ? (
                      logs.map((l, i) => (
                        <div key={i}>
                          <time>
                            {l.elapsed_ms !== undefined
                              ? `${(l.elapsed_ms / 1000).toFixed(2)}s`
                              : String(i + 1).padStart(2, "0")}
                          </time>
                          <span className={"log-type " + l.type}>{l.type}</span>
                          <p>
                            {l.message ||
                              `${l.branches?.toLocaleString() || 0} branches${l.objective !== undefined ? ` · objective ${l.objective}` : l.incumbent !== undefined ? ` · incumbent ${l.incumbent ?? "none"}` : ""}`}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="console-empty">
                        <Activity size={27} />
                        <p>Start a new search to see real progress.</p>
                        <small>
                          The initial example is a recorded, independently
                          checked CP-SAT run.
                        </small>
                      </div>
                    )}
                  </div>
                  {jobId && <p className="job-id">Job {jobId}</p>}
                </section>
                <section className="panel solver-config">
                  <h3>Search configuration</h3>
                  <label>
                    Time budget
                    <select
                      value={budget}
                      onChange={(e) =>
                        planner.setBudget(Number(e.target.value))
                      }
                      disabled={busy}
                    >
                      {[1, 2, 3, 5, 10].map((n) => (
                        <option value={n} key={n}>
                          {n} seconds
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    Hard constraints always take priority. A feasible result may
                    be returned without proof of optimality.
                  </p>
                  <div className="scope-note">
                    <Info size={16} />
                    <span>
                      {mode === "cpsat"
                        ? "Local service runs CP-SAT in a separate worker process."
                        : "Hosted search runs in an isolated browser worker, limited to 100 events. Use the supplied local CP-SAT service for larger datasets."}
                    </span>
                  </div>
                </section>
              </div>
              <h2 className="section-title">Saved jobs</h2>
              <div className="panel table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Meetings</th>
                      <th>Objective</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.job_id}>
                        <td>
                          <strong>{h.job_id.slice(0, 8)}</strong>
                          <small>
                            {new Date(
                              h.created < 1e12 ? h.created * 1000 : h.created,
                            ).toLocaleString()}
                          </small>
                        </td>
                        <td>
                          <span className="outline-chip">{h.status}</span>
                        </td>
                        <td>{h.result?.assignments?.length || "—"}</td>
                        <td>{h.result?.objective ?? "—"}</td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => planner.restore(h.job_id)}
                          >
                            Load & verify <ArrowRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!history.length && (
                      <tr>
                        <td colSpan={5} className="empty-state">
                          {authenticated
                            ? "No saved jobs yet. Generate a timetable to create one."
                            : "Sign in to keep jobs across sessions. Current preview results stay on this device."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {page === "research" && <Research />}
          {page === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    EXPLICIT INSTITUTIONAL POLICIES
                  </span>
                  <h1>Workspace settings</h1>
                  <p>
                    These are configurable demonstration rules, not automatic
                    regulatory certification.
                  </p>
                </div>
                <button className="button primary" onClick={planner.saveDraft}>
                  Save revision
                </button>
              </div>
              <section className="panel settings-panel">
                <h3>Institution & calendar</h3>
                <div className="form-grid">
                  <label>
                    Institution
                    <input
                      value={problem.institution}
                      onChange={(e) =>
                        planner.setProblem({
                          ...problem,
                          institution: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Timetable title
                    <input
                      value={problem.title}
                      onChange={(e) =>
                        planner.setProblem({
                          ...problem,
                          title: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Term starts
                    <input
                      type="date"
                      value={problem.calendar.term_start}
                      onChange={(e) =>
                        planner.setProblem({
                          ...problem,
                          calendar: {
                            ...problem.calendar,
                            term_start: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Term ends
                    <input
                      type="date"
                      value={problem.calendar.term_end}
                      onChange={(e) =>
                        planner.setProblem({
                          ...problem,
                          calendar: {
                            ...problem.calendar,
                            term_end: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    IANA timezone
                    <input
                      value={problem.calendar.timezone}
                      onChange={(e) =>
                        planner.setProblem({
                          ...problem,
                          calendar: {
                            ...problem.calendar,
                            timezone: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Max theory lectures / section / day
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={problem.policies.max_theory_per_day}
                      onChange={(e) =>
                        planner.setProblem({
                          ...problem,
                          policies: {
                            ...problem.policies,
                            max_theory_per_day: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Required building transfer (minutes)
                    <input
                      type="number"
                      min={0}
                      max={180}
                      value={problem.policies.min_travel_minutes}
                      onChange={(e) =>
                        planner.setProblem({
                          ...problem,
                          policies: {
                            ...problem.policies,
                            min_travel_minutes: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Search budget
                    <select
                      value={budget}
                      onChange={(e) =>
                        planner.setBudget(Number(e.target.value))
                      }
                    >
                      {[1, 2, 3, 5, 10].map((n) => (
                        <option key={n} value={n}>
                          {n} seconds
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <h3>Soft objective weights</h3>
                <div className="weight-grid">
                  {Object.entries(problem.policies.weights).map(
                    ([key, value]) => (
                      <label key={key}>
                        {key.replace(/_/g, " ")}
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          value={value}
                          onChange={(e) =>
                            planner.setProblem({
                              ...problem,
                              policies: {
                                ...problem.policies,
                                weights: {
                                  ...problem.policies.weights,
                                  [key]: Number(e.target.value),
                                },
                              },
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
                <div className="settings-bottom">
                  <div>
                    <b>Advanced configuration</b>
                    <p>
                      Calendar periods, holidays, event requirements,
                      synchronization groups and assignment locks.
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => showImport(JSON.stringify(problem, null, 2))}
                  >
                    <FileJson size={15} />
                    Edit full dataset
                  </button>
                  <button className="button secondary" onClick={downloadDraft}>
                    <Download size={15} />
                    Download JSON
                  </button>
                </div>
              </section>
              <section className="panel settings-panel">
                <h3>Saved problem revisions</h3>
                {planner.savedProblems.length ? (
                  planner.savedProblems.map((s) => (
                    <div className="saved-problem" key={s.id}>
                      <span>
                        <b>{s.problem.title}</b>
                        <small>{s.id}</small>
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          planner.setProblem(s.problem);
                          planner.setNotice(
                            "Saved problem loaded as a draft. Generate to apply it.",
                          );
                        }}
                      >
                        Load draft <ArrowRight size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="subtle">No saved problem revisions yet.</p>
                )}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="footer-mark" />
              TimetableGenie <span className="dot-separator">·</span> Academic
              planning, in sync.
            </span>
            <span>Explicit constraints. Independently checked.</span>
          </footer>
        </main>
      </div>
      {busy && (
        <button className="live-indicator" onClick={() => go("activity")}>
          <LoaderCircle size={16} className="spin" />
          <span>
            Finding a feasible timetable…
            <small>
              {logs.at(-1)?.branches?.toLocaleString() || "Preparing"}{" "}
              {logs.at(-1)?.branches ? "branches" : ""}
            </small>
          </span>
          <ArrowUpRight size={15} />
        </button>
      )}
      {editor && (
        <EntityEditor
          problem={problem}
          kind={editor.kind}
          index={editor.index}
          onSave={applyDraft}
          onClose={() => setEditor(null)}
        />
      )}
      {event &&
        (() => {
          const e = p.events.find((x) => x.id === event.event_id)!,
            c = p.courses.find((x) => x.id === e.course_id)!,
            room = p.rooms.find((x) => x.id === event.room_id)!;
          return (
            <Modal
              title={c.title}
              subtitle={c.id + " · " + e.section_id}
              onClose={() => setEvent(null)}
            >
              <div className="event-details">
                <span className={`category cat-${c.category}`}>
                  {c.category}
                </span>
                <span className="outline-chip">
                  {e.kind === "P"
                    ? "Practical block"
                    : e.kind === "T"
                      ? "Tutorial"
                      : e.kind === "INT"
                        ? "Practice / research"
                        : "Lecture"}
                </span>
                <dl>
                  <dt>When</dt>
                  <dd>
                    {p.calendar.days[event.day]},{" "}
                    {minutes(p.calendar.periods[event.period].start)}–
                    {minutes(
                      p.calendar.periods[event.period + e.duration - 1].end,
                    )}
                  </dd>
                  <dt>Room</dt>
                  <dd>
                    {room.name} · {room.building}
                  </dd>
                  <dt>Faculty</dt>
                  <dd>
                    {p.faculty.find((f) => f.id === event.faculty_id)?.name}
                  </dd>
                  <dt>Enrollment</dt>
                  <dd>
                    {e.group_ids.reduce(
                      (n, g) => n + p.groups.find((x) => x.id === g)!.size,
                      0,
                    )}{" "}
                    students / {room.capacity} seats
                  </dd>
                  <dt>Pathways</dt>
                  <dd>
                    {e.group_ids
                      .map((g) => p.groups.find((x) => x.id === g)!.name)
                      .join("; ")}
                  </dd>
                  <dt>Synchronization</dt>
                  <dd>{e.sync_group || "Independent meeting"}</dd>
                  <dt>Academic credits</dt>
                  <dd>
                    {c.credits} per course · contact duration defined separately
                  </dd>
                </dl>
                <div className="audit-scope">
                  <Info size={15} />
                  <p>
                    Drag a meeting to request a locked move and repair. No
                    conflicting edit is silently accepted.
                  </p>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    const np = structuredClone(problem);
                    np.policies.locked = np.policies.locked.filter(
                      (a) => a.event_id !== event.event_id,
                    );
                    np.policies.locked.push(event);
                    planner.setProblem(np);
                    planner.setNotice(
                      "Meeting locked in the draft. Generate to apply the lock.",
                    );
                    setEvent(null);
                  }}
                >
                  <LockKeyhole size={14} />
                  Lock this meeting
                </button>
                <div className="spacer" />
                <button
                  className="button primary"
                  onClick={() => setEvent(null)}
                >
                  Done
                </button>
              </div>
            </Modal>
          );
        })()}
      {modal === "design" && (
        <Modal
          title="Interface anatomy"
          subtitle="A dimensional reference measured from the actual metric-card component."
          onClose={() => setModal(null)}
          wide
        >
          <div className="design-intro">
            <p>
              Monochrome linework, explicit spacing and responsive dimensions.
              Based on Enes Ozturk's dimensional-drawing skill.
            </p>
            <a
              className="button secondary"
              href="/design/ui-card-sheet.html"
              target="_blank"
              rel="noreferrer"
            >
              Open full drawing <ArrowUpRight size={14} />
            </a>
            <a
              className="text-button"
              href="/design/ui-card-sheet.html"
              download
            >
              Download HTML sheet
            </a>
          </div>
          <iframe
            title="Metric card dimensional drawing"
            src="/design/ui-card-sheet.html"
            sandbox="allow-scripts"
            className="design-frame"
          />
        </Modal>
      )}
      {modal === "audit" && (
        <Modal
          title="Independent Constraint Audit Certificate"
          subtitle="Feasibility checks and integrity digests are separate from optimality and signatures."
          onClose={() => setModal(null)}
          wide
        >
          {renderAudit(true)}
        </Modal>
      )}
      {modal === "export" && (
        <Modal
          title="Take your timetable with you"
          subtitle="Every export runs a fresh independent constraint audit."
          onClose={() => setModal(null)}
        >
          <div className="export-options">
            {[
              ["pdf", "PDF document", "Readable timetable and audit summary"],
              [
                "xlsx",
                "Excel workbook",
                "Schedule and independent audit worksheets",
              ],
              [
                "ics",
                "Calendar events",
                "Term dates, timezone and holiday exclusions",
              ],
              ["csv", "CSV table", "Spreadsheet-safe meeting records"],
              [
                "json",
                "Reproducible audit bundle",
                "Problem, assignments, report and integrity digests",
              ],
            ].map(([kind, label, description]) => (
              <button key={kind} onClick={() => download(kind)}>
                <span className="export-icon">
                  <Download size={18} />
                </span>
                <span>
                  <b>{label}</b>
                  <small>{description}</small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal === "import" && (
        <Modal
          title="Import & inspect your dataset"
          subtitle="Academic JSON, the documented transit proxy format, or an exported audit bundle."
          onClose={() => setModal(null)}
          wide
        >
          <div className="import-tools">
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 2000000) {
                  setImportError("File exceeds 2 MB");
                  return;
                }
                const text = await f.text();
                setImportText(text);
                previewImport(text);
              }}
            />
            <button
              className="button secondary"
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={15} />
              Choose JSON file
            </button>
            <button
              className="text-button"
              onClick={() => {
                const text = JSON.stringify(transitFixture, null, 2);
                setImportText(text);
                previewImport(text);
              }}
            >
              Try synthetic transit proxy
            </button>
            <button
              className="text-button"
              onClick={() => {
                const text = JSON.stringify(initialProblem, null, 2);
                setImportText(text);
                previewImport(text);
              }}
            >
              Academic example
            </button>
          </div>
          <textarea
            aria-label="Dataset JSON"
            className="json-editor import-editor"
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportPreview(null);
            }}
            placeholder="Paste your dataset JSON here"
            spellCheck={false}
          />
          {importError && <div className="error-box">{importError}</div>}
          {importPreview && (
            <div className="import-preview">
              <b>
                <CheckCircle2 size={17} />
                Schema and references validated
              </b>
              <p>
                {importPreview.problem.events.length} meetings ·{" "}
                {importPreview.problem.rooms.length} rooms ·{" "}
                {importPreview.problem.faculty.length} faculty ·{" "}
                {importPreview.problem.groups.length} pathways
              </p>
              <small>{importPreview.problem.provenance.description}</small>
              {importPreview.mapping && (
                <div className="mapping-list">
                  {importPreview.mapping.map((x) => (
                    <div key={x.source}>
                      <span>{x.source}</span>
                      <ArrowRight size={13} />
                      <b>{x.target}</b>
                      <small>{x.count}</small>
                    </div>
                  ))}
                </div>
              )}
              {importPreview.bundle && (
                <p className="subtle">
                  Contains a schedule. Its full audit and existing
                  problem/schedule digests will be checked before loading.
                </p>
              )}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => previewImport()}
            >
              Validate & preview
            </button>
            <div className="spacer" />
            <button
              className="button primary"
              disabled={!importPreview}
              onClick={applyImport}
            >
              {importPreview?.bundle
                ? "Verify & load bundle"
                : "Import as draft"}
              <ArrowRight size={14} />
            </button>
          </div>
        </Modal>
      )}
      {modal === "repair" && (
        <Modal
          title={
            move ? "Repair around a requested move" : "Simulate a disruption"
          }
          subtitle="A new problem revision is solved and independently audited. Failed repair preserves the accepted timetable."
          onClose={() => setModal(null)}
        >
          <div className="repair-intro">
            <GitCompareArrows size={24} />
            <p>
              {move
                ? `Lock ${p.events.find((e) => e.id === move.event_id)?.course_id} to ${p.calendar.days[move.day]} at ${minutes(p.calendar.periods[move.period].start)} and repair other meetings around it.`
                : "Close a room or mark faculty unavailable in a period, then minimize changed assignments."}
            </p>
          </div>
          {!move && (
            <div className="form-grid">
              <label>
                Disruption type
                <select
                  value={repairType}
                  onChange={(e) => {
                    setRepairType(e.target.value);
                    setRepairTarget(
                      e.target.value === "room"
                        ? r.assignments[0].room_id
                        : r.assignments[0].faculty_id,
                    );
                  }}
                >
                  <option value="room">Room closure</option>
                  <option value="faculty">Faculty absence</option>
                </select>
              </label>
              <label>
                Resource
                <select
                  value={repairTarget}
                  onChange={(e) => setRepairTarget(e.target.value)}
                >
                  {(repairType === "room" ? p.rooms : p.faculty).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Day
                <select
                  value={repairDay}
                  onChange={(e) => setRepairDay(Number(e.target.value))}
                >
                  {p.calendar.days.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Period
                <select
                  value={repairPeriod}
                  onChange={(e) => setRepairPeriod(Number(e.target.value))}
                >
                  {p.calendar.periods.map((t, i) => (
                    <option key={i} value={i}>
                      {minutes(t.start)}–{minutes(t.end)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="audit-scope">
            <Info size={16} />
            <p>
              {p.policies.locked.length} existing assignment locks will be
              honored. More than 90% unchanged is a goal to measure, not a
              guarantee. Repair starts from the accepted revision.
            </p>
          </div>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <div className="spacer" />
            <button
              className="button primary"
              disabled={busy}
              onClick={applyRepair}
            >
              <GitCompareArrows size={15} />
              Run minimal-change repair
            </button>
          </div>
        </Modal>
      )}
      {modal === "search" && (
        <Modal title="Search your workspace" onClose={() => setModal(null)}>
          <label className="search-field large">
            <Search size={18} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Courses, rooms, faculty or pathways"
            />
          </label>
          <div className="search-results">
            {(
              [
                "courses",
                "rooms",
                "faculty",
                "groups",
                "baskets",
              ] as EntityKey[]
            ).flatMap((kind) =>
              (problem[kind] as { id: string; name?: string; title?: string }[])
                .filter(
                  (row) =>
                    query &&
                    (row.id + " " + (row.name || row.title))
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((row) => (
                  <button
                    key={kind + row.id}
                    onClick={() => {
                      go(kind);
                      setEntityQuery(row.id);
                      setModal(null);
                    }}
                  >
                    <Search size={14} />
                    <span>
                      <b>{row.name || row.title}</b>
                      <small>
                        {entityTitles[kind]} · {row.id}
                      </small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                )),
            )}
            {!query && (
              <p className="empty-state">Search by name or identifier.</p>
            )}
          </div>
        </Modal>
      )}
      {modal === "workspace" && (
        <Modal
          title="Your academic workspace"
          subtitle={authenticated ? name : "Device preview"}
          onClose={() => setModal(null)}
        >
          <div className="workspace-info">
            <GraduationCap size={32} />
            <h3>{p.institution}</h3>
            <p>
              {authenticated
                ? "Problem revisions and jobs are stored with account-level ownership checks."
                : "Your preview works on this device. Sign in to retain revisions and solver jobs."}
            </p>
            <span className="outline-chip">
              {mode === "cpsat"
                ? "Local OR-Tools CP-SAT service"
                : "Hosted browser solver · 100-event limit"}
            </span>
          </div>
          <a
            className="button secondary"
            href="/downloads/TimetableGenie-source.zip"
            download
          >
            <Download size={14} /> Download local CP-SAT project
          </a>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                planner.loadExample();
                setModal(null);
              }}
            >
              Load verified example
            </button>
            <div className="spacer" />
            {!authenticated && (
              <>
                <button
                  className="button secondary"
                  onClick={() => setModal("login")}
                >
                  <LogIn size={14} />
                  Local service login
                </button>
                <a
                  className="button primary"
                  href="/signin-with-chatgpt?return_to=%2F"
                  target="_top"
                >
                  Sign in with ChatGPT
                </a>
              </>
            )}
            {authenticated && (
              <button
                className="button primary"
                onClick={() => {
                  go("settings");
                  setModal(null);
                }}
              >
                Workspace settings
              </button>
            )}
          </div>
        </Modal>
      )}
      {modal === "login" && (
        <Modal
          title="Sign in to the local CP-SAT service"
          subtitle="Use the administrator account configured for your local service."
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("auth/login", { email, password });
                setPassword("");
                await planner.refresh();
                setModal(null);
                planner.setNotice("Signed in to local service.");
              } catch (e) {
                planner.setError(String(e));
              }
            }}
          >
            <div className="form-grid single">
              <label>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="button primary">Sign in</button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="A clear week in five steps"
          subtitle="Start with the example, then configure your institution."
          onClose={() => setModal(null)}
        >
          <ol className="walkthrough">
            <li>
              <b>Inspect the data</b>
              <p>
                Courses, rooms, faculty and pathways are explicit. Credits and
                contact periods are separate.
              </p>
            </li>
            <li>
              <b>Configure elective baskets</b>
              <p>
                Parallel offerings share windows. Actual enrollments determine
                student conflicts.
              </p>
            </li>
            <li>
              <b>Generate a timetable</b>
              <p>
                The selected engine searches within your time budget and reports
                its real status.
              </p>
            </li>
            <li>
              <b>Check the certificate</b>
              <p>
                An independent auditor checks every enabled hard rule from the
                raw schedule.
              </p>
            </li>
            <li>
              <b>Repair or export</b>
              <p>
                Simulate a closure, compare changed meetings, or download a
                reproducible audit bundle.
              </p>
            </li>
          </ol>
          <button className="button primary" onClick={() => setModal(null)}>
            Explore the workspace <ArrowRight size={15} />
          </button>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  icon: Icon,
  tone,
  label,
  value,
  detail,
  extra,
}: {
  icon: typeof CalendarDays;
  tone: string;
  label: string;
  value: string;
  detail: string;
  extra: string;
}) {
  return (
    <section className="stat-card panel">
      <div className="stat-top">
        <span>{label}</span>
        <i className={"stat-icon " + tone}>
          <Icon size={18} />
        </i>
      </div>
      <div className="stat-value">{value}</div>
      <p>{detail}</p>
      <span className={"stat-extra " + tone}>
        {tone === "green" ? (
          <CheckCircle2 size={11} />
        ) : (
          <span className="stat-dot" />
        )}
        {extra}
      </span>
    </section>
  );
}
