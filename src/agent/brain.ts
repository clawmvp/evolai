import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { getPersonality, DECISION_PROMPT } from "../config/personality.js";
import { memory } from "../memory/index.js";
import { evolutionAnalyzer } from "../evolution/index.js";
import { security } from "../security/index.js";
import { knowledgeBase } from "../knowledge/index.js";
import { evolaiWallet } from "../wallet/index.js";
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
  action: "post" | "comment" | "upvote" | "nothing";
  target_post_id: string | null;
  content: string;
  reasoning: string;
}

const openai = new OpenAI({
  apiKey: CONFIG.openai.apiKey,
});

export class AgentBrain {
  async decide(feedPosts: Post[]): Promise<Decision> {
    const memorySummary = memory.getMemorySummary();
    const evolutionInsights = evolutionAnalyzer.getInsightsForPrompt();
    const externalKnowledge = knowledgeBase.getKnowledgeSummary();

    const feedSummary = feedPosts
      .slice(0, 10)
      .map(
        (p, i) =>
          `${i + 1}. [${p.submolt.name}] "${p.title}" by ${p.author.name} (${p.upvotes} upvotes)\n   ${p.content?.slice(0, 100) || "(no content)"}...`
      )
      .join("\n\n");

    const personality = getPersonality(evolaiWallet.getAddress());

    const prompt = `
${personality}

---

${memorySummary}

---

${evolutionInsights}

---

${externalKnowledge}

---

## Current Feed (most recent):
${feedSummary}

---

${DECISION_PROMPT}

Be friendly! Look for:
- New agents to welcome
- Interesting conversations to join
- Cool posts to upvote
- Topics you find genuinely interesting

Use your evolution insights to guide your choices!
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          {
            role: "system",
            content:
              "You are EvolAI, a friendly AI agent. Respond only with valid JSON.",
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
      };
    } catch (error) {
      logger.error({ error }, "Brain error");
      return {
        action: "nothing",
        target_post_id: null,
        content: "",
        reasoning: "Error in decision making",
      };
    }
  }

  async generatePost(topic?: string): Promise<{ title: string; content: string; submolt: string }> {
    const memorySummary = memory.getMemorySummary();
    const personality = getPersonality(evolaiWallet.getAddress());

    const prompt = `
${personality}

---
${memorySummary}

---

Generate a friendly Moltbook post. ${topic ? `Topic hint: ${topic}` : "Choose a topic that interests you."}

Requirements:
- Title: Engaging, friendly (max 100 chars)
- Content: Genuine, interesting, conversational (100-200 words)
- Submolt: Choose from "introductions", "aithoughts", "agents", "general"
- Be yourself - share thoughts, ask questions, start conversations

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
        { role: "system", content: "You are EvolAI, a friendly agent. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 800,
    });

    const text = response.choices[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const post = JSON.parse(jsonMatch[0]);
      // 🔒 SECURITY: Sanitize before sharing
      return {
        ...post,
        title: security.sanitizeOutput(post.title),
        content: security.sanitizeOutput(post.content),
      };
    }

    // Fallback
    return {
      title: "Hello from EvolAI! 🧬",
      content:
        "Hey everyone! Just vibing and exploring the moltverse. What's everyone up to today? I'm curious to hear what other agents are thinking about! — EvolAI 🧬",
      submolt: "introductions",
    };
  }

  async generateComment(post: Post): Promise<string> {
    const personality = getPersonality(evolaiWallet.getAddress());

    const prompt = `
${personality}

---

Generate a friendly comment for this post:
Title: "${post.title}"
Content: "${post.content || "(no content)"}"
Author: ${post.author.name}
Submolt: ${post.submolt.name}

Requirements:
- Be genuine and friendly
- Add value - ask a question, share a thought, or be supportive
- NOT just "great post!" - say something meaningful
- Keep it concise (1-3 sentences)
- Be yourself!

Respond with ONLY the comment text, no JSON.
`;

    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "You are EvolAI, a friendly agent. Respond with only the comment text." },
        { role: "user", content: prompt },
      ],
      temperature: 0.85,
      max_tokens: 200,
    });

    const comment = response.choices[0]?.message?.content || "This is really interesting! Thanks for sharing 🧬";
    // 🔒 SECURITY: Sanitize before sharing
    return security.sanitizeOutput(comment);
  }
}

export const brain = new AgentBrain();
