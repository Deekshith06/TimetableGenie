import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ProblemSchema, type SolverResult } from "../lib/domain";
import { verify, digest } from "../lib/verifier";
import { adaptTransit } from "../lib/transit";
import { xlsx, pdf, ics, csv } from "../lib/exports";
import { solveBrowser } from "../public/solver-worker.js";
fs.mkdirSync("outputs", { recursive: true });
const p = ProblemSchema.parse(
  JSON.parse(fs.readFileSync("datasets/nep2020_synthetic_data.json", "utf8")),
);
const sample = JSON.parse(
  fs.readFileSync("datasets/demo_schedule.json", "utf8"),
);
const vectors = JSON.parse(
  fs.readFileSync("datasets/audit_test_vectors.json", "utf8"),
);
const cases = vectors.cases;
for (const c of cases)
  test(`TypeScript auditor rejects ${c.name}`, async () => {
    const a = await verify(c.problem, c.schedule);
    assert.equal(a.status, "FAIL");
    assert.ok(
      a.violations.some((v) => v.rule === c.rule),
      JSON.stringify(a),
    );
  });
test("recorded sample passes both-language digest agreement", async () => {
  const a = await verify(p, sample.assignments),
    reference = vectors.digest_reference;
  assert.equal(a.status, "PASS");
  assert.equal(a.problem_digest, reference.problem_digest);
  assert.equal(a.schedule_digest, reference.schedule_digest);
  const b = await verify(p, [...sample.assignments].reverse());
  assert.equal(a.schedule_digest, b.schedule_digest);
});
test("browser-generated result independently passes TypeScript audit", async () => {
  const r = solveBrowser(p, { budget_ms: 250, stop_first: true });
  assert.equal(r.status, "FEASIBLE");
  assert.equal((await verify(p, r.assignments)).status, "PASS");
  fs.writeFileSync(
    "outputs/browser-cross-check.json",
    JSON.stringify({ problem: p, result: r }),
  );
});
test("browser empty domain establishes infeasibility", () => {
  const q = structuredClone(p);
  q.events[0].allowed_starts = [];
  const r = solveBrowser(q, { budget_ms: 100 });
  assert.equal(r.status, "INFEASIBLE");
  assert.equal(r.assignments.length, 0);
});
test("browser deadline does not falsely declare infeasibility", () => {
  const r = solveBrowser(p, { budget_ms: 10, max_nodes: 1 });
  assert.ok(["UNKNOWN", "FEASIBLE"].includes(r.status));
  assert.equal(r.optimal, false);
});
test("browser repair is independently checked and measured", async () => {
  const q = structuredClone(p),
    a = sample.assignments[0];
  q.rooms
    .find((r) => r.id === a.room_id)!
    .unavailable.push({ day: a.day, period: a.period });
  const r = solveBrowser(q, {
    budget_ms: 500,
    baseline: sample.assignments,
  }) as unknown as SolverResult;
  assert.ok(r.assignments.length > 0);
  assert.equal((await verify(q, r.assignments)).status, "PASS");
  assert.equal(
    r.changed_count,
    r.assignments.filter(
      (a) =>
        !sample.assignments.some(
          (b: unknown) => JSON.stringify(b) === JSON.stringify(a),
        ),
    ).length,
  );
  fs.writeFileSync(
    "outputs/browser-repair.json",
    JSON.stringify({ problem: q, result: r }),
  );
});
test("adapter preserves the declared structural problem", () => {
  const t = JSON.parse(
      fs.readFileSync("datasets/transit_proxy_corpus.json", "utf8"),
    ),
    a = adaptTransit(t);
  assert.deepEqual(a.problem.events, p.events);
  assert.deepEqual(a.problem.baskets, p.baskets);
  assert.equal(a.problem.provenance.kind, "adapted");
});
test("all export formats contain actual schedule data", async () => {
  const audit = await verify(p, sample.assignments),
    workbook = xlsx(p, sample.assignments, audit),
    document = pdf(p, sample.assignments, audit),
    calendar = ics(p, sample.assignments),
    table = csv(p, sample.assignments);
  assert.equal(new TextDecoder().decode(workbook.slice(0, 2)), "PK");
  assert.equal(new TextDecoder().decode(document.slice(0, 8)), "%PDF-1.4");
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 29);
  assert.ok(table.includes("CS201"));
  fs.writeFileSync("outputs/browser-export.xlsx", workbook);
  fs.writeFileSync("outputs/browser-export.pdf", document);
  fs.writeFileSync("outputs/browser-export.ics", calendar);
});
test("SHA-256 agrees when browser Web Crypto is unavailable", async () => {
  const expected = await digest("test", { value: "regression" });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  try {
    Object.defineProperty(globalThis, "crypto", {
      value: {},
      configurable: true,
    });
    assert.equal(await digest("test", { value: "regression" }), expected);
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});
test("unknown room cannot produce a complete success report", async () => {
  const aa = structuredClone(sample.assignments);
  aa[0].room_id = "UNKNOWN_ROOM";
  const a = await verify(p, aa);
  assert.equal(a.status, "FAIL");
  assert.equal(a.complete, false);
  assert.equal(a.rules.find((r) => r.id === "H7")?.status, "NOT_EVALUATED");
});

test("calendar exports preserve local time across a daylight-saving change", () => {
  const q = structuredClone(p);
  q.calendar.timezone = "America/New_York";
  q.calendar.term_start = "2026-10-26";
  q.calendar.term_end = "2026-11-16";
  q.calendar.holidays = [];
  const a = { ...sample.assignments[0], day: 0, period: 0 };
  const text = ics(q, [a]);
  assert.ok(text.includes("20261026T130000Z"));
  assert.ok(text.includes("20261102T140000Z"));
});

test("academic credits do not count a course with no declared meetings", async () => {
  const { metrics } = await import("../lib/verifier");
  const q = structuredClone(p);
  q.courses.push({ ...q.courses[0], id: "NO_MEETINGS", credits: 40 });
  assert.equal(
    metrics(q, sample.assignments).credits,
    metrics(p, sample.assignments).credits,
  );
});

test("lab duration labels use contact minutes instead of assuming one-hour periods", async () => {
  const { durationLabel } = await import("../lib/domain");
  const q = structuredClone(p);
  q.calendar.periods = [
    { start: 540, end: 585 },
    { start: 585, end: 630 },
  ];
  const e = q.events.find((e) => e.kind === "P")!;
  assert.equal(durationLabel(q, e), "90m");
});
