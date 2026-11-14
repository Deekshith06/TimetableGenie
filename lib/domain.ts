import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const int = z.number().int().nonnegative();
export const SlotSchema = z.object({ day: int, period: int }).strict();
export const AssignmentSchema = z
  .object({ event_id: id, room_id: id, faculty_id: id, day: int, period: int })
  .strict();
export const ProblemSchema = z
  .object({
    schema_version: z.literal("1.0"),
    id,
    title: z.string().min(1).max(180),
    institution: z.string().max(180),
    provenance: z
      .object({
        kind: z.enum(["synthetic", "collected", "adapted"]),
        description: z.string().max(2000),
        seed: int,
        source_url: z.string().max(1000).nullable(),
      })
      .strict(),
    calendar: z
      .object({
        days: z.array(z.string().min(1).max(16)).min(1).max(7),
        periods: z
          .array(
            z.object({ start: int.max(1439), end: int.max(1440) }).strict(),
          )
          .min(1)
          .max(12),
        timezone: z.string().max(60),
        term_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        term_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400),
        midterm_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        midterm_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        endterm_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        endterm_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      })
      .strict(),
    courses: z
      .array(
        z
          .object({
            id,
            title: z.string().min(1).max(160),
            category: z.enum(["DSC", "MIC", "MDC", "AEC", "SEC", "VAC", "INT"]),
            credits: z.number().min(0).max(40).multipleOf(0.5),
            profile: z.string().max(160),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    rooms: z
      .array(
        z
          .object({
            id,
            name: z.string().max(120),
            type: z.string().max(40),
            capacity: int.max(10000),
            building: z.string().max(80),
            equipment: z.array(z.string().max(60)).max(50),
            unavailable: z.array(SlotSchema).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(80),
    faculty: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(100),
            department: z.string().max(100),
            max_minutes: int.max(10080),
            course_ids: z.array(id).max(200),
            unavailable: z.array(SlotSchema).max(1000),
            preferred: z.array(SlotSchema).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    groups: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(180),
            size: int.max(10000),
            program: z.string().max(100),
            major: z.string().max(100),
            minor: z.string().max(100),
            mdc: z.string().max(100),
            unavailable: z.array(SlotSchema).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    events: z
      .array(
        z
          .object({
            id,
            course_id: id,
            section_id: id,
            kind: z.enum(["L", "T", "P", "INT"]),
            duration: int.min(1).max(12),
            faculty_ids: z.array(id).min(1).max(100),
            group_ids: z.array(id).max(100),
            room_types: z.array(z.string()).min(1).max(20),
            equipment: z.array(z.string()).max(50),
            allowed_starts: z.array(SlotSchema).max(1000).nullable(),
            basket_id: id.nullable(),
            sync_group: id.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(250),
    baskets: z
      .array(
        z
          .object({
            id,
            name: z.string().max(150),
            course_ids: z.array(id).min(1),
            reserved_groups: z.array(id),
            allowed_starts: z.array(SlotSchema).max(1000),
          })
          .strict(),
      )
      .max(50),
    policies: z
      .object({
        max_theory_per_day: int.min(1).max(12),
        min_travel_minutes: int.max(180),
        locked: z.array(AssignmentSchema).max(250),
        weights: z
          .object({
            preference: int.max(1000),
            seat_slack: int.max(1000),
            idle: int.max(1000),
            travel: int.max(1000),
            balance: int.max(1000),
          })
          .strict(),
        notes: z.array(z.string().max(1000)).max(30),
      })
      .strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const fail = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: "custom", message, path });
    for (const key of [
      "courses",
      "rooms",
      "faculty",
      "groups",
      "events",
      "baskets",
    ] as const) {
      const ids = p[key].map((x) => x.id);
      if (new Set(ids).size !== ids.length)
        fail(`Duplicate ${key} identifiers`, [key]);
    }
    if (new Set(p.calendar.days).size !== p.calendar.days.length)
      fail("Day labels must be unique", ["calendar", "days"]);
    const canonicalDays = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    if (p.calendar.days.some((d, i) => d !== canonicalDays[i]))
      fail("Calendar days must be a Monday-first prefix of the week", [
        "calendar",
        "days",
      ]);
    for (let i = 0; i < p.calendar.periods.length; i++) {
      const t = p.calendar.periods[i];
      if (
        t.end <= t.start ||
        (i > 0 && t.start < p.calendar.periods[i - 1].end)
      )
        fail(
          "Periods must be increasing, non-overlapping, positive intervals",
          ["calendar", "periods", i],
        );
    }
    const lengths = p.calendar.periods.map((t) => t.end - t.start);
    if (new Set(lengths).size !== 1)
      fail("This version requires equal-duration periods", [
        "calendar",
        "periods",
      ]);
    const validDate = (s: string) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (
      !validDate(p.calendar.term_start) ||
      !validDate(p.calendar.term_end) ||
      p.calendar.term_end < p.calendar.term_start
    )
      fail("Invalid term dates", ["calendar"]);
    if (
      Date.parse(p.calendar.term_end) - Date.parse(p.calendar.term_start) >
      366 * 86400000
    )
      fail("Each problem covers one term of at most 366 days", ["calendar"]);
    if (
      p.calendar.days.length > 1 &&
      p.policies.min_travel_minutes >
        1440 +
          p.calendar.periods[0].start -
          p.calendar.periods[p.calendar.periods.length - 1].end
    )
      fail(
        "Calendar must leave the enabled travel buffer between teaching days",
        ["calendar"],
      );
    if (p.calendar.holidays.some((s) => !validDate(s)))
      fail("Invalid holiday date", ["calendar", "holidays"]);
    try {
      new Intl.DateTimeFormat("en", { timeZone: p.calendar.timezone });
    } catch {
      fail("Unknown IANA timezone", ["calendar", "timezone"]);
    }
    const has = (
      key: "courses" | "rooms" | "faculty" | "groups" | "events" | "baskets",
      v: string,
    ) => p[key].some((x) => x.id === v);
    const slots = (
      xs: { day: number; period: number }[],
      path: (string | number)[],
    ) => {
      for (const s of xs)
        if (
          s.day >= p.calendar.days.length ||
          s.period >= p.calendar.periods.length
        )
          fail("Slot outside calendar", path);
    };
    p.rooms.forEach((x, i) =>
      slots(x.unavailable, ["rooms", i, "unavailable"]),
    );
    p.faculty.forEach((x, i) => {
      slots(x.unavailable, ["faculty", i]);
      slots(x.preferred, ["faculty", i]);
      for (const c of x.course_ids)
        if (!has("courses", c)) fail(`Unknown course ${c}`, ["faculty", i]);
    });
    p.groups.forEach((x, i) => slots(x.unavailable, ["groups", i]));
    p.events.forEach((e, i) => {
      if (!has("courses", e.course_id))
        fail(`Unknown course ${e.course_id}`, ["events", i]);
      for (const f of e.faculty_ids)
        if (!has("faculty", f)) fail(`Unknown faculty ${f}`, ["events", i]);
      for (const g of e.group_ids)
        if (!has("groups", g)) fail(`Unknown group ${g}`, ["events", i]);
      if (
        new Set(e.group_ids).size !== e.group_ids.length ||
        new Set(e.faculty_ids).size !== e.faculty_ids.length
      )
        fail("Duplicate event references", ["events", i]);
      if (e.allowed_starts) slots(e.allowed_starts, ["events", i]);
      if (e.basket_id && !has("baskets", e.basket_id))
        fail("Unknown basket", ["events", i]);
      if (Boolean(e.sync_group) !== Boolean(e.basket_id))
        fail("Basket events require a synchronization group and vice versa", [
          "events",
          i,
        ]);
    });
    p.baskets.forEach((b, i) => {
      slots(b.allowed_starts, ["baskets", i]);
      for (const c of b.course_ids)
        if (!has("courses", c))
          fail(`Unknown basket course ${c}`, ["baskets", i]);
      for (const g of b.reserved_groups)
        if (!has("groups", g))
          fail(`Unknown reserved group ${g}`, ["baskets", i]);
      for (const g of p.groups) {
        const selected = new Set(
          p.events
            .filter((e) => e.basket_id === b.id && e.group_ids.includes(g.id))
            .map((e) => e.course_id),
        );
        if (selected.size > 1)
          fail(`Group ${g.id} selects multiple parallel alternatives`, [
            "baskets",
            i,
          ]);
      }
    });
    const sync = new Map<string, typeof p.events>();
    for (const e of p.events)
      if (e.sync_group)
        sync.set(e.sync_group, [...(sync.get(e.sync_group) || []), e]);
    for (const [sid, es] of sync) {
      if (
        es.length < 2 ||
        new Set(es.map((e) => e.duration)).size > 1 ||
        new Set(es.map((e) => e.basket_id)).size > 1 ||
        new Set(es.map((e) => e.course_id)).size !== es.length
      )
        fail(
          `Synchronization ${sid} requires distinct alternatives with equal duration in one basket`,
        );
      for (const e of es)
        if (
          !p.baskets
            .find((b) => b.id === e.basket_id)
            ?.course_ids.includes(e.course_id)
        )
          fail(`Event ${e.id} is not a basket alternative`);
    }
    const seenLocks = new Set<string>();
    for (const a of p.policies.locked) {
      if (seenLocks.has(a.event_id)) fail("Duplicate event lock");
      seenLocks.add(a.event_id);
      if (
        !has("events", a.event_id) ||
        !has("rooms", a.room_id) ||
        !has("faculty", a.faculty_id)
      )
        fail("Unknown locked assignment reference");
      slots([a], ["policies", "locked"]);
    }
  });
export type Problem = z.infer<typeof ProblemSchema>;
export type Assignment = z.infer<typeof AssignmentSchema>;
export type Event = Problem["events"][number];
export const RULES = [
  ["H1", "Session fulfillment"],
  ["H2", "Room exclusivity"],
  ["H3", "Faculty exclusivity"],
  ["H4", "Student pathway conflicts"],
  ["H5", "Elective synchronization"],
  ["H6", "Contiguous practical blocks"],
  ["H7", "Room capacity"],
  ["H8", "Equipment & qualifications"],
  ["H9", "Availability & calendar"],
  ["H10", "Faculty workload"],
  ["H11", "Theory spread"],
  ["H12", "Building travel time"],
  ["H13", "Locked assignments"],
] as const;
export type Violation = { rule: string; message: string; event_ids: string[] };
export type Audit = {
  schema_version: string;
  checker_version: string;
  status: "PASS" | "FAIL";
  complete: boolean;
  total_violations: number;
  rules: { id: string; label: string; status: string; violations: number }[];
  violations: Violation[];
  problem_digest: string;
  schedule_digest: string;
  payload_digest: string;
  issued_at: string;
  signature_status: string;
};
export type SolverResult = {
  status: string;
  assignments: Assignment[];
  engine: string;
  elapsed_ms: number;
  branches: number;
  objective: number | null;
  search_objective?: number | null;
  best_bound?: number | null;
  best_bound_scope?: string;
  optimal: boolean;
  diagnostics: string[];
  changed_count?: number;
  unchanged_percent?: number;
  audit?: Audit;
  id?: string;
  saved?: boolean;
};
export function minutes(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export function eventName(p: Problem, e: Event) {
  return p.courses.find((c) => c.id === e.course_id)?.title || e.course_id;
}

export function durationLabel(p: Problem, e: Event): string {
  const length =
    e.duration * (p.calendar.periods[0].end - p.calendar.periods[0].start);
  return length % 60 === 0 ? `${length / 60}h` : `${length}m`;
}
