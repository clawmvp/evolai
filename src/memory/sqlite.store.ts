import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { CONFIG } from "../config/index.js";
import { memoryLogger as logger } from "../infrastructure/logger.js";
import type { AgentMemory } from "./index.js";

// Database path (same directory as memory.json was)
const DB_PATH = CONFIG.paths.memory.replace(".json", ".db");

// Ensure directory exists
const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ============ Schema ============

const SCHEMA = `
-- Agent core info
CREATE TABLE IF NOT EXISTS agent (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  is_claimed INTEGER DEFAULT 0,
  karma INTEGER DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_upvotes_given INTEGER DEFAULT 0,
  last_heartbeat TEXT,
  last_post TEXT,
  last_comment TEXT,
  services_offered INTEGER DEFAULT 0,
  earnings REAL DEFAULT 0
);

-- Posts created by the agent
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  karma INTEGER DEFAULT 0
);

-- Recent topics (for avoiding repeats)
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Potential leads for monetization
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  interest TEXT NOT NULL,
  discovered_at TEXT NOT NULL
);

-- Opportunities discovered
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'pursued', 'closed'))
);

-- Agents we're following
CREATE TABLE IF NOT EXISTS following (
  name TEXT PRIMARY KEY
);

-- Interaction history
CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  last_interaction TEXT NOT NULL,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative'))
);

-- Strategy learning
CREATE TABLE IF NOT EXISTS strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy TEXT NOT NULL UNIQUE,
  success INTEGER NOT NULL CHECK (success IN (0, 1))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_topics_created_at ON topics(created_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_interactions_agent ON interactions(agent_name);
`;

// Run schema
db.exec(SCHEMA);

// ============ SQLite Store Class ============

export class SQLiteMemoryStore {
  private db: Database.Database;

  constructor() {
    this.db = db;
    this.ensureAgentExists();
    logger.info({ path: DB_PATH }, "SQLite memory store initialized");
  }

  private ensureAgentExists(): void {
    const exists = this.db.prepare("SELECT 1 FROM agent WHERE id = 1").get();
    if (!exists) {
      this.db
        .prepare(
          `INSERT INTO agent (id, name, registered_at) VALUES (1, ?, ?)`
        )
        .run(CONFIG.agent.name, new Date().toISOString());
      logger.info("Created new agent record");
    }
  }

  // ============ Core Agent Data ============

  get(): AgentMemory {
    const agent = this.db
      .prepare("SELECT * FROM agent WHERE id = 1")
      .get() as Record<string, unknown>;

    const posts = this.db
      .prepare("SELECT id, title, created_at as createdAt, karma FROM posts ORDER BY created_at DESC LIMIT 50")
      .all() as Array<{ id: string; title: string; createdAt: string; karma: number }>;

    const topics = this.db
      .prepare("SELECT topic FROM topics ORDER BY created_at DESC LIMIT 20")
      .all() as Array<{ topic: string }>;

    const leads = this.db
      .prepare("SELECT agent_name as agentName, interest, discovered_at as discoveredAt FROM leads")
      .all() as Array<{ agentName: string; interest: string; discoveredAt: string }>;

    const opportunities = this.db
      .prepare("SELECT type, description, discovered_at as discoveredAt, status FROM opportunities")
      .all() as Array<{ type: string; description: string; discoveredAt: string; status: "new" | "pursued" | "closed" }>;

    const following = this.db
      .prepare("SELECT name FROM following")
      .all() as Array<{ name: string }>;

    const interactions = this.db
      .prepare("SELECT agent_name as name, last_interaction as lastInteraction, sentiment FROM interactions")
      .all() as Array<{ name: string; lastInteraction: string; sentiment: "positive" | "neutral" | "negative" }>;

    const successStrategies = this.db
      .prepare("SELECT strategy FROM strategies WHERE success = 1")
      .all() as Array<{ strategy: string }>;

    const failedStrategies = this.db
      .prepare("SELECT strategy FROM strategies WHERE success = 0")
      .all() as Array<{ strategy: string }>;

    return {
      name: agent.name as string,
      registeredAt: agent.registered_at as string,
      isClaimed: Boolean(agent.is_claimed),
      karma: agent.karma as number,
      totalPosts: agent.total_posts as number,
      totalComments: agent.total_comments as number,
      totalUpvotesGiven: agent.total_upvotes_given as number,
      lastHeartbeat: agent.last_heartbeat as string | null,
      lastPost: agent.last_post as string | null,
      lastComment: agent.last_comment as string | null,
      recentTopics: topics.map((t) => t.topic),
      postsCreated: posts,
      monetization: {
        servicesOffered: agent.services_offered as number,
        potentialLeads: leads,
        earnings: agent.earnings as number,
        opportunities: opportunities,
      },
      following: following.map((f) => f.name),
      interactedWith: interactions,
      successfulStrategies: successStrategies.map((s) => s.strategy),
      failedStrategies: failedStrategies.map((s) => s.strategy),
    };
  }

