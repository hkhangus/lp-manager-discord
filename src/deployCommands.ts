import { REST, Routes } from "discord.js";
import { env } from "./config/env.js";
import { commands } from "./commands/index.js";
import { logger } from "./utils/logger.js";

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
const body = commands.map((command) => command.data.toJSON());

try {
  logger.info({ count: body.length, guildId: env.DISCORD_GUILD_ID }, "Registering slash commands");

  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
    body,
  });

  logger.info("Slash commands registered");
} catch (error) {
  logger.error({ error }, "Failed to register slash commands");
  process.exitCode = 1;
}
