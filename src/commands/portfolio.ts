import { CurrencyPreference } from "@prisma/client";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";
import { portfolioEmbed } from "../interactions/embeds.js";
import { getPortfolioOverview } from "../services/lpagent/positions.js";
import { getWallet, requireWalletConfig } from "../services/walletService.js";
import { assertSolanaAddress } from "../utils/validation.js";

export const portfolioCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("portfolio")
    .setDescription("Show an LPAgent portfolio overview")
    .addStringOption((option) =>
      option
        .setName("address")
        .setDescription("Optional wallet address; defaults to your connected wallet"),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const requestedAddress = interaction.options.getString("address");
    const linkedUser = await getWallet(interaction.user.id);
    const { walletAddress, currency } = requestedAddress
      ? {
          walletAddress: assertSolanaAddress(requestedAddress),
          currency: linkedUser?.currency ?? CurrencyPreference.USD,
        }
      : await requireWalletConfig(interaction.user.id);
    const overview = await getPortfolioOverview(walletAddress);

    await interaction.editReply({
      embeds: [portfolioEmbed(walletAddress, overview, currency)],
    });
  },
};
