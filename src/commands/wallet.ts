import { CurrencyPreference } from "@prisma/client";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";
import {
  getWallet,
  setCurrencyPreference,
  setWallet,
  unlinkWallet,
} from "../services/walletService.js";
import { walletEmbed } from "../interactions/embeds.js";
import { formatCurrencyPreference } from "../utils/formatter.js";

const CURRENCY_CHOICES = [
  ["USD", CurrencyPreference.USD],
  ["Native", CurrencyPreference.NATIVE],
] as const;

export const walletCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("wallet")
    .setDescription("Manage your LPAgent wallet")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("connect")
        .setDescription("Connect a public wallet address")
        .addStringOption((option) =>
          option
            .setName("address")
            .setDescription("Your public Solana wallet address")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Show your connected wallet"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("currency")
        .setDescription("Set your preferred value currency")
        .addStringOption((option) =>
          option
            .setName("value")
            .setDescription("Currency to use for LP values")
            .setRequired(true)
            .addChoices(...CURRENCY_CHOICES.map(([name, value]) => ({ name, value }))),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("unlink").setDescription("Unlink your connected wallet"),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "connect") {
      const address = interaction.options.getString("address", true);
      const user = await setWallet(interaction.user.id, address);

      await interaction.reply({
        embeds: [walletEmbed(user.walletAddress, user.currency)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "status") {
      const user = await getWallet(interaction.user.id);

      await interaction.reply({
        content: user
          ? `Connected wallet: \`${user.walletAddress}\`\nCurrency: **${formatCurrencyPreference(user.currency)}**`
          : "No wallet connected yet. Use `/wallet connect <address>`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === "currency") {
      const currency = interaction.options.getString("value", true) as CurrencyPreference;
      const user = await setCurrencyPreference(interaction.user.id, currency);

      await interaction.reply({
        content: `Currency preference set to **${formatCurrencyPreference(user.currency)}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const removed = await unlinkWallet(interaction.user.id);

    await interaction.reply({
      content: removed ? "Unlinked your wallet." : "No wallet was connected.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
