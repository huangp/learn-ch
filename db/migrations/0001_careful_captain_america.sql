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
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`settings` text
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
	FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON UPDATE no action ON DELETE cascade
);
