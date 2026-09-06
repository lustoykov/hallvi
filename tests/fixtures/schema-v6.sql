-- Captured from a fresh synthetic v6 database using db:push at 10cc4ca.
-- Kept independent of the current schema to test the real upgrade path.
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `phase_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repository_url` text NOT NULL,
	`repository_owner` text NOT NULL,
	`repository_name` text NOT NULL,
	`environment` text NOT NULL,
	`approval_mode` text NOT NULL,
	`approval_scope` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE TABLE `chat_summaries` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`covered_message_id` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`covered_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text,
	`native_session_id` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `phase_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`source_message_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`superseded_by_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`superseded_by_id`) REFERENCES `decisions`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`source_label` text NOT NULL,
	`source_url` text,
	`raw_json` text NOT NULL,
	`observed_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `phase_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`phase_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `pi_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`user_message_id` text NOT NULL,
	`assistant_message_id` text NOT NULL,
	`request_key` text NOT NULL,
	`retry_of_id` text,
	`status` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`error` text,
	`pi_calls` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `phase_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assistant_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `applications_repository_url_unique` ON `applications` (`repository_url`);

CREATE INDEX `idx_activity_workspace` ON `activity_events` (`workspace_id`,"created_at" desc);

CREATE INDEX `idx_decisions_application` ON `decisions` (`application_id`,`created_at`);

CREATE INDEX `idx_messages_chat` ON `messages` (`chat_id`,`created_at`);

CREATE INDEX `idx_observations_application_kind` ON `observations` (`application_id`,`kind`,"observed_at" desc);

CREATE INDEX `idx_pi_runs_chat` ON `pi_runs` (`chat_id`);

CREATE INDEX `idx_pi_runs_queue` ON `pi_runs` (`status`,`created_at`);

CREATE UNIQUE INDEX `phase_workspaces_application_id_phase_key_unique` ON `phase_workspaces` (`application_id`,`phase_key`);

CREATE UNIQUE INDEX `pi_runs_assistant_message_id_unique` ON `pi_runs` (`assistant_message_id`);

CREATE UNIQUE INDEX `pi_runs_chat_id_request_key_unique` ON `pi_runs` (`chat_id`,`request_key`);

CREATE UNIQUE INDEX `pi_runs_retry_of_id_unique` ON `pi_runs` (`retry_of_id`);

PRAGMA user_version = 6;
