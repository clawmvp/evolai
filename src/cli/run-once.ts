#!/usr/bin/env node

import { validateConfig } from "../config/index.js";
import { evolai } from "../agent/index.js";
import { log } from "../infrastructure/logger.js";

async function main() {
  log.startup("EvolAI - Single Run");

  if (!validateConfig()) {
    process.exit(1);
  }

  const initialized = await evolai.initialize();
  if (!initialized) {
    console.log("Agent not ready. Make sure you're claimed!");
    process.exit(1);
  }

  await evolai.runHeartbeat();
}

main().catch(console.error);
