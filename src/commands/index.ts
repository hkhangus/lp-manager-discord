import type { Command } from "../types/discord.js";
import { alertsCommand } from "./alerts.js";
import { balanceCommand } from "./balance.js";
import { poolCommand } from "./pool.js";
import { poolsCommand } from "./pools.js";
import { portfolioCommand } from "./portfolio.js";
import { positionsCommand } from "./positions.js";
import { rankingCommand } from "./ranking.js";
import { shareCommand } from "./share.js";
import { walletCommand } from "./wallet.js";

export const commands: Command[] = [
  walletCommand,
  balanceCommand,
  positionsCommand,
  portfolioCommand,
  poolsCommand,
  poolCommand,
  alertsCommand,
  rankingCommand,
  shareCommand,
];
