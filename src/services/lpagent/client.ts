import { env } from "../../config/env.js";
import { LpAgentError } from "../../utils/errors.js";

export class LpAgentClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl = env.LPAGENT_API_BASE_URL,
    private readonly apiKey = env.LPAGENT_API_KEY,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": this.apiKey,
      },
    });

    const body = await readResponseBody(response);

    if (!response.ok) {
      throw new LpAgentError(extractErrorMessage(body), response.status, body);
    }

    if (isErrorResponse(body)) {
      throw new LpAgentError(extractErrorMessage(body), response.status, body);
    }

    return body as T;
  }

  async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const responseBody = await readResponseBody(response);

    if (!response.ok) {
      throw new LpAgentError(extractErrorMessage(responseBody), response.status, responseBody);
    }

    if (isErrorResponse(responseBody)) {
      throw new LpAgentError(extractErrorMessage(responseBody), response.status, responseBody);
    }

    return responseBody as T;
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function extractErrorMessage(body: unknown): string {
  if (typeof body === "string") {
    return body || "Empty LPAgent response";
  }

  if (body && typeof body === "object") {
    const maybeError = body as { message?: unknown; error?: unknown };
    if (typeof maybeError.message === "string") {
      return maybeError.message;
    }
    if (typeof maybeError.error === "string") {
      return maybeError.error;
    }
    try {
      return JSON.stringify(body);
    } catch {
      return "Unexpected LPAgent response";
    }
  }

  return "Unexpected LPAgent response";
}

function isErrorResponse(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }

  const maybeResponse = body as { status?: unknown };
  return typeof maybeResponse.status === "string" && maybeResponse.status.toLowerCase() === "error";
}

export const lpAgentClient = new LpAgentClient();
