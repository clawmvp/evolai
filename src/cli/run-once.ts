#!/usr/bin/env node

import { validateConfig } from "../config/index.js";
import { evolai } from "../agent/index.js";

async function main() {
  console.log("🧬 EvolAI - Single Run\n");

  if (!validateConfig()) {
    process.exit(1);
  }

  const initialized = await evolai.initialize();
  if (!initialized) {
    console.log("\n⚠️  Agent not ready. Make sure you're claimed!");
    process.exit(1);
  }

  await evolai.runHeartbeat();
}

main().catch(console.error);
