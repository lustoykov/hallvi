CREATE TABLE `acceptance_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`rationale` text NOT NULL,
	`steps_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`digest` text NOT NULL,
	`contract_id` text NOT NULL,
	`contract_version` integer NOT NULL,
	`source_message_id` text,
	`pi_run_id` text,
	`accepted_at` text,
	`accepted_by` text,
	`superseded_by_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `phase_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`superseded_by_id`) REFERENCES `acceptance_checks`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `phase_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `application_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`version` integer NOT NULL,
	`profile_id` text NOT NULL,
	`profile_version` integer NOT NULL,
	`commit_sha` text NOT NULL,
	`source_message_id` text NOT NULL,
	`body_json` text NOT NULL,
	`superseded_by_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `phase_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`superseded_by_id`) REFERENCES `application_contracts`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `application_operation_processes` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`pid` integer NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `application_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `application_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`record` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
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
	`application_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text,
	`native_session_id` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `phase_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `conformance_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`origin` text NOT NULL,
	`status` text NOT NULL,
	`base_sha` text NOT NULL,
	`contract_id` text NOT NULL,
	`contract_version` integer NOT NULL,
	`summary` text NOT NULL,
	`changes_json` text NOT NULL,
	`files_digest` text NOT NULL,
	`mapping_json` text NOT NULL,
	`request_approval` integer DEFAULT true NOT NULL,
	`source_message_id` text,
	`pi_run_id` text,
	`approval_json` text,
	`publication_json` text,
	`publication_error` text,
	`external_json` text,
	`candidate_json` text,
	`verification_json` text,
	`superseded_by_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `phase_workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`superseded_by_id`) REFERENCES `conformance_proposals`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `conformance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`source_json` text NOT NULL,
	`proposal_id` text,
	`contract_id` text NOT NULL,
	`contract_version` integer NOT NULL,
	`profile_id` text NOT NULL,
	`profile_version` integer NOT NULL,
	`definition_version` integer NOT NULL,
	`acceptance_checks_id` text,
	`acceptance_checks_version` integer,
	`image_digest` text,
	`configuration_json` text,
	`results_json` text NOT NULL,
	`summary` text NOT NULL,
	`error` text,
	`pi_run_id` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
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
CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`status` text NOT NULL,
	`body` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
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
	`completed_at` text,
	`deliverable_evidence` text,
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
CREATE TABLE `preparation_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`record` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE TABLE `publication_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`mechanism` text NOT NULL,
	`verified_permissions_json` text NOT NULL,
	`granted_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `acceptance_checks_application_id_version_unique` ON `acceptance_checks` (`application_id`,`version`);
CREATE UNIQUE INDEX `application_contracts_application_id_version_unique` ON `application_contracts` (`application_id`,`version`);
CREATE UNIQUE INDEX `deployments_application_id_unique` ON `deployments` (`application_id`);
CREATE INDEX `idx_activity_workspace` ON `activity_events` (`workspace_id`,"created_at" desc);
CREATE INDEX `idx_conformance_proposals_application` ON `conformance_proposals` (`application_id`,`created_at`);
CREATE INDEX `idx_conformance_runs_application` ON `conformance_runs` (`application_id`,`created_at`);
CREATE INDEX `idx_conformance_runs_queue` ON `conformance_runs` (`status`,`created_at`);
CREATE INDEX `idx_decisions_application` ON `decisions` (`application_id`,`created_at`);
CREATE INDEX `idx_messages_chat` ON `messages` (`chat_id`,`created_at`);
CREATE INDEX `idx_observations_application_kind` ON `observations` (`application_id`,`kind`,"observed_at" desc);
CREATE INDEX `idx_pi_runs_chat` ON `pi_runs` (`chat_id`);
CREATE INDEX `idx_pi_runs_queue` ON `pi_runs` (`status`,`created_at`);
CREATE INDEX `idx_publication_grants_application` ON `publication_grants` (`application_id`);
CREATE UNIQUE INDEX `one_working_change_per_application` ON `application_operations` (`application_id`) WHERE "application_operations"."kind" = 'change' AND "application_operations"."state" = 'working';
CREATE INDEX `operation_application` ON `application_operations` (`application_id`);
CREATE UNIQUE INDEX `phase_workspaces_application_id_phase_key_unique` ON `phase_workspaces` (`application_id`,`phase_key`);
CREATE UNIQUE INDEX `pi_runs_assistant_message_id_unique` ON `pi_runs` (`assistant_message_id`);
CREATE UNIQUE INDEX `pi_runs_chat_id_request_key_unique` ON `pi_runs` (`chat_id`,`request_key`);
CREATE UNIQUE INDEX `pi_runs_retry_of_id_unique` ON `pi_runs` (`retry_of_id`);
PRAGMA user_version = 13;
