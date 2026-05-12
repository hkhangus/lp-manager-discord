import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";
import { balanceEmbed } from "../interactions/embeds.js";
import { getTokenBalances } from "../services/lpagent/token.js";
import { requireWallet } from "../services/walletService.js";

export const balanceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Show your wallet token balance"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const walletAddress = await requireWallet(interaction.user.id);
    const balances = await getTokenBalances(walletAddress);

    await interaction.editReply({
      embeds: [balanceEmbed(walletAddress, balances)],
    });
  },
};
