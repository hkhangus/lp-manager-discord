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
import { env } from "../config/env.js";
import { buildPositionZapInPreset } from "../services/positionCopyService.js";
import { requireWallet } from "../services/walletService.js";
import { createZapInSession } from "../signer/store.js";
import type { LpPosition } from "../types/lpagent.js";
import { formatNative, formatPercent, formatUsd, shortPositionId, truncateAddress } from "../utils/formatter.js";
import { positionsEmbed } from "./embeds.js";

const POSITIONS_PAGE_SIZE = 4;
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

  if (parsed.action === "zap-in") {
    await handlePositionZapIn(interaction, session, parsed.index);
    return true;
  }

  if (parsed.action === "share") {
    await handlePositionShare(interaction, session, parsed.index);
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

  components.push(
    ...positionActionRows(
      session.id,
      session.walletAddress,
      pagePositions,
      start,
      session.isOwnWallet,
    ),
  );

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

async function handlePositionZapIn(
  interaction: ButtonInteraction,
  session: PositionPaginationSession,
  index: number | null,
): Promise<void> {
  if (index === null || index < 0 || index >= session.positions.length) {
    await interaction.reply({
      content: "That position is no longer available in this page session.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const owner = await requireWallet(interaction.user.id);
  const position = session.positions[index]!;
  const preset = buildPositionZapInPreset(position);
  const zapSession = createZapInSession({
    discordUserId: interaction.user.id,
    owner,
    poolAddress: preset.poolAddress,
    pairLabel: preset.pairLabel,
    stratergy: preset.stratergy,
    inputSOL: preset.inputSOL,
    percentX: preset.percentX,
    slippage_bps: preset.slippage_bps,
    activeBinId: preset.activeBinId,
    fromBinId: preset.fromBinId,
    toBinId: preset.toBinId,
  });

  const signerUrl = `${env.SIGNER_BASE_URL.replace(/\/+$/, "")}/signer/${encodeURIComponent(zapSession.id)}`;
  const summary = [
    "**Zap-In copy session ready.**",
    `Position: \`${shortPositionId(position.position ?? position.id)}\``,
    `Pool: \`${preset.poolAddress}\``,
    `Owner: \`${owner}\``,
    `Strategy: \`${preset.stratergy}\``,
    `Input: ${formatNative(preset.inputSOL)}`,
    `Token X split: ${formatPercent(preset.percentX)}`,
    `Range: \`${preset.fromBinId} -> ${preset.toBinId}\``,
    "",
    "Click **Open signer** to review, generate the LPAgent `/add-tx` transaction, and sign with Phantom or Solflare.",
    "",
    ":warning: No transaction has been signed or sent yet.",
  ].join("\n");

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setLabel("Open signer").setStyle(ButtonStyle.Link).setURL(signerUrl),
  );

  await interaction.editReply({
    content: summary,
    components: [row],
  });
}

async function handlePositionShare(
  interaction: ButtonInteraction,
  session: PositionPaginationSession,
  index: number | null,
): Promise<void> {
  if (index === null || index < 0 || index >= session.positions.length) {
    await interaction.reply({
      content: "That position is no longer available in this page session.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const position = session.positions[index]!;
  const poolAddress = position.pool;
  if (!poolAddress) {
    await interaction.editReply({ content: "This position does not include a pool address to share." });
    return;
  }

  const pair = position.pairName ?? `${position.tokenName0 ?? "?"}/${position.tokenName1 ?? "?"}`;
  const pnlValue = position.pnl
    ? formatUsd(typeof position.pnl === "object" ? position.pnl.value : position.pnl)
    : "n/a";
  const range = position.inRange === false ? "⚠️ Out of range" : "✅ In range";

  const shareMessage = [
    `📢 **${pair}** — shared by <@${interaction.user.id}>`,
    "",
    `Pool: \`${poolAddress}\``,
    `Position: \`${shortPositionId(position.position ?? position.id)}\``,
    `Owner: \`${truncateAddress(session.walletAddress, 6, 6)}\``,
    `PnL: ${pnlValue} — ${range}`,
    "",
    "Click **Zap In** below to open your own position in this pool.",
  ].join("\n");

  const zapInButton = new ButtonBuilder()
    .setCustomId(`zap-in:${poolAddress}`)
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

  await interaction.editReply({ content: "Position shared to the channel! 📢" });
}

function positionActionRows(
  sessionId: string,
  walletAddress: string,
  positions: LpPosition[],
  startIndex: number,
  isOwnWallet: boolean,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return positions
    .map((position, index) => {
      const globalIndex = startIndex + index;
      const positionId = position.position ?? position.id;
      if (!positionId) {
        return null;
      }

      const url = `https://app.lpagent.io/portfolio?address=${encodeURIComponent(walletAddress)}&positionId=${encodeURIComponent(positionId)}`;
      const buttons: ButtonBuilder[] = [
        new ButtonBuilder().setLabel("View").setStyle(ButtonStyle.Link).setURL(url),
        new ButtonBuilder()
          .setCustomId(`positions:${sessionId}:zap-in:${globalIndex}`)
          .setLabel("Zap In")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`positions:${sessionId}:share:${globalIndex}`)
          .setLabel("📢 Share")
          .setStyle(ButtonStyle.Secondary),
      ];

      if (isOwnWallet && position.position) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId(`zap-out:${position.position}`)
            .setLabel("Zap Out")
            .setStyle(ButtonStyle.Danger),
        );
      }

      return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);
    })
    .filter((row): row is ActionRowBuilder<MessageActionRowComponentBuilder> => row !== null);
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
  action: "prev" | "next" | "zap-in" | "share";
  index: number | null;
} | null {
  const [scope, sessionId, action, index] = customId.split(":");

  if (
    scope !== "positions" ||
    !sessionId ||
    (action !== "prev" && action !== "next" && action !== "zap-in" && action !== "share")
  ) {
    return null;
  }

  return {
    sessionId,
    action,
    index: (action === "zap-in" || action === "share") && Number.isInteger(Number(index)) ? Number(index) : null,
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
