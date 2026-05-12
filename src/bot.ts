import { Collection, Events, GatewayIntentBits, MessageFlags, Client } from "discord.js";
import type { ScheduledTask } from "node-cron";
import { commands } from "./commands/index.js";
import { env } from "./config/env.js";
import { disconnectPrisma } from "./db/client.js";
import { handleButtonInteraction } from "./interactions/buttons.js";
import { startAlertWatcher } from "./jobs/alertWatcher.js";
import { startSignerServer, stopSignerServer } from "./signer/server.js";
import type { BotClient } from "./types/discord.js";
import { toUserMessage } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
}) as BotClient;

client.commands = new Collection();

for (const command of commands) {
  client.commands.set(command.data.name, command);
}

let alertTask: ScheduledTask | null = null;

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ tag: readyClient.user.tag }, "Discord bot is ready");
  alertTask = startAlertWatcher(client);
  startSignerServer(env.SIGNER_PORT);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        await interaction.reply({
          content: "That command is not registered in this bot.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }
  } catch (error) {
    logger.error({ error }, "Interaction failed");
    const content = toUserMessage(error);

    if (interaction.isRepliable()) {
      if (interaction.deferred) {
        await interaction.editReply({ content, embeds: [], components: [] });
      } else if (interaction.replied) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    }
  }
});

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await client.login(env.DISCORD_TOKEN);
} catch (error) {
  logger.error({ error }, "Failed to login to Discord");
  process.exitCode = 1;
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down");
  alertTask?.stop();
  client.destroy();
  await stopSignerServer();
  await disconnectPrisma();
  process.exit(0);
}
