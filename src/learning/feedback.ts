import { memory, AgentMemory } from "../memory/index.js";
import { moltbook } from "../moltbook/client.js";

// ============ Types ============

export interface TrackedPost {
  id: string;
  title: string;
  submolt: string;
  contentLength: number;
  createdAt: string;
  topic: string;
  postingHour: number;
  postingDay: number;
  
  // Karma tracking at different intervals
  karmaAt1h: number | null;
  karmaAt6h: number | null;
  karmaAt24h: number | null;
  finalKarma: number;
  
  // Calculated metrics
  karmaVelocity: number; // karma per hour in first 24h
  isSuccessful: boolean;
  
  // Tracking status
  checksCompleted: number;
  lastChecked: string | null;
}

export interface FeedbackStore {
  trackedPosts: TrackedPost[];
  pendingChecks: Array<{
    postId: string;
    checkAt: string;
    checkType: "1h" | "6h" | "24h";
  }>;
  lastUpdated: string;
}

// ============ Constants ============

const CHECK_INTERVALS = {
  "1h": 60 * 60 * 1000,     // 1 hour
  "6h": 6 * 60 * 60 * 1000, // 6 hours
  "24h": 24 * 60 * 60 * 1000 // 24 hours
};

const SUCCESS_KARMA_THRESHOLD = 5; // Posts with >= 5 karma are "successful"
const MAX_TRACKED_POSTS = 100;

// ============ Feedback Tracker Class ============

export class FeedbackTracker {
  private store: FeedbackStore;
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isProcessing = false;

  constructor() {
    this.store = this.loadStore();
  }

