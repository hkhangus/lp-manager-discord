import { CurrencyPreference } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbed,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import type { LpPosition } from "../types/lpagent.js";
import { positionsEmbed } from "./embeds.js";

const POSITIONS_PAGE_SIZE = 5;
const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map<string, PositionPaginationSession>();

interface PositionPaginationSession {
  id: string;
  userId: string;
  walletAddress: string;
  currency: CurrencyPreference;
  positions: LpPosition[];
  page: number;
  isOwnWallet: boolean;
  expiresAt: number;
}

export function createPositionsPagination(input: {
  userId: string;
  walletAddress: string;
  currency: CurrencyPreference;
  positions: LpPosition[];
  isOwnWallet: boolean;
}): {
  embeds: APIEmbed[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
} {
  cleanupExpiredSessions();

  const session: PositionPaginationSession = {
    id: crypto.randomUUID(),
    userId: input.userId,
    walletAddress: input.walletAddress,
    currency: input.currency,
    positions: input.positions,
    page: 1,
    isOwnWallet: input.isOwnWallet,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  sessions.set(session.id, session);
  return renderPositionsSession(session);
}

export async function handlePositionsPaginationButton(
  interaction: ButtonInteraction,
): Promise<boolean> {
  const parsed = parsePositionsButtonId(interaction.customId);

  if (!parsed) {
    return false;
  }

  cleanupExpiredSessions();

  const session = sessions.get(parsed.sessionId);

  if (!session) {
    await interaction.reply({
      content: "This positions page expired. Run `/positions` again.",
      ephemeral: true,
    });
    return true;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: "Only the user who opened this positions view can page it.",
      ephemeral: true,
    });
    return true;
  }

  const totalPages = getTotalPages(session.positions);
  session.page = Math.min(
    totalPages,
    Math.max(1, session.page + (parsed.action === "next" ? 1 : -1)),
  );
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(session.id, session);

  await interaction.update(renderPositionsSession(session));
  return true;
}

function renderPositionsSession(session: PositionPaginationSession): {
  embeds: APIEmbed[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
} {
  const totalPages = getTotalPages(session.positions);
  const start = (session.page - 1) * POSITIONS_PAGE_SIZE;
  const pagePositions = session.positions.slice(start, start + POSITIONS_PAGE_SIZE);
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  const viewRow = positionsViewRow(session.walletAddress, pagePositions, start);
  if (viewRow) {
    components.push(viewRow);
  }

  if (session.isOwnWallet) {
    const zapOutRow = positionsZapOutRow(pagePositions, start);
    if (zapOutRow) {
      components.push(zapOutRow);
    }
  }

  if (totalPages > 1) {
    components.push(positionsPaginationRow(session.id, session.page, totalPages));
  }

  return {
    embeds: [
      positionsEmbed(
        session.walletAddress,
        pagePositions,
        session.currency,
        session.positions.length,
        session.page,
        totalPages,
        start,
      ).toJSON(),
    ],
    components,
  };
}

function positionsZapOutRow(
  positions: LpPosition[],
  startIndex: number,
): ActionRowBuilder<MessageActionRowComponentBuilder> | null {
  const buttons = positions
    .map((position, index) => {
      const positionId = position.position ?? position.id;
      if (!positionId) {
        return null;
      }
      return new ButtonBuilder()
        .setCustomId(`zap-out:${positionId}`)
        .setLabel(`Zap-Out #${startIndex + index + 1}`)
        .setStyle(ButtonStyle.Danger);
    })
    .filter((button): button is ButtonBuilder => button !== null)
    .slice(0, 5);

  if (buttons.length === 0) {
    return null;
  }

  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);
}

function positionsViewRow(
  walletAddress: string,
  positions: LpPosition[],
  startIndex: number,
): ActionRowBuilder<MessageActionRowComponentBuilder> | null {
  const buttons = positions
    .map((position, index) => {
      const positionId = position.position ?? position.id;
      if (!positionId) {
        return null;
      }

      const url = `https://app.lpagent.io/portfolio?address=${encodeURIComponent(walletAddress)}&positionId=${encodeURIComponent(positionId)}`;
      return new ButtonBuilder()
        .setLabel(`View #${startIndex + index + 1}`)
        .setStyle(ButtonStyle.Link)
        .setURL(url);
    })
    .filter((button): button is ButtonBuilder => button !== null)
    .slice(0, 5);

  if (buttons.length === 0) {
    return null;
  }

  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);
}

function positionsPaginationRow(
  sessionId: string,
  page: number,
  totalPages: number,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`positions:${sessionId}:prev`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`positions:${sessionId}:next`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages),
  );
}

function parsePositionsButtonId(customId: string): {
  sessionId: string;
  action: "prev" | "next";
} | null {
  const [scope, sessionId, action] = customId.split(":");

  if (scope !== "positions" || !sessionId || (action !== "prev" && action !== "next")) {
    return null;
  }

  return {
    sessionId,
    action,
  };
}

function getTotalPages(positions: LpPosition[]): number {
  return Math.max(1, Math.ceil(positions.length / POSITIONS_PAGE_SIZE));
}

function cleanupExpiredSessions(): void {
  const now = Date.now();

  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}
