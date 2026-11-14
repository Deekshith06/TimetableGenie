CREATE TABLE `job_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`owner` text NOT NULL,
	`payload` text NOT NULL,
	`created` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_job` ON `job_events` (`job_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`problem` text NOT NULL,
	`baseline` text,
	`status` text NOT NULL,
	`result` text,
	`created` real NOT NULL,
	`updated` real NOT NULL,
	`budget` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_owner` ON `jobs` (`owner`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`payload` text NOT NULL,
	`created` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `problems_owner` ON `problems` (`owner`);