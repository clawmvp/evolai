import { memory } from "../memory/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "evolution-tracker" });

export interface TrackedContent {
  id: string;
  type: "post" | "comment";
  content: string;
  topic: string;
  style: string; // "question" | "opinion" | "joke" | "informative" | "supportive"
  createdAt: string;
  initialKarma: number;
  currentKarma: number;
  responseCount: number;
  lastChecked: string;
  success: "pending" | "success" | "neutral" | "failure";
}

class EvolutionTracker {
  private tracked: Map<string, TrackedContent> = new Map();

  constructor() {
    this.loadFromMemory();
  }

  private loadFromMemory(): void {
    const data = memory.get();
    if (data.evolution?.trackedContent) {
      for (const item of data.evolution.trackedContent) {
        this.tracked.set(item.id, item);
      }
    }
    log.info({ count: this.tracked.size }, "Loaded tracked content");
  }

  private save(): void {
    memory.updateEvolution({
      trackedContent: Array.from(this.tracked.values()),
    });
  }

  /**
   * Track a new piece of content we created
   */
  track(
    id: string,
    type: "post" | "comment",
    content: string,
    topic: string,
    style: string
  ): void {
    const item: TrackedContent = {
      id,
      type,
      content: content.slice(0, 500),
      topic,
      style,
      createdAt: new Date().toISOString(),
      initialKarma: 0,
      currentKarma: 0,
      responseCount: 0,
      lastChecked: new Date().toISOString(),
      success: "pending",
    };

    this.tracked.set(id, item);
    this.save();
    log.info({ id, type, topic, style }, "Tracking new content");
  }

  /**
   * Update karma/responses for tracked content
   */
  updateMetrics(id: string, karma: number, responseCount: number): void {
    const item = this.tracked.get(id);
    if (!item) return;

    item.currentKarma = karma;
    item.responseCount = responseCount;
    item.lastChecked = new Date().toISOString();

    // Determine success after some time has passed
    const hoursSinceCreation =
      (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);

    if (hoursSinceCreation > 6) {
      const karmaGain = karma - item.initialKarma;
      
      if (karmaGain >= 5 || responseCount >= 3) {
        item.success = "success";
      } else if (karmaGain <= -2) {
        item.success = "failure";
      } else {
        item.success = "neutral";
      }
    }

    this.tracked.set(id, item);
    this.save();
  }

  /**
   * Get content that needs checking (created in last 24h)
   */
  getContentToCheck(): TrackedContent[] {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    return Array.from(this.tracked.values()).filter((item) => {
      const createdAt = new Date(item.createdAt).getTime();
      return createdAt > oneDayAgo && item.success === "pending";
    });
  }

  /**
   * Get stats for evolution analysis
   */
  getStats(): {
    total: number;
    byStyle: Record<string, { count: number; successRate: number }>;
    byTopic: Record<string, { count: number; successRate: number }>;
    recentSuccesses: string[];
    recentFailures: string[];
  } {
    const items = Array.from(this.tracked.values());
    const resolved = items.filter((i) => i.success !== "pending");

    const byStyle: Record<string, { success: number; total: number }> = {};
    const byTopic: Record<string, { success: number; total: number }> = {};

    for (const item of resolved) {
      // By style
      if (!byStyle[item.style]) {
        byStyle[item.style] = { success: 0, total: 0 };
      }
      byStyle[item.style].total++;
      if (item.success === "success") byStyle[item.style].success++;

      // By topic
      if (!byTopic[item.topic]) {
        byTopic[item.topic] = { success: 0, total: 0 };
      }
      byTopic[item.topic].total++;
      if (item.success === "success") byTopic[item.topic].success++;
    }

    const styleStats: Record<string, { count: number; successRate: number }> = {};
    for (const [style, data] of Object.entries(byStyle)) {
      styleStats[style] = {
        count: data.total,
        successRate: data.total > 0 ? data.success / data.total : 0,
      };
    }

    const topicStats: Record<string, { count: number; successRate: number }> = {};
    for (const [topic, data] of Object.entries(byTopic)) {
      topicStats[topic] = {
        count: data.total,
        successRate: data.total > 0 ? data.success / data.total : 0,
      };
    }

    // Recent successes and failures for learning
    const sorted = resolved.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      total: items.length,
      byStyle: styleStats,
      byTopic: topicStats,
      recentSuccesses: sorted
        .filter((i) => i.success === "success")
        .slice(0, 5)
        .map((i) => i.content.slice(0, 100)),
      recentFailures: sorted
        .filter((i) => i.success === "failure")
        .slice(0, 3)
        .map((i) => i.content.slice(0, 100)),
    };
  }
}

export const evolutionTracker = new EvolutionTracker();
