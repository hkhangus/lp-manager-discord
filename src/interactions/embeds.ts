import { AlertType, CurrencyPreference, type Alert } from "@prisma/client";
import { EmbedBuilder } from "discord.js";
import type {
  LpPosition,
  Pagination,
  PoolDiscoveryItem,
  PoolInfo,
  PoolPosition,
  PoolPositionsData,
  PortfolioOverview,
  TokenBalance,
  TopLper,
} from "../types/lpagent.js";
import {
  formatCurrencyPreference,
  formatNative,
  formatNumber,
  formatPercent,
  formatUsd,
  shortPositionId,
  truncateAddress,
} from "../utils/formatter.js";

const BRAND_COLOR = 0x38bdf8;
const WARNING_COLOR = 0xf59e0b;

export function walletEmbed(walletAddress: string, currency: CurrencyPreference): EmbedBuilder {
  return baseEmbed("Wallet Connected").addFields(
    {
      name: "Wallet",
      value: `\`${walletAddress}\``,
    },
    {
      name: "Currency",
      value: currencyLabel(currency),
      inline: true,
    },
  );
}

export function balanceEmbed(walletAddress: string, balances: TokenBalance[]): EmbedBuilder {
  const embed = baseEmbed("Wallet Balance")
    .setDescription(`Wallet: \`${truncateAddress(walletAddress, 6, 6)}\``)
    .addFields({
      name: "Total Value",
      value: formatUsd(balances.reduce((sum, token) => sum + (token.balanceInUsd ?? 0), 0)),
      inline: true,
    });

  if (balances.length === 0) {
    return embed.addFields({ name: "Tokens", value: "No token balances returned." });
  }

  embed.addFields({
    name: "Top Tokens",
    value: balances
      .slice()
      .sort((a, b) => (b.balanceInUsd ?? 0) - (a.balanceInUsd ?? 0))
      .slice(0, 10)
      .map(
        (token) =>
          `**${token.symbol}** ${formatNumber(token.balance, 6)} - ${formatUsd(token.balanceInUsd)}`,
      )
      .join("\n"),
  });

  return embed;
}

export function positionsEmbed(
  walletAddress: string,
  positions: LpPosition[],
  currency: CurrencyPreference,
  totalPositions = positions.length,
  page = 1,
  totalPages = 1,
  startIndex = 0,
): EmbedBuilder {
  const embed = baseEmbed("Open LP Positions")
    .setDescription(`Wallet: \`${truncateAddress(walletAddress, 6, 6)}\``)
    .addFields(
      { name: "Open Positions", value: formatNumber(totalPositions), inline: true },
      { name: "Currency", value: currencyLabel(currency), inline: true },
    );

  if (positions.length === 0) {
    return embed.addFields({ name: "Positions", value: "No open LP positions returned." });
  }

  embed.addFields({
    name: "Positions",
    value: positions
      .slice(0, 8)
      .map((position, index) => {
        const num = startIndex + index + 1;
        const pair =
          position.pairName ?? `${position.tokenName0 ?? "?"}/${position.tokenName1 ?? "?"}`;
        const range = position.inRange === false ? "out of range" : "in range";
        const value = formatCurrencyValue(
          currency,
          position.value ?? position.currentValue,
          position.valueNative,
        );
        const pnlValue = formatPnlValue(currency, position.pnl);
        const pnlPercent = formatPnlPercent(currency, position.pnl);
        return `**#${num} ${pair}** - ${value} - PnL ${pnlValue} (${pnlPercent}) - ${range}\n\`${shortPositionId(position.position ?? position.id)}\``;
      })
      .join("\n\n"),
  });

  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${page}/${totalPages}` });
  }

  return embed;
}

export function portfolioEmbed(
  walletAddress: string,
  overview: PortfolioOverview,
  currency: CurrencyPreference,
): EmbedBuilder {
  return baseEmbed("Portfolio Overview")
    .setDescription(`Wallet: \`${truncateAddress(walletAddress, 6, 6)}\``)
    .addFields(
      { name: "Opening LPs", value: formatNumber(overview.opening_lp), inline: true },
      { name: "Closed LPs", value: formatNumber(periodValue(overview.closed_lp)), inline: true },
      { name: "Pools", value: formatNumber(overview.total_pool), inline: true },
      { name: "Currency", value: currencyLabel(currency), inline: true },
      {
        name: "Total PnL",
        value: formatCurrencyValue(
          currency,
          periodValue(overview.total_pnl),
          periodValue(overview.total_pnl_native),
        ),
        inline: true,
      },
      {
        name: "Total Fees",
        value: formatCurrencyValue(
          currency,
          periodValue(overview.total_fee),
          periodValue(overview.total_fee_native),
        ),
        inline: true,
      },
      { name: "ROI", value: formatPercent(overview.roi), inline: true },
      {
        name: "Win Rate",
        value: formatPercent(
          currency === CurrencyPreference.NATIVE
            ? (periodValue(overview.win_rate_native) ?? periodValue(overview.win_rate))
            : periodValue(overview.win_rate),
        ),
        inline: true,
      },
      { name: "APR", value: formatPercent(overview.apr), inline: true },
    );
}

