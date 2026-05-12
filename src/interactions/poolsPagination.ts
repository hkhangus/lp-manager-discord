import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbed,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { discoverPools, type DiscoverPoolsInput } from "../services/lpagent/pools.js";
import type { PoolDiscoveryItem } from "../types/lpagent.js";
import { formatUsd } from "../utils/formatter.js";
import { poolsEmbed } from "./embeds.js";

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map<string, PoolsSession>();

interface PoolsSession {
  id: string;
  userId: string;
  search: string | null;
  sortBy: DiscoverPoolsInput["sortBy"];
  pageSize: number;
  currentPage: number;
  /** Cached pools from the last render so the share button can reference them */
  lastPools: PoolDiscoveryItem[];
  expiresAt: number;
}

export interface PoolsRender {
  embeds: APIEmbed[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

export async function createPoolsSession(input: {
  userId: string;
  search: string | null;
  sortBy: DiscoverPoolsInput["sortBy"];
  pageSize: number;
}): Promise<PoolsRender> {
  cleanupExpired();

  const session: PoolsSession = {
    id: crypto.randomUUID(),
    userId: input.userId,
    search: input.search,
    sortBy: input.sortBy,
    pageSize: input.pageSize,
    currentPage: 1,
    lastPools: [],
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(session.id, session);
  return renderSession(session);
}

export async function handlePoolsPaginationButton(
  interaction: ButtonInteraction,
): Promise<boolean> {
  const parsed = parsePoolsButtonId(interaction.customId);
  if (!parsed) return false;

  cleanupExpired();

  const session = sessions.get(parsed.sessionId);
  if (!session) {
    await interaction.reply({
      content: "This pools page expired. Run `/pools` again.",
      ephemeral: true,
    });
    return true;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: "Only the user who opened this pools view can page it.",
      ephemeral: true,
    });
    return true;
  }

  if (parsed.action === "share") {
    await handlePoolShare(interaction, session, parsed.index);
    return true;
  }

  await interaction.deferUpdate();

  session.currentPage = Math.max(1, session.currentPage + (parsed.action === "next" ? 1 : -1));
  session.expiresAt = Date.now() + SESSION_TTL_MS;

  const rendered = await renderSession(session);
  await interaction.editReply(rendered);
  return true;
}

async function renderSession(session: PoolsSession): Promise<PoolsRender> {
  const result = await discoverPools({
    search: session.search ?? undefined,
    sortBy: session.sortBy,
    page: session.currentPage,
    pageSize: session.pageSize,
  });

  const totalPages = result.pagination?.totalPages ?? 1;
  if (session.currentPage > totalPages) {
    session.currentPage = totalPages;
  }

  // Cache pools for share button
  session.lastPools = result.pools;

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const zapRow = zapInRow(session.id, result.pools);
  if (zapRow) components.push(zapRow);

  const shareRow = shareButtonRow(session.id, result.pools);
  if (shareRow) components.push(shareRow);

  const navRow = navigationRow(session.id, session.currentPage, totalPages);
  if (navRow) components.push(navRow);

  return {
    embeds: [poolsEmbed(result.pools, result.pagination, session.search).toJSON()],
    components,
  };
}

function zapInRow(
  sessionId: string,
  pools: PoolDiscoveryItem[],
): ActionRowBuilder<MessageActionRowComponentBuilder> | null {
  if (pools.length === 0) return null;
  const buttons = pools.slice(0, 5).map((pool, index) =>
    new ButtonBuilder()
      .setCustomId(`zap-in:${pool.pool}`)
      .setLabel(`Zap-In #${index + 1}`)
      .setStyle(ButtonStyle.Primary),
  );
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);
}

function shareButtonRow(
  sessionId: string,
  pools: PoolDiscoveryItem[],
): ActionRowBuilder<MessageActionRowComponentBuilder> | null {
  if (pools.length === 0) return null;
  const buttons = pools.slice(0, 5).map((pool, index) =>
    new ButtonBuilder()
      .setCustomId(`pools:${sessionId}:share:${index}`)
      .setLabel(`📢 #${index + 1}`)
      .setStyle(ButtonStyle.Secondary),
  );
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);
}

async function handlePoolShare(
  interaction: ButtonInteraction,
  session: PoolsSession,
  index: number | null,
): Promise<void> {
  if (index === null || index < 0 || index >= session.lastPools.length) {
    await interaction.reply({
      content: "That pool is no longer available in this page.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pool = session.lastPools[index]!;
  const pair = `${pool.token0_symbol ?? "?"}/${pool.token1_symbol ?? "?"}`;

  const shareMessage = [
    `📢 **${pair}** — shared by <@${interaction.user.id}>`,
    "",
    `Pool: \`${pool.pool}\``,
    `TVL: ${formatUsd(pool.tvl)} — 24h Vol: ${formatUsd(pool.vol_24h)}`,
    "",
    "Click **Zap In** below to open a position in this pool.",
  ].join("\n");

  const zapInButton = new ButtonBuilder()
    .setCustomId(`zap-in:${pool.pool}`)
    .setLabel("Zap In")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(zapInButton);

  const channel = interaction.channel;
  if (!channel || !("send" in channel)) {
    await interaction.editReply({ content: "Cannot share in this channel type." });
    return;
  }

  await channel.send({
    content: shareMessage,
    components: [row],
  });

  await interaction.editReply({ content: "Pool shared to the channel! 📢" });
}

function navigationRow(
  sessionId: string,
  page: number,
  totalPages: number,
): ActionRowBuilder<MessageActionRowComponentBuilder> | null {
  if (totalPages <= 1) return null;
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pools:${sessionId}:prev`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`pools:${sessionId}:next`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages),
  );
}

function parsePoolsButtonId(customId: string): {
  sessionId: string;
  action: "prev" | "next" | "share";
  index: number | null;
} | null {
  const [scope, sessionId, action, index] = customId.split(":");
  if (
    scope !== "pools" ||
    !sessionId ||
    (action !== "prev" && action !== "next" && action !== "share")
  ) {
    return null;
  }
  return {
    sessionId,
    action,
    index: action === "share" && Number.isInteger(Number(index)) ? Number(index) : null,
  };
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}
