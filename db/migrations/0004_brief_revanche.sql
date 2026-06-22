CREATE TABLE `accounts` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`email_verified` integer,
	`image` text,
	`role` text DEFAULT 'adult' NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `learners` ADD `owner_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `learners` ADD `username` text;--> statement-breakpoint
ALTER TABLE `learners` ADD `pin_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `learners_username_unique` ON `learners` (`username`);--> statement-breakpoint
CREATE INDEX `learners_owner` ON `learners` (`owner_id`);