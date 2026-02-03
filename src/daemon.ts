#!/usr/bin/env node

import cron from "node-cron";
import { validateConfig, CONFIG } from "./config/index.js";
import { evolai } from "./agent/index.js";

async function main() {
  console.log("🧬 EvolAI Daemon Starting...\n");

  if (!validateConfig()) {
    process.exit(1);
  }

  const initialized = await evolai.initialize();
  if (!initialized) {
    console.log("\n⚠️  Agent not ready. Waiting for claim...");
    console.log("   Will retry every hour.");
  }

  // Run immediately on start
  console.log("\n🚀 Running initial heartbeat...");
  await evolai.runHeartbeat();

  // Schedule heartbeats
  const hours = CONFIG.agent.heartbeatHours;
  const cronExpression = `0 */${hours} * * *`; // Every N hours

  console.log(`\n⏰ Scheduling heartbeats every ${hours} hours`);
  console.log(`   Cron expression: ${cronExpression}`);
  console.log("\n🔄 Daemon running. Press Ctrl+C to stop.\n");

  cron.schedule(cronExpression, async () => {
    console.log("\n⏰ Scheduled heartbeat triggered");
    await evolai.runHeartbeat();
  });

  // Also run a quick check every hour to look for opportunities
  cron.schedule("30 * * * *", async () => {
    console.log("\n👀 Quick opportunity scan...");
    // Just check for @mentions or DMs in the future
    // For now, this is a placeholder
  });

  // Keep the process alive
  process.on("SIGINT", () => {
    console.log("\n\n👋 EvolAI shutting down gracefully...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\n👋 EvolAI terminated...");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