  private loadStore(): FeedbackStore {
    // Load from memory if exists, otherwise initialize
    const memoryData = memory.get();
    
    // We'll store feedback data alongside posts
    const trackedPosts: TrackedPost[] = [];
    
    // Convert existing postsCreated to TrackedPost format
    for (const post of memoryData.postsCreated) {
      trackedPosts.push({
        id: post.id,
        title: post.title,
        submolt: "unknown",
        contentLength: 0,
        createdAt: post.createdAt,
        topic: this.extractTopic(post.title),
        postingHour: new Date(post.createdAt).getHours(),
        postingDay: new Date(post.createdAt).getDay(),
        karmaAt1h: null,
        karmaAt6h: null,
        karmaAt24h: null,
        finalKarma: post.karma,
        karmaVelocity: 0,
        isSuccessful: post.karma >= SUCCESS_KARMA_THRESHOLD,
        checksCompleted: 0,
        lastChecked: null,
      });
    }

    return {
      trackedPosts,
      pendingChecks: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  private extractTopic(title: string): string {
    // Simple topic extraction from title
    const keywords = title.toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 3);
    
    // Return first meaningful keyword or "general"
    const stopWords = ["this", "that", "with", "have", "from", "about", "what", "when", "where", "which"];
    const meaningful = keywords.find(k => !stopWords.includes(k));
    return meaningful || "general";
  }

  /**
   * Register a new post for karma tracking
   */
  async trackPost(
    postId: string,
    title: string,
    submolt: string,
    contentLength: number
  ): Promise<void> {
    const now = new Date();
    
    const trackedPost: TrackedPost = {
      id: postId,
      title,
      submolt,
      contentLength,
      createdAt: now.toISOString(),
      topic: this.extractTopic(title),
      postingHour: now.getHours(),
      postingDay: now.getDay(),
      karmaAt1h: null,
      karmaAt6h: null,
      karmaAt24h: null,
      finalKarma: 0,
      karmaVelocity: 0,
      isSuccessful: false,
      checksCompleted: 0,
      lastChecked: null,
    };

    this.store.trackedPosts.push(trackedPost);
    
    // Schedule karma checks
    this.scheduleCheck(postId, "1h");
    this.scheduleCheck(postId, "6h");
    this.scheduleCheck(postId, "24h");

    // Keep only recent posts
    if (this.store.trackedPosts.length > MAX_TRACKED_POSTS) {
      this.store.trackedPosts = this.store.trackedPosts.slice(-MAX_TRACKED_POSTS);
    }

    this.store.lastUpdated = now.toISOString();
    console.log(`📊 Tracking karma for post: "${title}" (${postId})`);
  }

  /**
   * Schedule a karma check for a specific time
   */
  private scheduleCheck(postId: string, checkType: "1h" | "6h" | "24h"): void {
    const delay = CHECK_INTERVALS[checkType];
    const checkAt = new Date(Date.now() + delay).toISOString();

    this.store.pendingChecks.push({ postId, checkAt, checkType });

    const timeoutId = setTimeout(async () => {
      await this.performCheck(postId, checkType);
      this.checkIntervals.delete(`${postId}-${checkType}`);
    }, delay);

    this.checkIntervals.set(`${postId}-${checkType}`, timeoutId);
    
    console.log(`⏰ Scheduled ${checkType} check for post ${postId}`);
  }

  /**
   * Perform a karma check for a post
   */
  private async performCheck(postId: string, checkType: "1h" | "6h" | "24h"): Promise<void> {
    if (this.isProcessing) {
      console.log("⏳ Check already in progress, skipping...");
      return;
    }

    this.isProcessing = true;

    try {
      const post = await moltbook.getPost(postId);
      
      if (!post) {
        console.log(`⚠️ Post ${postId} not found, removing from tracking`);
        this.removePost(postId);
        return;
      }

      const karma = post.upvotes - post.downvotes;
      const trackedPost = this.store.trackedPosts.find(p => p.id === postId);

      if (trackedPost) {
        // Update karma based on check type
        switch (checkType) {
          case "1h":
            trackedPost.karmaAt1h = karma;
            break;
          case "6h":
            trackedPost.karmaAt6h = karma;
            break;
          case "24h":
            trackedPost.karmaAt24h = karma;
            // Calculate velocity and success
            const hoursElapsed = 24;
            trackedPost.karmaVelocity = karma / hoursElapsed;
            trackedPost.isSuccessful = karma >= SUCCESS_KARMA_THRESHOLD;
            trackedPost.finalKarma = karma;
            
            // Record strategy in memory
            const strategy = this.getPostStrategy(trackedPost);
            memory.recordStrategy(strategy, trackedPost.isSuccessful);
            break;
        }

        trackedPost.checksCompleted++;
        trackedPost.lastChecked = new Date().toISOString();

        console.log(`✅ ${checkType} check for "${trackedPost.title}": karma = ${karma}`);

        // Remove from pending checks
        this.store.pendingChecks = this.store.pendingChecks.filter(
          c => !(c.postId === postId && c.checkType === checkType)
        );

        this.store.lastUpdated = new Date().toISOString();
      }
    } catch (error) {
      console.error(`❌ Error checking karma for ${postId}:`, error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get strategy description for a post
   */
  private getPostStrategy(post: TrackedPost): string {
    const hourRange = post.postingHour < 12 ? "morning" : 
                      post.postingHour < 18 ? "afternoon" : "evening";
    const lengthDesc = post.contentLength < 100 ? "short" :
                       post.contentLength < 300 ? "medium" : "long";
    
    return `${post.topic}-${hourRange}-${lengthDesc}`;
  }

  /**
   * Remove a post from tracking
   */
  private removePost(postId: string): void {
    this.store.trackedPosts = this.store.trackedPosts.filter(p => p.id !== postId);
    this.store.pendingChecks = this.store.pendingChecks.filter(c => c.postId !== postId);
    
    // Clear any pending timeouts
    for (const checkType of ["1h", "6h", "24h"] as const) {
      const key = `${postId}-${checkType}`;
      const timeout = this.checkIntervals.get(key);
      if (timeout) {
        clearTimeout(timeout);
        this.checkIntervals.delete(key);
      }
    }
  }

  /**
   * Process any overdue checks (useful after restart)
   */
  async processOverdueChecks(): Promise<void> {
    const now = new Date();
    const overdueChecks = this.store.pendingChecks.filter(
      c => new Date(c.checkAt) <= now
    );

    console.log(`📋 Processing ${overdueChecks.length} overdue karma checks...`);

    for (const check of overdueChecks) {
      await this.performCheck(check.postId, check.checkType);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Force an immediate karma update for all tracked posts
   */
  async forceUpdateAll(): Promise<void> {
    console.log("🔄 Force updating karma for all tracked posts...");

    for (const post of this.store.trackedPosts) {
      try {
        const moltbookPost = await moltbook.getPost(post.id);
        if (moltbookPost) {
          post.finalKarma = moltbookPost.upvotes - moltbookPost.downvotes;
          post.isSuccessful = post.finalKarma >= SUCCESS_KARMA_THRESHOLD;
          post.lastChecked = new Date().toISOString();
        }
        // Rate limit protection
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error updating post ${post.id}:`, error);
      }
    }

    this.store.lastUpdated = new Date().toISOString();
    console.log("✅ Force update complete");
  }

  /**
   * Get all tracked posts
   */
  getTrackedPosts(): TrackedPost[] {
    return this.store.trackedPosts;
  }

  /**
   * Get successful posts only
   */
  getSuccessfulPosts(): TrackedPost[] {
    return this.store.trackedPosts.filter(p => p.isSuccessful);
  }

  /**
   * Get failed posts only
   */
  getFailedPosts(): TrackedPost[] {
    return this.store.trackedPosts.filter(p => !p.isSuccessful && p.checksCompleted >= 3);
  }

  /**
   * Get posts pending final evaluation
   */
  getPendingPosts(): TrackedPost[] {
    return this.store.trackedPosts.filter(p => p.checksCompleted < 3);
  }

  /**
   * Get recent posts (last N)
   */
  getRecentPosts(limit: number = 10): TrackedPost[] {
    return this.store.trackedPosts.slice(-limit);
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    successRate: number;
    avgKarma: number;
  } {
    const total = this.store.trackedPosts.length;
    const evaluated = this.store.trackedPosts.filter(p => p.checksCompleted >= 3);
    const successful = evaluated.filter(p => p.isSuccessful).length;
    const failed = evaluated.length - successful;
    const pending = total - evaluated.length;
    
    const avgKarma = total > 0
      ? this.store.trackedPosts.reduce((sum, p) => sum + p.finalKarma, 0) / total
      : 0;

    return {
      total,
      successful,
      failed,
      pending,
      successRate: evaluated.length > 0 ? (successful / evaluated.length) * 100 : 0,
      avgKarma: Math.round(avgKarma * 100) / 100,
    };
  }

  /**
   * Cleanup old data and intervals
   */
  cleanup(): void {
    for (const timeout of this.checkIntervals.values()) {
      clearTimeout(timeout);
    }
    this.checkIntervals.clear();
    console.log("🧹 Feedback tracker cleaned up");
  }
}

// Export singleton instance
export const feedbackTracker = new FeedbackTracker();
