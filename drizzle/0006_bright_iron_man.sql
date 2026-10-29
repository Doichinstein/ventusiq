CREATE TABLE `webhook_attempts` (
	`delivery_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`at` integer NOT NULL,
	`http_status` integer,
	`outcome` text NOT NULL,
	`error` text,
	PRIMARY KEY(`delivery_id`, `attempt`)
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint_id` text NOT NULL,
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
CREATE INDEX `webhook_due` ON `webhook_deliveries` (`status`,`next_attempt`);--> statement-breakpoint
CREATE INDEX `webhook_delivery_endpoint` ON `webhook_deliveries` (`endpoint_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `webhook_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`label` text NOT NULL,
	`endpoint` text NOT NULL,
	`secret` text NOT NULL,
	`created_at` integer NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`last_test` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webhook_owner` ON `webhook_endpoints` (`owner`);