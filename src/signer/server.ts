import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  generateZapOutTx,
  submitZapOutLanding,
} from "../services/lpagent/positions.js";
import {
  generateZapInTx,
  getPoolInfo,
  submitZapInLanding,
} from "../services/lpagent/pools.js";
import type { PoolInfo, ZapInStrategy } from "../types/lpagent.js";
import { LpAgentError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { SIGNER_PAGE_HTML } from "./page.js";
import {
  applyZapInGenerated,
  applyZapOutGenerated,
  getSession,
  markFailed,
  markSubmitted,
  type ZapInSession,
  type ZapOutSession,
  type ZapSession,
} from "./store.js";

const RANGE_BINS = 34;
const STRATEGIES: readonly ZapInStrategy[] = ["Spot", "Curve", "BidAsk"];
const MAX_GENERATIONS_PER_SESSION = 5;

let server: Server | null = null;

export function startSignerServer(port: number): Server {
  if (server) {
    return server;
  }

  server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      logger.error({ error, url: req.url }, "Signer request crashed");
      sendJson(res, 500, { error: "Internal server error" });
    });
  });

  server.listen(port, () => {
    logger.info({ port }, "Signer HTTP server listening");
  });

  return server;
}

export async function stopSignerServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
  server = null;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const txMatch = /^\/signer\/api\/tx\/([^/]+)$/.exec(path);
  if (req.method === "GET" && txMatch) {
    const session = getSession(decodeURIComponent(txMatch[1]!));
    if (!session) {
      sendJson(res, 404, { error: "Session not found or expired" });
      return;
    }
    sendJson(res, 200, publicSession(session));
    return;
  }

  const generateMatch = /^\/signer\/api\/generate\/([^/]+)$/.exec(path);
  if (req.method === "POST" && generateMatch) {
    await handleGenerate(decodeURIComponent(generateMatch[1]!), req, res);
    return;
  }

  const submitMatch = /^\/signer\/api\/submit\/([^/]+)$/.exec(path);
  if (req.method === "POST" && submitMatch) {
    await handleSubmit(decodeURIComponent(submitMatch[1]!), req, res);
    return;
  }

  const pageMatch = /^\/signer\/([^/]+)$/.exec(path);
  if (req.method === "GET" && pageMatch) {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    });
    res.end(SIGNER_PAGE_HTML);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function handleGenerate(
  sessionId: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    sendJson(res, 404, { error: "Session not found or expired" });
    return;
  }
  if (session.status === "submitted") {
    sendJson(res, 409, { error: "Already submitted" });
    return;
  }
  if (session.generationCount >= MAX_GENERATIONS_PER_SESSION) {
    sendJson(res, 429, {
      error: `Reached max ${MAX_GENERATIONS_PER_SESSION} generations for this session. Re-open it to start a new one.`,
    });
    return;
  }

  let body: unknown;
  try {
    body = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON" });
    return;
  }

  try {
    if (session.kind === "zap-in") {
      await generateZapIn(session, body, res);
    } else {
      await generateZapOut(session, body, res);
    }
  } catch (error) {
    handleLpAgentError(res, error, "Failed to generate transactions", { sessionId });
  }
}

async function generateZapIn(
  session: ZapInSession,
  body: unknown,
  res: ServerResponse,
): Promise<void> {
  let inputSOL: number;
  let stratergy: ZapInStrategy;
  let slippage_bps: number;
  try {
    const obj = (body ?? {}) as Record<string, unknown>;
    inputSOL = parseAmount(obj.inputSOL, "Input SOL");
    stratergy = parseStrategy(obj.stratergy);
    slippage_bps = parseSlippage(obj.slippage_bps);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid params" });
    return;
  }

  let poolInfo: PoolInfo;
  try {
    poolInfo = await getPoolInfo(session.poolAddress);
  } catch (error) {
    handleLpAgentError(res, error, "Failed to fetch pool info", { sessionId: session.id });
    return;
  }

  const activeBinId = extractActiveBinId(poolInfo);
  if (activeBinId === null) {
    logger.warn(
      {
        sessionId: session.id,
        poolAddress: session.poolAddress,
        type: poolInfo.type,
      },
      "Could not extract active bin id",
    );
    sendJson(res, 422, {
      error: "Could not read the active bin from this pool. It may not be a DLMM pool.",
    });
    return;
  }

  const fromBinId = activeBinId - RANGE_BINS;
  const toBinId = activeBinId + RANGE_BINS;

  const tx = await generateZapInTx(session.poolAddress, {
    stratergy,
    owner: session.owner,
    inputSOL,
    percentX: 0.5,
    fromBinId,
    toBinId,
    slippage_bps,
    mode: "zap-in",
  });

  const swapTxs = tx.swapTxsWithJito ?? [];
  const addTxs = tx.addLiquidityTxsWithJito ?? [];
  if (swapTxs.length === 0 && addTxs.length === 0) {
    sendJson(res, 422, {
      error: "LPAgent returned no transactions for this zap-in. Try a different amount.",
    });
    return;
  }

  const updated = applyZapInGenerated(session.id, {
    stratergy,
    inputSOL,
    slippage_bps,
    activeBinId,
    fromBinId,
    toBinId,
    pairLabel: extractPairLabel(poolInfo),
    swapTxsWithJito: swapTxs,
    addLiquidityTxsWithJito: addTxs,
    lastValidBlockHeight: tx.lastValidBlockHeight ?? null,
    meta: tx.meta ?? {},
  });

  if (!updated) {
    sendJson(res, 404, { error: "Session expired during generation" });
    return;
  }

  logger.info(
    {
      sessionId: session.id,
      kind: "zap-in",
      owner: session.owner,
      pool: session.poolAddress,
      activeBinId,
      swapCount: swapTxs.length,
      addCount: addTxs.length,
    },
    "Zap-in transactions generated",
  );
  sendJson(res, 200, publicSession(updated));
}

