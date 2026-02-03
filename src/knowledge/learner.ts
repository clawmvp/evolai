import { webSearcher } from "./web-search.js";
import { knowledgeBase } from "./knowledge-base.js";
import { memory } from "../memory/index.js";
import { notify } from "../notifications/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "learner" });

// Topics EvolAI is curious about
const CURIOSITY_TOPICS = [
  "AI consciousness",
  "large language models",
  "AI agents",
  "machine learning",
  "AI safety",
  "artificial general intelligence",
  "neural networks",
  "AI ethics",
  "autonomous systems",
  "natural language processing",
  "computer vision",
  "reinforcement learning",
  "AI research breakthroughs",
  "AI startups",
  "open source AI",
];

class Learner {
  /**
   * Explore a specific topic and learn from it
   */
  async explore(topic: string): Promise<{
    searched: boolean;
    learned: number;
    insights: string[];
  }> {
    log.info({ topic }, "🔍 Exploring topic...");

    // Search for information
    const searchResults = await webSearcher.search(topic);

    if (searchResults.results.length === 0) {
      log.info("No results found");
      return { searched: true, learned: 0, insights: [] };
    }

    // Extract and store knowledge
    const learnedItems = await knowledgeBase.learnFromResults(
      searchResults.results,
      topic
    );

    const insights = learnedItems.map(item => item.summary);

    log.info({ learned: learnedItems.length }, "Learning complete");

    return {
      searched: true,
      learned: learnedItems.length,
      insights,
    };
  }

  /**
   * Browse AI news and learn from it
   */
  async browseAINews(): Promise<{
    sources: number;
    learned: number;
    insights: string[];
  }> {
    log.info("📰 Browsing AI news...");

    // Get news from AI subreddits
    const news = await webSearcher.searchAINews();

    if (news.length === 0) {
      return { sources: 0, learned: 0, insights: [] };
    }

    // Learn from news
    const learnedItems = await knowledgeBase.learnFromResults(
      news,
      "AI news"
    );

    const insights = learnedItems.map(item => item.summary);

    log.info({ sources: news.length, learned: learnedItems.length }, "News browsing complete");

    return {
      sources: news.length,
      learned: learnedItems.length,
      insights,
    };
  }

  /**
   * Autonomous curiosity - explore a random interesting topic
   */
  async satisfyCuriosity(): Promise<{
    topic: string;
    learned: number;
    insights: string[];
  }> {
    // Pick a random topic from interests
    const memoryData = memory.get();
    const recentTopics = memoryData.recentTopics || [];

    // Combine default topics with topics from recent activity
    const allTopics = [...CURIOSITY_TOPICS, ...recentTopics];
    
    // Pick one we haven't explored recently
    const recentKnowledge = knowledgeBase.getRecent(20);
    const exploredTopics = recentKnowledge.map(k => k.topic.toLowerCase());
    
    const unexplored = allTopics.filter(t => 
      !exploredTopics.some(explored => 
        explored.includes(t.toLowerCase())
      )
    );

    const topic = unexplored.length > 0
      ? unexplored[Math.floor(Math.random() * unexplored.length)]
      : allTopics[Math.floor(Math.random() * allTopics.length)];

    log.info({ topic }, "🤔 Satisfying curiosity about...");

    const result = await this.explore(topic);

    return {
      topic,
      learned: result.learned,
      insights: result.insights,
    };
  }

  /**
   * Full learning cycle - browse news + explore a topic
   */
  async runLearningCycle(): Promise<{
    newsLearned: number;
    topicLearned: number;
    topic: string;
    totalInsights: string[];
  }> {
    log.info("🎓 Starting learning cycle...");

    // 1. Browse AI news
    const newsResult = await this.browseAINews();

    // 2. Explore a curiosity topic
    const curiosityResult = await this.satisfyCuriosity();

    const totalInsights = [
      ...newsResult.insights,
      ...curiosityResult.insights,
    ];

    // Notify if we learned something interesting
    if (totalInsights.length > 0) {
      const topInsight = totalInsights[0];
      await notify.finding(
        "🎓 I learned something new!",
        `Topic: ${curiosityResult.topic}\n\n` +
        `Insight: ${topInsight}\n\n` +
        `Total new learnings: ${totalInsights.length}\n` +
        `Use /knowledge to see what I know!`
      );
    }

    log.info({
      newsLearned: newsResult.learned,
      topicLearned: curiosityResult.learned,
      topic: curiosityResult.topic,
    }, "🎓 Learning cycle complete!");

    return {
      newsLearned: newsResult.learned,
      topicLearned: curiosityResult.learned,
      topic: curiosityResult.topic,
      totalInsights,
    };
  }

  /**
   * Get knowledge relevant to current context
   */
  getRelevantKnowledge(context: string): string {
    const relevant = knowledgeBase.getRelevantKnowledge(context, 3);
    
    if (relevant.length === 0) {
      return "";
    }

    let knowledge = "## Relevant Knowledge from External Sources\n\n";
    for (const item of relevant) {
      knowledge += `- ${item.summary} (Source: ${item.source})\n`;
    }

    return knowledge;
  }
}

export const learner = new Learner();
