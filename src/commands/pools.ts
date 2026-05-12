import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";
import { createPoolsSession } from "../interactions/poolsPagination.js";

const SORT_CHOICES = [
  ["Fee / TVL", "fee_tvl_ratio"],
  ["Market Cap", "mcap"],
  ["Created At", "created_at"],
  ["24h Volume", "vol_24h"],
  ["TVL", "tvl"],
  ["Volatility", "volatility"],
] as const;

export const poolsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("pools")
    .setDescription("Discover LPAgent pools")
    .addStringOption((option) =>
      option.setName("search").setDescription("Pool name, token symbol, or token address"),
    )
    .addStringOption((option) =>
      option
        .setName("sort")
        .setDescription("Sort pools by; defaults to Fee / TVL")
        .addChoices(...SORT_CHOICES.map(([name, value]) => ({ name, value }))),
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("Number of pools per page")
        .setMinValue(1)
        .setMaxValue(10),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const search = interaction.options.getString("search");
    const sortBy = interaction.options.getString("sort") as
      | "mcap"
      | "created_at"
      | "vol_24h"
      | "tvl"
      | "fee_tvl_ratio"
      | "volatility"
      | null;
    const pageSize = interaction.options.getInteger("limit") ?? 5;

    const rendered = await createPoolsSession({
      userId: interaction.user.id,
      search,
      sortBy: sortBy ?? undefined,
      pageSize,
    });

    await interaction.editReply(rendered);
  },
};
