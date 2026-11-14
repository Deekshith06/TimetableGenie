"use client";
import { useState } from "react";
import Modal from "./Modal";
import { ProblemSchema, type Problem } from "@/lib/domain";
export type EntityKey =
  "courses" | "rooms" | "faculty" | "groups" | "events" | "baskets";
export default function EntityEditor({
  problem: p,
  kind,
  index,
  onSave,
  onClose,
}: {
  problem: Problem;
  kind: EntityKey;
  index: number | null;
  onSave: (p: Problem) => void;
  onClose: () => void;
}) {
  const initial = (): Record<string, unknown> => {
    if (index !== null) return p[kind][index];
    const id = `NEW_${kind.toUpperCase()}_${p[kind].length + 1}`;
    if (kind === "rooms")
      return {
        id,
        name: "New room",
        type: "LECTURE_HALL",
        capacity: 40,
        building: "Main",
        equipment: ["projector"],
        unavailable: [],
      };
    if (kind === "faculty")
      return {
        id,
        name: "New faculty member",
        department: "Department",
        max_minutes: 720,
        course_ids: [],
        unavailable: [],
        preferred: [],
      };
    if (kind === "groups")
      return {
        id,
        name: "New pathway",
        size: 20,
        program: "Undergraduate",
        major: "",
        minor: "",
        mdc: "",
        unavailable: [],
      };
    if (kind === "courses")
      return {
        id,
        title: "New course",
        category: "DSC",
        credits: 2,
        profile: "Institution-defined",
      };
    if (kind === "baskets")
      return {
        id,
        name: "New basket",
        course_ids: [p.courses[0].id],
        reserved_groups: [],
        allowed_starts: [],
      };
    return {
      id,
      course_id: p.courses[0].id,
      section_id: "NEW_SECTION",
      kind: "L",
      duration: 1,
      faculty_ids: [p.faculty[0].id],
      group_ids: [p.groups[0].id],
      room_types: ["LECTURE_HALL"],
      equipment: ["projector"],
      allowed_starts: null,
      basket_id: null,
      sync_group: null,
    };
  };
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState(""),
    [advanced, setAdvanced] = useState(false),
    [raw, setRaw] = useState("");
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  function save(remove = false) {
    try {
      const data = structuredClone(p);
      const arr = data[kind] as unknown[];
      if (remove && index !== null) arr.splice(index, 1);
      else if (index === null) arr.push(advanced ? JSON.parse(raw) : draft);
      else arr[index] = advanced ? JSON.parse(raw) : draft;
      onSave(ProblemSchema.parse(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const checks = (key: string, items: { id: string; name: string }[]) => (
    <div className="multi-check">
      {items.map((x) => (
        <label key={x.id}>
          <input
            type="checkbox"
            checked={(draft[key] as string[]).includes(x.id)}
            onChange={(e) =>
              set(
                key,
                e.target.checked
                  ? [...(draft[key] as string[]), x.id]
                  : (draft[key] as string[]).filter((id) => id !== x.id),
              )
            }
          />
          {x.name}
        </label>
      ))}
    </div>
  );
  function grid(key: string) {
    const xs = (draft[key] || []) as { day: number; period: number }[];
    return (
      <div
        className="availability-grid"
        style={{
          gridTemplateColumns: `30px repeat(${p.calendar.days.length},1fr)`,
        }}
      >
        <span />
        {p.calendar.days.map((d) => (
          <b key={d}>{d.slice(0, 3)}</b>
        ))}
        {p.calendar.periods.flatMap((_, t) => [
          <span key={`p${t}`}>P{t + 1}</span>,
          ...p.calendar.days.map((_, d) => (
            <button
              type="button"
              key={`${d}/${t}`}
              className={
                xs.some((x) => x.day === d && x.period === t) ? "checked" : ""
              }
              aria-label={`${key} ${p.calendar.days[d]} period ${t + 1}`}
              onClick={() =>
                set(
                  key,
                  xs.some((x) => x.day === d && x.period === t)
                    ? xs.filter((x) => x.day !== d || x.period !== t)
                    : [...xs, { day: d, period: t }],
                )
              }
            >
              {xs.some((x) => x.day === d && x.period === t) ? "✓" : ""}
            </button>
          )),
        ])}
      </div>
    );
  }
  return (
    <Modal
      title={`${index === null ? "Add" : "Edit"} ${kind === "groups" ? "student pathway" : kind === "events" ? "session" : kind.replace(/s$/, "")}`}
      subtitle="Changes create a draft. Generate a new timetable to apply them."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="form-grid">
          {[
            "id",
            ...Object.keys(draft).filter((k) =>
              [
                "name",
                "title",
                "section_id",
                "department",
                "building",
                "program",
                "major",
                "minor",
                "mdc",
                "profile",
              ].includes(k),
            ),
          ].map((k) => (
            <label key={k}>
              {k.replace(/_/g, " ")}
              <input
                required={k === "id" || k === "title" || k === "name"}
                disabled={k === "id" && index !== null}
                value={String(draft[k] ?? "")}
                onChange={(e) => set(k, e.target.value)}
              />
            </label>
          ))}
          {["capacity", "size", "max_minutes", "credits", "duration"]
            .filter((k) => k in draft)
            .map((k) => (
              <label key={k}>
                {k === "max_minutes"
                  ? "Weekly workload cap (minutes)"
                  : k.replace(/_/g, " ")}
                <input
                  type="number"
                  min={k === "duration" ? 1 : 0}
                  step={k === "credits" ? 0.5 : 1}
                  value={String(draft[k])}
                  onChange={(e) => set(k, Number(e.target.value))}
                />
              </label>
            ))}
          {"category" in draft && (
            <label>
              Category
              <select
                value={String(draft.category)}
                onChange={(e) => set("category", e.target.value)}
              >
                {["DSC", "MIC", "MDC", "AEC", "SEC", "VAC", "INT"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {"type" in draft && (
            <label>
              Room type
              <select
                value={String(draft.type)}
                onChange={(e) => set("type", e.target.value)}
              >
                {[
                  "LECTURE_HALL",
                  "COMPUTER_LAB",
                  "SKILL_STUDIO",
                  "SEMINAR_ROOM",
                  "LANGUAGE_LAB",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {"kind" in draft && (
            <label>
              Session type
              <select
                value={String(draft.kind)}
                onChange={(e) => set("kind", e.target.value)}
              >
                {["L", "T", "P", "INT"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {"course_id" in draft && (
            <label>
              Course
              <select
                value={String(draft.course_id)}
                onChange={(e) => set("course_id", e.target.value)}
              >
                {p.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {"basket_id" in draft && (
            <label>
              Basket
              <select
                value={String(draft.basket_id || "")}
                onChange={(e) => set("basket_id", e.target.value || null)}
              >
                <option value="">No basket</option>
                {p.baskets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {"sync_group" in draft && (
            <label>
              Synchronization group
              <input
                value={String(draft.sync_group || "")}
                onChange={(e) => set("sync_group", e.target.value || null)}
              />
            </label>
          )}
          {["equipment", "room_types"]
            .filter((k) => k in draft)
            .map((k) => (
              <label key={k}>
                {k.replace(/_/g, " ")} (comma-separated)
                <input
                  value={(draft[k] as string[]).join(", ")}
                  onChange={(e) =>
                    set(
                      k,
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </label>
            ))}
        </div>
        {"course_ids" in draft && (
          <fieldset>
            <legend>
              {kind === "faculty" ? "Qualified courses" : "Alternative courses"}
            </legend>
            {checks(
              "course_ids",
              p.courses.map((c) => ({
                id: c.id,
                name: c.id + " · " + c.title,
              })),
            )}
          </fieldset>
        )}
        {"faculty_ids" in draft && (
          <fieldset>
            <legend>Eligible faculty (one assigned per meeting)</legend>
            {checks(
              "faculty_ids",
              p.faculty.map((f) => ({ id: f.id, name: f.name })),
            )}
          </fieldset>
        )}
        {["group_ids", "reserved_groups"]
          .filter((k) => k in draft)
          .map((k) => (
            <fieldset key={k}>
              <legend>
                {k === "group_ids"
                  ? "Enrolled pathways"
                  : "Reserve windows for pathways"}
              </legend>
              {checks(
                k,
                p.groups.map((g) => ({ id: g.id, name: g.name })),
              )}
            </fieldset>
          ))}
        {["unavailable", "preferred"]
          .filter((k) => k in draft)
          .map((k) => (
            <fieldset key={k}>
              <legend>
                {k === "unavailable"
                  ? "Unavailable periods"
                  : "Preferred periods"}
              </legend>
              {grid(k)}
            </fieldset>
          ))}
        {"allowed_starts" in draft && (
          <fieldset>
            <legend>Allowed starting periods</legend>
            {kind === "events" && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={draft.allowed_starts !== null}
                  onChange={(e) =>
                    set("allowed_starts", e.target.checked ? [] : null)
                  }
                />
                Restrict to selected starts
              </label>
            )}
            {draft.allowed_starts !== null && grid("allowed_starts")}
          </fieldset>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            if (!advanced) setRaw(JSON.stringify(draft, null, 2));
            else
              try {
                setDraft(JSON.parse(raw));
              } catch {
                setError("Fix JSON before returning to the form");
                return;
              }
            setAdvanced(!advanced);
          }}
        >
          {advanced ? "Return to form" : "Advanced JSON"}
        </button>
        {advanced && (
          <textarea
            aria-label="Advanced entity JSON"
            className="json-editor"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
          />
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          {index !== null && (
            <button
              type="button"
              className="danger-button"
              onClick={() => save(true)}
            >
              Delete
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">Save draft</button>
        </div>
      </form>
    </Modal>
  );
}
