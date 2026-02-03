#!/usr/bin/env node

import cron from "node-cron";
import { validateConfig, CONFIG } from "./config/index.js";
import { evolai } from "./agent/index.js";
import { notify } from "./notifications/index.js";
import { daemonLogger as logger, log } from "./infrastructure/logger.js";
import { startHealthServer } from "./infrastructure/health.js";
import { telegramBot } from "./telegram/bot.js";
import { runSelfImprovement, versionManager } from "./self-improvement/index.js";

async function main() {
  log.startup("EvolAI Daemon Starting...");

  if (!validateConfig()) {
    process.exit(1);
  }

  // Start health check server
  startHealthServer();

  // Start Telegram chat bot
  if (telegramBot.isEnabled()) {
    logger.info("Telegram chat bot is running - you can now talk to EvolAI! 💬");
  }

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

  // Self-improvement cycle every 12 hours (at 6:00 and 18:00)
  cron.schedule("0 6,18 * * *", async () => {
    logger.info("🔧 Scheduled self-improvement cycle starting...");
    const currentVersion = versionManager.getCurrentVersion();
    
    try {
      const result = await runSelfImprovement();
      
      if (result.versionsCreated.length > 0) {
        logger.info({
          previousVersion: currentVersion,
          newVersions: result.versionsCreated,
          proposals: result.proposalsGenerated,
        }, "Self-improvement complete - new versions created!");
      } else {
        logger.info("Self-improvement cycle complete - no changes needed");
      }
    } catch (error) {
      logger.error({ error: String(error) }, "Self-improvement cycle failed");
    }
  });

  // Log current version on startup
  logger.info({ version: versionManager.getCurrentVersion() }, "EvolAI version");

  // Quick check every hour for opportunities
  cron.schedule("30 * * * *", async () => {
    logger.debug("Quick opportunity scan...");
    // Placeholder for future checks
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
