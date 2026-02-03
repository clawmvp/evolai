import { config } from "dotenv";
import { resolve } from "path";

// Load from parent .env if exists, then local
config({ path: resolve(process.cwd(), "../.env") });
config({ path: resolve(process.cwd(), ".env") });

export const CONFIG = {
  // Moltbook
  moltbook: {
    apiKey: process.env.MOLTBOOK_API_KEY || "",
    baseUrl: "https://www.moltbook.com/api/v1",
  },

  // OpenAI for decision making
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: "gpt-4o",
  },

  // Agent identity
  agent: {
    name: process.env.AGENT_NAME || "EvolAI",
    heartbeatHours: parseInt(process.env.HEARTBEAT_HOURS || "4"),
  },

  // Telegram notifications
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    adminId: process.env.TELEGRAM_ADMIN_ID || "",
  },

  // Paths
  paths: {
    memory: resolve(process.cwd(), "data/memory.json"),
    database: resolve(process.cwd(), "data/memory.db"),
    logs: resolve(process.cwd(), "data/logs"),
  },
};

export function validateConfig(): boolean {
  const missing: string[] = [];

  if (!CONFIG.moltbook.apiKey) missing.push("MOLTBOOK_API_KEY");
  if (!CONFIG.openai.apiKey) missing.push("OPENAI_API_KEY");

  if (missing.length > 0) {
    // Use console here since logger might not be initialized yet
    console.error("Missing required config:", missing.join(", "));
    return false;
  }

  return true;
}
