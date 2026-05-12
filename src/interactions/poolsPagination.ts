import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbed,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { discoverPools, type DiscoverPoolsInput } from "../services/lpagent/pools.js";
import type { PoolDiscoveryItem } from "../types/lpagent.js";
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

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  const zapRow = zapInRow(result.pools);
  if (zapRow) components.push(zapRow);

  const navRow = navigationRow(session.id, session.currentPage, totalPages);
  if (navRow) components.push(navRow);

  return {
    embeds: [poolsEmbed(result.pools, result.pagination, session.search).toJSON()],
    components,
  };
}

function zapInRow(
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
  action: "prev" | "next";
} | null {
  const [scope, sessionId, action] = customId.split(":");
  if (scope !== "pools" || !sessionId || (action !== "prev" && action !== "next")) {
    return null;
  }
  return { sessionId, action };
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}
