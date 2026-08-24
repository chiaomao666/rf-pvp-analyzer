CREATE TABLE `pvpImportBatches` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(120) NOT NULL,
	`receivedAt` bigint NOT NULL,
	`recognizedCount` int NOT NULL DEFAULT 0,
	`rejectedCount` int NOT NULL DEFAULT 0,
	`warnings` json NOT NULL,
	`rawPayload` json NOT NULL,
	CONSTRAINT `pvpImportBatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pvpMatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`importBatchId` varchar(64),
	`battleAt` bigint NOT NULL,
	`pvpMode` enum('1v1','3v3') NOT NULL,
	`pvpOutcome` enum('win','loss','draw','unknown') NOT NULL DEFAULT 'unknown',
	`playerTeam` json NOT NULL,
	`opponentTeam` json NOT NULL,
	`opponentName` varchar(120),
	`rankBefore` int,
	`rankAfter` int,
	`notes` text,
	`pvpRecordSource` enum('manual','import') NOT NULL DEFAULT 'manual',
	`rawPayload` json,
	`unrecognizedFields` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pvpMatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `pvpImportBatches` ADD CONSTRAINT `pvpImportBatches_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pvpMatches` ADD CONSTRAINT `pvpMatches_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pvpMatches` ADD CONSTRAINT `pvpMatches_importBatchId_pvpImportBatches_id_fk` FOREIGN KEY (`importBatchId`) REFERENCES `pvpImportBatches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pvpImportBatches_user_received_idx` ON `pvpImportBatches` (`userId`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `pvpMatches_user_battle_idx` ON `pvpMatches` (`userId`,`battleAt`);--> statement-breakpoint
CREATE INDEX `pvpMatches_user_mode_idx` ON `pvpMatches` (`userId`,`pvpMode`);--> statement-breakpoint
CREATE INDEX `pvpMatches_import_idx` ON `pvpMatches` (`importBatchId`);