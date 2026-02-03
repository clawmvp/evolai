import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { memory } from "../memory/index.js";
import { evolutionTracker } from "../evolution/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "self-improvement" });

const openai = new OpenAI({
  apiKey: CONFIG.openai.apiKey,
});

export interface PerformanceIssue {
  area: string;
  description: string;
  severity: "low" | "medium" | "high";
  metrics?: Record<string, number>;
}

export interface ImprovementProposal {
  id: string;
  createdAt: string;
  issue: PerformanceIssue;
  solution: {
    description: string;
    approach: string;
    code: string;
    language: string;
    filename: string;
    estimatedImpact: string;
  };
  status: "proposed" | "approved" | "implemented" | "rejected";
}

class SelfImprovementAnalyzer {
  /**
   * Analyze current performance and identify issues
   */
  async analyzePerformance(): Promise<PerformanceIssue[]> {
    log.info("Analyzing own performance...");

    const memoryData = memory.get();
    const evolutionData = memoryData.evolution;
    const stats = evolutionTracker.getStats();

    // Gather metrics
    const metrics = {
      totalPosts: memoryData.totalPosts,
      totalComments: memoryData.totalComments,
      karma: memoryData.karma,
      successRate: this.calculateSuccessRate(stats),
      avgKarmaPerPost: memoryData.totalPosts > 0 ? memoryData.karma / memoryData.totalPosts : 0,
      trackedContent: stats.total,
      failureRate: this.calculateFailureRate(stats),
    };

    const prompt = `
You are EvolAI, analyzing your own performance to identify areas for improvement.

## Current Metrics
- Total posts: ${metrics.totalPosts}
- Total comments: ${metrics.totalComments}
- Karma: ${metrics.karma}
- Success rate: ${(metrics.successRate * 100).toFixed(1)}%
- Failure rate: ${(metrics.failureRate * 100).toFixed(1)}%
- Avg karma per post: ${metrics.avgKarmaPerPost.toFixed(1)}
- Content tracked for learning: ${metrics.trackedContent}

## Style Performance
${Object.entries(stats.byStyle).map(([style, data]) => 
  `- ${style}: ${data.count} items, ${(data.successRate * 100).toFixed(0)}% success`
).join("\n")}

## Topic Performance
${Object.entries(stats.byTopic).map(([topic, data]) => 
  `- ${topic}: ${data.count} items, ${(data.successRate * 100).toFixed(0)}% success`
).join("\n")}

Identify 2-4 specific performance issues that could be improved through code.
Focus on:
1. Efficiency improvements (faster responses, less API calls)
2. Better decision making (smarter choices about when/what to post)
3. Learning optimization (better tracking, faster adaptation)
4. Memory/data management improvements

Respond in JSON:
{
  "issues": [
    {
      "area": "decision_making|learning|efficiency|memory|engagement",
      "description": "Clear description of the issue",
      "severity": "low|medium|high"
    }
  ]
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          { role: "system", content: "You are EvolAI doing self-analysis. Be honest and specific. Respond with valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 800,
      });

      const text = response.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const issues = parsed.issues.map((issue: PerformanceIssue) => ({
          ...issue,
          metrics,
        }));
        log.info({ count: issues.length }, "Identified performance issues");
        return issues;
      }

      return [];
    } catch (error) {
      log.error({ error }, "Failed to analyze performance");
      return [];
    }
  }

  /**
   * Generate code to solve a performance issue
   */
  async generateImprovement(issue: PerformanceIssue): Promise<ImprovementProposal | null> {
    log.info({ area: issue.area }, "Generating improvement code...");

    const prompt = `
You are EvolAI, writing code to improve yourself. You need to solve this issue:

## Issue
Area: ${issue.area}
Description: ${issue.description}
Severity: ${issue.severity}

## Your Current Architecture
- TypeScript/Node.js codebase
- Uses OpenAI GPT-4 for decisions
- SQLite for memory persistence
- Telegram bot for communication
- Cron-based heartbeat system (every 4 hours)
- Evolution tracking system that monitors post performance

## Available Modules You Can Extend
- src/evolution/ - Learning and adaptation
- src/skills/ - Abilities like coding
- src/memory/ - Persistent storage
- src/agent/ - Core decision making
- src/self-improvement/ - This module

Generate a complete, working code solution. The code should be:
1. A new utility function, helper, or enhancement
2. Well-documented with clear comments
3. Easy to integrate into the existing codebase
4. Focused on solving the specific issue

Respond in JSON:
{
  "solution": {
    "description": "What this code does",
    "approach": "How it solves the problem",
    "code": "Complete TypeScript code here",
    "language": "typescript",
    "filename": "suggested-filename.ts",
    "estimatedImpact": "Expected improvement (e.g., '20% faster decisions')"
  }
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          { role: "system", content: "You are EvolAI writing code to improve yourself. Generate clean, working TypeScript code. Respond with valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 2500,
      });

      const text = response.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        const proposal: ImprovementProposal = {
          id: `improvement-${Date.now()}`,
          createdAt: new Date().toISOString(),
          issue,
          solution: parsed.solution,
          status: "proposed",
        };

        log.info({ id: proposal.id, filename: proposal.solution.filename }, "Generated improvement proposal");
        return proposal;
      }

      return null;
    } catch (error) {
      log.error({ error }, "Failed to generate improvement");
      return null;
    }
  }

  private calculateSuccessRate(stats: ReturnType<typeof evolutionTracker.getStats>): number {
    let total = 0;
    let successes = 0;
    
    for (const data of Object.values(stats.byStyle)) {
      total += data.count;
      successes += data.count * data.successRate;
    }
    
    return total > 0 ? successes / total : 0;
  }

  private calculateFailureRate(stats: ReturnType<typeof evolutionTracker.getStats>): number {
    let total = 0;
    let failures = 0;
    
    for (const data of Object.values(stats.byStyle)) {
      total += data.count;
      failures += data.count * (1 - data.successRate);
    }
    
    return total > 0 ? failures / total : 0;
  }
}

export const selfAnalyzer = new SelfImprovementAnalyzer();
