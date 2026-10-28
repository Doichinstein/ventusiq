CREATE TABLE `event_collections` (
	`at` integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_heads` (
	`id` text PRIMARY KEY NOT NULL,
	`cap_id` text NOT NULL,
	`revision` text NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`present` integer,
	`name` text NOT NULL,
	`area` text NOT NULL,
	`message_type` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `event_first_seen` ON `event_heads` (`first_seen`,`id`);--> statement-breakpoint
CREATE TABLE `event_links` (
	`source` text NOT NULL,
	`target` text NOT NULL,
	`target_cap` text NOT NULL,
	`first_seen` integer NOT NULL,
	PRIMARY KEY(`source`, `target`)
);
--> statement-breakpoint
CREATE INDEX `event_link_target` ON `event_links` (`target`);--> statement-breakpoint
CREATE TABLE `event_revisions` (
	`id` text NOT NULL,
	`revision` text NOT NULL,
	`collected_at` integer NOT NULL,
	`issued_at` text,
	`payload` text NOT NULL,
	PRIMARY KEY(`id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `event_transitions` (
	`id` text NOT NULL,
	`at` integer NOT NULL,
	`revision` text NOT NULL,
	`present` integer,
	`origin` text NOT NULL,
	PRIMARY KEY(`id`, `at`)
);