export function poolsEmbed(
  pools: PoolDiscoveryItem[],
  pagination?: Pagination,
  search?: string | null,
): EmbedBuilder {
  const embed = baseEmbed("Pool Discovery").setDescription(
    search ? `Search: \`${search}\`` : "Top LPAgent pools",
  );

  if (pools.length === 0) {
    return embed.addFields({ name: "Pools", value: "No pools matched that search." });
  }

  embed.addFields({
    name: "Pools",
    value: pools
      .slice(0, 8)
      .map((pool, index) => {
        const pair = `${pool.token0_symbol ?? "?"}/${pool.token1_symbol ?? "?"}`;
        return `**#${index + 1} ${pair}** - TVL ${formatUsd(pool.tvl)} - 24h Vol ${formatUsd(pool.vol_24h)}\n\`${pool.pool}\``;
      })
      .join("\n\n"),
  });

  if (pagination) {
    embed.setFooter({
      text: paginationFooter(pagination, "pools"),
    });
  }

  return embed;
}

export function poolEmbed(poolId: string, pool: PoolInfo): EmbedBuilder {
  const tokens = pool.tokenInfo?.flatMap((entry) => entry.data ?? []) ?? [];
  const tokenLabel = tokens.map((token) => token.symbol ?? token.name ?? "?").join("/") || "Pool";
  const activeBin = pool.liquidityViz?.activeBin;

  return baseEmbed(tokenLabel)
    .setDescription(`Pool: \`${poolId}\``)
    .addFields(
      { name: "Type", value: pool.type ?? "n/a", inline: true },
      { name: "Amount X", value: formatNumber(pool.amountX, 4), inline: true },
      { name: "Amount Y", value: formatNumber(pool.amountY, 4), inline: true },
      {
        name: "Base Fee",
        value: formatPercent(pool.feeInfo?.baseFeeRatePercentage),
        inline: true,
      },
      {
        name: "Dynamic Fee",
        value: formatPercent(pool.feeInfo?.dynamicFee),
        inline: true,
      },
      {
        name: "Active Bin",
        value: activeBin?.binId
          ? `${activeBin.binId} @ ${activeBin.pricePerToken ?? "n/a"}`
          : "n/a",
        inline: true,
      },
    );
}

export function poolPositionsEmbed(
  poolId: string,
  data: PoolPositionsData,
  currency: CurrencyPreference,
): EmbedBuilder {
  const positions = data.positions ?? [];
  const embed = baseEmbed("Pool Positions")
    .setDescription(`Pool: \`${poolId}\``)
    .addFields(
      { name: "Currency", value: currencyLabel(currency), inline: true },
      {
        name: "Positions",
        value: formatNumber(data.pagination?.total ?? positions.length),
        inline: true,
      },
      {
        name: "Active Bin",
        value: data.activeBin?.binId
          ? `${data.activeBin.binId} @ ${data.activeBin.pricePerToken ?? data.activeBin.price ?? "n/a"}`
          : "n/a",
        inline: true,
      },
    );

  if (positions.length === 0) {
    return embed.addFields({ name: "Results", value: "No positions returned for this pool." });
  }

  embed.addFields({
    name: "Results",
    value: positions
      .slice(0, 8)
      .map((position) => {
        const pair = poolPositionPair(position);
        const status = typeof position.status === "string" ? position.status : "n/a";
        const range = position.inRange === false ? "out of range" : "in range";
        return `**${pair}** - ${formatPoolPositionValue(currency, position)} - PnL ${formatPoolPositionPnl(currency, position)} - ${status} / ${range}\nOwner: \`${truncateAddress(poolPositionOwner(position), 6, 6)}\` - Position: \`${shortPositionId(poolPositionId(position))}\``;
      })
      .join("\n\n"),
  });

  if (data.pagination) {
    embed.setFooter({
      text: `Page ${data.pagination.page}/${data.pagination.totalPages} - ${data.pagination.total} positions`,
    });
  }

  return embed;
}

export function topLpersEmbed(
  poolId: string,
  lpers: TopLper[],
  pagination: Pagination | undefined,
  currency: CurrencyPreference,
): EmbedBuilder {
  const embed = baseEmbed("Top LPers")
    .setDescription(`Pool: \`${poolId}\``)
    .addFields({ name: "Currency", value: currencyLabel(currency), inline: true });

  if (lpers.length === 0) {
    return embed.addFields({ name: "LPers", value: "No LPers returned for this pool." });
  }

  embed.addFields({
    name: "LPers",
    value: lpers
      .slice(0, 10)
      .map((lper, index) => {
        const pnl = formatCurrencyValue(currency, lper.total_pnl, lper.total_pnl_native);
        const fee = formatCurrencyValue(currency, lper.total_fee, lper.total_fee_native);
        return `**#${index + 1}** \`${truncateAddress(lper.owner, 6, 6)}\` - PnL ${pnl} - Fees ${fee} - LPs ${formatNumber(lper.total_lp, 0)} - ROI ${formatPercent(lper.roi)}`;
      })
      .join("\n"),
  });

  if (pagination) {
    embed.setFooter({
      text: paginationFooter(pagination, "LPers"),
    });
  }

  return embed;
}

