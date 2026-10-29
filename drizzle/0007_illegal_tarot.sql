CREATE TABLE `upkeep_status` (
	`id` integer PRIMARY KEY NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`outcome` text,
	`phases` text,
	`next_run` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
