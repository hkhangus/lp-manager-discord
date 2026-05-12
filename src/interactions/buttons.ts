import type { ButtonInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { handlePositionsPaginationButton } from "./pagination.js";
import { handlePoolsPaginationButton } from "./poolsPagination.js";
import { handleZapInButton, isZapInButton } from "./zapIn.js";
import { handleZapOutButton, isZapOutButton } from "./zapOut.js";

export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  if (await handlePositionsPaginationButton(interaction)) {
    return;
  }

  if (await handlePoolsPaginationButton(interaction)) {
    return;
  }

  if (isZapOutButton(interaction.customId)) {
    await handleZapOutButton(interaction);
    return;
  }

  if (isZapInButton(interaction.customId)) {
    await handleZapInButton(interaction);
    return;
  }

  await interaction.reply({
    content: "That button is not wired up in the MVP yet.",
    flags: MessageFlags.Ephemeral,
  });
}
