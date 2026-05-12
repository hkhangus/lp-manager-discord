import { CurrencyPreference } from "@prisma/client";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";
import { createPositionsPagination } from "../interactions/pagination.js";
import { getOpeningPositions } from "../services/lpagent/positions.js";
import { getWallet, requireWalletConfig } from "../services/walletService.js";
import { assertSolanaAddress } from "../utils/validation.js";

export const positionsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("positions")
    .setDescription("Show open LP positions")
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
    const isOwnWallet = linkedUser?.walletAddress === walletAddress;
    const positions = await getOpeningPositions(walletAddress);
    const response = createPositionsPagination({
      userId: interaction.user.id,
      walletAddress,
      currency,
      positions,
      isOwnWallet,
    });

    await interaction.editReply({
      embeds: response.embeds,
      components: response.components,
    });
  },
};
