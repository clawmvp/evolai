// ============================================
// EvolAI Learning System
// ============================================
// 
// This module provides a complete learning loop for EvolAI:
// 
// 1. FEEDBACK TRACKER - Monitors karma over time
//    - Tracks posts at 1h, 6h, 24h intervals
//    - Identifies successful vs failed content
//    - Calculates karma velocity
//
// 2. STRATEGY OPTIMIZER - Analyzes patterns
//    - Best topics, times, content lengths
//    - Generates recommendations
//    - Provides prompt context for brain.ts
//
// 3. ANALYTICS ENGINE - Comprehensive metrics
//    - Performance tracking
//    - Trend detection
//    - Conversion metrics
//
// Usage:
//   import { learning } from "./learning/index.js";
//   
//   // After creating a post
//   await learning.feedback.trackPost(postId, title, submolt, contentLength);
//   
//   // Before making a decision
//   const insights = learning.optimizer.getPromptInjection();
//   
//   // Get analytics
//   console.log(learning.analytics.getSummary());
//
// ============================================

export { feedbackTracker } from "./feedback.js";
export type { TrackedPost, FeedbackStore } from "./feedback.js";

export { strategyOptimizer } from "./strategy-optimizer.js";
export type { 
  StrategyInsights, 
  StrategyPromptContext,
  PostingPattern,
  TimePattern,
  LengthPattern,
  SubmoltPattern,
} from "./strategy-optimizer.js";

export { analytics } from "./analytics.js";
export type { 
  PerformanceMetrics, 
  TopicAnalytics, 
  TimeAnalytics,
  ConversionMetrics,
  FullAnalytics,
} from "./analytics.js";

// Re-export as unified namespace
import { feedbackTracker, FeedbackTracker } from "./feedback.js";
import { strategyOptimizer, StrategyOptimizer } from "./strategy-optimizer.js";
import { analytics, AnalyticsEngine } from "./analytics.js";

// Public interface for the learning system
export interface LearningSystem {
  feedback: FeedbackTracker;
  optimizer: StrategyOptimizer;
  analytics: AnalyticsEngine;
  initialize(): Promise<void>;
  cleanup(): void;
  getStatus(): string;
  trackNewPost(postId: string, title: string, submolt: string, content: string): Promise<void>;
  getInsightsForPrompt(): string;
  getReport(): string;
}

const learningImpl: LearningSystem = {
  feedback: feedbackTracker,
  optimizer: strategyOptimizer,
  analytics: analytics,

  /**
   * Initialize the learning system
   * Call this on startup to process any overdue checks
   */
  async initialize(): Promise<void> {
    console.log("🧠 Initializing EvolAI Learning System...");
    await feedbackTracker.processOverdueChecks();
    console.log("✅ Learning System ready");
    console.log(`📊 ${analytics.getBriefMetrics()}`);
  },

  /**
   * Cleanup when shutting down
   */
  cleanup(): void {
    feedbackTracker.cleanup();
    console.log("🧹 Learning System cleaned up");
  },

  /**
   * Get quick status for logging
   */
  getStatus(): string {
    const summary = feedbackTracker.getSummary();
    return `Learning: ${summary.total} posts, ${summary.successRate.toFixed(1)}% success, ${summary.avgKarma} avg karma`;
  },

  /**
   * Record a new post for tracking
   */
  async trackNewPost(
    postId: string,
    title: string,
    submolt: string,
    content: string
  ): Promise<void> {
    await feedbackTracker.trackPost(postId, title, submolt, content.length);
  },

  /**
   * Get insights for brain prompt
   */
  getInsightsForPrompt(): string {
    return strategyOptimizer.getPromptInjection();
  },

  /**
   * Get full analytics report
   */
  getReport(): string {
    return analytics.getSummary();
  },
};

export const learning = learningImpl;

// Default export
export default learning;
