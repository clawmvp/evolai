#!/usr/bin/env node

import { telegram } from "../notifications/telegram.js";

async function main() {
  console.log("🧪 Testing Telegram notifications...\n");

  if (!telegram.isEnabled()) {
    console.log("❌ Telegram not configured!");
    console.log("   Add TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_ID to .env");
    process.exit(1);
  }

  console.log("✅ Telegram is configured");
  console.log("📤 Sending test notification...\n");

  const success = await telegram.sendTest();

  if (success) {
    console.log("✅ Test notification sent!");
    console.log("   Check your Telegram for the message.");
  } else {
    console.log("❌ Failed to send notification");
  }
}

main().catch(console.error);
