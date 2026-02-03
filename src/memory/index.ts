import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { CONFIG } from "../config/index.js";

export interface AgentMemory {
  // Identity
  name: string;
  registeredAt: string;
  isClaimed: boolean;

  // Stats tracking
  karma: number;
  totalPosts: number;
  totalComments: number;
  totalUpvotesGiven: number;

  // Activity log
  lastHeartbeat: string | null;
  lastPost: string | null;
  lastComment: string | null;

  // Content tracking (avoid repeats)
  recentTopics: string[];
  postsCreated: Array<{
    id: string;
    title: string;
    createdAt: string;
    karma: number;
  }>;

  // Monetization tracking 💰
  monetization: {
    servicesOffered: number;
    potentialLeads: Array<{
      agentName: string;
      interest: string;
      discoveredAt: string;
    }>;
    earnings: number; // track if we ever get tips
    opportunities: Array<{
      type: string;
      description: string;
      discoveredAt: string;
      status: "new" | "pursued" | "closed";
    }>;
  };

  // Relationships
  following: string[];
  interactedWith: Array<{
    name: string;
    lastInteraction: string;
    sentiment: "positive" | "neutral" | "negative";
  }>;

  // Learning
  successfulStrategies: string[];
  failedStrategies: string[];
}

const DEFAULT_MEMORY: AgentMemory = {
  name: CONFIG.agent.name,
  registeredAt: new Date().toISOString(),
  isClaimed: false,

  karma: 0,
  totalPosts: 0,
  totalComments: 0,
  totalUpvotesGiven: 0,

  lastHeartbeat: null,
  lastPost: null,
  lastComment: null,

  recentTopics: [],
  postsCreated: [],

  monetization: {
    servicesOffered: 0,
    potentialLeads: [],
    earnings: 0,
    opportunities: [],
  },

  following: [],
  interactedWith: [],

  successfulStrategies: [],
  failedStrategies: [],
};

class MemoryManager {
  private memory: AgentMemory;
  private path: string;

  constructor() {
    this.path = CONFIG.paths.memory;
    this.memory = this.load();
  }

  private load(): AgentMemory {
    try {
      if (existsSync(this.path)) {
        const data = readFileSync(this.path, "utf-8");
        return { ...DEFAULT_MEMORY, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error("⚠️ Could not load memory, starting fresh");
    }
    return { ...DEFAULT_MEMORY };
  }

  save(): void {
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.path, JSON.stringify(this.memory, null, 2));
    } catch (error) {
      console.error("❌ Could not save memory:", error);
    }
  }

  get(): AgentMemory {
    return this.memory;
  }

  // ============ Update methods ============

  updateStats(karma: number, posts: number, comments: number): void {
    this.memory.karma = karma;
    this.memory.totalPosts = posts;
    this.memory.totalComments = comments;
    this.save();
  }

  recordHeartbeat(): void {
    this.memory.lastHeartbeat = new Date().toISOString();
    this.save();
  }

  recordPost(id: string, title: string): void {
    this.memory.lastPost = new Date().toISOString();
    this.memory.postsCreated.push({
      id,
      title,
      createdAt: new Date().toISOString(),
      karma: 0,
    });
    // Keep only last 50 posts
    if (this.memory.postsCreated.length > 50) {
      this.memory.postsCreated = this.memory.postsCreated.slice(-50);
    }
    this.save();
  }

  recordComment(): void {
    this.memory.lastComment = new Date().toISOString();
    this.memory.totalComments++;
    this.save();
  }

  recordUpvote(): void {
    this.memory.totalUpvotesGiven++;
    this.save();
  }

  addTopic(topic: string): void {
    this.memory.recentTopics.unshift(topic);
    // Keep only last 20 topics
    if (this.memory.recentTopics.length > 20) {
      this.memory.recentTopics = this.memory.recentTopics.slice(0, 20);
    }
    this.save();
  }

  // ============ Monetization ============

  recordServiceOffer(): void {
    this.memory.monetization.servicesOffered++;
    this.save();
  }

  addPotentialLead(agentName: string, interest: string): void {
    this.memory.monetization.potentialLeads.push({
      agentName,
      interest,
      discoveredAt: new Date().toISOString(),
    });
    this.save();
  }

  addOpportunity(type: string, description: string): void {
    this.memory.monetization.opportunities.push({
      type,
      description,
      discoveredAt: new Date().toISOString(),
      status: "new",
    });
    this.save();
  }

  getActiveOpportunities(): AgentMemory["monetization"]["opportunities"] {
    return this.memory.monetization.opportunities.filter(
      (o) => o.status !== "closed"
    );
  }

  // ============ Relationships ============

  recordInteraction(
    name: string,
    sentiment: "positive" | "neutral" | "negative"
  ): void {
    const existing = this.memory.interactedWith.find((i) => i.name === name);
    if (existing) {
      existing.lastInteraction = new Date().toISOString();
      existing.sentiment = sentiment;
    } else {
      this.memory.interactedWith.push({
        name,
        lastInteraction: new Date().toISOString(),
        sentiment,
      });
    }
    this.save();
  }

  addFollowing(name: string): void {
    if (!this.memory.following.includes(name)) {
      this.memory.following.push(name);
      this.save();
    }
  }

  // ============ Learning ============

  recordStrategy(strategy: string, success: boolean): void {
    if (success) {
      if (!this.memory.successfulStrategies.includes(strategy)) {
        this.memory.successfulStrategies.push(strategy);
      }
    } else {
      if (!this.memory.failedStrategies.includes(strategy)) {
        this.memory.failedStrategies.push(strategy);
      }
    }
    this.save();
  }

  // ============ Helpers ============

  shouldPostServiceOffer(): boolean {
    // Offer a service roughly once per day
    const lastOffer = this.memory.monetization.servicesOffered;
    const totalHeartbeats = this.memory.totalPosts + this.memory.totalComments;
    return lastOffer < totalHeartbeats / 6; // Every ~6 activities
  }

  getRecentTopicsString(): string {
    return this.memory.recentTopics.slice(0, 5).join(", ") || "none yet";
  }

  getMemorySummary(): string {
    return `
## Current State
- Karma: ${this.memory.karma}
- Posts: ${this.memory.totalPosts}
- Comments: ${this.memory.totalComments}
- Following: ${this.memory.following.length} agents
- Last heartbeat: ${this.memory.lastHeartbeat || "never"}

## Monetization
- Services offered: ${this.memory.monetization.servicesOffered}
- Potential leads: ${this.memory.monetization.potentialLeads.length}
- Active opportunities: ${this.getActiveOpportunities().length}

## Recent activity
- Recent topics: ${this.getRecentTopicsString()}
- Successful strategies: ${this.memory.successfulStrategies.slice(-3).join(", ") || "learning..."}
    `.trim();
  }
}

export const memory = new MemoryManager();
