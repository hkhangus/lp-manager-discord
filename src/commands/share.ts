import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types/discord.js";
import { getPoolInfo, discoverPools } from "../services/lpagent/pools.js";
import { formatNumber, formatPercent, formatUsd } from "../utils/formatter.js";

const SHARE_TYPE_CHOICES = [
  { name: "Pool", value: "pool" },
  { name: "Token", value: "token" },
] as const;

export const shareCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("share")
    .setDescription("Share a pool or token with a Zap-In button for the channel")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("What are you sharing?")
        .setRequired(true)
        .addChoices(...SHARE_TYPE_CHOICES),
    )
    .addStringOption((option) =>
      option
        .setName("value")
        .setDescription("Pool address or token address")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const type = interaction.options.getString("type", true) as "pool" | "token";
    const value = interaction.options.getString("value", true).trim();

    if (type === "pool") {
      await sharePool(interaction, value);
    } else {
      await shareToken(interaction, value);
    }
  },
};

async function sharePool(
  interaction: Parameters<Command["execute"]>[0],
  poolAddress: string,
): Promise<void> {
  const pool = await getPoolInfo(poolAddress);
  const tokens = pool.tokenInfo?.flatMap((entry) => entry.data ?? []) ?? [];
  const pair = tokens.map((t) => t.symbol ?? t.name ?? "?").join("/") || "Pool";
  const activeBin = pool.liquidityViz?.activeBin;

  const message = [
    `📢 **${pair}** — shared by <@${interaction.user.id}>`,
    "",
    `Pool: \`${poolAddress}\``,
    `Type: **${pool.type ?? "n/a"}**`,
    `Base Fee: ${formatPercent(pool.feeInfo?.baseFeeRatePercentage)} — Dynamic Fee: ${formatPercent(pool.feeInfo?.dynamicFee)}`,
    `Active Bin: ${activeBin?.binId ? `${activeBin.binId} @ ${activeBin.pricePerToken ?? "n/a"}` : "n/a"}`,
    "",
    "Click **Zap In** below to open a position in this pool.",
  ].join("\n");

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`zap-in:${poolAddress}`)
      .setLabel("Zap In")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel("View on LPAgent")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://app.lpagent.io/pools/${encodeURIComponent(poolAddress)}`),
  );

  await interaction.editReply({
    content: message,
    components: [row],
  });
}

async function shareToken(
  interaction: Parameters<Command["execute"]>[0],
  tokenAddress: string,
): Promise<void> {
  const result = await discoverPools({
    search: tokenAddress,
    sortBy: "fee_tvl_ratio",
    page: 1,
    pageSize: 5,
  });

  const pools = result.pools;

  if (pools.length === 0) {
    await interaction.editReply({
      content: `No pools found for token \`${tokenAddress}\`.`,
    });
    return;
  }

  const lines = pools.map((pool, index) => {
    const pair = `${pool.token0_symbol ?? "?"}/${pool.token1_symbol ?? "?"}`;
    return `**#${index + 1} ${pair}** — TVL ${formatUsd(pool.tvl)} — 24h Vol ${formatUsd(pool.vol_24h)}\n\`${pool.pool}\``;
  });

  const message = [
    `📢 **Top pools for token** — shared by <@${interaction.user.id}>`,
    `Token: \`${tokenAddress}\``,
    "",
    ...lines,
    "",
    "Click a **Zap In** button below to open a position.",
  ].join("\n");

  const zapRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...pools.slice(0, 5).map((pool, index) =>
      new ButtonBuilder()
        .setCustomId(`zap-in:${pool.pool}`)
        .setLabel(`Zap In #${index + 1}`)
        .setStyle(ButtonStyle.Primary),
    ),
  );

  await interaction.editReply({
    content: message,
    components: [zapRow],
  });
}
