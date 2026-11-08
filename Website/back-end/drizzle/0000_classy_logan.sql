CREATE TABLE `feed_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observation_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`observation_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reviews_observation_idx` ON `observation_reviews` (`observation_id`,`id`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`borough_code` text NOT NULL,
	`place_name` text NOT NULL,
	`attribute` text NOT NULL,
	`value` text NOT NULL,
	`scope` text NOT NULL,
	`observed_at` text NOT NULL,
	`evidence_url` text NOT NULL,
	`notes` text NOT NULL,
	`contributor_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `observations_place_idx` ON `observations` (`place_id`);--> statement-breakpoint
CREATE INDEX `observations_user_idx` ON `observations` (`contributor_id`,`created_at`);