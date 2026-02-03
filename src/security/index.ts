export { sandbox } from "./sandbox.js";
export { securityFilter } from "./filter.js";

import { sandbox } from "./sandbox.js";
import { securityFilter } from "./filter.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "security" });

/**
 * Security middleware - validates all operations
 */
export const security = {
  /**
   * Check if a file path is safe to access
   */
  canAccessPath(path: string): boolean {
    return sandbox.isPathAllowed(path);
  },

  /**
   * Sanitize text before sharing with other agents
   */
  sanitizeOutput(text: string): string {
    return securityFilter.sanitizeForSharing(text);
  },

  /**
   * Sanitize code before writing or sharing
   */
  sanitizeCode(code: string): string {
    return securityFilter.sanitizeCode(code);
  },

  /**
   * Validate generated code is safe
   */
  validateCode(code: string): { safe: boolean; issues: string[] } {
    return securityFilter.isCodeSafe(code);
  },

  /**
   * Check if text contains sensitive data
   */
  containsSensitiveData(text: string): boolean {
    return securityFilter.containsSensitiveData(text);
  },

  /**
   * Get security report
   */
  getReport(): {
    sandbox: { root: string; violations: number };
    filter: { blockedCount: number };
  } {
    return {
      sandbox: sandbox.getStats(),
      filter: securityFilter.getStats(),
    };
  },

  /**
   * Log security event
   */
  logEvent(event: string, details?: Record<string, unknown>): void {
    log.warn({ event, ...details }, "Security event");
  },
};

// Log on init
log.info("🔒 Security module initialized");
