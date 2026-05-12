export interface LpAgentResponse<T> {
  status: string;
  data: T;
  count?: number;
  pagination?: Pagination;
  message?: string;
  error?: string;
}

export interface Pagination {
  currentPage?: number;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

export interface TokenBalance {
  tokenAddress: string;
  balance: number;
  rawBalance?: string;
  symbol: string;
  decimals?: number;
  logo?: string;
  balanceInUsd?: number;
  price?: number;
}

export interface LpPosition {
  id?: string;
  position?: string;
  status?: string;
  strategyType?: string;
  pairName?: string;
  currentValue?: string | number;
  value?: string | number;
  valueNative?: string | number;
  inputValue?: string | number;
  collectedFee?: string | number;
  unCollectedFee?: string | number;
  uncollectedFee?: string | number;
  unCollectedFeeNative?: string | number;
  pnl?: {
    value?: number;
    percent?: number;
    valueNative?: number;
    percentNative?: number;
  } | null;
  inRange?: boolean;
  pool?: string;
  tokenName0?: string;
  tokenName1?: string;
  token0Info?: {
    token_symbol?: string;
    token_name?: string;
  };
  token1Info?: {
    token_symbol?: string;
    token_name?: string;
  };
  priceRange?: number[];
  range?: number[];
  createdAt?: string;
}

export interface PortfolioOverview {
  owner: string;
  total_inflow?: number;
  total_outflow?: number;
  total_fee?: Record<string, number | string>;
  total_pnl?: Record<string, number | string>;
  total_fee_native?: Record<string, number | string>;
  total_pnl_native?: Record<string, number | string>;
  opening_lp?: string | number;
  closed_lp?: Record<string, string | number>;
  total_pool?: string | number;
  win_rate?: Record<string, number>;
  roi?: number;
  apr?: number;
  first_activity?: string;
  last_activity?: string;
}

export interface PoolDiscoveryItem {
  pool: string;
  tvl?: number;
  fee?: number;
  protocol?: string;
  chain?: string;
  token0_symbol?: string;
  token1_symbol?: string;
  token0_name?: string;
  token1_name?: string;
  vol_24h?: number;
  mcap?: number;
  organic_score?: number;
  fee_tvl_ratio?: number;
  bin_step?: number;
  created_at?: string;
}

export interface PoolInfo {
  type?: string;
  tokenInfo?: Array<{
    data?: Array<{
      id?: string;
      name?: string;
      symbol?: string;
      mcap?: number;
      fdv?: number;
      usdPrice?: number;
      organicScore?: number;
      holderCount?: number;
    }>;
  }>;
  amountX?: number;
  amountY?: number;
  feeInfo?: {
    baseFeeRatePercentage?: number;
    maxFeeRatePercentage?: number;
    protocolFeePercentage?: number;
    dynamicFee?: number;
  };
  liquidityViz?: {
    activeBin?: {
      binId?: number;
      price?: string;
      pricePerToken?: string;
    };
  };
  poolStats?: Record<string, unknown>;
  poolState?: Record<string, unknown>;
  poolDb?: Record<string, unknown>;
}

export interface PoolPositionsData {
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  positions?: PoolPosition[];
  positionState?: Array<{
    positionId: string;
    positionData: Array<{
      binId: number;
      price: string;
      pricePerToken: string;
      binXAmount: string;
      binYAmount: string;
      positionXAmount: string;
      positionYAmount: string;
      feeX: string;
      feeY: string;
    }>;
  }>;
  activeBin?: {
    binId?: number;
    price?: string;
    pricePerToken?: string;
  };
  prices?: Record<string, unknown>;
}

export interface PoolPosition extends Record<string, unknown> {
  id?: string;
  position?: string;
  positionId?: string;
  owner?: string;
  status?: string;
  pairName?: string;
  tokenName0?: string;
  tokenName1?: string;
  input?: number | string;
  inputNative?: number | string;
  inputValue?: number | string;
  inputValueNative?: number | string;
  value?: number | string;
  valueNative?: number | string;
  currentValue?: number | string;
  currentValueNative?: number | string;
  pnl?: number | string | { value?: number; valueNative?: number; percent?: number };
  pnlNative?: number | string;
  fee?: number | string;
  feeNative?: number | string;
  unCollectedFee?: number | string;
  unCollectedFeeNative?: number | string;
  inRange?: boolean;
}

export interface TopLper extends Record<string, unknown> {
  pool: string;
  owner: string;
  protocol?: string;
  token0?: string;
  token1?: string;
  total_inflow?: number;
  avg_inflow?: number;
  total_outflow?: number;
  total_fee?: number;
  total_pnl?: number;
  total_inflow_native?: number;
  avg_inflow_native?: number;
  total_outflow_native?: number;
  total_reward?: number;
  total_fee_native?: number;
  total_reward_native?: number;
  total_pnl_native?: number;
  total_lp?: number;
  avg_age_hour?: number;
  win_lp?: number;
  win_lp_native?: number;
  win_rate?: number;
  win_rate_native?: number;
  fee_percent?: number;
  fee_percent_native?: number;
  apr?: number;
  roi?: number;
  first_activity?: string;
  last_activity?: string;
}

export type ZapInStrategy = "Spot" | "Curve" | "BidAsk";

export interface ZapInTxInput {
  stratergy: ZapInStrategy;
  owner: string;
  inputSOL?: number;
  percentX?: number;
  fromBinId?: number;
  toBinId?: number;
  amountX?: number;
  amountY?: number;
  slippage_bps?: number;
  provider?: "OKX" | "JUPITER_ULTRA";
  mode?: "normal" | "zap-in";
}

export interface ZapInTxData {
  lastValidBlockHeight?: number;
  swapTxsWithJito?: string[];
  addLiquidityTxsWithJito?: string[];
  meta?: Record<string, unknown>;
}

export type ZapOutOutput = "allBaseToken" | "both" | "allToken0" | "allToken1";

export interface ZapOutTxInput {
  positionId: string;
  owner: string;
  bps: number;
  output: ZapOutOutput;
  slippage_bps?: number;
  provider?: "OKX" | "JUPITER_ULTRA";
}

export interface ZapOutTxData {
  lastValidBlockHeight?: number;
  closeTxsWithJito?: string[];
  swapTxsWithJito?: string[];
  meta?: Record<string, unknown>;
}
