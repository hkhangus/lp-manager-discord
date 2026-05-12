const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaAddress(value: string): boolean {
  return SOLANA_ADDRESS_PATTERN.test(value);
}

export function assertSolanaAddress(value: string): string {
  const address = value.trim();

  if (!isSolanaAddress(address)) {
    throw new Error("That does not look like a valid Solana wallet address.");
  }

  return address;
}
