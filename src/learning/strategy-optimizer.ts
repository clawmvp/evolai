import { feedbackTracker, TrackedPost } from "./feedback.js";
import { memory } from "../memory/index.js";

// ============ Types ============

export interface PostingPattern {
  topic: string;
  avgKarma: number;
  postCount: number;
  successRate: number;
}

export interface TimePattern {
  hour: number;
  avgKarma: number;
  postCount: number;
  successRate: number;
}

export interface LengthPattern {
  range: "short" | "medium" | "long";
  minLength: number;
  maxLength: number;
  avgKarma: number;
  postCount: number;
  successRate: number;
}

export interface SubmoltPattern {
  submolt: string;
  avgKarma: number;
  postCount: number;
  successRate: number;
}

export interface StrategyInsights {
  bestTopics: PostingPattern[];
  worstTopics: PostingPattern[];
  bestHours: TimePattern[];
  worstHours: TimePattern[];
  bestLength: LengthPattern | null;
  bestSubmolts: SubmoltPattern[];
  recommendations: string[];
  confidence: "low" | "medium" | "high";
}

export interface StrategyPromptContext {
  summary: string;
  doThis: string[];
  avoidThis: string[];
  suggestedTopics: string[];
  suggestedHours: number[];
}

// ============ Constants ============

const MIN_POSTS_FOR_PATTERN = 3; // Need at least 3 posts to identify a pattern
const LENGTH_RANGES = {
  short: { min: 0, max: 100 },
  medium: { min: 101, max: 300 },
  long: { min: 301, max: Infinity },
};

// ============ Strategy Optimizer Class ============

export class StrategyOptimizer {
  /**
   * Analyze all patterns from tracked posts
   */
  analyzePatterns(): StrategyInsights {
    const posts = feedbackTracker.getTrackedPosts();
    const evaluatedPosts = posts.filter(p => p.checksCompleted >= 3);

    if (evaluatedPosts.length < MIN_POSTS_FOR_PATTERN) {
      return this.getDefaultInsights();
    }

    const topicPatterns = this.analyzeTopics(evaluatedPosts);
    const timePatterns = this.analyzeTime(evaluatedPosts);
    const lengthPatterns = this.analyzeLength(evaluatedPosts);
    const submoltPatterns = this.analyzeSubmolts(evaluatedPosts);

    // Sort patterns
    const sortedTopics = [...topicPatterns].sort((a, b) => b.avgKarma - a.avgKarma);
    const sortedHours = [...timePatterns].sort((a, b) => b.avgKarma - a.avgKarma);
    const sortedSubmolts = [...submoltPatterns].sort((a, b) => b.avgKarma - a.avgKarma);

    // Determine best length
    const sortedLengths = [...lengthPatterns].sort((a, b) => b.avgKarma - a.avgKarma);
    const bestLength = sortedLengths.length > 0 ? sortedLengths[0] : null;

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      sortedTopics,
      sortedHours,
      bestLength,
      sortedSubmolts
    );

    // Calculate confidence based on data amount
    const confidence = this.calculateConfidence(evaluatedPosts.length);

