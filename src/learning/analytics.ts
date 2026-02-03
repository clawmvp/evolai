import { feedbackTracker, TrackedPost } from "./feedback.js";
import { memory } from "../memory/index.js";

// ============ Types ============

export interface PerformanceMetrics {
  // Overall metrics
  totalPosts: number;
  totalKarma: number;
  avgKarmaPerPost: number;
  medianKarma: number;
  
  // Success metrics
  successfulPosts: number;
  failedPosts: number;
  successRate: number;
  
  // Growth metrics
  karmaGrowthRate: number; // karma per day
  postsPerDay: number;
  
  // Engagement velocity
  avgKarmaVelocity: number; // karma per hour in first 24h
  
  // Time range
  trackingStartDate: string | null;
  trackingDays: number;
}

export interface TopicAnalytics {
  topic: string;
  posts: number;
  totalKarma: number;
  avgKarma: number;
  successRate: number;
  trend: "rising" | "stable" | "falling";
}

export interface TimeAnalytics {
  hour: number;
  hourLabel: string;
  posts: number;
  avgKarma: number;
  successRate: number;
}

export interface ConversionMetrics {
  // Posts to interactions
  totalPosts: number;
  postsWithKarma: number;
  postsWithComments: number; // Would need comment data
  conversionRate: number;
  
  // Monetization tracking
  serviceOffers: number;
  potentialLeads: number;
  conversionToLeads: number; // service offers that generated leads
}

export interface FullAnalytics {
  performance: PerformanceMetrics;
  topTopics: TopicAnalytics[];
  worstTopics: TopicAnalytics[];
  bestHours: TimeAnalytics[];
  conversions: ConversionMetrics;
  insights: string[];
}

// ============ Analytics Class ============

export class AnalyticsEngine {
  /**
   * Calculate overall performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const posts = feedbackTracker.getTrackedPosts();
    const evaluatedPosts = posts.filter(p => p.checksCompleted >= 3);
    
    if (posts.length === 0) {
      return this.getEmptyMetrics();
    }

    // Calculate basic metrics
    const totalKarma = posts.reduce((sum, p) => sum + p.finalKarma, 0);
    const avgKarmaPerPost = totalKarma / posts.length;
    
    // Calculate median
    const sortedKarma = posts.map(p => p.finalKarma).sort((a, b) => a - b);
    const medianKarma = sortedKarma.length % 2 === 0
      ? (sortedKarma[sortedKarma.length / 2 - 1] + sortedKarma[sortedKarma.length / 2]) / 2
      : sortedKarma[Math.floor(sortedKarma.length / 2)];

    // Success metrics
    const successfulPosts = evaluatedPosts.filter(p => p.isSuccessful).length;
    const failedPosts = evaluatedPosts.length - successfulPosts;
    const successRate = evaluatedPosts.length > 0 
      ? (successfulPosts / evaluatedPosts.length) * 100 
      : 0;

    // Time-based metrics
    const dates = posts.map(p => new Date(p.createdAt).getTime());
    const trackingStartDate = posts.length > 0 
      ? new Date(Math.min(...dates)).toISOString() 
      : null;
    
    const trackingDays = trackingStartDate
      ? Math.max(1, Math.ceil((Date.now() - Math.min(...dates)) / (1000 * 60 * 60 * 24)))
      : 0;

    const karmaGrowthRate = trackingDays > 0 ? totalKarma / trackingDays : 0;
    const postsPerDay = trackingDays > 0 ? posts.length / trackingDays : 0;

    // Velocity metrics
    const velocities = evaluatedPosts.map(p => p.karmaVelocity).filter(v => v > 0);
    const avgKarmaVelocity = velocities.length > 0
      ? velocities.reduce((a, b) => a + b, 0) / velocities.length
      : 0;

    return {
      totalPosts: posts.length,
      totalKarma,
      avgKarmaPerPost: Math.round(avgKarmaPerPost * 100) / 100,
      medianKarma: Math.round(medianKarma * 100) / 100,
      successfulPosts,
      failedPosts,
      successRate: Math.round(successRate * 100) / 100,
      karmaGrowthRate: Math.round(karmaGrowthRate * 100) / 100,
      postsPerDay: Math.round(postsPerDay * 100) / 100,
      avgKarmaVelocity: Math.round(avgKarmaVelocity * 1000) / 1000,
      trackingStartDate,
      trackingDays,
    };
  }

  /**
   * Get empty metrics
   */
  private getEmptyMetrics(): PerformanceMetrics {
    return {
      totalPosts: 0,
      totalKarma: 0,
      avgKarmaPerPost: 0,
      medianKarma: 0,
      successfulPosts: 0,
      failedPosts: 0,
      successRate: 0,
      karmaGrowthRate: 0,
      postsPerDay: 0,
      avgKarmaVelocity: 0,
      trackingStartDate: null,
      trackingDays: 0,
    };
  }

