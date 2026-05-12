export const USD_MARKER = ":dollar:";
export const NATIVE_MARKER = ":small_blue_diamond:";

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function formatUsd(value: unknown): string {
  const number = asNumber(value);
  if (number === null) {
    return "n/a";
  }

  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Math.abs(number) >= 1000 ? 0 : 2,
  }).format(number);

  return `${USD_MARKER} ${formatted}`;
}

export function formatNative(value: unknown, maximumFractionDigits = 6): string {
  const formatted = formatNumber(value, maximumFractionDigits);

  return formatted === "n/a" ? formatted : `${NATIVE_MARKER} ${formatted}`;
}

export function formatCurrencyPreference(value: string): string {
  return value === "NATIVE" ? `${NATIVE_MARKER} Native` : `${USD_MARKER} USD`;
}

export function formatNumber(value: unknown, maximumFractionDigits = 2): string {
  const number = asNumber(value);
  if (number === null) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(number);
}

export function formatPercent(value: unknown): string {
  const number = asNumber(value);
  if (number === null) {
    return "n/a";
  }

  const normalized = Math.abs(number) <= 1 ? number * 100 : number;
  return `${formatNumber(normalized, 2)}%`;
}

export function truncateAddress(value: string, prefix = 4, suffix = 4): string {
  if (value.length <= prefix + suffix + 3) {
    return value;
  }

  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

export function shortPositionId(value: string | null | undefined): string {
  if (!value) {
    return "any";
  }

  return truncateAddress(value, 6, 6);
}
