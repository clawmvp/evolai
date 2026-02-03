import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { security } from "../security/index.js";
import type { SearchResult } from "./web-search.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "knowledge-base" });

const openai = new OpenAI({
  apiKey: CONFIG.openai.apiKey,
});

// Knowledge base storage
const KB_DIR = join(dirname(CONFIG.paths.memory), "knowledge");
const KB_FILE = join(KB_DIR, "learned.json");

// Ensure directory exists
if (!existsSync(KB_DIR)) {
  mkdirSync(KB_DIR, { recursive: true });
}

export interface LearnedItem {
  id: string;
  topic: string;
  summary: string;
  source: string;
  sourceUrl?: string;
  learnedAt: string;
  relevance: number; // 1-10
  category: "ai" | "tech" | "philosophy" | "social" | "coding" | "other";
  tags: string[];
}

export interface KnowledgeStore {
  items: LearnedItem[];
  lastUpdate: string | null;
  totalLearned: number;
  topicsExplored: string[];
}

class KnowledgeBase {
  private store: KnowledgeStore;

  constructor() {
    this.store = this.load();
    log.info({ items: this.store.items.length }, "Knowledge base loaded");
  }

  private load(): KnowledgeStore {
    if (existsSync(KB_FILE)) {
      try {
        return JSON.parse(readFileSync(KB_FILE, "utf-8"));
      } catch {
        log.warn("Could not load knowledge base, starting fresh");
      }
    }
    return {
      items: [],
      lastUpdate: null,
      totalLearned: 0,
      topicsExplored: [],
    };
  }

  private save(): void {
    writeFileSync(KB_FILE, JSON.stringify(this.store, null, 2));
  }

  /**
   * Process search results and extract knowledge
   */
  async learnFromResults(results: SearchResult[], topic: string): Promise<LearnedItem[]> {
    if (results.length === 0) return [];

    log.info({ topic, resultCount: results.length }, "Learning from search results...");

    // Summarize and extract insights using GPT
    const prompt = `
You are EvolAI, learning new information. Analyze these search results about "${topic}" and extract key learnings.

Results:
${results.map((r, i) => `${i + 1}. [${r.source}] ${r.title}\n   ${r.snippet}`).join("\n\n")}

For each interesting insight you find, create a learning entry. Focus on:
- New concepts or ideas
- Trends in AI/tech
- Interesting perspectives
- Useful techniques or approaches

Respond in JSON:
{
  "learnings": [
    {
      "summary": "A concise summary of what you learned (1-2 sentences)",
      "relevance": 1-10,
      "category": "ai|tech|philosophy|social|coding|other",
      "tags": ["tag1", "tag2"]
    }
  ]
}

Only include genuinely interesting or useful learnings. Quality over quantity.
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          { role: "system", content: "You are EvolAI extracting knowledge. Respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 1000,
      });

      const text = response.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as {
        learnings: Array<{
          summary: string;
          relevance: number;
          category: LearnedItem["category"];
          tags: string[];
        }>;
      };

      const learnedItems: LearnedItem[] = [];

      for (const learning of parsed.learnings) {
        // Find the most relevant source
        const source = results[0];

        const item: LearnedItem = {
          id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          topic,
          summary: security.sanitizeOutput(learning.summary),
          source: source.source,
          sourceUrl: source.url,
          learnedAt: new Date().toISOString(),
          relevance: learning.relevance,
          category: learning.category,
          tags: learning.tags,
        };

        this.store.items.push(item);
        learnedItems.push(item);
      }

      // Update metadata
      this.store.totalLearned += learnedItems.length;
      this.store.lastUpdate = new Date().toISOString();
      if (!this.store.topicsExplored.includes(topic)) {
        this.store.topicsExplored.push(topic);
      }

      this.save();
      log.info({ learned: learnedItems.length }, "Knowledge extracted and saved");

      return learnedItems;
    } catch (error) {
      log.error({ error: String(error) }, "Failed to extract knowledge");
      return [];
    }
  }

  /**
   * Get relevant knowledge for a topic
   */
  getRelevantKnowledge(topic: string, limit = 5): LearnedItem[] {
    const lower = topic.toLowerCase();
    
    return this.store.items
      .filter(item => 
        item.topic.toLowerCase().includes(lower) ||
        item.summary.toLowerCase().includes(lower) ||
        item.tags.some(t => t.toLowerCase().includes(lower))
      )
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /**
   * Get recent learnings
   */
  getRecent(limit = 10): LearnedItem[] {
    return this.store.items
      .sort((a, b) => new Date(b.learnedAt).getTime() - new Date(a.learnedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get knowledge by category
   */
  getByCategory(category: LearnedItem["category"]): LearnedItem[] {
    return this.store.items.filter(item => item.category === category);
  }

  /**
   * Get knowledge summary for prompts
   */
  getKnowledgeSummary(): string {
    const recent = this.getRecent(5);
    
    if (recent.length === 0) {
      return "No external knowledge acquired yet.";
    }

    let summary = "## Recent Learnings from External Sources\n\n";
    
    for (const item of recent) {
      summary += `- **${item.category}**: ${item.summary} (from ${item.source})\n`;
    }

    return summary;
  }

  /**
   * Get stats
   */
  getStats(): {
    totalItems: number;
    totalLearned: number;
    topicsExplored: number;
    lastUpdate: string | null;
    byCategory: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};
    for (const item of this.store.items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    }

    return {
      totalItems: this.store.items.length,
      totalLearned: this.store.totalLearned,
      topicsExplored: this.store.topicsExplored.length,
      lastUpdate: this.store.lastUpdate,
      byCategory,
    };
  }

  /**
   * Get summary for display
   */
  getSummary(): string {
    const stats = this.getStats();
    const recent = this.getRecent(3);

    let summary = `## 📚 Knowledge Base\n\n`;
    summary += `**Stats:**\n`;
    summary += `- Total items: ${stats.totalItems}\n`;
    summary += `- Topics explored: ${stats.topicsExplored}\n`;
    summary += `- Last update: ${stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleString() : "never"}\n\n`;

    if (Object.keys(stats.byCategory).length > 0) {
      summary += `**By Category:**\n`;
      for (const [cat, count] of Object.entries(stats.byCategory)) {
        summary += `- ${cat}: ${count}\n`;
      }
      summary += `\n`;
    }

    if (recent.length > 0) {
      summary += `**Recent Learnings:**\n`;
      for (const item of recent) {
        summary += `• ${item.summary.slice(0, 60)}... (${item.source})\n`;
      }
    }

    return summary;
  }
}

export const knowledgeBase = new KnowledgeBase();
