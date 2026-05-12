import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { env } from "../config/env.js";
import { requireWallet } from "../services/walletService.js";
import { createZapOutSession } from "../signer/store.js";
import { BotError } from "../utils/errors.js";
import { isSolanaAddress } from "../utils/validation.js";

const BUTTON_PREFIX = "zap-out:";

export function isZapOutButton(customId: string): boolean {
  return customId.startsWith(BUTTON_PREFIX);
}

export async function handleZapOutButton(interaction: ButtonInteraction): Promise<void> {
  const positionId = interaction.customId.slice(BUTTON_PREFIX.length);

  if (!isSolanaAddress(positionId)) {
    throw new BotError("That Zap-Out button references an invalid position id.");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const owner = await requireWallet(interaction.user.id);
  const session = createZapOutSession({
    discordUserId: interaction.user.id,
    owner,
    positionId,
    pairLabel: null,
    output: "allBaseToken",
  });

  const signerUrl = `${env.SIGNER_BASE_URL.replace(/\/+$/, "")}/signer/${encodeURIComponent(session.id)}`;
  const summary = [
    "**Zap-Out session ready.**",
    `Position: \`${positionId}\``,
    `Owner: \`${owner}\``,
    `Output: \`allBaseToken\` (swap everything to SOL)`,
    "",
    "Click **Open signer** to choose your withdrawal percentage and slippage, then sign with Phantom or Solflare. The link expires in 15 minutes.",
    "",
    ":warning: Never paste your seed phrase or private key into Discord or any webpage.",
  ].join("\n");

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setLabel("Open signer").setStyle(ButtonStyle.Link).setURL(signerUrl),
  );

  await interaction.editReply({
    content: summary,
    components: [row],
  });
}