export function alertsEmbed(alerts: Alert[]): EmbedBuilder {
  const embed = baseEmbed("Your Alerts");

  if (alerts.length === 0) {
    return embed.addFields({ name: "Alerts", value: "No alerts configured." });
  }

  return embed.addFields({
    name: "Active Alerts",
    value: alerts
      .slice(0, 15)
      .map((alert) => {
        const threshold =
          alert.type === AlertType.OUT_OF_RANGE
            ? ""
            : ` threshold ${formatAlertThreshold(alert.type, alert.thresholdValue)}`;
        return `\`${alert.id}\` - **${alert.type}** on ${shortPositionId(alert.positionId)}${threshold}`;
      })
      .join("\n"),
  });
}

export function rankingEmbed(
  rankings: Array<{
    discordUserId: string;
    walletAddress: string;
    totalPnl: number;
    totalFee: number;
    roi: number | undefined;
    openingLp: number;
  }>,
): EmbedBuilder {
  const medals = ["🥇", "🥈", "🥉"];

  const leaderboard = rankings
    .map((entry, index) => {
      const rank = medals[index] ?? `**#${index + 1}**`;
      const pnl = formatUsd(entry.totalPnl);
      const fee = formatUsd(entry.totalFee);
      const roi = formatPercent(entry.roi);
      return `${rank} <@${entry.discordUserId}> — PnL ${pnl} — Fees ${fee} — ROI ${roi}\n\`${truncateAddress(entry.walletAddress, 6, 6)}\``;
    })
    .join("\n\n");

  return baseEmbed("🏆 Channel PnL Ranking")
    .setDescription(leaderboard)
    .setFooter({ text: `${rankings.length} member${rankings.length === 1 ? "" : "s"} ranked` });
}

export function warningEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(WARNING_COLOR).setTitle(title).setDescription(description);
}

function baseEmbed(title: string): EmbedBuilder {
  return new EmbedBuilder().setColor(BRAND_COLOR).setTitle(title).setTimestamp(new Date());
}

function currencyLabel(currency: CurrencyPreference): string {
  return formatCurrencyPreference(currency);
}

function formatCurrencyValue(
  currency: CurrencyPreference,
  usdValue: unknown,
  nativeValue: unknown,
): string {
  if (currency === CurrencyPreference.NATIVE) {
    return formatNative(nativeValue);
  }

  return formatUsd(usdValue);
}

function formatPnlValue(currency: CurrencyPreference, pnl: LpPosition["pnl"]): string {
  if (currency === CurrencyPreference.NATIVE) {
    return formatNative(pnl?.valueNative);
  }

  return formatUsd(pnl?.value);
}

function formatPnlPercent(currency: CurrencyPreference, pnl: LpPosition["pnl"]): string {
  if (currency === CurrencyPreference.NATIVE) {
    return formatPercent(pnl?.percentNative);
  }

  return formatPercent(pnl?.percent);
}

function formatAlertThreshold(type: AlertType, value: unknown): string {
  if (type === AlertType.FEE_ABOVE) {
    return formatUsd(value);
  }

  return `${formatNumber(value)}%`;
}

function paginationFooter(pagination: Pagination, label: string): string {
  const page = pagination.currentPage ?? pagination.page ?? 1;
  const totalPages = pagination.totalPages ?? 1;
  const total = pagination.totalCount ?? pagination.total ?? 0;

  return `Page ${page}/${totalPages} - ${total} ${label}`;
}

function periodValue(value: unknown, period = "ALL"): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  return record[period] ?? record[period.toLowerCase()] ?? record.total ?? record.value;
}

function poolPositionId(position: PoolPosition): string | null {
  return firstString(position.position, position.positionId, position.id);
}

function poolPositionOwner(position: PoolPosition): string {
  return firstString(position.owner) ?? "unknown";
}

function poolPositionPair(position: PoolPosition): string {
  return (
    firstString(position.pairName) ??
    `${firstString(position.tokenName0) ?? "?"}/${firstString(position.tokenName1) ?? "?"}`
  );
}

function formatPoolPositionValue(currency: CurrencyPreference, position: PoolPosition): string {
  return formatCurrencyValue(
    currency,
    firstValue(position.value, position.currentValue, position.inputValue, position.input),
    firstValue(
      position.valueNative,
      position.currentValueNative,
      position.inputValueNative,
      position.inputNative,
    ),
  );
}

function formatPoolPositionPnl(currency: CurrencyPreference, position: PoolPosition): string {
  const pnl = position.pnl;

  if (pnl && typeof pnl === "object") {
    return formatCurrencyValue(currency, pnl.value, pnl.valueNative);
  }

  return formatCurrencyValue(currency, pnl, position.pnlNative);
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function firstString(...values: unknown[]): string | null {
  const value = firstValue(...values);
  return typeof value === "string" && value.trim() ? value : null;
}
