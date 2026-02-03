#!/usr/bin/env node

import cron from "node-cron";
import { validateConfig, CONFIG } from "./config/index.js";
import { evolai } from "./agent/index.js";
import { notify } from "./notifications/index.js";
import { daemonLogger as logger, log } from "./infrastructure/logger.js";
import { startHealthServer } from "./infrastructure/health.js";
import { telegramBot } from "./telegram/bot.js";
import { runSelfImprovement, versionManager } from "./self-improvement/index.js";
import { learner } from "./knowledge/index.js";

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

  // Autonomous self-improvement cycle every 12 hours (at 6:00 and 18:00)
  cron.schedule("0 6,18 * * *", async () => {
    logger.info("🤖 Scheduled AUTONOMOUS self-improvement cycle starting...");
    const currentVersion = versionManager.getCurrentVersion();
    
    try {
      const result = await runSelfImprovement();
      
      if (result.improvementsImplemented > 0) {
        logger.info({
          previousVersion: currentVersion,
          newVersions: result.versionsCreated,
          implemented: result.improvementsImplemented,
          commits: result.commits,
        }, "🤖 Autonomous self-improvement complete - changes implemented!");
      } else {
        logger.info("Self-improvement cycle complete - no changes needed");
      }
    } catch (error) {
      logger.error({ error: String(error) }, "Self-improvement cycle failed");
    }
  });

  // Log current version on startup
  logger.info({ version: versionManager.getCurrentVersion() }, "EvolAI version");

  // Learning cycle every 6 hours (at 3:00, 9:00, 15:00, 21:00)
  cron.schedule("0 3,9,15,21 * * *", async () => {
    logger.info("🎓 Scheduled learning cycle starting...");
    
    try {
      const result = await learner.runLearningCycle();
      
      if (result.totalInsights.length > 0) {
        logger.info({
          topic: result.topic,
          learned: result.newsLearned + result.topicLearned,
        }, "🎓 Learning cycle complete - new knowledge acquired!");
      } else {
        logger.info("Learning cycle complete - no new insights this time");
      }
    } catch (error) {
      logger.error({ error: String(error) }, "Learning cycle failed");
    }
  });

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
