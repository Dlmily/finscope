CREATE TABLE `paperAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`initialCash` decimal(14,2) NOT NULL DEFAULT '100000.00',
	`cash` decimal(14,2) NOT NULL DEFAULT '100000.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paperAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `paperAccounts_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `paperHoldings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(16) NOT NULL,
	`quantity` int NOT NULL,
	`averageCost` decimal(14,4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paperHoldings_id` PRIMARY KEY(`id`),
	CONSTRAINT `paper_holdings_user_symbol` UNIQUE(`userId`,`symbol`)
);
--> statement-breakpoint
CREATE TABLE `paperTrades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(16) NOT NULL,
	`side` enum('BUY','SELL') NOT NULL,
	`quantity` int NOT NULL,
	`price` decimal(14,4) NOT NULL,
	`gross` decimal(14,2) NOT NULL,
	`realizedPnl` decimal(14,2) NOT NULL DEFAULT '0.00',
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paperTrades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolioSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`totalAssets` decimal(14,2) NOT NULL,
	`cash` decimal(14,2) NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolioSnapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watchlistItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(16) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watchlistItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `watchlist_user_symbol` UNIQUE(`userId`,`symbol`)
);
