#!/usr/bin/env node

import { validateConfig } from "../config/index.js";
import { evolai } from "../agent/index.js";

async function main() {
  if (!validateConfig()) {
    process.exit(1);
  }

  await evolai.showStatus();

  // Also print to console for CLI readability
  const { memory } = await import("../memory/index.js");
  console.log("\n" + memory.getMemorySummary());
}

main().catch(console.error);
