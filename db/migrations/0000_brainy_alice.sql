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
	`decomposition` text,
	`hsk_level` integer,
	`freq_rank` integer,
	`is_component` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_char_unique` ON `characters` (`char`);--> statement-breakpoint
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