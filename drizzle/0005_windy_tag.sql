CREATE TABLE `place_libraries` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` text NOT NULL,
	`places` text NOT NULL,
	`updated_at` integer NOT NULL
);