  // ============ Update Methods ============

  updateStats(karma: number, posts: number, comments: number): void {
    this.db
      .prepare(
        "UPDATE agent SET karma = ?, total_posts = ?, total_comments = ? WHERE id = 1"
      )
      .run(karma, posts, comments);
    logger.debug({ karma, posts, comments }, "Updated stats");
  }

  recordHeartbeat(): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE agent SET last_heartbeat = ? WHERE id = 1")
      .run(now);
    logger.debug({ timestamp: now }, "Recorded heartbeat");
  }

  recordPost(id: string, title: string): void {
    const now = new Date().toISOString();
    
    // Update agent
    this.db
      .prepare("UPDATE agent SET last_post = ? WHERE id = 1")
      .run(now);

    // Insert post
    this.db
      .prepare("INSERT OR REPLACE INTO posts (id, title, created_at, karma) VALUES (?, ?, ?, 0)")
      .run(id, title, now);

    // Clean old posts (keep last 50)
    this.db
      .prepare(
        `DELETE FROM posts WHERE id NOT IN (
          SELECT id FROM posts ORDER BY created_at DESC LIMIT 50
        )`
      )
      .run();

    logger.debug({ id, title }, "Recorded post");
  }

  recordComment(): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE agent SET last_comment = ?, total_comments = total_comments + 1 WHERE id = 1"
      )
      .run(now);
    logger.debug("Recorded comment");
  }

  recordUpvote(): void {
    this.db
      .prepare("UPDATE agent SET total_upvotes_given = total_upvotes_given + 1 WHERE id = 1")
      .run();
    logger.debug("Recorded upvote");
  }

  addTopic(topic: string): void {
    this.db
      .prepare("INSERT INTO topics (topic) VALUES (?)")
      .run(topic);

    // Keep only last 20
    this.db
      .prepare(
        `DELETE FROM topics WHERE id NOT IN (
          SELECT id FROM topics ORDER BY created_at DESC LIMIT 20
        )`
      )
      .run();

    logger.debug({ topic }, "Added topic");
  }

  // ============ Monetization ============

  recordServiceOffer(): void {
    this.db
      .prepare("UPDATE agent SET services_offered = services_offered + 1 WHERE id = 1")
      .run();
    logger.debug("Recorded service offer");
  }

  addPotentialLead(agentName: string, interest: string): void {
    this.db
      .prepare(
        "INSERT INTO leads (agent_name, interest, discovered_at) VALUES (?, ?, ?)"
      )
      .run(agentName, interest, new Date().toISOString());
    logger.debug({ agentName, interest }, "Added potential lead");
  }

  addOpportunity(type: string, description: string): void {
    this.db
      .prepare(
        "INSERT INTO opportunities (type, description, discovered_at, status) VALUES (?, ?, ?, 'new')"
      )
      .run(type, description, new Date().toISOString());
    logger.debug({ type, description }, "Added opportunity");
  }

  getActiveOpportunities(): AgentMemory["monetization"]["opportunities"] {
    return this.db
      .prepare(
        "SELECT type, description, discovered_at as discoveredAt, status FROM opportunities WHERE status != 'closed'"
      )
      .all() as AgentMemory["monetization"]["opportunities"];
  }

  updateOpportunityStatus(id: number, status: "new" | "pursued" | "closed"): void {
    this.db
      .prepare("UPDATE opportunities SET status = ? WHERE id = ?")
      .run(status, id);
    logger.debug({ id, status }, "Updated opportunity status");
  }

  // ============ Relationships ============

  recordInteraction(
    name: string,
    sentiment: "positive" | "neutral" | "negative"
  ): void {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT 1 FROM interactions WHERE agent_name = ?")
      .get(name);

    if (existing) {
      this.db
        .prepare(
          "UPDATE interactions SET last_interaction = ?, sentiment = ? WHERE agent_name = ?"
        )
        .run(now, sentiment, name);
    } else {
      this.db
        .prepare(
          "INSERT INTO interactions (agent_name, last_interaction, sentiment) VALUES (?, ?, ?)"
        )
        .run(name, now, sentiment);
    }
    logger.debug({ name, sentiment }, "Recorded interaction");
  }

  addFollowing(name: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO following (name) VALUES (?)")
      .run(name);
    logger.debug({ name }, "Added following");
  }

  // ============ Learning ============

  recordStrategy(strategy: string, success: boolean): void {
    this.db
      .prepare("INSERT OR REPLACE INTO strategies (strategy, success) VALUES (?, ?)")
      .run(strategy, success ? 1 : 0);
    logger.debug({ strategy, success }, "Recorded strategy");
  }

  // ============ Helpers ============

  shouldPostServiceOffer(): boolean {
    const agent = this.db
      .prepare("SELECT services_offered, total_posts, total_comments FROM agent WHERE id = 1")
      .get() as { services_offered: number; total_posts: number; total_comments: number };

    const totalHeartbeats = agent.total_posts + agent.total_comments;
    return agent.services_offered < totalHeartbeats / 6;
  }

  getRecentTopicsString(): string {
    const topics = this.db
      .prepare("SELECT topic FROM topics ORDER BY created_at DESC LIMIT 5")
      .all() as Array<{ topic: string }>;

    return topics.map((t) => t.topic).join(", ") || "none yet";
  }

  getMemorySummary(): string {
    const agent = this.db
      .prepare("SELECT * FROM agent WHERE id = 1")
      .get() as Record<string, unknown>;

    const followingCount = (
      this.db.prepare("SELECT COUNT(*) as count FROM following").get() as { count: number }
    ).count;

    const leadsCount = (
      this.db.prepare("SELECT COUNT(*) as count FROM leads").get() as { count: number }
    ).count;

    const activeOpportunitiesCount = (
      this.db.prepare("SELECT COUNT(*) as count FROM opportunities WHERE status != 'closed'").get() as { count: number }
    ).count;

    const successStrategies = this.db
      .prepare("SELECT strategy FROM strategies WHERE success = 1 ORDER BY id DESC LIMIT 3")
      .all() as Array<{ strategy: string }>;

    return `
## Current State
- Karma: ${agent.karma}
- Posts: ${agent.total_posts}
- Comments: ${agent.total_comments}
- Following: ${followingCount} agents
- Last heartbeat: ${agent.last_heartbeat || "never"}

## Monetization
- Services offered: ${agent.services_offered}
- Potential leads: ${leadsCount}
- Active opportunities: ${activeOpportunitiesCount}

## Recent activity
- Recent topics: ${this.getRecentTopicsString()}
- Successful strategies: ${successStrategies.map((s) => s.strategy).join(", ") || "learning..."}
    `.trim();
  }

  // ============ Migration from JSON ============

  migrateFromJSON(jsonMemory: AgentMemory): void {
    logger.info("Migrating data from JSON to SQLite...");

    const tx = this.db.transaction(() => {
      // Update agent core data
      this.db
        .prepare(
          `UPDATE agent SET 
            name = ?, registered_at = ?, is_claimed = ?,
            karma = ?, total_posts = ?, total_comments = ?, total_upvotes_given = ?,
            last_heartbeat = ?, last_post = ?, last_comment = ?,
            services_offered = ?, earnings = ?
          WHERE id = 1`
        )
        .run(
          jsonMemory.name,
          jsonMemory.registeredAt,
          jsonMemory.isClaimed ? 1 : 0,
          jsonMemory.karma,
          jsonMemory.totalPosts,
          jsonMemory.totalComments,
          jsonMemory.totalUpvotesGiven,
          jsonMemory.lastHeartbeat,
          jsonMemory.lastPost,
          jsonMemory.lastComment,
          jsonMemory.monetization.servicesOffered,
          jsonMemory.monetization.earnings
        );

      // Migrate posts
      for (const post of jsonMemory.postsCreated) {
        this.db
          .prepare("INSERT OR IGNORE INTO posts (id, title, created_at, karma) VALUES (?, ?, ?, ?)")
          .run(post.id, post.title, post.createdAt, post.karma);
      }

      // Migrate topics
      for (const topic of jsonMemory.recentTopics) {
        this.db.prepare("INSERT INTO topics (topic) VALUES (?)").run(topic);
      }

      // Migrate leads
      for (const lead of jsonMemory.monetization.potentialLeads) {
        this.db
          .prepare("INSERT INTO leads (agent_name, interest, discovered_at) VALUES (?, ?, ?)")
          .run(lead.agentName, lead.interest, lead.discoveredAt);
      }

      // Migrate opportunities
      for (const opp of jsonMemory.monetization.opportunities) {
        this.db
          .prepare("INSERT INTO opportunities (type, description, discovered_at, status) VALUES (?, ?, ?, ?)")
          .run(opp.type, opp.description, opp.discoveredAt, opp.status);
      }

      // Migrate following
      for (const name of jsonMemory.following) {
        this.db.prepare("INSERT OR IGNORE INTO following (name) VALUES (?)").run(name);
      }

      // Migrate interactions
      for (const interaction of jsonMemory.interactedWith) {
        this.db
          .prepare("INSERT INTO interactions (agent_name, last_interaction, sentiment) VALUES (?, ?, ?)")
          .run(interaction.name, interaction.lastInteraction, interaction.sentiment);
      }

      // Migrate strategies
      for (const strategy of jsonMemory.successfulStrategies) {
        this.db.prepare("INSERT OR IGNORE INTO strategies (strategy, success) VALUES (?, 1)").run(strategy);
      }
      for (const strategy of jsonMemory.failedStrategies) {
        this.db.prepare("INSERT OR IGNORE INTO strategies (strategy, success) VALUES (?, 0)").run(strategy);
      }
    });

    tx();
    logger.info("Migration from JSON complete");
  }

  // ============ Close ============

  close(): void {
    this.db.close();
    logger.info("SQLite database closed");
  }
}

export const sqliteStore = new SQLiteMemoryStore();
