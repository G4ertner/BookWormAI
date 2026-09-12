CREATE TABLE `public_audio_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'openrouter' NOT NULL,
	`voice` text DEFAULT 'marin' NOT NULL,
	`openrouter_key` text DEFAULT '' NOT NULL,
	`openai_key` text DEFAULT '' NOT NULL,
	`expires_at` integer NOT NULL
);