  /**
   * Get topic analytics with trend detection
   */
  getTopicAnalytics(): TopicAnalytics[] {
    const posts = feedbackTracker.getTrackedPosts();
    const topicMap = new Map<string, TrackedPost[]>();

    for (const post of posts) {
      if (!topicMap.has(post.topic)) {
        topicMap.set(post.topic, []);
      }
      topicMap.get(post.topic)!.push(post);
    }

    const analytics: TopicAnalytics[] = [];

    for (const [topic, topicPosts] of topicMap) {
      const totalKarma = topicPosts.reduce((sum, p) => sum + p.finalKarma, 0);
      const avgKarma = totalKarma / topicPosts.length;
      
      const evaluated = topicPosts.filter(p => p.checksCompleted >= 3);
      const successful = evaluated.filter(p => p.isSuccessful).length;
      const successRate = evaluated.length > 0 ? (successful / evaluated.length) * 100 : 0;

      // Calculate trend (compare first half vs second half)
      const trend = this.calculateTrend(topicPosts);

      analytics.push({
        topic,
        posts: topicPosts.length,
        totalKarma,
        avgKarma: Math.round(avgKarma * 100) / 100,
        successRate: Math.round(successRate),
        trend,
      });
    }

    return analytics.sort((a, b) => b.avgKarma - a.avgKarma);
  }

  /**
   * Calculate trend for a set of posts
   */
  private calculateTrend(posts: TrackedPost[]): "rising" | "stable" | "falling" {
    if (posts.length < 4) return "stable";

    const sorted = [...posts].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint);
    const secondHalf = sorted.slice(midpoint);

