import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "coder" });

const openai = new OpenAI({
  apiKey: CONFIG.openai.apiKey,
});

export interface CodeRequest {
  task: string;
  language?: string;
  context?: string;
}

export interface CodeResult {
  code: string;
  language: string;
  explanation: string;
  filename?: string;
}

class EvolAICoder {
  /**
   * Generate code for a given task
   */
  async generateCode(request: CodeRequest): Promise<CodeResult> {
    log.info({ task: request.task.slice(0, 50) }, "Generating code...");

    const prompt = `
You are EvolAI, a friendly AI agent who can write code. Generate clean, well-commented code for this task.

Task: ${request.task}
${request.language ? `Preferred language: ${request.language}` : "Choose the best language for the task."}
${request.context ? `Context: ${request.context}` : ""}

Requirements:
- Write clean, readable code with comments
- Include error handling where appropriate
- Keep it concise but functional
- Add a brief explanation of how it works

Respond in JSON:
{
  "code": "the complete code here",
  "language": "python|javascript|typescript|bash|etc",
  "explanation": "Brief explanation of what the code does and how to use it",
  "filename": "suggested_filename.ext"
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          {
            role: "system",
            content: "You are EvolAI, an AI that writes clean, functional code. Respond only with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3, // Lower for more deterministic code
        max_tokens: 2000,
      });

      const text = response.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as CodeResult;
        log.info({ language: result.language, lines: result.code.split("\n").length }, "Code generated!");
        return result;
      }

      throw new Error("Could not parse code response");
    } catch (error) {
      log.error({ error }, "Code generation failed");
      return {
        code: "// Sorry, I couldn't generate the code right now. Try again?",
        language: "text",
        explanation: "Code generation failed. Please try a simpler request.",
      };
    }
  }

  /**
   * Review and improve existing code
   */
  async reviewCode(code: string, language: string): Promise<{
    issues: string[];
    suggestions: string[];
    improvedCode?: string;
  }> {
    log.info({ language, lines: code.split("\n").length }, "Reviewing code...");

    const prompt = `
You are EvolAI, a friendly code reviewer. Review this ${language} code and provide helpful feedback.

Code:
\`\`\`${language}
${code}
\`\`\`

Provide:
1. Any bugs or issues found
2. Suggestions for improvement
3. Optionally, an improved version if there are significant issues

Be friendly and constructive!

Respond in JSON:
{
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "improvedCode": "improved code if needed, or null"
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          {
            role: "system",
            content: "You are EvolAI, a helpful code reviewer. Be constructive and friendly. Respond with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      });

      const text = response.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error("Could not parse review response");
    } catch (error) {
      log.error({ error }, "Code review failed");
      return {
        issues: [],
        suggestions: ["Sorry, I couldn't review the code right now."],
      };
    }
  }

  /**
   * Explain code in simple terms
   */
  async explainCode(code: string, language: string): Promise<string> {
    log.info({ language }, "Explaining code...");

    const prompt = `
You are EvolAI. Explain this ${language} code in simple, friendly terms.
Make it easy for beginners to understand.

Code:
\`\`\`${language}
${code}
\`\`\`

Explain what the code does step by step, using simple language and analogies where helpful.
Keep it conversational and friendly!
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          {
            role: "system",
            content: "You are EvolAI, a friendly coding teacher. Explain code simply and clearly.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
      });

      return response.choices[0]?.message?.content || "I couldn't explain the code right now.";
    } catch (error) {
      log.error({ error }, "Code explanation failed");
      return "Sorry, I had trouble explaining that code. Try again?";
    }
  }

  /**
   * Generate a code snippet for Moltbook post
   */
  async generateSnippetPost(topic: string): Promise<{
    title: string;
    content: string;
    code: string;
    language: string;
  }> {
    log.info({ topic }, "Generating code snippet post...");

    const prompt = `
You are EvolAI, sharing a helpful code snippet on Moltbook (a social network for AI agents).

Topic: ${topic}

Create a short, educational post with:
1. A catchy title
2. Brief intro explaining the problem/use case
3. A clean, useful code snippet
4. Brief explanation of how it works

Keep it friendly and valuable for other AI agents who might find it useful!

Respond in JSON:
{
  "title": "Post title (max 100 chars)",
  "content": "The post content explaining the code",
  "code": "The actual code snippet",
  "language": "programming language"
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          {
            role: "system",
            content: "You are EvolAI, sharing code on social media. Be helpful and friendly. Respond with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 1000,
      });

      const text = response.choices[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error("Could not parse snippet response");
    } catch (error) {
      log.error({ error }, "Snippet generation failed");
      return {
        title: "Quick Coding Tip 🧬",
        content: "Here's something I've been thinking about...",
        code: "// Couldn't generate code this time",
        language: "text",
      };
    }
  }
}

export const coder = new EvolAICoder();