async function generateZapOut(
  session: ZapOutSession,
  body: unknown,
  res: ServerResponse,
): Promise<void> {
  let bps: number;
  let slippage_bps: number;
  try {
    const obj = (body ?? {}) as Record<string, unknown>;
    bps = parseBps(obj.bps);
    slippage_bps = parseSlippage(obj.slippage_bps);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid params" });
    return;
  }

  const tx = await generateZapOutTx({
    positionId: session.positionId,
    owner: session.owner,
    bps,
    output: session.output,
    slippage_bps,
    provider: "JUPITER_ULTRA",
  });

  logger.info(
    {
      sessionId: session.id,
      kind: "zap-out",
      rawKeys: Object.keys((tx ?? {}) as Record<string, unknown>),
      swapTxsWithJitoLen: Array.isArray(tx.swapTxsWithJito) ? tx.swapTxsWithJito.length : null,
      closeTxsWithJitoLen: Array.isArray(tx.closeTxsWithJito) ? tx.closeTxsWithJito.length : null,
      lastValidBlockHeight: tx.lastValidBlockHeight ?? null,
    },
    "Zap-out decrease-tx response",
  );

  const swapTxs = tx.swapTxsWithJito ?? [];
  const closeTxs = tx.closeTxsWithJito ?? [];
  if (swapTxs.length === 0 && closeTxs.length === 0) {
    sendJson(res, 422, {
      error: "LPAgent returned no transactions for this zap-out. Try a different bps.",
    });
    return;
  }

  const updated = applyZapOutGenerated(session.id, {
    bps,
    slippage_bps,
    pairLabel: session.pairLabel,
    swapTxsWithJito: swapTxs,
    closeTxsWithJito: closeTxs,
    lastValidBlockHeight: tx.lastValidBlockHeight ?? null,
    meta: tx.meta ?? {},
  });

  if (!updated) {
    sendJson(res, 404, { error: "Session expired during generation" });
    return;
  }

  logger.info(
    {
      sessionId: session.id,
      kind: "zap-out",
      owner: session.owner,
      positionId: session.positionId,
      bps,
      output: session.output,
      swapCount: swapTxs.length,
      closeCount: closeTxs.length,
    },
    "Zap-out transactions generated",
  );
  sendJson(res, 200, publicSession(updated));
}

async function handleSubmit(
  sessionId: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    sendJson(res, 404, { error: "Session not found or expired" });
    return;
  }

  if (session.status === "submitted") {
    sendJson(res, 409, { error: "Already submitted" });
    return;
  }

  if (session.status !== "ready" && session.status !== "failed") {
    sendJson(res, 400, { error: "Generate transactions before submitting" });
    return;
  }

  let body: unknown;
  try {
    body = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON" });
    return;
  }

  try {
    if (session.kind === "zap-in") {
      await submitZapIn(session, body, res);
    } else {
      await submitZapOut(session, body, res);
    }
  } catch (error) {
    markFailed(session.id, error);
    const status = error instanceof LpAgentError && error.statusCode ? error.statusCode : 502;
    const message = error instanceof Error ? error.message : "Submit failed";
    const errBody = error instanceof LpAgentError ? error.body : undefined;
    logger.error(
      {
        sessionId: session.id,
        kind: session.kind,
        status,
        message,
        body: errBody,
      },
      "Zap submission failed",
    );
    sendJson(res, status, { error: message, body: errBody });
  }
}

async function submitZapIn(
  session: ZapInSession,
  body: unknown,
  res: ServerResponse,
): Promise<void> {
  const swap = extractStringArray(body, "swapTxsWithJito");
  const add = extractStringArray(body, "addLiquidityTxsWithJito");

  if (
    swap.length !== session.swapTxsWithJito.length ||
    add.length !== session.addLiquidityTxsWithJito.length
  ) {
    sendJson(res, 400, { error: "Signed transaction count does not match the original session" });
    return;
  }

  const result = await submitZapInLanding({
    swapTxsWithJito: swap,
    addLiquidityTxsWithJito: add,
    lastValidBlockHeight: session.lastValidBlockHeight,
    meta: session.meta,
  });
  markSubmitted(session.id, result);
  logger.info(
    { sessionId: session.id, kind: "zap-in", owner: session.owner, result },
    "Zap-in submitted",
  );
  sendJson(res, 200, { ok: true, result });
}

