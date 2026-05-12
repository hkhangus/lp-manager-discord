export class BotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BotError";
  }
}

export class LpAgentError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "LpAgentError";
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof BotError) {
    return error.message;
  }

  if (error instanceof LpAgentError) {
    return `LPAgent API error${error.statusCode ? ` (${error.statusCode})` : ""}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while handling that command.";
}
