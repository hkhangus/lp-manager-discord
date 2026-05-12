import type {
  LpAgentResponse,
  PoolDiscoveryItem,
  PoolInfo,
  PoolPositionsData,
  TopLper,
  ZapInTxData,
  ZapInTxInput,
} from "../../types/lpagent.js";
import { lpAgentClient } from "./client.js";

export interface DiscoverPoolsInput {
  search?: string;
  sortBy?: "mcap" | "created_at" | "vol_24h" | "tvl" | "fee_tvl_ratio" | "volatility";
  page?: number;
  pageSize?: number;
}

export interface GetPoolPositionsInput {
  owner?: string;
  status?: "Open" | "Close";
  page?: number;
  pageSize?: number;
  orderBy?: string;
  sortOrder?: "asc" | "desc";
  platform?: string;
  pnlThreshold?: number;
  pnlNativeThreshold?: number;
}

export interface GetTopLpersInput {
  orderBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export async function discoverPools(input: DiscoverPoolsInput): Promise<{
  pools: PoolDiscoveryItem[];
  pagination: LpAgentResponse<PoolDiscoveryItem[]>["pagination"];
}> {
  const response = await lpAgentClient.get<LpAgentResponse<PoolDiscoveryItem[]>>(
    "/pools/discover",
    {
      chain: "SOL",
      type: "meteora",
      search: input.search,
      sortBy: input.sortBy ?? "fee_tvl_ratio",
      sortOrder: "desc",
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 5,
    },
  );

  return {
    pools: response.data ?? [],
    pagination: response.pagination,
  };
}

export async function getPoolInfo(poolId: string): Promise<PoolInfo> {
  const response = await lpAgentClient.get<LpAgentResponse<PoolInfo>>(
    `/pools/${encodeURIComponent(poolId)}/info`,
  );

  return response.data;
}

export async function getPoolPositions(
  poolId: string,
  input: GetPoolPositionsInput = {},
): Promise<PoolPositionsData> {
  const response = await lpAgentClient.get<LpAgentResponse<PoolPositionsData>>(
    `/pools/${encodeURIComponent(poolId)}/positions`,
    {
      owner: input.owner,
      status: input.status,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 5,
      order_by: input.orderBy ?? "inputNative",
      sort_order: input.sortOrder ?? "desc",
      platform: input.platform,
      pnl_threshold: input.pnlThreshold,
      pnl_native_threshold: input.pnlNativeThreshold,
    },
  );

  return response.data;
}

export async function getTopLpers(
  poolId: string,
  input: GetTopLpersInput = {},
): Promise<{
  lpers: TopLper[];
  pagination: LpAgentResponse<TopLper[]>["pagination"];
}> {
  const response = await lpAgentClient.get<LpAgentResponse<TopLper[]>>(
    `/pools/${encodeURIComponent(poolId)}/top-lpers`,
    {
      order_by: input.orderBy ?? "total_pnl_native",
      sort_order: input.sortOrder ?? "desc",
      page: input.page ?? 1,
      limit: input.limit ?? 5,
    },
  );

  return {
    lpers: response.data ?? [],
    pagination: response.pagination,
  };
}

export async function generateZapInTx(poolId: string, input: ZapInTxInput): Promise<ZapInTxData> {
  const response = await lpAgentClient.post<LpAgentResponse<ZapInTxData>>(
    `/pools/${encodeURIComponent(poolId)}/add-tx`,
    {
      stratergy: input.stratergy,
      owner: input.owner,
      inputSOL: input.inputSOL,
      percentX: input.percentX,
      fromBinId: input.fromBinId,
      toBinId: input.toBinId,
      amountX: input.amountX,
      amountY: input.amountY,
      slippage_bps: input.slippage_bps,
      provider: input.provider,
      mode: input.mode ?? "zap-in",
    },
  );

  return response.data;
}

export interface SubmitZapInLandingInput {
  swapTxsWithJito: string[];
  addLiquidityTxsWithJito: string[];
  lastValidBlockHeight: number | null;
  meta: Record<string, unknown>;
}

export async function submitZapInLanding(input: SubmitZapInLandingInput): Promise<unknown> {
  const response = await lpAgentClient.post<LpAgentResponse<unknown>>("/pools/landing-add-tx", {
    swapTxsWithJito: input.swapTxsWithJito,
    addLiquidityTxsWithJito: input.addLiquidityTxsWithJito,
    lastValidBlockHeight: input.lastValidBlockHeight ?? undefined,
    meta: input.meta,
  });

  return response.data;
}