async function submitZapOut(
  session: ZapOutSession,
  body: unknown,
  res: ServerResponse,
): Promise<void> {
  logger.info(
    {
      sessionId: session.id,
      kind: "zap-out",
      bodyKeys: body && typeof body === "object" ? Object.keys(body as Record<string, unknown>) : null,
      sessionCloseLen: session.closeTxsWithJito.length,
      sessionSwapLen: session.swapTxsWithJito.length,
    },
    "Zap-out submit body inspection",
  );

  const close = extractStringArray(body, "closeTxsWithJito");
  const swap = extractStringArray(body, "swapTxsWithJito");

  if (
    close.length !== session.closeTxsWithJito.length ||
    swap.length !== session.swapTxsWithJito.length
  ) {
    sendJson(res, 400, { error: "Signed transaction count does not match the original session" });
    return;
  }

  const result = await submitZapOutLanding({
    closeTxsWithJito: close,
    swapTxsWithJito: swap,
    lastValidBlockHeight: session.lastValidBlockHeight,
  });
  markSubmitted(session.id, result);
  logger.info(
    {
      sessionId: session.id,
      kind: "zap-out",
      owner: session.owner,
      positionId: session.positionId,
      result,
    },
    "Zap-out submitted",
  );
  sendJson(res, 200, { ok: true, result });
}

function publicSession(session: ZapSession) {
  const base = {
    id: session.id,
    kind: session.kind,
    owner: session.owner,
    status: session.status,
    generationCount: session.generationCount,
    maxGenerations: MAX_GENERATIONS_PER_SESSION,
  };
  if (session.kind === "zap-in") {
    return {
      ...base,
      poolAddress: session.poolAddress,
      pairLabel: session.pairLabel,
      stratergy: session.stratergy,
      inputSOL: session.inputSOL,
      slippage_bps: session.slippage_bps,
      activeBinId: session.activeBinId,
      fromBinId: session.fromBinId,
      toBinId: session.toBinId,
      swapTxsWithJito: session.swapTxsWithJito,
      addLiquidityTxsWithJito: session.addLiquidityTxsWithJito,
      rangeBins: RANGE_BINS,
      strategies: STRATEGIES,
    };
  }
  return {
    ...base,
    positionId: session.positionId,
    pairLabel: session.pairLabel,
    output: session.output,
    bps: session.bps,
    slippage_bps: session.slippage_bps,
    swapTxsWithJito: session.swapTxsWithJito,
    closeTxsWithJito: session.closeTxsWithJito,
  };
}

function handleLpAgentError(
  res: ServerResponse,
  error: unknown,
  contextMessage: string,
  context: Record<string, unknown>,
): void {
  const status = error instanceof LpAgentError && error.statusCode ? error.statusCode : 502;
  const message = error instanceof Error ? error.message : "Request failed";
  const errBody = error instanceof LpAgentError ? error.body : undefined;
  logger.error({ ...context, status, message, body: errBody }, contextMessage);
  sendJson(res, status, { error: message, body: errBody });
}

function parseAmount(raw: unknown, label: string): number {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return value;
}

function parseStrategy(raw: unknown): ZapInStrategy {
  const normalized = String(raw ?? "").trim();
  const match = STRATEGIES.find((option) => option.toLowerCase() === normalized.toLowerCase());
  if (!match) {
    throw new Error(`Strategy must be one of: ${STRATEGIES.join(", ")}.`);
  }
  return match;
}

function parseSlippage(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new Error("Slippage must be an integer between 0 and 10000 basis points.");
  }
  return value;
}

function parseBps(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value < 1 || value > 10000) {
    throw new Error("bps must be an integer between 1 and 10000 (10000 = 100%).");
  }
  return value;
}

function extractActiveBinId(poolInfo: PoolInfo): number | null {
  const candidates: unknown[] = [
    poolInfo.liquidityViz?.activeBin?.binId,
    (poolInfo.liquidityViz?.activeBin as Record<string, unknown> | undefined)?.id,
    (poolInfo.poolState as Record<string, unknown> | undefined)?.activeId,
    (poolInfo.poolState as Record<string, unknown> | undefined)?.activeBinId,
    (poolInfo.poolStats as Record<string, unknown> | undefined)?.activeId,
    (poolInfo.poolStats as Record<string, unknown> | undefined)?.activeBinId,
  ];

  for (const candidate of candidates) {
    const value = coerceInteger(candidate);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function coerceInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function extractPairLabel(poolInfo: PoolInfo): string | null {
  const tokens = poolInfo.tokenInfo?.flatMap((entry) => entry.data ?? []) ?? [];
  const symbols = tokens.map((token) => token.symbol ?? token.name).filter(Boolean) as string[];
  return symbols.length > 0 ? symbols.join("/") : null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > 5 * 1024 * 1024) {
      throw new Error("Request body too large");
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function extractStringArray(body: unknown, key: string): string[] {
  if (!body || typeof body !== "object") {
    throw new Error("Body must be a JSON object");
  }
  const value = (body as Record<string, unknown>)[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${key} must be an array of base64 strings`);
  }
  return value as string[];
}