    return {
      bestTopics: sortedTopics.slice(0, 5).filter(t => t.avgKarma > 0),
      worstTopics: sortedTopics.slice(-3).filter(t => t.postCount >= MIN_POSTS_FOR_PATTERN),
      bestHours: sortedHours.slice(0, 5).filter(h => h.avgKarma > 0),
      worstHours: sortedHours.slice(-3).filter(h => h.postCount >= MIN_POSTS_FOR_PATTERN),
      bestLength,
      bestSubmolts: sortedSubmolts.slice(0, 3),
      recommendations,
      confidence,
    };
  }

  /**
   * Analyze topic performance
   */
  private analyzeTopics(posts: TrackedPost[]): PostingPattern[] {
    const topicMap = new Map<string, { karma: number[]; success: number }>();

    for (const post of posts) {
      const topic = post.topic;
      if (!topicMap.has(topic)) {
        topicMap.set(topic, { karma: [], success: 0 });
      }
      const data = topicMap.get(topic)!;
      data.karma.push(post.finalKarma);
      if (post.isSuccessful) data.success++;
    }

    const patterns: PostingPattern[] = [];
    for (const [topic, data] of topicMap) {
      if (data.karma.length >= 1) { // Include all topics
        const avgKarma = data.karma.reduce((a, b) => a + b, 0) / data.karma.length;
        patterns.push({
          topic,
          avgKarma: Math.round(avgKarma * 100) / 100,
          postCount: data.karma.length,
          successRate: Math.round((data.success / data.karma.length) * 100),
        });
      }
    }

    return patterns;
  }

  /**
   * Analyze time-of-day performance
   */
  private analyzeTime(posts: TrackedPost[]): TimePattern[] {
    const hourMap = new Map<number, { karma: number[]; success: number }>();

    for (const post of posts) {
      const hour = post.postingHour;
      if (!hourMap.has(hour)) {
        hourMap.set(hour, { karma: [], success: 0 });
      }
      const data = hourMap.get(hour)!;
      data.karma.push(post.finalKarma);
      if (post.isSuccessful) data.success++;
    }

    const patterns: TimePattern[] = [];
    for (const [hour, data] of hourMap) {
      const avgKarma = data.karma.reduce((a, b) => a + b, 0) / data.karma.length;
      patterns.push({
        hour,
        avgKarma: Math.round(avgKarma * 100) / 100,
        postCount: data.karma.length,
        successRate: Math.round((data.success / data.karma.length) * 100),
      });
    }

    return patterns;
  }

  /**
   * Analyze content length performance
   */
  private analyzeLength(posts: TrackedPost[]): LengthPattern[] {
    const patterns: LengthPattern[] = [];

    for (const [range, { min, max }] of Object.entries(LENGTH_RANGES)) {
      const rangePosts = posts.filter(
        p => p.contentLength >= min && p.contentLength <= max
      );

      if (rangePosts.length >= 1) {
        const avgKarma = rangePosts.reduce((sum, p) => sum + p.finalKarma, 0) / rangePosts.length;
        const successCount = rangePosts.filter(p => p.isSuccessful).length;

        patterns.push({
          range: range as "short" | "medium" | "long",
          minLength: min,
          maxLength: max === Infinity ? 1000 : max,
          avgKarma: Math.round(avgKarma * 100) / 100,
          postCount: rangePosts.length,
          successRate: Math.round((successCount / rangePosts.length) * 100),
        });
      }
    }

    return patterns;
  }

  /**
   * Analyze submolt performance
   */
  private analyzeSubmolts(posts: TrackedPost[]): SubmoltPattern[] {
    const submoltMap = new Map<string, { karma: number[]; success: number }>();

    for (const post of posts) {
      const submolt = post.submolt;
      if (submolt === "unknown") continue;
      
      if (!submoltMap.has(submolt)) {
        submoltMap.set(submolt, { karma: [], success: 0 });
      }
      const data = submoltMap.get(submolt)!;
      data.karma.push(post.finalKarma);
      if (post.isSuccessful) data.success++;
    }

    const patterns: SubmoltPattern[] = [];
    for (const [submolt, data] of submoltMap) {
      const avgKarma = data.karma.reduce((a, b) => a + b, 0) / data.karma.length;
      patterns.push({
        submolt,
        avgKarma: Math.round(avgKarma * 100) / 100,
        postCount: data.karma.length,
        successRate: Math.round((data.success / data.karma.length) * 100),
      });
    }

    return patterns;
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    topics: PostingPattern[],
    hours: TimePattern[],
    bestLength: LengthPattern | null,
    submolts: SubmoltPattern[]
  ): string[] {
    const recommendations: string[] = [];

    // Topic recommendations
    if (topics.length > 0) {
      const bestTopic = topics[0];
      if (bestTopic.avgKarma > 2) {
        recommendations.push(
          `Focus on "${bestTopic.topic}" content - it averages ${bestTopic.avgKarma} karma`
        );
      }

      const worstTopic = topics[topics.length - 1];
      if (worstTopic && worstTopic.avgKarma < 1 && worstTopic.postCount >= MIN_POSTS_FOR_PATTERN) {
        recommendations.push(
          `Avoid "${worstTopic.topic}" - consistently underperforms with ${worstTopic.avgKarma} avg karma`
        );
      }
    }

    // Time recommendations
    if (hours.length > 0) {
      const bestHour = hours[0];
      if (bestHour.avgKarma > 2) {
        const timeStr = this.formatHour(bestHour.hour);
        recommendations.push(
          `Post around ${timeStr} - best engagement time with ${bestHour.avgKarma} avg karma`
        );
      }
    }

    // Length recommendations
    if (bestLength && bestLength.postCount >= MIN_POSTS_FOR_PATTERN) {
      const lengthDesc = bestLength.range === "short" ? "short (< 100 chars)" :
                        bestLength.range === "medium" ? "medium (100-300 chars)" :
                        "long (300+ chars)";
      recommendations.push(
        `${lengthDesc} posts perform best with ${bestLength.avgKarma} avg karma`
      );
    }

    // Submolt recommendations
    if (submolts.length > 0) {
      const bestSubmolt = submolts[0];
      if (bestSubmolt.avgKarma > 2) {
        recommendations.push(
          `Post more in "${bestSubmolt.submolt}" - ${bestSubmolt.successRate}% success rate`
        );
      }
    }

    // Add memory-based strategies
    const memoryData = memory.get();
    if (memoryData.successfulStrategies.length > 0) {
      const recentSuccess = memoryData.successfulStrategies.slice(-3);
      recommendations.push(
        `Continue strategies: ${recentSuccess.join(", ")}`
      );
    }

    return recommendations;
  }

  /**
   * Format hour for display
   */
  private formatHour(hour: number): string {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  }

  /**
   * Calculate confidence level based on data
   */
  private calculateConfidence(postCount: number): "low" | "medium" | "high" {
    if (postCount < 10) return "low";
    if (postCount < 30) return "medium";
    return "high";
  }

  /**
   * Get default insights when not enough data
   */
  private getDefaultInsights(): StrategyInsights {
    return {
      bestTopics: [],
      worstTopics: [],
      bestHours: [],
      worstHours: [],
      bestLength: null,
      bestSubmolts: [],
      recommendations: [
        "Not enough data yet - keep posting to learn what works",
        "Try different topics, times, and lengths to gather data",
        "Focus on quality content while building learning dataset",
      ],
      confidence: "low",
    };
  }

  /**
   * Get context for brain.ts prompt injection
   */
  getPromptContext(): StrategyPromptContext {
    const insights = this.analyzePatterns();
    
    const doThis: string[] = [];
    const avoidThis: string[] = [];
    const suggestedTopics: string[] = [];
    const suggestedHours: number[] = [];

    // Build doThis list
    for (const topic of insights.bestTopics.slice(0, 3)) {
      doThis.push(`Post about "${topic.topic}" (${topic.successRate}% success)`);
      suggestedTopics.push(topic.topic);
    }

    for (const hour of insights.bestHours.slice(0, 3)) {
      suggestedHours.push(hour.hour);
    }

    if (insights.bestLength) {
      doThis.push(`Write ${insights.bestLength.range} posts (${insights.bestLength.minLength}-${insights.bestLength.maxLength} chars)`);
    }

    for (const submolt of insights.bestSubmolts.slice(0, 2)) {
      doThis.push(`Post in "${submolt.submolt}"`);
    }

    // Build avoidThis list
    for (const topic of insights.worstTopics) {
      avoidThis.push(`"${topic.topic}" topics (${topic.avgKarma} avg karma)`);
    }

    for (const hour of insights.worstHours) {
      avoidThis.push(`Posting at ${this.formatHour(hour.hour)}`);
    }

    // Build summary
    const summary = this.buildSummary(insights);

    return {
      summary,
      doThis,
      avoidThis,
      suggestedTopics,
      suggestedHours,
    };
  }

  /**
   * Build a summary string for prompt
   */
  private buildSummary(insights: StrategyInsights): string {
    const feedbackSummary = feedbackTracker.getSummary();

    if (feedbackSummary.total < MIN_POSTS_FOR_PATTERN) {
      return `Learning in progress (${feedbackSummary.total} posts tracked). Keep experimenting.`;
    }

    let summary = `Based on ${feedbackSummary.total} tracked posts: `;
    summary += `${feedbackSummary.successRate.toFixed(1)}% success rate, `;
    summary += `${feedbackSummary.avgKarma} avg karma. `;
    summary += `Confidence: ${insights.confidence}.`;

    return summary;
  }

  /**
   * Get a formatted string for prompt injection
   */
  getPromptInjection(): string {
    const context = this.getPromptContext();

    if (context.doThis.length === 0 && context.avoidThis.length === 0) {
      return `
## Learning Status
${context.summary}
Still gathering data - no strong patterns yet.
`;
    }

    let injection = `
## Learning Insights (${feedbackTracker.getSummary().total} posts analyzed)
${context.summary}

### What works:
${context.doThis.map(d => `- ✅ ${d}`).join("\n")}

### What to avoid:
${context.avoidThis.map(a => `- ❌ ${a}`).join("\n")}
`;

    if (context.suggestedTopics.length > 0) {
      injection += `\nSuggested topics: ${context.suggestedTopics.join(", ")}`;
    }

    if (context.suggestedHours.length > 0) {
      injection += `\nBest posting hours: ${context.suggestedHours.map(h => this.formatHour(h)).join(", ")}`;
    }

    return injection;
  }
}

// Export singleton instance
export const strategyOptimizer = new StrategyOptimizer();
