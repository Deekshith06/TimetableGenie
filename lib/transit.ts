import { ProblemSchema, type Problem } from "./domain";
export function adaptTransit(raw: unknown): {
  problem: Problem;
  mapping: { source: string; target: string; count: number }[];
} {
  if (!raw || typeof raw !== "object")
    throw new Error("Transit input must be an object");
  const d = raw as Record<string, unknown>;
  const allowed = [
    "schema_version",
    "title",
    "provenance",
    "calendar",
    "vehicles",
    "operators",
    "passenger_groups",
    "service_types",
    "service_blocks",
    "transfer_groups",
    "policies",
    "corridors",
  ];
  if (Object.keys(d).some((k) => !allowed.includes(k)))
    throw new Error(
      "Unknown transit input fields; this adapter accepts the documented structural proxy format, not arbitrary GTFS",
    );
  const problem = ProblemSchema.parse({
    schema_version: d.schema_version,
    id: "TRANSIT_PROXY",
    title: d.title,
    institution: "Transit-derived structural scheduling proxy",
    provenance: {
      ...(d.provenance as object),
      kind: "adapted",
      description: `${(d.provenance as { description?: string })?.description || ""} Adapted without changing explicit resource-allocation constraints; not academic enrollment evidence.`,
    },
    calendar: d.calendar,
    rooms: d.vehicles,
    faculty: d.operators,
    groups: d.passenger_groups,
    courses: d.service_types,
    events: d.service_blocks,
    baskets: d.transfer_groups,
    policies: d.policies,
  });
  return {
    problem,
    mapping: [
      { source: "Vehicles", target: "Rooms", count: problem.rooms.length },
      { source: "Operators", target: "Faculty", count: problem.faculty.length },
      {
        source: "Passenger groups",
        target: "Pathways",
        count: problem.groups.length,
      },
      {
        source: "Service blocks",
        target: "Meetings",
        count: problem.events.length,
      },
      {
        source: "Transfer groups",
        target: "Elective baskets",
        count: problem.baskets.length,
      },
    ],
  };
}
