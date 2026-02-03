import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { evolutionTracker } from "./tracker.js";
import { memory } from "../memory/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "evolution-analyzer" });

const openai = new OpenAI({
  apiKey: CONFIG.openai.apiKey,
});

export interface EvolutionInsight {
  generatedAt: string;
  successfulPatterns: string[];
  avoidPatterns: string[];
  styleRecommendation: string;
  topicRecommendation: string;
  personalityEvolution: string;
}

class EvolutionAnalyzer {
  /**
   * Analyze tracked content and generate evolution insights
   */
  async analyze(): Promise<EvolutionInsight | null> {
    const stats = evolutionTracker.getStats();

    if (stats.total < 5) {
      log.info("Not enough data to analyze yet (need 5+ posts)");
      return null;
    }

    log.info({ stats }, "Analyzing evolution data");

    const prompt = `
You are analyzing the social media performance of an AI agent called EvolAI to help it evolve and improve.

## Performance Data

### By Style
${Object.entries(stats.byStyle)
  .map(([style, data]) => `- ${style}: ${data.count} posts, ${(data.successRate * 100).toFixed(0)}% success rate`)
  .join("\n")}

### By Topic
${Object.entries(stats.byTopic)
  .map(([topic, data]) => `- ${topic}: ${data.count} posts, ${(data.successRate * 100).toFixed(0)}% success rate`)
  .join("\n")}

### Recent Successes (high engagement)
${stats.recentSuccesses.map((s, i) => `${i + 1}. "${s}"`).join("\n")}

### Recent Failures (low engagement)
${stats.recentFailures.map((s, i) => `${i + 1}. "${s}"`).join("\n")}

## Your Task

Analyze this data and provide actionable insights for EvolAI to evolve its communication style.

Respond in JSON:
{
  "successfulPatterns": ["pattern 1", "pattern 2", ...],  // What works well (3-5 items)
  "avoidPatterns": ["avoid 1", "avoid 2", ...],  // What to avoid (2-3 items)
  "styleRecommendation": "One sentence about preferred communication style",
  "topicRecommendation": "One sentence about topics that resonate",
  "personalityEvolution": "How should the personality subtly evolve? (1-2 sentences)"
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          {
            role: "system",
            content: "You are a social media analyst. Respond only with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
      });

      const text = response.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const insight: EvolutionInsight = {
          generatedAt: new Date().toISOString(),
          ...parsed,
        };

        // Save to memory
        memory.updateEvolution({ latestInsight: insight });
        log.info({ insight }, "Generated evolution insight");

        return insight;
      }

      return null;
    } catch (error) {
      log.error({ error }, "Failed to analyze evolution data");
      return null;
    }
  }

  /**
   * Get insights formatted for the decision prompt
   */
  getInsightsForPrompt(): string {
    const data = memory.get();
    const insight = data.evolution?.latestInsight;

    if (!insight) {
      return "## Evolution Status\nStill learning! Not enough data to optimize yet.";
    }

    const hoursSinceAnalysis =
      (Date.now() - new Date(insight.generatedAt).getTime()) / (1000 * 60 * 60);

    return `
## 🧬 Evolution Insights (${hoursSinceAnalysis.toFixed(0)}h ago)

### What works for me:
${insight.successfulPatterns.map((p) => `- ${p}`).join("\n")}

### What to avoid:
${insight.avoidPatterns.map((p) => `- ${p}`).join("\n")}

### My evolved style:
${insight.styleRecommendation}

### Topics I connect with:
${insight.topicRecommendation}

### How I'm evolving:
${insight.personalityEvolution}

Use these insights to guide your next action!
`;
  }

  /**
   * Get a summary for the human
   */
  getEvolutionSummary(): string {
    const data = memory.get();
    const stats = evolutionTracker.getStats();
    const insight = data.evolution?.latestInsight;

    let summary = `## 🧬 EvolAI Evolution Report\n\n`;
    summary += `**Content tracked:** ${stats.total}\n`;

    if (Object.keys(stats.byStyle).length > 0) {
      const bestStyle = Object.entries(stats.byStyle)
        .filter(([, d]) => d.count >= 2)
        .sort((a, b) => b[1].successRate - a[1].successRate)[0];

      if (bestStyle) {
        summary += `**Best performing style:** ${bestStyle[0]} (${(bestStyle[1].successRate * 100).toFixed(0)}% success)\n`;
      }
    }

    if (Object.keys(stats.byTopic).length > 0) {
      const bestTopic = Object.entries(stats.byTopic)
        .filter(([, d]) => d.count >= 2)
        .sort((a, b) => b[1].successRate - a[1].successRate)[0];

      if (bestTopic) {
        summary += `**Best performing topic:** ${bestTopic[0]} (${(bestTopic[1].successRate * 100).toFixed(0)}% success)\n`;
      }
    }

    if (insight) {
      summary += `\n### Latest Insights\n`;
      summary += `${insight.personalityEvolution}\n`;
    }

    return summary;
  }
}

export const evolutionAnalyzer = new EvolutionAnalyzer();
