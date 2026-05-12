import type {
  LpAgentResponse,
  LpPosition,
  PortfolioOverview,
  ZapOutTxData,
  ZapOutTxInput,
} from "../../types/lpagent.js";
import { lpAgentClient } from "./client.js";

export async function getOpeningPositions(owner: string): Promise<LpPosition[]> {
  const response = await lpAgentClient.get<LpAgentResponse<LpPosition[]>>("/lp-positions/opening", {
    owner,
  });

  return response.data ?? [];
}

export async function getPortfolioOverview(owner: string): Promise<PortfolioOverview> {
  const response = await lpAgentClient.get<LpAgentResponse<PortfolioOverview>>(
    "/lp-positions/overview",
    {
      owner,
    },
  );

  return response.data;
}

export async function generateZapOutTx(input: ZapOutTxInput): Promise<ZapOutTxData> {
  const response = await lpAgentClient.post<LpAgentResponse<ZapOutTxData>>(
    "/position/decrease-tx",
    {
      position_id: input.positionId,
      owner: input.owner,
      bps: input.bps,
      output: "allBaseToken",
      slippage_bps: input.slippage_bps,
      provider: input.provider,
    },
  );

  return response.data;
}

export interface SubmitZapOutLandingInput {
  closeTxsWithJito: string[];
  swapTxsWithJito: string[];
  lastValidBlockHeight: number | null;
}

export async function submitZapOutLanding(input: SubmitZapOutLandingInput): Promise<unknown> {
  const response = await lpAgentClient.post<LpAgentResponse<unknown>>(
    "/position/landing-decrease-tx",
    {
      lastValidBlockHeight: input.lastValidBlockHeight ?? undefined,
      closeTxs: [],
      swapTxs: [],
      closeTxsWithJito: input.closeTxsWithJito,
      swapTxsWithJito: input.swapTxsWithJito,
    },
  );

  return response.data;
}
