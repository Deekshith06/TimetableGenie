import type { Problem, Assignment } from "@/lib/domain";
/** A source-derived weekly grid, using the reference's exploded linework. */
export default function PlanningSketch({
  problem: p,
  assignments,
}: {
  problem: Problem;
  assignments: Assignment[];
}) {
  const group = p.groups[0]?.id;
  const occupied = new Set<string>();
  for (const a of assignments) {
    const e = p.events.find((e) => e.id === a.event_id);
    if (e?.group_ids.includes(group))
      for (let t = a.period; t < a.period + e.duration; t++)
        occupied.add(`${a.day}/${t}`);
  }
  const w = 150,
    h = 65,
    dx = w / p.calendar.days.length,
    dy = h / p.calendar.periods.length;
  return (
    <svg className="hero-sketch" viewBox="0 0 300 115" aria-hidden="true">
      <defs>
        <pattern
          id="sketch-hatch"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="5" stroke="#aaa" strokeWidth=".5" />
        </pattern>
      </defs>
      <g transform="matrix(1 .12 -.52 .58 77 26)">
        <rect
          x="0"
          y="28"
          width={w}
          height={h}
          rx="4"
          fill="#fafafa"
          stroke="#b5b5b5"
          strokeWidth=".8"
        />
        <rect
          x="0"
          y="14"
          width={w}
          height={h}
          rx="4"
          fill="#f3f3f3"
          stroke="#999"
          strokeWidth=".8"
        />
        {[
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ].map(([x, y], i) => (
          <line
            key={i}
            x1={x}
            y1={y - 8}
            x2={x}
            y2={y + 34}
            stroke="#999"
            strokeDasharray="3 3"
            strokeWidth=".6"
          />
        ))}
        <rect
          x="0"
          y="0"
          width={w}
          height={h}
          rx="4"
          fill="#fff"
          stroke="#555"
          strokeWidth="1"
        />
        {p.calendar.days.flatMap((_, d) =>
          p.calendar.periods.map((__, t) => (
            <rect
              key={`${d}/${t}`}
              x={d * dx + 3}
              y={t * dy + 2}
              width={dx - 6}
              height={dy - 4}
              rx="1"
              fill={occupied.has(`${d}/${t}`) ? "#cfcfcf" : "#fafafa"}
              stroke={occupied.has(`${d}/${t}`) ? "#999" : "#ddd"}
              strokeWidth=".5"
            />
          )),
        )}
        <rect
          x="0"
          y="28"
          width={w}
          height={h}
          rx="4"
          fill="none"
          stroke="#b5b5b5"
          strokeWidth=".5"
          strokeDasharray="3 3"
        />
      </g>
      <path
        d="M77 18V10H226V30 M67 88L52 99H21"
        fill="none"
        stroke="#999"
        strokeWidth=".6"
      />
      <path d="M77 10l4-2v4zM226 10l-4-2v4z" fill="#777" />
      <text
        x="151"
        y="7"
        textAnchor="middle"
        fontSize="5.5"
        fill="#777"
        fontFamily="monospace"
        letterSpacing=".7"
      >
        {p.calendar.days.length} DAYS × {p.calendar.periods.length} PERIODS
      </text>
      <text
        x="22"
        y="109"
        fontSize="5.5"
        fill="#777"
        fontFamily="monospace"
        letterSpacing=".6"
      >
        PATHWAY / ALLOCATION VIEW
      </text>
      <path d="M258 47h12m-6-6v12" stroke="#aaa" strokeWidth=".6" />
      <circle
        cx="264"
        cy="47"
        r="4"
        stroke="#aaa"
        fill="none"
        strokeWidth=".6"
      />
    </svg>
  );
}
