CREATE TABLE `watch_events` (
	`id` text PRIMARY KEY NOT NULL,
	`watch_id` text NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watch_event_time` ON `watch_events` (`watch_id`,`at`);--> statement-breakpoint
CREATE TABLE `watches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`label` text NOT NULL,
	`point` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`next_check` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`checked_at` integer,
	`error` text,
	`baseline` text,
	`sequence` integer DEFAULT 0 NOT NULL,
	`feed_hash` text
);
--> statement-breakpoint
CREATE INDEX `watch_owner` ON `watches` (`owner`);--> statement-breakpoint
CREATE INDEX `watch_due` ON `watches` (`enabled`,`next_check`);