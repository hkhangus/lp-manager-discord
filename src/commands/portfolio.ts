import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";
import { portfolioEmbed } from "../interactions/embeds.js";
import { getPortfolioOverview } from "../services/lpagent/positions.js";
import { requireWalletConfig } from "../services/walletService.js";

export const portfolioCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("portfolio")
    .setDescription("Show your LPAgent portfolio overview"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { walletAddress, currency } = await requireWalletConfig(interaction.user.id);
    const overview = await getPortfolioOverview(walletAddress);

    await interaction.editReply({
      embeds: [portfolioEmbed(walletAddress, overview, currency)],
    });
  },
};
