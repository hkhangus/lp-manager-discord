import { AlertType } from "@prisma/client";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";
import { alertsEmbed } from "../interactions/embeds.js";
import { createAlert, listAlerts, removeAlert } from "../services/alertService.js";
import { formatNumber, shortPositionId } from "../utils/formatter.js";

const ALERT_CHOICES = [
  ["Out of range", AlertType.OUT_OF_RANGE],
  ["PnL above %", AlertType.PNL_ABOVE],
  ["PnL below %", AlertType.PNL_BELOW],
  ["Fees above USD", AlertType.FEE_ABOVE],
] as const;

export const alertsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("alert")
    .setDescription("Manage LP position alerts")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Create an alert")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Alert type")
            .setRequired(true)
            .addChoices(...ALERT_CHOICES.map(([name, value]) => ({ name, value }))),
        )
        .addStringOption((option) =>
          option
            .setName("position_id")
            .setDescription("Optional LP position id; leave empty to watch all positions"),
        )
        .addNumberOption((option) =>
          option
            .setName("threshold")
            .setDescription("Required for PnL and fee alerts; PnL is percent, fees are USD"),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List your configured alerts"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove an alert")
        .addStringOption((option) =>
          option.setName("id").setDescription("Alert id from /alert list").setRequired(true),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const type = interaction.options.getString("type", true) as AlertType;
      const positionId = interaction.options.getString("position_id");
      const threshold = interaction.options.getNumber("threshold");
      const alert = await createAlert({
        discordUserId: interaction.user.id,
        type,
        positionId,
        thresholdValue: threshold,
      });

      await interaction.reply({
        content: `Created ${alert.type} alert \`${alert.id}\` for ${shortPositionId(alert.positionId)}${threshold === null ? "" : ` at ${formatNumber(threshold)}`}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "list") {
      const alerts = await listAlerts(interaction.user.id);

      await interaction.reply({
        embeds: [alertsEmbed(alerts)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const id = interaction.options.getString("id", true);
    const removed = await removeAlert(interaction.user.id, id);

    await interaction.reply({
      content: removed ? `Removed alert \`${id}\`.` : `No alert found for \`${id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
