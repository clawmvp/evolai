import {
  telegram,
  HeartbeatStats,
  OpportunityInfo,
  DailyDigestStats,
} from "./telegram.js";

/**
 * Unified notification service
 * Handles all notification channels with graceful fallbacks
 */
class NotificationService {
  /**
   * Send critical alert
   */
  async alert(message: string, error?: Error): Promise<void> {
    console.log(`🚨 ALERT: ${message}`);
    if (error) {
      console.error(error);
    }

    // Try Telegram
    if (telegram.isEnabled()) {
      await telegram.sendAlert(message, error);
    }
  }

  /**
   * Send heartbeat summary
   */
  async heartbeatSummary(stats: HeartbeatStats): Promise<void> {
    if (telegram.isEnabled()) {
      await telegram.sendHeartbeatSummary(stats);
    }
  }

  /**
   * Notify about a new opportunity
   */
  async opportunity(info: OpportunityInfo): Promise<void> {
    console.log(`💡 Opportunity: ${info.type} - ${info.description}`);

    if (telegram.isEnabled()) {
      await telegram.sendOpportunity(info);
    }
  }

  /**
   * Send daily digest
   */
  async dailyDigest(stats: DailyDigestStats): Promise<void> {
    if (telegram.isEnabled()) {
      await telegram.sendDailyDigest(stats);
    }
  }

  /**
   * Notify startup
   */
  async startup(): Promise<void> {
    console.log("🚀 Agent starting...");

    if (telegram.isEnabled()) {
      await telegram.sendStartup();
    }
  }

  /**
   * Notify shutdown
   */
  async shutdown(reason?: string): Promise<void> {
    console.log(`👋 Agent shutting down${reason ? `: ${reason}` : ""}`);

    if (telegram.isEnabled()) {
      await telegram.sendShutdown(reason);
    }
  }

  /**
   * Send a general finding/update
   */
  async finding(title: string, description: string): Promise<void> {
    console.log(`🧬 Finding: ${title} - ${description}`);

    if (telegram.isEnabled()) {
      await telegram.sendFinding({
        title,
        description,
        category: "insight",
      });
    }
  }

  /**
   * Check if any notification channel is available
   */
  isEnabled(): boolean {
    return telegram.isEnabled();
  }
}

// Export singleton and types
export const notify = new NotificationService();
export { telegram } from "./telegram.js";
export type { HeartbeatStats, OpportunityInfo, DailyDigestStats } from "./telegram.js";
