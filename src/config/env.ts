import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_GUILD_ID: z.string().min(1, "DISCORD_GUILD_ID is required"),
  LPAGENT_API_KEY: z.string().min(1, "LPAGENT_API_KEY is required"),
  LPAGENT_API_BASE_URL: z.string().url().default("https://api.lpagent.io/open-api/v1"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ALERT_CRON: z.string().default("*/5 * * * *"),
  ALERT_COOLDOWN_MINUTES: z.coerce.number().int().min(1).default(60),
  LOG_LEVEL: z.string().default("info"),
  SIGNER_BASE_URL: z.string().url().default("http://localhost:3001"),
  SIGNER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});

export const env = envSchema.parse(process.env);
