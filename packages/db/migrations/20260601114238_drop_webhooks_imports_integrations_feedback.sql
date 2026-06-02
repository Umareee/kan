DROP TABLE "feedback" CASCADE;--> statement-breakpoint
DROP TABLE "import" CASCADE;--> statement-breakpoint
DROP TABLE "integration" CASCADE;--> statement-breakpoint
DROP TABLE "workspace_webhooks" CASCADE;--> statement-breakpoint
ALTER TABLE "board" DROP CONSTRAINT IF EXISTS "board_importId_import_id_fk";
--> statement-breakpoint
ALTER TABLE "card" DROP CONSTRAINT IF EXISTS "card_importId_import_id_fk";
--> statement-breakpoint
ALTER TABLE "label" DROP CONSTRAINT IF EXISTS "label_importId_import_id_fk";
--> statement-breakpoint
ALTER TABLE "list" DROP CONSTRAINT IF EXISTS "list_importId_import_id_fk";
--> statement-breakpoint
ALTER TABLE "board" DROP COLUMN IF EXISTS "importId";--> statement-breakpoint
ALTER TABLE "card" DROP COLUMN IF EXISTS "importId";--> statement-breakpoint
ALTER TABLE "label" DROP COLUMN IF EXISTS "importId";--> statement-breakpoint
ALTER TABLE "list" DROP COLUMN IF EXISTS "importId";--> statement-breakpoint
DROP TYPE "public"."source";--> statement-breakpoint
DROP TYPE "public"."status";