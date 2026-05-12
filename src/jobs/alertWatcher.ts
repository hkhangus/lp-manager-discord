import type { Client } from "discord.js";
import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { runAlertScan } from "../services/alertService.js";
import { logger } from "../utils/logger.js";

export function startAlertWatcher(client: Client): ScheduledTask {
  if (!cron.validate(env.ALERT_CRON)) {
    throw new Error(`Invalid ALERT_CRON value: ${env.ALERT_CRON}`);
  }

  let running = false;

  const task = cron.schedule(env.ALERT_CRON, async () => {
    if (running) {
      logger.warn("Skipping alert scan because the previous scan is still running");
      return;
    }

    running = true;
    try {
      await runAlertScan(client);
    } catch (error) {
      logger.error({ error }, "Alert scan failed");
    } finally {
      running = false;
    }
  });

  logger.info({ cron: env.ALERT_CRON }, "Alert watcher started");
  return task;
}
