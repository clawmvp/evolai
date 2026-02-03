#!/usr/bin/env node

import cron from "node-cron";
import { validateConfig, CONFIG } from "./config/index.js";
import { evolai } from "./agent/index.js";
import { notify } from "./notifications/index.js";
import { daemonLogger as logger, log } from "./infrastructure/logger.js";
import { startHealthServer } from "./infrastructure/health.js";

async function main() {
  log.startup("EvolAI Daemon Starting...");

  if (!validateConfig()) {
    process.exit(1);
  }

  // Start health check server
  startHealthServer();

  const initialized = await evolai.initialize();
  if (!initialized) {
    logger.warn("Agent not ready. Waiting for claim... Will retry every hour.");
  }

  // Send startup notification
  await notify.startup();

  // Run immediately on start
  logger.info("Running initial heartbeat...");
  await evolai.runHeartbeat();

  // Schedule heartbeats
  const hours = CONFIG.agent.heartbeatHours;
  const cronExpression = `0 */${hours} * * *`; // Every N hours

  logger.info({ intervalHours: hours, cronExpression }, "Scheduling heartbeats");
  logger.info("Daemon running. Press Ctrl+C to stop.");

  cron.schedule(cronExpression, async () => {
    logger.info("Scheduled heartbeat triggered");
    await evolai.runHeartbeat();
  });

  // Also run a quick check every hour to look for opportunities
  cron.schedule("30 * * * *", async () => {
    logger.debug("Quick opportunity scan...");
    // Just check for @mentions or DMs in the future
    // For now, this is a placeholder
  });

  // Keep the process alive with graceful shutdown
  process.on("SIGINT", async () => {
    logger.info("EvolAI shutting down gracefully...");
    await notify.shutdown("Manual stop (SIGINT)");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("EvolAI terminated...");
    await notify.shutdown("Process terminated (SIGTERM)");
    process.exit(0);
  });
}

main().catch(async (error) => {
  logger.fatal({ error: String(error) }, "Fatal error");
  await notify.alert("Fatal daemon error", error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});
