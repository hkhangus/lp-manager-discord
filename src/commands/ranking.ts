import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";
import { rankingEmbed } from "../interactions/embeds.js";
import { getAllWalletUsers } from "../services/walletService.js";
import { getPortfolioOverview } from "../services/lpagent/positions.js";
import { BotError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const MAX_CHANNEL_MEMBERS = 10;

export const rankingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Rank channel members by total PnL from their portfolio"),

  async execute(interaction) {
    const channel = interaction.channel;

    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new BotError("This command can only be used in a text channel.");
    }

    const guild = interaction.guild;
    if (!guild) {
      throw new BotError("This command can only be used inside a server.");
    }

    await interaction.deferReply();

    // Get all users who have linked wallets
    const allWalletUsers = await getAllWalletUsers();

    if (allWalletUsers.length === 0) {
      throw new BotError("No members have linked their wallets yet.");
    }

    // For each wallet user, check if they are a member of this channel
    // using REST-based fetch (no privileged GuildMembers intent needed)
    const channelMembers: Array<{ discordUserId: string; walletAddress: string }> = [];

    for (const user of allWalletUsers) {
      try {
        const member = await guild.members.fetch(user.discordUserId);
        const perms = channel.permissionsFor(member);
        if (perms?.has(PermissionFlagsBits.ViewChannel)) {
          channelMembers.push({
            discordUserId: user.discordUserId,
            walletAddress: user.walletAddress,
          });
        }
      } catch {
        // Member not in guild or not fetchable — skip
      }
    }

    if (channelMembers.length === 0) {
      throw new BotError("No members in this channel have linked their wallets.");
    }

    if (channelMembers.length > MAX_CHANNEL_MEMBERS) {
      throw new BotError(
        `This channel has ${channelMembers.length} linked-wallet members — ranking is limited to channels with ${MAX_CHANNEL_MEMBERS} or fewer.`,
      );
    }

    // Fetch all portfolios in parallel
    const portfolioResults = await Promise.allSettled(
      channelMembers.map(async (user) => {
        const overview = await getPortfolioOverview(user.walletAddress);
        return {
          discordUserId: user.discordUserId,
          walletAddress: user.walletAddress,
          overview,
        };
      }),
    );

    // Collect successful results
    const rankings: Array<{
      discordUserId: string;
      walletAddress: string;
      totalPnl: number;
      totalFee: number;
      roi: number | undefined;
      openingLp: number;
    }> = [];

    for (const result of portfolioResults) {
      if (result.status === "fulfilled") {
        const { discordUserId, walletAddress, overview } = result.value;
        const totalPnl = extractPeriodNumber(overview.total_pnl);

        rankings.push({
          discordUserId,
          walletAddress,
          totalPnl,
          totalFee: extractPeriodNumber(overview.total_fee),
          roi: typeof overview.roi === "number" ? overview.roi : undefined,
          openingLp: Number(overview.opening_lp) || 0,
        });
      } else {
        logger.warn({ error: result.reason }, "Failed to fetch portfolio for ranking");
      }
    }

    if (rankings.length === 0) {
      throw new BotError("Could not fetch portfolio data for any member.");
    }

    // Sort by total PnL descending
    rankings.sort((a, b) => b.totalPnl - a.totalPnl);

    await interaction.editReply({
      embeds: [rankingEmbed(rankings)],
    });
  },
};

/**
 * Extract a numeric value from a PortfolioOverview field that may be
 * a plain number, a string, or a period-keyed object like { ALL: 123 }.
 */
function extractPeriodNumber(
  value: Record<string, number | string> | number | string | undefined,
  period = "ALL",
): number {
  if (value === undefined || value === null) return 0;

  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;

  if (typeof value === "object") {
    const v = value[period] ?? value[period.toLowerCase()] ?? value.total ?? value.value;
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v) || 0;
  }

  return 0;
}
