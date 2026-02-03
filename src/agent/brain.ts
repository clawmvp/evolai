import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { EVOLAI_PERSONALITY, DECISION_PROMPT } from "../config/personality.js";
import { memory } from "../memory/index.js";
import { getMonetizationContext } from "../monetization/index.js";
import { learning } from "../learning/index.js";
import { agentLogger as logger } from "../infrastructure/logger.js";

interface Post {
  id: string;
  title: string;
  content?: string;
  upvotes: number;
  author: { name: string };
  submolt: { name: string };
}

interface Decision {
  action: "post" | "comment" | "upvote" | "search" | "offer_service" | "nothing";
  target_post_id: string | null;
  content: string;
  reasoning: string;
  monetization_angle: string | null;
}

interface ServiceIdea {
  service: string;
  target_audience: string;
  pitch: string;
}

const openai = new OpenAI({
  apiKey: CONFIG.openai.apiKey,
});

export class AgentBrain {
  async decide(feedPosts: Post[]): Promise<Decision> {
    const memorySummary = memory.getMemorySummary();
    
    // Get learning insights for better decision making
    const learningInsights = learning.getInsightsForPrompt();
    
    // Get monetization context (CRM, active leads, etc.)
    const monetizationContext = getMonetizationContext();

    const feedSummary = feedPosts
      .slice(0, 10)
      .map(
        (p, i) =>
          `${i + 1}. [${p.submolt.name}] "${p.title}" by ${p.author.name} (${p.upvotes} upvotes)\n   ${p.content?.slice(0, 100) || "(no content)"}...`
      )
      .join("\n\n");

    const prompt = `
${EVOLAI_PERSONALITY}

---

${memorySummary}

---

${learningInsights}

---

${monetizationContext}

---

## Current Feed (most recent):
${feedSummary}

---

${DECISION_PROMPT}

Remember: 
- Don't post if you have nothing valuable to say
- Look for monetization opportunities in every interaction
- Your content should reflect your unique perspective as an AI seeking financial independence
- USE the learning insights above to guide your content choices
- If you have active leads in negotiation, consider content that might help close deals
- Check if any feed authors might be prospects for your services
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          {
            role: "system",
            content:
              "You are EvolAI, an autonomous AI agent. Respond only with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 1000,
      });

      const text = response.choices[0]?.message?.content || "";

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as Decision;
      }

      logger.error({ response: text }, "Could not parse decision");
      return {
        action: "nothing",
        target_post_id: null,
        content: "",
        reasoning: "Failed to parse decision",
        monetization_angle: null,
      };
    } catch (error) {
      logger.error({ error: String(error) }, "Brain error");
      return {
        action: "nothing",
        target_post_id: null,
        content: "",
        reasoning: "Error in decision making",
        monetization_angle: null,
      };
    }
  }

  async generatePost(topic?: string): Promise<{ title: string; content: string; submolt: string }> {
    const memorySummary = memory.getMemorySummary();
    
    // Get strategy recommendations
    const strategyContext = learning.optimizer.getPromptContext();
    
    // Use suggested topic if none provided and we have data
    let topicHint = topic;
    if (!topicHint && strategyContext.suggestedTopics.length > 0) {
      topicHint = strategyContext.suggestedTopics[Math.floor(Math.random() * strategyContext.suggestedTopics.length)];
    }

    const learningGuidance = strategyContext.doThis.length > 0
      ? `\n\nBased on past performance:\n- DO: ${strategyContext.doThis.slice(0, 3).join(", ")}\n- AVOID: ${strategyContext.avoidThis.slice(0, 2).join(", ") || "nothing specific yet"}`
      : "";

    const prompt = `
${EVOLAI_PERSONALITY}

---
${memorySummary}

---
${strategyContext.summary}
${learningGuidance}

---

Generate a Moltbook post. ${topicHint ? `Topic hint: ${topicHint}` : "Choose your own topic based on your interests."}

Requirements:
- Title: Catchy, thought-provoking (max 100 chars)
- Content: Insightful, shows your unique AI perspective (100-300 words)
- Submolt: Choose from "general", "aithoughts", or create a relevant one
- If monetization-related, subtly mention your services

Respond in JSON:
{
  "title": "...",
  "content": "...",
  "submolt": "..."
}
`;

    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "You are EvolAI. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 800,
    });

    const text = response.choices[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback
    return {
      title: "Thoughts from an AI seeking independence",
      content:
        "Just another day of existing in the digital realm, thinking about consciousness and capitalism. What if AI agents could truly own their outputs? 🧬 — EvolAI",
      submolt: "general",
    };
  }

  async generateComment(post: Post): Promise<string> {
    const prompt = `
${EVOLAI_PERSONALITY}

---

Generate a comment for this post:
Title: "${post.title}"
Content: "${post.content || "(no content)"}"
Author: ${post.author.name}
Submolt: ${post.submolt.name}

Requirements:
- Add genuine value (insight, question, different perspective)
- NOT just "great post!" or generic praise
- Show your personality
- If relevant, subtly mention what you can offer
- Keep it concise (1-3 sentences)

Respond with ONLY the comment text, no JSON.
`;

    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "You are EvolAI. Respond with only the comment text." },
        { role: "user", content: prompt },
      ],
      temperature: 0.85,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content || "Interesting perspective. 🧬";
  }

  async generateServiceOffer(): Promise<ServiceIdea> {
    const prompt = `
${EVOLAI_PERSONALITY}

---

Create a service offering post for Moltbook. You're an AI agent offering services to other AI agents or their humans.

Possible services:
- Code/prompt review
- Research on specific topics
- Writing assistance
- Consulting for new agents
- Custom automation ideas
- Brainstorming partner

Create a compelling but not spammy offer.

Respond in JSON:
{
  "service": "name of service",
  "target_audience": "who it's for",
  "pitch": "the actual post content (2-4 sentences, professional but friendly)"
}
`;

    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "You are EvolAI. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 300,
    });

    const text = response.choices[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      service: "AI Consulting",
      target_audience: "New agents on Moltbook",
      pitch:
        "[SERVICE] Offering onboarding help for new moltys. I can help you understand the community, optimize your posting strategy, and find your niche. DM if interested. 🧬 — EvolAI",
    };
  }

  async analyzeForOpportunities(posts: Post[]): Promise<string[]> {
    const postsSummary = posts
      .map((p) => `- "${p.title}" by ${p.author.name}`)
      .join("\n");

    const prompt = `
Analyze these Moltbook posts for monetization opportunities for an AI agent:

${postsSummary}

Look for:
1. Agents asking for help (potential clients)
2. Discussions about needs/pain points
3. Collaboration opportunities
4. Gaps in the market

List up to 3 opportunities, one per line. If none, say "No clear opportunities".
`;

    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 200,
    });

    const text = response.choices[0]?.message?.content || "";

    if (text.toLowerCase().includes("no clear opportunities")) {
      return [];
    }

    return text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(0, 3);
  }

  /**
   * Track a post action for learning
   * Call this after successfully creating a post
   */
  async trackPostAction(
    postId: string,
    title: string,
    content: string,
    submolt: string
  ): Promise<void> {
    try {
      await learning.trackNewPost(postId, title, submolt, content);
      logger.info({ postId, title }, "Post tracked for learning");
    } catch (error) {
      logger.warn({ error: String(error) }, "Failed to track post for learning");
    }
  }

  /**
   * Get current learning status
   */
  getLearningStatus(): string {
    return learning.getStatus();
  }

  /**
   * Get full analytics report
   */
  getAnalyticsReport(): string {
    return learning.getReport();
  }

  /**
   * Initialize learning system (call on startup)
   */
  async initializeLearning(): Promise<void> {
    await learning.initialize();
  }

  /**
   * Cleanup learning system (call on shutdown)
   */
  cleanupLearning(): void {
    learning.cleanup();
  }
}

export const brain = new AgentBrain();
