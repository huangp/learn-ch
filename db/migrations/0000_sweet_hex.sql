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
CREATE TABLE `char_components` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`char_id` integer NOT NULL,
	`component_id` integer NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`char_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`component_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `char_comp_uniq` ON `char_components` (`char_id`,`component_id`,`role`);--> statement-breakpoint
CREATE INDEX `char_comp_child` ON `char_components` (`char_id`);--> statement-breakpoint
CREATE INDEX `char_comp_parent` ON `char_components` (`component_id`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`char` text NOT NULL,
	`pinyin` text,
	`gloss` text,
	`radical` text,
	`stroke_count` integer,
	`stroke_data` text,
	`decomposition` text,
	`hsk_level` integer,
	`freq_rank` integer,
	`is_component` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_char_unique` ON `characters` (`char`);--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`learner_id` integer NOT NULL,
	`char_id` integer,
	`type` text NOT NULL,
	`value` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`char_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `learner_chars` (
	`learner_id` integer NOT NULL,
	`char_id` integer NOT NULL,
	`status` text NOT NULL,
	`stability` real,
	`difficulty` real,
	`due` integer,
	`last_review` integer,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`exposures` integer DEFAULT 0 NOT NULL,
	`reveals` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`learner_id`, `char_id`),
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`char_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `learner_chars_due` ON `learner_chars` (`learner_id`,`due`);--> statement-breakpoint
CREATE TABLE `learners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text,
	`display_name` text NOT NULL,
	`username` text,
	`pin_hash` text,
	`created_at` integer NOT NULL,
	`settings` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learners_username_unique` ON `learners` (`username`);--> statement-breakpoint
CREATE INDEX `learners_owner` ON `learners` (`owner_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`title` text,
	`hanzi` text,
	`annotated` text,
	`target_chars` text,
	`due_chars_used` text,
	`theme` text,
	`parent_story_id` integer,
	`meta` text,
	`created_at` integer NOT NULL,
	`graded_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
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
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
--> statement-breakpoint
CREATE TABLE `words` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`word` text NOT NULL,
	`chars` text,
	`pinyin` text,
	`gloss` text,
	`hsk_level` integer,
	`freq_rank` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `words_word_unique` ON `words` (`word`);--> statement-breakpoint
CREATE INDEX `words_freq` ON `words` (`freq_rank`);--> statement-breakpoint
CREATE INDEX `words_hsk` ON `words` (`hsk_level`);