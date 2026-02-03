import { readFileSync, existsSync, renameSync } from "fs";
import { CONFIG } from "../config/index.js";
import { sqliteStore, SQLiteMemoryStore } from "./sqlite.store.js";
import { memoryLogger as logger } from "../infrastructure/logger.js";

// ============ Types ============

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
    earnings: number;
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

// ============ Migration from JSON ============

function migrateFromJSONIfExists(): void {
  const jsonPath = CONFIG.paths.memory;
  
  if (existsSync(jsonPath)) {
    logger.info("Found existing JSON memory file, migrating to SQLite...");
    
    try {
      const data = readFileSync(jsonPath, "utf-8");
      const jsonMemory = JSON.parse(data) as AgentMemory;
      
      sqliteStore.migrateFromJSON(jsonMemory);
      
      // Rename old file as backup
      const backupPath = jsonPath.replace(".json", ".json.backup");
      renameSync(jsonPath, backupPath);
      logger.info({ backupPath }, "JSON file backed up");
    } catch (error) {
      logger.error({ error: String(error) }, "Failed to migrate from JSON");
    }
  }
}

// Run migration on import
migrateFromJSONIfExists();

// ============ Memory Manager (wrapper for SQLite store) ============

class MemoryManager {
  private store: SQLiteMemoryStore;

  constructor() {
    this.store = sqliteStore;
    logger.info("Memory manager initialized with SQLite store");
  }

  get(): AgentMemory {
    return this.store.get();
  }

  // ============ Update methods ============

  updateStats(karma: number, posts: number, comments: number): void {
    this.store.updateStats(karma, posts, comments);
  }

  recordHeartbeat(): void {
    this.store.recordHeartbeat();
  }

  recordPost(id: string, title: string): void {
    this.store.recordPost(id, title);
  }

  recordComment(): void {
    this.store.recordComment();
  }

  recordUpvote(): void {
    this.store.recordUpvote();
  }

  addTopic(topic: string): void {
    this.store.addTopic(topic);
  }

  // ============ Monetization ============

  recordServiceOffer(): void {
    this.store.recordServiceOffer();
  }

  addPotentialLead(agentName: string, interest: string): void {
    this.store.addPotentialLead(agentName, interest);
  }

  addOpportunity(type: string, description: string): void {
    this.store.addOpportunity(type, description);
  }

  getActiveOpportunities(): AgentMemory["monetization"]["opportunities"] {
    return this.store.getActiveOpportunities();
  }

  // ============ Relationships ============

  recordInteraction(
    name: string,
    sentiment: "positive" | "neutral" | "negative"
  ): void {
    this.store.recordInteraction(name, sentiment);
  }

  addFollowing(name: string): void {
    this.store.addFollowing(name);
  }

  // ============ Learning ============

  recordStrategy(strategy: string, success: boolean): void {
    this.store.recordStrategy(strategy, success);
  }

  // ============ Helpers ============

  shouldPostServiceOffer(): boolean {
    return this.store.shouldPostServiceOffer();
  }

  getRecentTopicsString(): string {
    return this.store.getRecentTopicsString();
  }

  getMemorySummary(): string {
    return this.store.getMemorySummary();
  }
}

export const memory = new MemoryManager();