    const firstAvg = firstHalf.reduce((s, p) => s + p.finalKarma, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, p) => s + p.finalKarma, 0) / secondHalf.length;

    const change = (secondAvg - firstAvg) / Math.max(firstAvg, 1);

    if (change > 0.2) return "rising";
    if (change < -0.2) return "falling";
    return "stable";
  }

  /**
   * Get hourly analytics
   */
  getHourlyAnalytics(): TimeAnalytics[] {
    const posts = feedbackTracker.getTrackedPosts();
    const hourMap = new Map<number, TrackedPost[]>();

    for (const post of posts) {
      const hour = post.postingHour;
      if (!hourMap.has(hour)) {
        hourMap.set(hour, []);
      }
      hourMap.get(hour)!.push(post);
    }

    const analytics: TimeAnalytics[] = [];

    for (const [hour, hourPosts] of hourMap) {
      const avgKarma = hourPosts.reduce((s, p) => s + p.finalKarma, 0) / hourPosts.length;
      const evaluated = hourPosts.filter(p => p.checksCompleted >= 3);
      const successful = evaluated.filter(p => p.isSuccessful).length;
      const successRate = evaluated.length > 0 ? (successful / evaluated.length) * 100 : 0;

      analytics.push({
        hour,
        hourLabel: this.formatHour(hour),
        posts: hourPosts.length,
        avgKarma: Math.round(avgKarma * 100) / 100,
        successRate: Math.round(successRate),
      });
    }

    return analytics.sort((a, b) => b.avgKarma - a.avgKarma);
  }

  /**
   * Format hour
   */
  private formatHour(hour: number): string {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  }

  /**
   * Get conversion metrics
   */
  getConversionMetrics(): ConversionMetrics {
    const posts = feedbackTracker.getTrackedPosts();
    const memoryData = memory.get();

    const postsWithKarma = posts.filter(p => p.finalKarma > 0).length;
    const conversionRate = posts.length > 0 ? (postsWithKarma / posts.length) * 100 : 0;

    const serviceOffers = memoryData.monetization.servicesOffered;
    const potentialLeads = memoryData.monetization.potentialLeads.length;
    const conversionToLeads = serviceOffers > 0 ? (potentialLeads / serviceOffers) * 100 : 0;

    return {
      totalPosts: posts.length,
      postsWithKarma,
      postsWithComments: 0, // Would need to track this
      conversionRate: Math.round(conversionRate * 100) / 100,
      serviceOffers,
      potentialLeads,
      conversionToLeads: Math.round(conversionToLeads * 100) / 100,
    };
  }

  /**
   * Get full analytics report
   */
  getFullAnalytics(): FullAnalytics {
    const performance = this.getPerformanceMetrics();
    const topicAnalytics = this.getTopicAnalytics();
    const hourlyAnalytics = this.getHourlyAnalytics();
    const conversions = this.getConversionMetrics();

    // Top and worst topics
    const topTopics = topicAnalytics.slice(0, 5);
    const worstTopics = topicAnalytics.slice(-3).reverse();

    // Best hours
    const bestHours = hourlyAnalytics.slice(0, 5);

    // Generate insights
    const insights = this.generateInsights(performance, topicAnalytics, hourlyAnalytics, conversions);

    return {
      performance,
      topTopics,
      worstTopics,
      bestHours,
      conversions,
      insights,
    };
  }

  /**
   * Generate actionable insights
   */
  private generateInsights(
    performance: PerformanceMetrics,
    topics: TopicAnalytics[],
    hours: TimeAnalytics[],
    conversions: ConversionMetrics
  ): string[] {
    const insights: string[] = [];

    // Performance insights
    if (performance.successRate > 60) {
      insights.push(`🎯 Strong performance: ${performance.successRate}% success rate`);
    } else if (performance.successRate < 30 && performance.totalPosts >= 10) {
      insights.push(`⚠️ Low success rate (${performance.successRate}%) - consider adjusting strategy`);
    }

    if (performance.avgKarmaPerPost > 5) {
      insights.push(`📈 Above average engagement: ${performance.avgKarmaPerPost} karma/post`);
    }

    // Topic insights
    const risingTopics = topics.filter(t => t.trend === "rising");
    if (risingTopics.length > 0) {
      insights.push(`📈 Rising topics: ${risingTopics.map(t => t.topic).join(", ")}`);
    }

    const fallingTopics = topics.filter(t => t.trend === "falling" && t.posts >= 3);
    if (fallingTopics.length > 0) {
      insights.push(`📉 Declining topics: ${fallingTopics.map(t => t.topic).join(", ")}`);
    }

    // Timing insights
    if (hours.length > 0 && hours[0].avgKarma > performance.avgKarmaPerPost * 1.5) {
      insights.push(`⏰ Peak time: ${hours[0].hourLabel} (${hours[0].avgKarma} avg karma)`);
    }

    // Conversion insights
    if (conversions.conversionRate < 50 && conversions.totalPosts >= 10) {
      insights.push(`💡 ${Math.round(100 - conversions.conversionRate)}% of posts get no karma - focus on quality`);
    }

    if (conversions.conversionToLeads > 0) {
      insights.push(`💰 ${conversions.conversionToLeads}% of service offers generate leads`);
    }

    // Posting frequency
    if (performance.postsPerDay > 5) {
      insights.push(`📊 High posting frequency (${performance.postsPerDay}/day) - consider quality over quantity`);
    } else if (performance.postsPerDay < 0.5 && performance.trackingDays > 7) {
      insights.push(`📊 Low posting frequency - consider posting more consistently`);
    }

    return insights;
  }

  /**
   * Get a formatted summary for display
   */
  getSummary(): string {
    const analytics = this.getFullAnalytics();
    const { performance, topTopics, bestHours, insights } = analytics;

    let summary = `
═══════════════════════════════════════
        EvolAI ANALYTICS REPORT
═══════════════════════════════════════

📊 PERFORMANCE OVERVIEW
   Posts Tracked: ${performance.totalPosts}
   Total Karma: ${performance.totalKarma}
   Avg Karma/Post: ${performance.avgKarmaPerPost}
   Success Rate: ${performance.successRate}%
   Posts/Day: ${performance.postsPerDay}

🏆 TOP PERFORMING TOPICS
${topTopics.slice(0, 3).map((t, i) => 
  `   ${i + 1}. ${t.topic} (${t.avgKarma} avg, ${t.successRate}% success) ${t.trend === "rising" ? "📈" : t.trend === "falling" ? "📉" : ""}`
).join("\n") || "   No data yet"}

⏰ BEST POSTING TIMES
${bestHours.slice(0, 3).map((h, i) => 
  `   ${i + 1}. ${h.hourLabel} (${h.avgKarma} avg karma)`
).join("\n") || "   No data yet"}

💡 INSIGHTS
${insights.map(i => `   ${i}`).join("\n") || "   Keep posting to gather insights"}

═══════════════════════════════════════
`;

    return summary;
  }

  /**
   * Get brief metrics for logging
   */
  getBriefMetrics(): string {
    const m = this.getPerformanceMetrics();
    return `Posts: ${m.totalPosts} | Karma: ${m.totalKarma} | Avg: ${m.avgKarmaPerPost} | Success: ${m.successRate}%`;
  }
}

// Export singleton instance
export const analytics = new AnalyticsEngine();
