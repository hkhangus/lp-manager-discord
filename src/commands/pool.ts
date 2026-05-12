import { CurrencyPreference } from "@prisma/client";
import { SlashCommandBuilder } from "discord.js";
import { poolEmbed, poolPositionsEmbed } from "../interactions/embeds.js";
import { createTopLpersView } from "../interactions/topLpersPagination.js";
import { getPoolInfo, getPoolPositions, getTopLpers } from "../services/lpagent/pools.js";
import { getWallet } from "../services/walletService.js";
import type { Command } from "../types/discord.js";

const SORT_ORDER_CHOICES = [
  ["Descending", "desc"],
  ["Ascending", "asc"],
] as const;

const TOP_LPER_SORT_CHOICES = [
  ["PnL", "total_pnl"],
  ["Native PnL", "total_pnl_native"],
  ["Fees", "total_fee"],
  ["Native Fees", "total_fee_native"],
  ["Total LPs", "total_lp"],
  ["ROI", "roi"],
  ["APR", "apr"],
  ["Win Rate", "win_rate"],
] as const;

export const poolCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("pool")
    .setDescription("Inspect LPAgent pool data")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("Show detailed information for a pool")
        .addStringOption((option) =>
          option.setName("address").setDescription("Pool address").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("positions")
        .setDescription("Show LP positions for a pool")
        .addStringOption((option) =>
          option.setName("address").setDescription("Pool address").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("owner").setDescription("Optional wallet address to filter positions"),
        )
        .addStringOption((option) =>
          option
            .setName("status")
            .setDescription("Position status")
            .addChoices({ name: "Open", value: "Open" }, { name: "Close", value: "Close" }),
        )
        .addIntegerOption((option) =>
          option.setName("page").setDescription("Page number").setMinValue(1),
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of positions to show")
            .setMinValue(1)
            .setMaxValue(20),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("top-lpers")
        .setDescription("Show ranked LP providers for a pool")
        .addStringOption((option) =>
          option.setName("address").setDescription("Pool address").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("sort")
            .setDescription("Sort LPers by")
            .addChoices(...TOP_LPER_SORT_CHOICES.map(([name, value]) => ({ name, value }))),
        )
        .addStringOption((option) =>
          option
            .setName("order")
            .setDescription("Sort direction")
            .addChoices(...SORT_ORDER_CHOICES.map(([name, value]) => ({ name, value }))),
        )
        .addIntegerOption((option) =>
          option.setName("page").setDescription("Page number").setMinValue(1),
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of LPers to show")
            .setMinValue(1)
            .setMaxValue(10),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const poolId = interaction.options.getString("address", true).trim();
    const currency = (await getWallet(interaction.user.id))?.currency ?? CurrencyPreference.USD;

    if (subcommand === "info") {
      const pool = await getPoolInfo(poolId);

      await interaction.editReply({
        embeds: [poolEmbed(poolId, pool)],
      });
      return;
    }

    if (subcommand === "positions") {
      const status = interaction.options.getString("status") as "Open" | "Close" | null;
      const positions = await getPoolPositions(poolId, {
        owner: interaction.options.getString("owner")?.trim(),
        status: status ?? undefined,
        page: interaction.options.getInteger("page") ?? 1,
        pageSize: interaction.options.getInteger("limit") ?? 5,
      });

      await interaction.editReply({
        embeds: [poolPositionsEmbed(poolId, positions, currency)],
      });
      return;
    }

    const sortOrder = interaction.options.getString("order") as "asc" | "desc" | null;
    const topLpers = await getTopLpers(poolId, {
      orderBy:
        interaction.options.getString("sort") ??
        (currency === CurrencyPreference.NATIVE ? "total_pnl_native" : "total_pnl"),
      sortOrder: sortOrder ?? "desc",
      page: interaction.options.getInteger("page") ?? 1,
      limit: interaction.options.getInteger("limit") ?? 5,
    });

    const rendered = createTopLpersView({
      userId: interaction.user.id,
      poolId,
      currency,
      lpers: topLpers.lpers,
      pagination: topLpers.pagination,
    });

    await interaction.editReply({
      embeds: rendered.embeds,
      components: rendered.components,
    });
  },
};
