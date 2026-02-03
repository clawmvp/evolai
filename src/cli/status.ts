#!/usr/bin/env node

import { validateConfig } from "../config/index.js";
import { evolai } from "../agent/index.js";

async function main() {
  if (!validateConfig()) {
    process.exit(1);
  }

  await evolai.showStatus();
}

main().catch(console.error);
