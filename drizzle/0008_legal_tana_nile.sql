CREATE TABLE "channel_account" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"phone_number" text,
	"account_identifier" text,
	"qr_code" text,
	"credentials_cipher" text,
	"credentials_iv" text,
	"credentials_tag" text,
	"metadata" jsonb,
	"error_message" text,
	"last_connected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "channel_account_id" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "platform" text DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "channel_account_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "platform" text DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "channel_account_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "external_message_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "channel_account" ADD CONSTRAINT "channel_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_org_idx" ON "channel_account" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "channel_provider_idx" ON "channel_account" USING btree ("organization_id","provider");--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_channel_idx" ON "conversation" USING btree ("organization_id","channel_account_id");--> statement-breakpoint
CREATE INDEX "message_channel_idx" ON "message" USING btree ("organization_id","channel_account_id");