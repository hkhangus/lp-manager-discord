import { CurrencyPreference } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbed,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { getOpeningPositions } from "../services/lpagent/positions.js";
import type { TopLper } from "../types/lpagent.js";
import { truncateAddress } from "../utils/formatter.js";
import { topLpersEmbed } from "./embeds.js";
import { createPositionsPagination } from "./pagination.js";

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map<string, TopLpersSession>();

interface TopLpersSession {
  id: string;
  userId: string;
  poolId: string;
  currency: CurrencyPreference;
  lpers: TopLper[];
  expiresAt: number;
}

export interface TopLpersRender {
  embeds: APIEmbed[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

export function createTopLpersView(input: {
  userId: string;
  poolId: string;
  currency: CurrencyPreference;
  lpers: TopLper[];
  pagination: unknown;
}): TopLpersRender {
  cleanupExpired();

  const session: TopLpersSession = {
    id: crypto.randomUUID(),
    userId: input.userId,
    poolId: input.poolId,
    currency: input.currency,
    lpers: input.lpers,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  sessions.set(session.id, session);
  return renderSession(session, input.pagination);
}

export async function handleTopLpersButton(
  interaction: ButtonInteraction,
): Promise<boolean> {
  const parsed = parseButtonId(interaction.customId);
  if (!parsed) return false;

  cleanupExpired();

  const session = sessions.get(parsed.sessionId);
  if (!session) {
    await interaction.reply({
      content: "This top LPers view has expired. Run `/pool top-lpers` again.",
      ephemeral: true,
    });
    return true;
  }

  if (parsed.action === "positions") {
    await handleListPositions(interaction, session, parsed.index);
    return true;
  }

  return false;
}

async function handleListPositions(
  interaction: ButtonInteraction,
  session: TopLpersSession,
  index: number | null,
): Promise<void> {
  if (index === null || index < 0 || index >= session.lpers.length) {
    await interaction.reply({
      content: "That LPer is no longer available in this view.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lper = session.lpers[index]!;
  const positions = await getOpeningPositions(lper.owner);

  if (positions.length === 0) {
    await interaction.editReply({
      content: `No open positions found for \`${truncateAddress(lper.owner, 6, 6)}\`.`,
    });
    return;
  }

  const response = createPositionsPagination({
    userId: interaction.user.id,
    walletAddress: lper.owner,
    currency: session.currency,
    positions,
    isOwnWallet: false,
  });

  await interaction.editReply({
    embeds: response.embeds,
    components: response.components,
  });
}

function renderSession(
  session: TopLpersSession,
  pagination: unknown,
): TopLpersRender {
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  // Add "Positions" buttons for each LPer (max 5 per action row, Discord limit)
  const positionButtons = session.lpers.slice(0, 5).map((lper, index) =>
    new ButtonBuilder()
      .setCustomId(`top-lpers:${session.id}:positions:${index}`)
      .setLabel(`📋 #${index + 1}`)
      .setStyle(ButtonStyle.Secondary),
  );

  if (positionButtons.length > 0) {
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        ...positionButtons,
      ),
    );
  }

  return {
    embeds: [
      topLpersEmbed(
        session.poolId,
        session.lpers,
        pagination as Parameters<typeof topLpersEmbed>[2],
        session.currency,
      ).toJSON(),
    ],
    components,
  };
}

function parseButtonId(customId: string): {
  sessionId: string;
  action: "positions";
  index: number | null;
} | null {
  const [scope, sessionId, action, index] = customId.split(":");

  if (scope !== "top-lpers" || !sessionId || action !== "positions") {
    return null;
  }

  return {
    sessionId,
    action,
    index: Number.isInteger(Number(index)) ? Number(index) : null,
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
