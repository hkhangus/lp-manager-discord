CREATE TYPE "AlertType" AS ENUM ('OUT_OF_RANGE', 'PNL_ABOVE', 'PNL_BELOW', 'FEE_ABOVE');

CREATE TABLE "discord_users" (
  "id" TEXT NOT NULL,
  "discord_user_id" TEXT NOT NULL,
  "wallet_address" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "discord_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alerts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "AlertType" NOT NULL,
  "position_id" TEXT,
  "threshold_value" DOUBLE PRECISION,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_triggered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_events" (
  "id" TEXT NOT NULL,
  "alert_id" TEXT NOT NULL,
  "position_id" TEXT,
  "value" DOUBLE PRECISION,
  "message" TEXT NOT NULL,
  "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discord_users_discord_user_id_key" ON "discord_users"("discord_user_id");
CREATE INDEX "alerts_user_id_idx" ON "alerts"("user_id");
CREATE INDEX "alerts_enabled_type_idx" ON "alerts"("enabled", "type");
CREATE INDEX "alert_events_alert_id_idx" ON "alert_events"("alert_id");

ALTER TABLE "alerts"
  ADD CONSTRAINT "alerts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "discord_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alert_events"
  ADD CONSTRAINT "alert_events_alert_id_fkey"
  FOREIGN KEY ("alert_id") REFERENCES "alerts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
