CREATE TYPE "CurrencyPreference" AS ENUM ('USD', 'NATIVE');

ALTER TABLE "discord_users"
  ADD COLUMN "currency" "CurrencyPreference" NOT NULL DEFAULT 'USD';
