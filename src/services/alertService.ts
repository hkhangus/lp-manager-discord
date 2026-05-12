import { AlertType, type Alert } from "@prisma/client";
import type { Client } from "discord.js";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";
import type { LpPosition } from "../types/lpagent.js";
import { BotError } from "../utils/errors.js";
import {
  asNumber,
  formatNumber,
  formatPercent,
  formatUsd,
  shortPositionId,
} from "../utils/formatter.js";
import { logger } from "../utils/logger.js";
import { getOpeningPositions } from "./lpagent/positions.js";

const THRESHOLD_ALERTS = new Set<AlertType>([
  AlertType.PNL_ABOVE,
  AlertType.PNL_BELOW,
  AlertType.FEE_ABOVE,
]);

export async function createAlert(input: {
  discordUserId: string;
  type: AlertType;
  positionId?: string | null;
  thresholdValue?: number | null;
}) {
  const user = await prisma.discordUser.findUnique({
    where: { discordUserId: input.discordUserId },
  });

  if (!user) {
    throw new BotError("Connect a wallet before creating alerts.");
  }

  if (THRESHOLD_ALERTS.has(input.type) && !Number.isFinite(input.thresholdValue)) {
    throw new BotError("This alert type needs a numeric threshold.");
  }

  if (input.type === AlertType.OUT_OF_RANGE && input.thresholdValue !== null) {
    throw new BotError("Out-of-range alerts do not use a threshold.");
  }

  return prisma.alert.create({
    data: {
      userId: user.id,
      type: input.type,
      positionId: input.positionId?.trim() || null,
      thresholdValue: input.type === AlertType.OUT_OF_RANGE ? null : input.thresholdValue,
    },
  });
}

export async function listAlerts(discordUserId: string) {
  const user = await prisma.discordUser.findUnique({
    where: { discordUserId },
    include: {
      alerts: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    throw new BotError("Connect a wallet before listing alerts.");
  }

  return user.alerts;
}

export async function removeAlert(discordUserId: string, alertId: string): Promise<boolean> {
  const alert = await prisma.alert.findFirst({
    where: {
      id: alertId,
      user: { discordUserId },
    },
  });

  if (!alert) {
    return false;
  }

  await prisma.alert.delete({
    where: { id: alert.id },
  });

  return true;
}

export async function runAlertScan(client: Client): Promise<void> {
  const alerts = await prisma.alert.findMany({
    where: { enabled: true },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  const alertsByWallet = new Map<string, typeof alerts>();

  for (const alert of alerts) {
    const walletAlerts = alertsByWallet.get(alert.user.walletAddress) ?? [];
    walletAlerts.push(alert);
    alertsByWallet.set(alert.user.walletAddress, walletAlerts);
  }

  for (const [walletAddress, walletAlerts] of alertsByWallet) {
    try {
      const positions = await getOpeningPositions(walletAddress);

      for (const alert of walletAlerts) {
        await evaluateAlert(client, alert, positions);
      }
    } catch (error) {
      logger.error({ error, walletAddress }, "Failed to evaluate wallet alerts");
    }
  }
}

async function evaluateAlert(
  client: Client,
  alert: Awaited<ReturnType<typeof prisma.alert.findMany>>[number] & {
    user: { discordUserId: string; walletAddress: string };
  },
  positions: LpPosition[],
): Promise<void> {
  if (isInCooldown(alert)) {
    return;
  }

  const matches = matchingPositions(alert, positions);

  for (const match of matches) {
    const message = buildAlertMessage(alert, match);
    const value = extractAlertValue(alert.type, match.position);

    await prisma.$transaction([
      prisma.alertEvent.create({
        data: {
          alertId: alert.id,
          positionId: match.positionId,
          value,
          message,
        },
      }),
      prisma.alert.update({
        where: { id: alert.id },
        data: { lastTriggeredAt: new Date() },
      }),
    ]);

    await notifyUser(client, alert.user.discordUserId, message);
  }
}

function matchingPositions(
  alert: Alert,
  positions: LpPosition[],
): Array<{
  positionId: string | null;
  position: LpPosition;
}> {
  return positions
    .filter((position) => {
      const positionId = position.position ?? position.id ?? null;

      if (alert.positionId && positionId !== alert.positionId) {
        return false;
      }

      switch (alert.type) {
        case AlertType.OUT_OF_RANGE:
          return position.inRange === false;
        case AlertType.PNL_ABOVE: {
          const pnl = normalizePercent(position.pnl?.percent);
          return pnl !== null && alert.thresholdValue !== null && pnl >= alert.thresholdValue;
        }
        case AlertType.PNL_BELOW: {
          const pnl = normalizePercent(position.pnl?.percent);
          return pnl !== null && alert.thresholdValue !== null && pnl <= alert.thresholdValue;
        }
        case AlertType.FEE_ABOVE: {
          const fee = asNumber(position.unCollectedFee ?? position.uncollectedFee);
          return fee !== null && alert.thresholdValue !== null && fee >= alert.thresholdValue;
        }
      }
    })
    .map((position) => ({
      positionId: position.position ?? position.id ?? null,
      position,
    }));
}

function buildAlertMessage(
  alert: Alert,
  match: {
    positionId: string | null;
    position: LpPosition;
  },
): string {
  const pair =
    match.position.pairName ??
    `${match.position.tokenName0 ?? "Token0"}/${match.position.tokenName1 ?? "Token1"}`;
  const positionLabel = shortPositionId(match.positionId);

  switch (alert.type) {
    case AlertType.OUT_OF_RANGE:
      return `Position ${positionLabel} (${pair}) is out of range.`;
    case AlertType.PNL_ABOVE:
      return `Position ${positionLabel} (${pair}) PnL is ${formatPercent(match.position.pnl?.percent)}, above ${formatNumber(alert.thresholdValue)}%.`;
    case AlertType.PNL_BELOW:
      return `Position ${positionLabel} (${pair}) PnL is ${formatPercent(match.position.pnl?.percent)}, below ${formatNumber(alert.thresholdValue)}%.`;
    case AlertType.FEE_ABOVE:
      return `Position ${positionLabel} (${pair}) uncollected fees are ${formatUsd(match.position.unCollectedFee ?? match.position.uncollectedFee)}, above ${formatUsd(alert.thresholdValue)}.`;
  }
}

function extractAlertValue(type: AlertType, position: LpPosition): number | null {
  switch (type) {
    case AlertType.OUT_OF_RANGE:
      return null;
    case AlertType.PNL_ABOVE:
    case AlertType.PNL_BELOW:
      return normalizePercent(position.pnl?.percent);
    case AlertType.FEE_ABOVE:
      return asNumber(position.unCollectedFee ?? position.uncollectedFee);
  }
}

function normalizePercent(value: unknown): number | null {
  const number = asNumber(value);

  if (number === null) {
    return null;
  }

  return Math.abs(number) <= 1 ? number * 100 : number;
}

function isInCooldown(alert: Alert): boolean {
  if (!alert.lastTriggeredAt) {
    return false;
  }

  const cooldownMs = env.ALERT_COOLDOWN_MINUTES * 60 * 1000;
  return Date.now() - alert.lastTriggeredAt.getTime() < cooldownMs;
}

async function notifyUser(client: Client, discordUserId: string, message: string): Promise<void> {
  try {
    const user = await client.users.fetch(discordUserId);
    await user.send(message);
  } catch (error) {
    logger.warn({ error, discordUserId }, "Failed to send alert DM");
  }
}
