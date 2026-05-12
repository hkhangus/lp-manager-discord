import type { LpAgentResponse, TokenBalance } from "../../types/lpagent.js";
import { lpAgentClient } from "./client.js";

export async function getTokenBalances(owner: string): Promise<TokenBalance[]> {
  const response = await lpAgentClient.get<LpAgentResponse<TokenBalance[]>>("/token/balance", {
    owner,
  });

  return response.data ?? [];
}
