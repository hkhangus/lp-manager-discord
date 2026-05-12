import type { ZapInStrategy, ZapOutOutput } from "../types/lpagent.js";

export type ZapSessionStatus = "draft" | "ready" | "submitted" | "failed";

interface BaseSession {
  id: string;
  discordUserId: string;
  owner: string;
  status: ZapSessionStatus;
  generationCount: number;
  submittedAt: number | null;
  result: unknown;
  expiresAt: number;
  lastValidBlockHeight: number | null;
  meta: Record<string, unknown>;
}

export interface ZapInSession extends BaseSession {
  kind: "zap-in";
  poolAddress: string;
  pairLabel: string | null;
  stratergy: ZapInStrategy | null;
  inputSOL: number | null;
  slippage_bps: number | null;
  activeBinId: number | null;
  fromBinId: number | null;
  toBinId: number | null;
  swapTxsWithJito: string[];
  addLiquidityTxsWithJito: string[];
}

export interface ZapOutSession extends BaseSession {
  kind: "zap-out";
  positionId: string;
  pairLabel: string | null;
  bps: number | null;
  slippage_bps: number | null;
  output: ZapOutOutput;
  swapTxsWithJito: string[];
  closeTxsWithJito: string[];
}

export type ZapSession = ZapInSession | ZapOutSession;

export interface ZapInGeneratedFields {
  stratergy: ZapInStrategy;
  inputSOL: number;
  slippage_bps: number;
  activeBinId: number;
  fromBinId: number;
  toBinId: number;
  pairLabel: string | null;
  swapTxsWithJito: string[];
  addLiquidityTxsWithJito: string[];
  lastValidBlockHeight: number | null;
  meta: Record<string, unknown>;
}

export interface ZapOutGeneratedFields {
  bps: number;
  slippage_bps: number;
  pairLabel: string | null;
  swapTxsWithJito: string[];
  closeTxsWithJito: string[];
  lastValidBlockHeight: number | null;
  meta: Record<string, unknown>;
}

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map<string, ZapSession>();

export function createZapInSession(input: {
  discordUserId: string;
  owner: string;
  poolAddress: string;
}): ZapInSession {
  cleanupExpired();
  const id = crypto.randomUUID();
  const session: ZapInSession = {
    kind: "zap-in",
    id,
    discordUserId: input.discordUserId,
    owner: input.owner,
    poolAddress: input.poolAddress,
    pairLabel: null,
    stratergy: null,
    inputSOL: null,
    slippage_bps: null,
    activeBinId: null,
    fromBinId: null,
    toBinId: null,
    swapTxsWithJito: [],
    addLiquidityTxsWithJito: [],
    lastValidBlockHeight: null,
    meta: {},
    status: "draft",
    generationCount: 0,
    submittedAt: null,
    result: null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(id, session);
  return session;
}

export function createZapOutSession(input: {
  discordUserId: string;
  owner: string;
  positionId: string;
  pairLabel: string | null;
  output: ZapOutOutput;
}): ZapOutSession {
  cleanupExpired();
  const id = crypto.randomUUID();
  const session: ZapOutSession = {
    kind: "zap-out",
    id,
    discordUserId: input.discordUserId,
    owner: input.owner,
    positionId: input.positionId,
    pairLabel: input.pairLabel,
    output: input.output,
    bps: null,
    slippage_bps: null,
    swapTxsWithJito: [],
    closeTxsWithJito: [],
    lastValidBlockHeight: null,
    meta: {},
    status: "draft",
    generationCount: 0,
    submittedAt: null,
    result: null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): ZapSession | null {
  cleanupExpired();
  return sessions.get(id) ?? null;
}

export function applyZapInGenerated(
  id: string,
  fields: ZapInGeneratedFields,
): ZapInSession | null {
  const session = sessions.get(id);
  if (!session || session.kind !== "zap-in") return null;
  session.stratergy = fields.stratergy;
  session.inputSOL = fields.inputSOL;
  session.slippage_bps = fields.slippage_bps;
  session.activeBinId = fields.activeBinId;
  session.fromBinId = fields.fromBinId;
  session.toBinId = fields.toBinId;
  session.pairLabel = fields.pairLabel;
  session.swapTxsWithJito = fields.swapTxsWithJito;
  session.addLiquidityTxsWithJito = fields.addLiquidityTxsWithJito;
  session.lastValidBlockHeight = fields.lastValidBlockHeight;
  session.meta = fields.meta;
  session.status = "ready";
  session.generationCount += 1;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

export function applyZapOutGenerated(
  id: string,
  fields: ZapOutGeneratedFields,
): ZapOutSession | null {
  const session = sessions.get(id);
  if (!session || session.kind !== "zap-out") return null;
  session.bps = fields.bps;
  session.slippage_bps = fields.slippage_bps;
  session.pairLabel = fields.pairLabel;
  session.swapTxsWithJito = fields.swapTxsWithJito;
  session.closeTxsWithJito = fields.closeTxsWithJito;
  session.lastValidBlockHeight = fields.lastValidBlockHeight;
  session.meta = fields.meta;
  session.status = "ready";
  session.generationCount += 1;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

export function markSubmitted(id: string, result: unknown): void {
  const session = sessions.get(id);
  if (!session) return;
  session.status = "submitted";
  session.submittedAt = Date.now();
  session.result = result;
}

export function markFailed(id: string, result: unknown): void {
  const session = sessions.get(id);
  if (!session) return;
  session.status = "failed";
  session.result = result;
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}
