CREATE TABLE `change_batches` (
	`at` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checks` (
	`dataset` text NOT NULL,
	`at` integer NOT NULL,
	`revision` text NOT NULL,
	PRIMARY KEY(`dataset`, `at`)
);
--> statement-breakpoint
CREATE TABLE `datasets` (
	`name` text PRIMARY KEY NOT NULL,
	`revision` text,
	`last_success` integer,
	`next_fetch` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `revisions` (
	`dataset` text NOT NULL,
	`revision` text NOT NULL,
	`first_seen` integer NOT NULL,
	`issued_at` text,
	`payload` text NOT NULL,
	PRIMARY KEY(`dataset`, `revision`)
);
--> statement-breakpoint
CREATE INDEX `revision_time` ON `revisions` (`dataset`,`first_seen`);