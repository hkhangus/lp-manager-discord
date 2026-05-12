import type { LpPosition, ZapInStrategy } from "../types/lpagent.js";
import { BotError } from "../utils/errors.js";
import { asNumber } from "../utils/formatter.js";

export interface PositionZapInPreset {
  poolAddress: string;
  pairLabel: string | null;
  stratergy: ZapInStrategy;
  inputSOL: number;
  percentX: number;
  activeBinId: number | null;
  fromBinId: number;
  toBinId: number;
  slippage_bps: number;
}

export function buildPositionZapInPreset(position: LpPosition): PositionZapInPreset {
  if (!position.pool) {
    throw new BotError("This position does not include a pool address to copy.");
  }

  const inputSOL = asNumber(position.inputNative ?? position.valueNative);
  if (inputSOL === null || inputSOL <= 0) {
    throw new BotError("This position does not include a usable native input amount.");
  }

  const fromBinId = asInteger(position.range?.[0] ?? position.tickLower);
  const toBinId = asInteger(position.range?.[1] ?? position.tickUpper);
  if (fromBinId === null || toBinId === null) {
    throw new BotError("This position does not include a usable bin range.");
  }

  return {
    poolAddress: position.pool,
    pairLabel: position.pairName ?? `${position.tokenName0 ?? "?"}/${position.tokenName1 ?? "?"}`,
    stratergy: normalizeStrategy(position.strategyType),
    inputSOL,
    percentX: getPercentX(position),
    activeBinId: asInteger(position.range?.[2]) ?? null,
    fromBinId,
    toBinId,
    slippage_bps: 500,
  };
}

function normalizeStrategy(strategyType: string | undefined): ZapInStrategy {
  const normalized = strategyType?.toLowerCase() ?? "";

  if (normalized.includes("curve")) {
    return "Curve";
  }

  if (normalized.includes("bidask") || normalized.includes("bid_ask")) {
    return "BidAsk";
  }

  return "Spot";
}

function getPercentX(position: LpPosition): number {
  const amount0 = asNumber(position.current?.amount0Adjusted);
  const amount1 = asNumber(position.current?.amount1Adjusted);
  const price0 = asNumber(position.price0);
  const price1 = asNumber(position.price1);

  if (amount0 !== null && amount1 !== null && price0 !== null && price1 !== null) {
    const value0 = amount0 * price0;
    const value1 = amount1 * price1;
    const total = value0 + value1;

    if (total > 0) {
      return clamp(value0 / total, 0, 1);
    }
  }

  return 0.5;
}

function asInteger(value: unknown): number | null {
  const number = asNumber(value);

  if (number === null || !Number.isInteger(number)) {
    return null;
  }

  return number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
