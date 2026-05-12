import { CurrencyPreference } from "@prisma/client";
import { prisma } from "../db/client.js";
import { BotError } from "../utils/errors.js";
import { assertSolanaAddress } from "../utils/validation.js";

export async function setWallet(discordUserId: string, walletAddress: string) {
  const normalizedWallet = assertSolanaAddress(walletAddress);

  return prisma.discordUser.upsert({
    where: { discordUserId },
    update: { walletAddress: normalizedWallet },
    create: {
      discordUserId,
      walletAddress: normalizedWallet,
    },
  });
}

export async function getWallet(discordUserId: string) {
  return prisma.discordUser.findUnique({
    where: { discordUserId },
  });
}

export async function setCurrencyPreference(discordUserId: string, currency: CurrencyPreference) {
  const user = await getWallet(discordUserId);

  if (!user) {
    throw new BotError("Connect a wallet before setting currency preference.");
  }

  return prisma.discordUser.update({
    where: { discordUserId },
    data: { currency },
  });
}

export async function requireWallet(discordUserId: string): Promise<string> {
  const user = await getWallet(discordUserId);

  if (!user) {
    throw new BotError("Connect a wallet first with `/wallet connect <address>`.");
  }

  return user.walletAddress;
}

export async function requireWalletConfig(discordUserId: string): Promise<{
  walletAddress: string;
  currency: CurrencyPreference;
}> {
  const user = await getWallet(discordUserId);

  if (!user) {
    throw new BotError("Connect a wallet first with `/wallet connect <address>`.");
  }

  return {
    walletAddress: user.walletAddress,
    currency: user.currency,
  };
}

export async function getAllWalletUsers() {
  return prisma.discordUser.findMany();
}

export async function unlinkWallet(discordUserId: string): Promise<boolean> {
  const user = await getWallet(discordUserId);

  if (!user) {
    return false;
  }

  await prisma.discordUser.delete({
    where: { discordUserId },
  });

  return true;
}
