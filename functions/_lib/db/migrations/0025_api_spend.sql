CREATE TABLE `api_spend` (
	`day` text NOT NULL,
	`sku` text NOT NULL,
	`units` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `sku`)
);
