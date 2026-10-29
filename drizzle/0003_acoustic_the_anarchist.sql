CREATE TABLE `push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`watch_id` text,
	`event_id` text,
	`created_at` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`accepted_at` integer,
	`http_status` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `push_due` ON `push_deliveries` (`status`,`next_attempt`);--> statement-breakpoint
CREATE INDEX `push_delivery_subscription` ON `push_deliveries` (`subscription_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`label` text NOT NULL,
	`endpoint` text NOT NULL,
	`keys` text NOT NULL,
	`created_at` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`error` text,
	`last_test` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_owner` ON `push_subscriptions` (`owner`);