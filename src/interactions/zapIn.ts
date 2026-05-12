import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  type ButtonInteraction,
} from "discord.js";
import { env } from "../config/env.js";
import { requireWallet } from "../services/walletService.js";
import { createZapInSession } from "../signer/store.js";
import { BotError } from "../utils/errors.js";
import { isSolanaAddress } from "../utils/validation.js";

const BUTTON_PREFIX = "zap-in:";

export function isZapInButton(customId: string): boolean {
  return customId.startsWith(BUTTON_PREFIX);
}

export async function handleZapInButton(interaction: ButtonInteraction): Promise<void> {
  const poolAddress = interaction.customId.slice(BUTTON_PREFIX.length);

  if (!isSolanaAddress(poolAddress)) {
    throw new BotError("That Zap-In button references an invalid pool address.");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const owner = await requireWallet(interaction.user.id);
  const session = createZapInSession({
    discordUserId: interaction.user.id,
    owner,
    poolAddress,
  });

  const signerUrl = `${env.SIGNER_BASE_URL.replace(/\/+$/, "")}/signer/${encodeURIComponent(session.id)}`;
  const summary = [
    "**Zap-In session ready.**",
    `Pool: \`${poolAddress}\``,
    `Owner: \`${owner}\``,
    "",
    "Click **Open signer** to choose your amount/strategy/slippage, generate the transaction, and sign with Phantom or Solflare. The link expires in 15 minutes.",
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
