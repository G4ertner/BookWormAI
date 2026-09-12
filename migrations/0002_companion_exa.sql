CREATE TABLE `companion_exa_settings` (
  `user_id` text PRIMARY KEY NOT NULL,
  `exa_key` text DEFAULT '' NOT NULL,
  `expires_at` integer NOT NULL
);
