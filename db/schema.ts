import {
  integer,
  sqliteTable,
  text,
  real,
  index,
} from "drizzle-orm/sqlite-core";
export const problems = sqliteTable(
  "problems",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    payload: text("payload").notNull(),
    created: real("created").notNull(),
  },
  (t) => [index("problems_owner").on(t.owner)],
);
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    problem: text("problem").notNull(),
    baseline: text("baseline"),
    status: text("status").notNull(),
    result: text("result"),
    created: real("created").notNull(),
    updated: real("updated").notNull(),
    budget: integer("budget").notNull(),
  },
  (t) => [index("jobs_owner").on(t.owner)],
);
export const events = sqliteTable(
  "job_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id").notNull(),
    owner: text("owner").notNull(),
    payload: text("payload").notNull(),
    created: real("created").notNull(),
  },
  (t) => [index("events_job").on(t.jobId)],
);
