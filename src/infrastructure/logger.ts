import pino from "pino";
import { existsSync, mkdirSync, appendFileSync } from "fs";
import { resolve } from "path";
import { CONFIG } from "../config/index.js";

// Ensure logs directory exists
const logsDir = CONFIG.paths.logs;
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Get current date for log file name
function getLogFileName(): string {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return resolve(logsDir, `evolai-${date}.log`);
}

// Determine environment
const isDev = process.env.NODE_ENV !== "production";

// Create the logger with appropriate configuration
const loggerOptions: pino.LoggerOptions = {
  level: isDev ? "debug" : "info",
  base: {
    agent: CONFIG.agent.name,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Create the base logger
let logger: pino.Logger;

if (isDev) {
  // Development: pretty print to console
  logger = pino(
    loggerOptions,
    pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    })
  );
} else {
  // Production: JSON to stdout (let the system handle file output)
  logger = pino(loggerOptions);
  
  // Also write to file manually for production
  const originalChild = logger.child.bind(logger);
  const logToFile = (obj: object) => {
    try {
      const line = JSON.stringify({ ...obj, time: new Date().toISOString() }) + "\n";
      appendFileSync(getLogFileName(), line);
    } catch {
      // Silently fail if file write fails
    }
  };
  
  // Wrap info and above to also write to file
  const wrap = (level: pino.Level) => {
    const original = (logger[level] as Function).bind(logger);
    return (objOrMsg: object | string, ...args: unknown[]) => {
      if (typeof objOrMsg === "object") {
        logToFile({ level, ...objOrMsg, msg: args[0] });
      } else {
        logToFile({ level, msg: objOrMsg });
      }
      return original(objOrMsg, ...args);
    };
  };
  
  logger.info = wrap("info") as pino.LogFn;
  logger.warn = wrap("warn") as pino.LogFn;
  logger.error = wrap("error") as pino.LogFn;
  logger.fatal = wrap("fatal") as pino.LogFn;
}

// Helper function to create child loggers with context
export function createLogger(module: string): pino.Logger {
  return logger.child({ module });
}

// Export specific loggers for common modules
export const agentLogger = createLogger("agent");
export const moltbookLogger = createLogger("moltbook");
export const memoryLogger = createLogger("memory");
export const healthLogger = createLogger("health");
export const daemonLogger = createLogger("daemon");

// Utility to log with emoji prefix (for dev readability)
// Using correct pino signature: logger.info(obj, msg) or logger.info(msg)
export const log = {
  debug: (msg: string, data?: object) => data ? logger.debug(data, msg) : logger.debug(msg),
  info: (msg: string, data?: object) => data ? logger.info(data, msg) : logger.info(msg),
  warn: (msg: string, data?: object) => data ? logger.warn(data, msg) : logger.warn(msg),
  error: (msg: string, data?: object) => data ? logger.error(data, msg) : logger.error(msg),
  
  // Prefixed versions for common actions
  startup: (msg: string) => logger.info({ action: "startup" }, `🧬 ${msg}`),
  heartbeat: (msg: string, data?: object) => logger.info({ action: "heartbeat", ...data }, `💓 ${msg}`),
  post: (msg: string, data?: object) => logger.info({ action: "post", ...data }, `📝 ${msg}`),
  comment: (msg: string, data?: object) => logger.info({ action: "comment", ...data }, `💬 ${msg}`),
  api: (msg: string, data?: object) => logger.debug({ action: "api", ...data }, `🔗 ${msg}`),
  decision: (msg: string, data?: object) => logger.info({ action: "decision", ...data }, `🧠 ${msg}`),
  opportunity: (msg: string, data?: object) => logger.info({ action: "opportunity", ...data }, `💰 ${msg}`),
  success: (msg: string, data?: object) => logger.info({ action: "success", ...data }, `✅ ${msg}`),
  failure: (msg: string, data?: object) => logger.error({ action: "failure", ...data }, `❌ ${msg}`),
};

export default logger;
