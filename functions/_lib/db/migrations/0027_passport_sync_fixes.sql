ALTER TABLE `bookings` ADD `passport_stamped_at` integer;--> statement-breakpoint
ALTER TABLE `visited_shops` ADD `removed_visits` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `visited_shops` ADD `server_updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `visited_shops_user_sync_idx` ON `visited_shops` (`user_id`,`server_updated_at`);--> statement-breakpoint
-- Seed the server-clock cursor from the client clock for existing rows so
-- current delta-pull cursors (which were client-clock based) keep working.
UPDATE `visited_shops` SET `server_updated_at` = `updated_at`;--> statement-breakpoint
-- Under the old flow every approved booking was stamped at approve time;
-- mark those so the GC's post-meeting stamping doesn't stamp them twice.
UPDATE `bookings` SET `passport_stamped_at` = `approved_at` WHERE `approved_at` IS NOT NULL AND `place_id` IS NOT NULL;
