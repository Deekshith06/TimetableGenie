/* Bounded finite-domain search. This is intentionally not labelled CP-SAT.
 * It never declares optimality/infeasibility after a time/node limit. */
const slot = (a, b) => a.day === b.day && a.period === b.period;
const eq = (a, b) =>
  a &&
  b &&
  a.event_id === b.event_id &&
  a.room_id === b.room_id &&
  a.faculty_id === b.faculty_id &&
  slot(a, b);
function domains(p, e, deadline = Infinity) {
  const result = [],
    periods = p.calendar.periods,
    groups = new Map(p.groups.map((g) => [g.id, g])),
    size = e.group_ids.reduce((n, g) => n + groups.get(g).size, 0),
    basket = p.baskets.find((b) => b.id === e.basket_id),
    lock = p.policies.locked.find((a) => a.event_id === e.id);
  for (let d = 0; d < p.calendar.days.length; d++)
    for (let t = 0; t + e.duration <= periods.length; t++) {
      const s = { day: d, period: t },
        occ = Array.from({ length: e.duration }, (_, k) => t + k);
      if (
        occ.some((v, k) => k && periods[v - 1].end !== periods[v].start) ||
        (e.allowed_starts !== null &&
          !e.allowed_starts.some((a) => slot(a, s))) ||
        (basket && !basket.allowed_starts.some((a) => slot(a, s))) ||
        e.group_ids.some((g) =>
          occ.some((period) =>
            groups
              .get(g)
              .unavailable.some((a) => a.day === d && a.period === period),
          ),
        )
      )
        continue;
      for (const r of p.rooms) {
        if (
          r.capacity < size ||
          !e.room_types.includes(r.type) ||
          e.equipment.some((q) => !r.equipment.includes(q)) ||
          occ.some((period) =>
            r.unavailable.some((a) => a.day === d && a.period === period),
          )
        )
          continue;
        for (const f of p.faculty) {
          if (
            !e.faculty_ids.includes(f.id) ||
            !f.course_ids.includes(e.course_id) ||
            occ.some((period) =>
              f.unavailable.some((a) => a.day === d && a.period === period),
            )
          )
            continue;
          const a = {
            event_id: e.id,
            room_id: r.id,
            faculty_id: f.id,
            day: d,
            period: t,
          };
          if (!lock || eq(a, lock)) result.push(a);
          if (result.length > 20000 || performance.now() > deadline)
            throw new Error(
              "Browser preprocessing budget exceeded. Use the local CP-SAT service or reduce the instance.",
            );
        }
      }
    }
  return result;
}
export function score(p, as) {
  const es = new Map(p.events.map((e) => [e.id, e])),
    rs = new Map(p.rooms.map((r) => [r.id, r])),
    fs = new Map(p.faculty.map((f) => [f.id, f])),
    gs = new Map(p.groups.map((g) => [g.id, g])),
    w = p.policies.weights,
    resources = new Map(),
    loads = new Map();
  let n = 0;
  for (const a of as) {
    const e = es.get(a.event_id),
      r = rs.get(a.room_id),
      f = fs.get(a.faculty_id);
    n +=
      e.duration *
      w.seat_slack *
      (r.capacity - e.group_ids.reduce((v, g) => v + gs.get(g).size, 0));
    for (let t = a.period; t < a.period + e.duration; t++) {
      if (f.preferred.some((s) => s.day === a.day && s.period === t))
        n -= w.preference;
      for (const k of ["f:" + f.id, ...e.group_ids.map((g) => "g:" + g)]) {
        const key = k + "/" + a.day;
        if (!resources.has(key)) resources.set(key, new Map());
        resources.get(key).set(t, r.building);
      }
    }
    const minutes =
      p.calendar.periods[a.period].end - p.calendar.periods[a.period].start;
    loads.set(f.id, (loads.get(f.id) || 0) + e.duration * minutes);
  }
  for (const occ of resources.values()) {
    const ts = [...occ.keys()].sort((a, b) => a - b);
    n += w.idle * (ts.at(-1) - ts[0] + 1 - ts.length);
    for (let i = 1; i < ts.length; i++)
      if (occ.get(ts[i - 1]) !== occ.get(ts[i])) n += w.travel;
  }
  const ls = p.faculty.map((f) => loads.get(f.id) || 0);
  return n + w.balance * (Math.max(...ls) - Math.min(...ls));
}
export function solveBrowser(
  p,
  {
    budget_ms = 2000,
    max_nodes = 150000,
    baseline = null,
    progress = () => {},
    stop_first = false,
  } = {},
) {
  const started = performance.now(),
    es = new Map(p.events.map((e) => [e.id, e])),
    rs = new Map(p.rooms.map((r) => [r.id, r])),
    fs = new Map(p.faculty.map((f) => [f.id, f])),
    gs = new Map(p.groups.map((g) => [g.id, g])),
    D = p.calendar.days.length,
    P = p.calendar.periods.length,
    w = p.policies.weights;
  const result = {
    status: "UNKNOWN",
    assignments: [],
    engine: "Browser finite-domain search 1.0",
    elapsed_ms: 0,
    branches: 0,
    objective: null,
    optimal: false,
    diagnostics: [],
  };
  if (p.events.length > 100) {
    result.diagnostics = [
      "Browser engine is limited to 100 events. Use the local CP-SAT service for larger instances.",
    ];
    return result;
  }
  let ds;
  try {
    ds = new Map(
      p.events.map((e) => [
        e.id,
        domains(p, e, started + Math.max(1000, budget_ms)),
      ]),
    );
  } catch (e) {
    result.elapsed_ms = Math.round(performance.now() - started);
    result.diagnostics = [String(e)];
    return result;
  }
  const empty = p.events.find((e) => !ds.get(e.id).length);
  if (empty) {
    result.status = "INFEASIBLE";
    result.diagnostics = [
      empty.id +
        " has no capacity-, equipment-, availability-, calendar-, basket- and lock-compatible placement.",
    ];
    return result;
  }
  const linear = (a) => {
    const e = es.get(a.event_id),
      r = rs.get(a.room_id),
      f = fs.get(a.faculty_id);
    return (
      w.seat_slack *
        e.duration *
        (r.capacity - e.group_ids.reduce((n, g) => n + gs.get(g).size, 0)) -
      w.preference *
        Array.from({ length: e.duration }, (_, j) => a.period + j).filter((t) =>
          f.preferred.some((s) => s.day === a.day && s.period === t),
        ).length
    );
  };
  const span = [...ds.values()].reduce((n, aa) => {
    const cs = aa.map(linear);
    return n + Math.max(...cs) - Math.min(...cs);
  }, 0);
  const dominance =
    1 +
    span +
    (p.faculty.length + p.groups.length) *
      D *
      (w.idle * P + w.travel * (P - 1)) +
    w.balance * 10080;
  const old = new Map((baseline || []).map((a) => [a.event_id, a]));
  const placeCost = (a) =>
    linear(a) +
    (baseline && old.has(a.event_id) && !eq(old.get(a.event_id), a)
      ? dominance
      : 0);
  const overlap = (a, e, b, h) =>
    a.day === b.day &&
    a.period < b.period + h.duration &&
    b.period < a.period + e.duration;
  function valid(add, current) {
    const all = [...current];
    for (const a of add) {
      const e = es.get(a.event_id),
        r = rs.get(a.room_id),
        f = fs.get(a.faculty_id);
      let load =
          e.duration *
          (p.calendar.periods[0].end - p.calendar.periods[0].start),
        theory = e.kind === "L" ? 1 : 0;
      for (const b of all) {
        const h = es.get(b.event_id),
          s = rs.get(b.room_id),
          shared = e.group_ids.some((g) => h.group_ids.includes(g)),
          ov = overlap(a, e, b, h);
        if (a.faculty_id === b.faculty_id)
          load +=
            h.duration *
            (p.calendar.periods[0].end - p.calendar.periods[0].start);
        if (
          e.kind === "L" &&
          h.kind === "L" &&
          e.section_id === h.section_id &&
          a.day === b.day
        )
          theory++;
        if (
          ov &&
          (a.room_id === b.room_id || a.faculty_id === b.faculty_id || shared)
        )
          return false;
        if (ov && e.basket_id !== h.basket_id) {
          const eb = p.baskets.find((x) => x.id === e.basket_id),
            hb = p.baskets.find((x) => x.id === h.basket_id);
          if (
            (eb && h.group_ids.some((g) => eb.reserved_groups.includes(g))) ||
            (hb && e.group_ids.some((g) => hb.reserved_groups.includes(g)))
          )
            return false;
        }
        if (
          !ov &&
          a.day === b.day &&
          p.policies.min_travel_minutes &&
          r.building !== s.building &&
          (shared || a.faculty_id === b.faculty_id)
        ) {
          const left = a.period < b.period ? { a, e } : { a: b, e: h },
            right = a.period < b.period ? { a: b, e: h } : { a, e };
          if (
            p.calendar.periods[right.a.period].start -
              p.calendar.periods[left.a.period + left.e.duration - 1].end <
            p.policies.min_travel_minutes
          )
            return false;
        }
      }
      if (load > f.max_minutes || theory > p.policies.max_theory_per_day)
        return false;
      all.push(a);
    }
    return true;
  }
  const clusters = new Map();
  for (const e of p.events) {
    const key = e.sync_group || e.id;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(e);
  }
  const bundles = [];
  for (const [id, ee] of clusters) {
    const options = [];
    let preprocessingLimit = false;
    function combine(i, acc) {
      if (preprocessingLimit) return;
      if (
        options.length > 20000 ||
        performance.now() > started + Math.max(1000, budget_ms)
      ) {
        preprocessingLimit = true;
        return;
      }
      if (i === ee.length) {
        if (valid(acc, [])) options.push(acc);
        return;
      }
      for (const a of ds.get(ee[i].id))
        if (!acc.length || slot(a, acc[0])) combine(i + 1, [...acc, a]);
    }
    combine(0, []);
    if (preprocessingLimit) {
      result.diagnostics = [
        "Synchronization preprocessing exceeded the browser budget. No infeasibility conclusion was reached.",
      ];
      result.elapsed_ms = Math.round(performance.now() - started);
      return result;
    }
    if (!options.length) {
      result.status = "INFEASIBLE";
      result.diagnostics = [
        "Synchronization " + id + " has no jointly compatible placements.",
      ];
      return result;
    }
    options.sort(
      (a, b) =>
        a.reduce((n, x) => n + placeCost(x), 0) -
        b.reduce((n, x) => n + placeCost(x), 0),
    );
    bundles.push({
      id,
      options,
      min: Math.min(
        ...options.map((aa) => aa.reduce((n, a) => n + placeCost(a), 0)),
      ),
    });
  }
  let best = Infinity,
    bestAs = [],
    branches = 0,
    limited = false,
    last = 0;
  const deadline = started + Math.max(10, Math.min(budget_ms, 10000));
  function dfs(remaining, current, partial) {
    branches++;
    const now = performance.now();
    if (now >= deadline || branches > max_nodes) {
      limited = true;
      return;
    }
    if (now - last > 200) {
      progress({
        type: "search",
        branches,
        elapsed_ms: Math.round(now - started),
        incumbent: bestAs.length ? score(p, bestAs) : null,
      });
      last = now;
    }
    if (!remaining.length) {
      const quality = score(p, current),
        changed = baseline
          ? current.filter(
              (a) => old.has(a.event_id) && !eq(old.get(a.event_id), a),
            ).length
          : 0,
        total = quality + dominance * changed;
      if (total < best) {
        best = total;
        bestAs = current.map((a) => ({ ...a }));
        progress({
          type: "incumbent",
          branches,
          elapsed_ms: Math.round(now - started),
          objective: quality,
          changed,
        });
      }
      return;
    }
    if (partial + remaining.reduce((n, b) => n + b.min, 0) >= best) return;
    let choice = null,
      available = null;
    for (const b of remaining) {
      const aa = b.options.filter((option) => valid(option, current));
      if (!aa.length) return;
      if (!available || aa.length < available.length) {
        choice = b;
        available = aa;
      }
      if (available.length === 1) break;
      if (performance.now() > deadline) {
        limited = true;
        return;
      }
    }
    const rest = remaining.filter((b) => b !== choice);
    for (const aa of available) {
      dfs(
        rest,
        [...current, ...aa],
        partial + aa.reduce((n, a) => n + placeCost(a), 0),
      );
      if (limited || (stop_first && bestAs.length)) return;
    }
  }
  dfs(bundles, [], 0);
  result.assignments = bestAs;
  result.branches = branches;
  result.elapsed_ms = Math.round(performance.now() - started);
  result.objective = bestAs.length ? score(p, bestAs) : null;
  result.status = bestAs.length
    ? limited || stop_first
      ? "FEASIBLE"
      : "OPTIMAL"
    : limited
      ? "UNKNOWN"
      : "INFEASIBLE";
  result.optimal = result.status === "OPTIMAL";
  if (result.status === "UNKNOWN")
    result.diagnostics = [
      "The time/node budget ended without a solution. This is not proof of infeasibility.",
    ];
  if (result.status === "INFEASIBLE")
    result.diagnostics = [
      "Exhaustive search found no schedule satisfying the declared constraints. No minimal conflict core was computed.",
    ];
  if (baseline && bestAs.length) {
    result.changed_count = bestAs.filter(
      (a) => !eq(old.get(a.event_id), a),
    ).length;
    result.unchanged_percent =
      (100 * (bestAs.length - result.changed_count)) / bestAs.length;
  }
  return result;
}
if (typeof self !== "undefined" && typeof Window === "undefined")
  self.onmessage = (event) => {
    try {
      const { problem, options } = event.data;
      const result = solveBrowser(problem, {
        ...options,
        progress: (data) => self.postMessage({ type: "progress", data }),
      });
      self.postMessage({ type: "result", result });
    } catch (error) {
      self.postMessage({
        type: "result",
        result: {
          status: "MODEL_INVALID",
          assignments: [],
          engine: "Browser finite-domain search 1.0",
          elapsed_ms: 0,
          branches: 0,
          objective: null,
          optimal: false,
          diagnostics: [String(error)],
        },
      });
    }
  };
