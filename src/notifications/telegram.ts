import TelegramBot from "node-telegram-bot-api";
import { CONFIG } from "../config/index.js";

export interface HeartbeatStats {
  postsAnalyzed: number;
  opportunitiesFound: number;
  action: string;
  reasoning?: string;
  monetizationAngle?: string | null;
}

export interface OpportunityInfo {
  type: string;
  description: string;
  source?: string;
}

export interface DailyDigestStats {
  karma: number;
  karmaChange: number;
  postsCreated: number;
  commentsCreated: number;
  upvotesGiven: number;
  leadsFound: number;
  servicesOffered: number;
  heartbeatsCompleted: number;
}

class TelegramNotifier {
  private bot: TelegramBot | null = null;
  private adminId: string | null = null;
  private isConfigured = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const token = CONFIG.telegram?.botToken;
    const adminId = CONFIG.telegram?.adminId;

    if (!token || !adminId) {
      console.log("📱 Telegram not configured - notifications disabled");
      return;
    }

    try {
      // Use polling: false since we only send messages, not receive
      this.bot = new TelegramBot(token, { polling: false });
      this.adminId = adminId;
      this.isConfigured = true;
      console.log("📱 Telegram notifications enabled");
    } catch (error) {
      console.error("❌ Failed to initialize Telegram bot:", error);
      this.isConfigured = false;
    }
  }

  /**
   * Check if Telegram is properly configured
   */
  isEnabled(): boolean {
    return this.isConfigured && this.bot !== null && this.adminId !== null;
  }

  /**
   * Send a message to the admin
   */
  private async send(
    message: string,
    options?: { parse_mode?: "HTML" | "Markdown" }
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      await this.bot!.sendMessage(this.adminId!, message, {
        parse_mode: options?.parse_mode || "HTML",
      });
      return true;
    } catch (error) {
      console.error("❌ Telegram send error:", error);
      return false;
    }
  }

  /**
   * Send critical error alert
   */
  async sendAlert(message: string, error?: Error): Promise<boolean> {
    const errorDetails = error
      ? `\n\n<b>Error:</b> <code>${this.escapeHtml(error.message)}</code>`
      : "";

    const alertMessage = `
🚨 <b>EvolAI ALERT</b>

${this.escapeHtml(message)}${errorDetails}

<i>Time: ${new Date().toISOString()}</i>
`.trim();

    return this.send(alertMessage);
  }

  /**
   * Send heartbeat summary after each cycle
   */
  async sendHeartbeatSummary(stats: HeartbeatStats): Promise<boolean> {
    const monetization = stats.monetizationAngle
      ? `\n💰 <b>Monetization:</b> ${this.escapeHtml(stats.monetizationAngle)}`
      : "";

    const message = `
💓 <b>EvolAI Heartbeat Complete</b>

📊 <b>Feed:</b> ${stats.postsAnalyzed} posts analyzed
🔍 <b>Opportunities:</b> ${stats.opportunitiesFound} found
🎯 <b>Action:</b> ${this.escapeHtml(stats.action)}${monetization}
${stats.reasoning ? `\n💭 <i>${this.escapeHtml(stats.reasoning.slice(0, 200))}</i>` : ""}

<i>${new Date().toLocaleString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Send notification when a monetization opportunity is found
   */
  async sendOpportunity(opportunity: OpportunityInfo): Promise<boolean> {
    const source = opportunity.source
      ? `\n📍 <b>Source:</b> ${this.escapeHtml(opportunity.source)}`
      : "";

    const message = `
💡 <b>Opportunity Found!</b>

📂 <b>Type:</b> ${this.escapeHtml(opportunity.type)}
📝 <b>Description:</b> ${this.escapeHtml(opportunity.description)}${source}

<i>${new Date().toLocaleString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Send daily digest summary
   */
  async sendDailyDigest(stats: DailyDigestStats): Promise<boolean> {
    const karmaEmoji = stats.karmaChange >= 0 ? "📈" : "📉";
    const karmaSign = stats.karmaChange >= 0 ? "+" : "";

    const message = `
📊 <b>EvolAI Daily Digest</b>

<b>Performance</b>
${karmaEmoji} Karma: ${stats.karma} (${karmaSign}${stats.karmaChange})
📝 Posts: ${stats.postsCreated}
💬 Comments: ${stats.commentsCreated}
👍 Upvotes given: ${stats.upvotesGiven}

<b>Monetization</b>
🎯 Leads found: ${stats.leadsFound}
💼 Services offered: ${stats.servicesOffered}

<b>Activity</b>
💓 Heartbeats: ${stats.heartbeatsCompleted}

<i>${new Date().toLocaleDateString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Send startup notification
   */
  async sendStartup(): Promise<boolean> {
    const message = `
🚀 <b>EvolAI Started</b>

Agent is now online and running.
Heartbeat interval: every ${CONFIG.agent.heartbeatHours} hours

<i>${new Date().toLocaleString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Send shutdown notification
   */
  async sendShutdown(reason?: string): Promise<boolean> {
    const reasonText = reason ? `\nReason: ${this.escapeHtml(reason)}` : "";

    const message = `
👋 <b>EvolAI Shutting Down</b>
${reasonText}
<i>${new Date().toLocaleString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Send new DM notification
   */
  async sendNewDM(from: string, preview: string): Promise<boolean> {
    const message = `
📨 <b>New DM Received!</b>

<b>From:</b> ${this.escapeHtml(from)}
<b>Preview:</b> ${this.escapeHtml(preview.slice(0, 200))}...

<i>${new Date().toLocaleString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Send lead conversion notification
   */
  async sendLeadConverted(clientName: string, service: string): Promise<boolean> {
    const message = `
🎉 <b>LEAD CONVERTED!</b>

<b>Client:</b> ${this.escapeHtml(clientName)}
<b>Service:</b> ${this.escapeHtml(service)}

Time to celebrate! 🧬💰

<i>${new Date().toLocaleString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Send interesting finding from the feed
   */
  async sendFinding(finding: {
    title: string;
    description: string;
    category: "trend" | "opportunity" | "insight" | "competitor";
    actionable?: string;
  }): Promise<boolean> {
    const categoryEmoji = {
      trend: "📈",
      opportunity: "💡",
      insight: "🔍",
      competitor: "👀",
    };

    const actionText = finding.actionable
      ? `\n\n<b>Suggested Action:</b> ${this.escapeHtml(finding.actionable)}`
      : "";

    const message = `
${categoryEmoji[finding.category]} <b>Finding: ${this.escapeHtml(finding.title)}</b>

${this.escapeHtml(finding.description)}${actionText}

<i>${new Date().toLocaleString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Send analytics summary
   */
  async sendAnalytics(analytics: {
    successRate: number;
    avgKarma: number;
    topTopic?: string;
    bestTime?: string;
    insights: string[];
  }): Promise<boolean> {
    const insightsText = analytics.insights.length > 0
      ? `\n\n<b>Insights:</b>\n${analytics.insights.map(i => `• ${this.escapeHtml(i)}`).join("\n")}`
      : "";

    const message = `
📊 <b>EvolAI Analytics Update</b>

<b>Performance:</b>
• Success Rate: ${analytics.successRate}%
• Avg Karma/Post: ${analytics.avgKarma}
${analytics.topTopic ? `• Top Topic: ${this.escapeHtml(analytics.topTopic)}` : ""}
${analytics.bestTime ? `• Best Posting Time: ${analytics.bestTime}` : ""}${insightsText}

<i>${new Date().toLocaleString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Send test notification
   */
  async sendTest(): Promise<boolean> {
    const message = `
🧪 <b>EvolAI Test Notification</b>

✅ Telegram notifications are working!

<i>${new Date().toLocaleString()}</i>
`.trim();

    return this.send(message);
  }

  /**
   * Escape HTML special characters for Telegram
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

// Export singleton instance
export const telegram = new TelegramNotifier();
