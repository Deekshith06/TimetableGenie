import {
  AssignmentSchema,
  ProblemSchema,
  RULES,
  type Assignment,
  type Audit,
  type Problem,
  type Violation,
} from "./domain";
import { sha256 } from "@noble/hashes/sha2.js";

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}
export async function digest(domain: string, value: unknown) {
  const bytes = new TextEncoder().encode(
    `TimetableGenie/${domain}/v1\n${canonical(value)}`,
  );
  const hash =
    typeof crypto !== "undefined" && crypto.subtle
      ? new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
      : sha256(bytes);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
const sameSlot = (
  a: { day: number; period: number },
  b: { day: number; period: number },
) => a.day === b.day && a.period === b.period;
const sameAssignment = (a: Assignment, b: Assignment) =>
  a.event_id === b.event_id &&
  a.room_id === b.room_id &&
  a.faculty_id === b.faculty_id &&
  sameSlot(a, b);

/** Independent occupancy auditor. This module deliberately does not import solver/domain-building code. */
export async function verify(
  rawProblem: unknown,
  rawSchedule: unknown,
): Promise<Audit> {
  const violations: Violation[] = [];
  const add = (rule: string, message: string, event_ids: string[] = []) =>
    violations.push({ rule, message, event_ids });
  const parsed = ProblemSchema.safeParse(rawProblem);
  let complete = parsed.success;
  const p = parsed.success ? parsed.data : null;
  const assignments: Assignment[] = [];
  if (!parsed.success)
    add(
      "H1",
      `Invalid problem: ${parsed.error.issues.map((x) => x.message).join("; ")}`,
    );
  if (!Array.isArray(rawSchedule)) {
    complete = false;
    add("H1", "Schedule must be an array");
  } else if (rawSchedule.length > 500) {
    complete = false;
    add("H1", "Schedule exceeds audit size limit");
  } else
    for (const [i, row] of rawSchedule.entries()) {
      const a = AssignmentSchema.safeParse(row);
      if (!a.success) {
        complete = false;
        add("H1", `Malformed assignment at index ${i}`);
      } else assignments.push(a.data);
    }
  if (p) {
    const es = new Map(p.events.map((e) => [e.id, e]));
    const rooms = new Map(p.rooms.map((r) => [r.id, r]));
    const fs = new Map(p.faculty.map((f) => [f.id, f]));
    const groups = new Map(p.groups.map((g) => [g.id, g]));
    for (const e of p.events) {
      const n = assignments.filter((a) => a.event_id === e.id).length;
      if (n !== 1)
        add("H1", `${e.id}: expected exactly one meeting, found ${n}`, [e.id]);
    }
    for (const a of assignments)
      if (!es.has(a.event_id)) {
        complete = false;
        add("H1", `Unexpected event ${a.event_id}`, [a.event_id]);
      }
    const rows = assignments
      .filter((a) => es.has(a.event_id))
      .map((a) => ({
        a,
        e: es.get(a.event_id)!,
        r: rooms.get(a.room_id),
        f: fs.get(a.faculty_id),
        occupied: Array.from(
          { length: es.get(a.event_id)!.duration },
          (_, j) => a.period + j,
        ),
      }));
    for (const row of rows) {
      const { a, e, r, f, occupied } = row;
      const badCalendar =
        a.day >= p.calendar.days.length ||
        occupied.some((i) => i >= p.calendar.periods.length);
      if (badCalendar) {
        complete = false;
        add("H6", `${e.id}: interval outside teaching calendar`, [e.id]);
        add("H9", `${e.id}: invalid day or period`, [e.id]);
      } else if (
        occupied.some(
          (i, j) =>
            j > 0 &&
            p.calendar.periods[i - 1].end !== p.calendar.periods[i].start,
        )
      )
        add("H6", `${e.id}: block crosses a break`, [e.id]);
      if (!r || !f) {
        complete = false;
        add("H8", `${e.id}: unknown room or faculty`, [e.id]);
        continue;
      }
      const enrollment = e.group_ids.reduce(
        (n, g) => n + (groups.get(g)?.size || 0),
        0,
      );
      if (enrollment > r.capacity)
        add(
          "H7",
          `${e.id}: ${enrollment} attendees exceed ${r.id} capacity ${r.capacity}`,
          [e.id],
        );
      if (
        !e.room_types.includes(r.type) ||
        e.equipment.some((eq) => !r.equipment.includes(eq)) ||
        !e.faculty_ids.includes(f.id) ||
        !f.course_ids.includes(e.course_id)
      )
        add(
          "H8",
          `${e.id}: incompatible room, equipment or faculty qualification`,
          [e.id],
        );
      if (
        e.allowed_starts !== null &&
        !e.allowed_starts.some((s) => sameSlot(s, a))
      )
        add("H9", `${e.id}: start is outside allowed windows`, [e.id]);
      const restricted = [
        ...r.unavailable,
        ...f.unavailable,
        ...e.group_ids.flatMap((g) => groups.get(g)?.unavailable || []),
      ];
      if (
        occupied.some((period) =>
          restricted.some((s) => s.day === a.day && s.period === period),
        )
      )
        add("H9", `${e.id}: assignment intersects a blackout or closure`, [
          e.id,
        ]);
    }
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const x = rows[i],
          y = rows[j];
        if (x.a.day !== y.a.day) continue;
        const overlap = x.occupied.some((t) => y.occupied.includes(t));
        const shareGroup = x.e.group_ids.some((g) => y.e.group_ids.includes(g));
        if (overlap) {
          if (x.a.room_id === y.a.room_id)
            add("H2", `${x.a.room_id}: overlapping meetings`, [x.e.id, y.e.id]);
          if (x.a.faculty_id === y.a.faculty_id)
            add("H3", `${x.a.faculty_id}: overlapping meetings`, [
              x.e.id,
              y.e.id,
            ]);
          if (shareGroup)
            add("H4", "A selected student pathway has overlapping meetings", [
              x.e.id,
              y.e.id,
            ]);
        }
        if (
          p.policies.min_travel_minutes &&
          x.r &&
          y.r &&
          x.r.building !== y.r.building &&
          (shareGroup || x.a.faculty_id === y.a.faculty_id) &&
          !overlap
        ) {
          const [left, right] = x.a.period < y.a.period ? [x, y] : [y, x];
          const last = left.a.period + left.e.duration - 1;
          if (
            last < p.calendar.periods.length &&
            right.a.period < p.calendar.periods.length &&
            p.calendar.periods[right.a.period].start -
              p.calendar.periods[last].end <
              p.policies.min_travel_minutes
          )
            add("H12", "Insufficient time for a required building transfer", [
              left.e.id,
              right.e.id,
            ]);
        }
      }
    const syncs = new Map<string, typeof rows>();
    for (const row of rows)
      if (row.e.sync_group)
        syncs.set(row.e.sync_group, [
          ...(syncs.get(row.e.sync_group) || []),
          row,
        ]);
    for (const [sid, rs] of syncs)
      if (rs.some((x) => !sameSlot(x.a, rs[0].a)))
        add(
          "H5",
          `${sid}: parallel offerings are not synchronized`,
          rs.map((x) => x.e.id),
        );
    for (const b of p.baskets) {
      const br = rows.filter((x) => x.e.basket_id === b.id);
      for (const x of br) {
        if (!b.allowed_starts.some((s) => sameSlot(s, x.a)))
          add("H5", `${x.e.id}: outside ${b.id} window`, [x.e.id]);
        for (const y of rows)
          if (
            y.e.basket_id !== b.id &&
            y.a.day === x.a.day &&
            y.e.group_ids.some((g) => b.reserved_groups.includes(g)) &&
            x.occupied.some((t) => y.occupied.includes(t))
          )
            add("H5", `${b.id}: reserved pathway window is blocked`, [
              x.e.id,
              y.e.id,
            ]);
      }
    }
    for (const f of p.faculty) {
      const assigned = rows.filter((x) => x.a.faculty_id === f.id);
      const load = assigned.reduce(
        (n, x) =>
          n +
          x.occupied.reduce(
            (m, i) =>
              m +
              (p.calendar.periods[i]
                ? p.calendar.periods[i].end - p.calendar.periods[i].start
                : 0),
            0,
          ),
        0,
      );
      if (load > f.max_minutes)
        add(
          "H10",
          `${f.id}: ${load} contact minutes exceed limit ${f.max_minutes}`,
          assigned.map((x) => x.e.id),
        );
    }
    const spread = new Map<string, string[]>();
    for (const x of rows)
      if (x.e.kind === "L") {
        const k = `${x.e.section_id}/${x.a.day}`;
        spread.set(k, [...(spread.get(k) || []), x.e.id]);
      }
    for (const ids of spread.values())
      if (ids.length > p.policies.max_theory_per_day)
        add("H11", "Theory daily spread limit exceeded", ids);
    for (const lock of p.policies.locked)
      if (!assignments.some((a) => sameAssignment(a, lock)))
        add("H13", `Locked event ${lock.event_id} moved or missing`, [
          lock.event_id,
        ]);
  }
  const rules = RULES.map(([id, label]) => ({
    id,
    label,
    status: !p
      ? "NOT_EVALUATED"
      : (id === "H12" && !p.policies.min_travel_minutes) ||
          (id === "H13" && !p.policies.locked.length) ||
          (id === "H5" && !p.baskets.length)
        ? "NOT_APPLICABLE"
        : violations.some((v) => v.rule === id)
          ? "FAIL"
          : complete
            ? "PASS"
            : "NOT_EVALUATED",
    violations: violations.filter((v) => v.rule === id).length,
  }));
  const sortedSchedule = Array.isArray(rawSchedule)
    ? [...rawSchedule].sort((a, b) =>
        canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0,
      )
    : rawSchedule;
  const problem_digest = await digest("problem", p || rawProblem);
  const schedule_digest = await digest("schedule", sortedSchedule);
  const status = complete && violations.length === 0 ? "PASS" : "FAIL";
  const payload = {
    schema_version: "1.0",
    checker_version: "ts-independent-1.0",
    status,
    complete,
    total_violations: violations.length,
    rules,
    violations,
    problem_digest,
    schedule_digest,
  };
  return {
    ...payload,
    status,
    payload_digest: await digest("audit", payload),
    issued_at: new Date().toISOString(),
    signature_status: "Unsigned integrity digest; independently recomputable",
  };
}
export function metrics(p: Problem, as: Assignment[]) {
  const valid = as.filter((a) => p.events.some((e) => e.id === a.event_id));
  let occupied = 0,
    seats = 0,
    capacity = 0;
  for (const a of valid) {
    const e = p.events.find((e) => e.id === a.event_id)!;
    occupied += e.duration;
    seats +=
      e.duration *
      e.group_ids.reduce(
        (n, id) => n + (p.groups.find((g) => g.id === id)?.size || 0),
        0,
      );
    capacity +=
      e.duration * (p.rooms.find((r) => r.id === a.room_id)?.capacity || 0);
  }
  const available = p.rooms.reduce(
    (n, r) =>
      n +
      p.calendar.days.length * p.calendar.periods.length -
      new Set(r.unavailable.map((s) => `${s.day}/${s.period}`)).size,
    0,
  );
  const syncIds = [
    ...new Set(p.events.filter((e) => e.sync_group).map((e) => e.sync_group)),
  ];
  const synchronized = syncIds.filter((s) => {
    const es = p.events.filter((e) => e.sync_group === s);
    const aa = es.map((e) => valid.find((a) => a.event_id === e.id));
    return aa.every(Boolean) && aa.every((a) => sameSlot(a!, aa[0]!));
  }).length;
  return {
    meetings: valid.length,
    required: p.events.length,
    occupied,
    roomUtil: available ? (100 * occupied) / available : 0,
    seatUtil: capacity ? (100 * seats) / capacity : 0,
    sync: syncIds.length ? (100 * synchronized) / syncIds.length : null,
    credits: p.courses
      .filter(
        (c) =>
          p.events.some((e) => e.course_id === c.id) &&
          p.events
            .filter((e) => e.course_id === c.id)
            .every((e) => valid.some((a) => a.event_id === e.id)),
      )
      .reduce((n, c) => n + c.credits, 0),
  };
}
