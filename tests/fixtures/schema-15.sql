CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repository_url` text NOT NULL,
	`repository_owner` text NOT NULL,
	`repository_name` text NOT NULL,
	`repository_id` integer,
	`repository_check` text,
	`permission_mode` text DEFAULT 'pi-decides' NOT NULL,
	`host` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'side' NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`current_response_id` text,
	`native_session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `one_main_conversation` ON `conversations` (`application_id`) WHERE "conversations"."kind" = 'main';
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`blocks` text DEFAULT '[]' NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`response_to` text,
	`request_key` text,
	`retry_of_id` text,
	`error` text,
	`pi_calls` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `messages_retry_of_id_unique` ON `messages` (`retry_of_id`);
CREATE INDEX `messages_conversation` ON `messages` (`conversation_id`,`created_at`);
CREATE UNIQUE INDEX `message_request` ON `messages` (`conversation_id`,`request_key`);
CREATE TABLE `saved_information` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`evidence` text NOT NULL,
	`established_at` text,
	`presentation` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`retired_at` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `information_application` ON `saved_information` (`application_id`);
