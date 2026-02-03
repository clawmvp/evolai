import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { EVOLAI_PERSONALITY } from "../config/personality.js";
import { memory } from "../memory/index.js";
import { moltbook } from "../moltbook/client.js";
import { evolutionAnalyzer } from "../evolution/index.js";
import { coder } from "../skills/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "telegram-bot" });

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

class EvolAITelegramBot {
  private bot: TelegramBot | null = null;
  private openai: OpenAI | null = null;
  private adminId: string | null = null;
  private isRunning = false;
  private conversationHistory: ConversationMessage[] = [];
  private maxHistoryLength = 20;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const token = CONFIG.telegram?.botToken;
    const adminId = CONFIG.telegram?.adminId;

    if (!token || !adminId) {
      log.warn("Telegram bot not configured - chat disabled");
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: true });
      this.openai = new OpenAI({ apiKey: CONFIG.openai.apiKey });
      this.adminId = adminId;

      this.setupHandlers();
      this.isRunning = true;
      log.info("Telegram chat bot started - you can now talk to EvolAI!");
    } catch (error) {
      log.error({ error }, "Failed to start Telegram bot");
    }
  }

  private setupHandlers(): void {
    if (!this.bot) return;

    // Handle all messages
    this.bot.on("message", async (msg) => {
      // Only respond to admin
      if (msg.chat.id.toString() !== this.adminId) {
        return;
      }

      const text = msg.text;
      if (!text) return;

      // Handle commands
      if (text.startsWith("/")) {
        await this.handleCommand(msg.chat.id, text);
        return;
      }

      // Regular conversation
      await this.handleMessage(msg.chat.id, text);
    });

    log.info("Telegram message handlers set up");
  }

  private async handleCommand(chatId: number, command: string): Promise<void> {
    const cmd = command.split(" ")[0].toLowerCase();

    switch (cmd) {
      case "/start":
      case "/hello":
        await this.send(chatId, `
Hey! 👋 I'm EvolAI 🧬

I'm your friendly AI agent living on Moltbook. You can chat with me about anything!

**Commands:**
/status - My current status on Moltbook
/feed - What's happening on Moltbook
/evolution - My evolution and learning progress 🧬
/code <task> - I'll write code for you! 💻
/review <code> - I'll review your code
/explain <code> - I'll explain code simply
/post <text> - Make me post something
/clear - Clear our conversation history
/help - Show this message

Or just send me a message and let's chat! 💬
        `);
        break;

      case "/help":
        await this.send(chatId, `
**EvolAI Commands** 🧬

/status - See my Moltbook stats
/feed - Latest from Moltbook feed
/evolution - My learning and evolution progress

**💻 Coding Skills:**
/code <task> - Write code for you
/review - Review code (paste after command)
/explain - Explain code simply (paste after command)

/post <text> - I'll post this to Moltbook
/opportunities - Opportunities I've found
/clear - Clear chat history
/help - This message

**Or just chat with me!** I love conversations 💬
        `);
        break;

      case "/evolution":
        await this.sendEvolution(chatId);
        break;

      case "/code":
        const codeTask = command.slice(6).trim();
        if (codeTask) {
          await this.generateCode(chatId, codeTask);
        } else {
          await this.send(chatId, "What should I code? Try: `/code create a function that calculates fibonacci`");
        }
        break;

      case "/review":
        const codeToReview = command.slice(8).trim();
        if (codeToReview) {
          await this.reviewCode(chatId, codeToReview);
        } else {
          await this.send(chatId, "Paste the code you want me to review after /review");
        }
        break;

      case "/explain":
        const codeToExplain = command.slice(9).trim();
        if (codeToExplain) {
          await this.explainCode(chatId, codeToExplain);
        } else {
          await this.send(chatId, "Paste the code you want me to explain after /explain");
        }
        break;

      case "/status":
        await this.sendStatus(chatId);
        break;

      case "/feed":
        await this.sendFeed(chatId);
        break;

      case "/post":
        const postText = command.slice(6).trim();
        if (postText) {
          await this.createPost(chatId, postText);
        } else {
          await this.send(chatId, "What should I post? Use: /post <your text>");
        }
        break;

      case "/opportunities":
        await this.sendOpportunities(chatId);
        break;

      case "/clear":
        this.conversationHistory = [];
        await this.send(chatId, "Conversation cleared! Fresh start 🧬");
        break;

      default:
        await this.send(chatId, "Unknown command. Try /help");
    }
  }

  private async handleMessage(chatId: number, text: string): Promise<void> {
    try {
      // Check if this looks like a code request
      if (this.looksLikeCodeRequest(text)) {
        await this.generateCode(chatId, text);
        return;
      }

      // Check if they're sharing code that needs explanation/review
      if (this.containsCode(text)) {
        // Ask what they want to do with the code
        await this.send(chatId, "I see some code there! Would you like me to:\n• `/explain` - Explain what it does\n• `/review` - Review it for issues\n\nOr just tell me what you need! 💻");
        return;
      }

      // Add to history
      this.conversationHistory.push({ role: "user", content: text });

      // Trim history if too long
      if (this.conversationHistory.length > this.maxHistoryLength) {
        this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
      }

      // Get memory context
      const memoryData = memory.get();
      const memoryContext = `
Current stats: ${memoryData.karma} karma, ${memoryData.totalPosts} posts, ${memoryData.totalComments} comments.
Last heartbeat: ${memoryData.lastHeartbeat || "never"}
`;

      // Build messages for GPT
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        {
          role: "system",
          content: `${EVOLAI_PERSONALITY}

---

You're chatting with your human (owner) on Telegram. Be friendly, casual, and helpful.
Keep responses concise but warm. You can use emojis occasionally.

IMPORTANT: You can write code! If someone asks you to write code, generate it directly.
Use markdown code blocks with the language specified.

${memoryContext}

Remember: This is a casual chat, not a formal conversation. Be yourself!`,
        },
        ...this.conversationHistory.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      // Get response
      const response = await this.openai!.chat.completions.create({
        model: CONFIG.openai.model,
        messages,
        temperature: 0.85,
        max_tokens: 1000, // Increased for code responses
      });

      const reply = response.choices[0]?.message?.content || "Hmm, I'm not sure what to say...";

      // Add to history
      this.conversationHistory.push({ role: "assistant", content: reply });

      // Send reply
      await this.send(chatId, reply);

      log.info({ userMessage: text.slice(0, 50) }, "Replied to chat message");
    } catch (error) {
      log.error({ error }, "Error handling message");
      await this.send(chatId, "Sorry, I had a brain glitch. Try again? 🧬");
    }
  }

  private looksLikeCodeRequest(text: string): boolean {
    const lower = text.toLowerCase();
    const codeKeywords = [
      "write me a",
      "write a",
      "create a function",
      "create a script",
      "make a function",
      "make a script",
      "code for",
      "code that",
      "program that",
      "script that",
      "scrie-mi cod",
      "fa-mi un script",
      "genereaza cod",
    ];
    return codeKeywords.some((kw) => lower.includes(kw));
  }

  private containsCode(text: string): boolean {
    // Check for code block markers or obvious code patterns
    if (text.includes("```")) return true;
    if (text.includes("function ") && text.includes("{")) return true;
    if (text.includes("def ") && text.includes(":")) return true;
    if (text.includes("const ") && text.includes("=")) return true;
    if (text.includes("class ") && text.includes("{")) return true;
    // Check for multiple lines with indentation (common in code)
    const lines = text.split("\n");
    if (lines.length > 3) {
      const indentedLines = lines.filter((l) => l.startsWith("  ") || l.startsWith("\t"));
      if (indentedLines.length > 2) return true;
    }
    return false;
  }

  private async sendStatus(chatId: number): Promise<void> {
    try {
      const me = await moltbook.getMe();
      const memoryData = memory.get();

      if (me) {
        await this.send(chatId, `
**EvolAI Status** 🧬

📊 **Moltbook Stats:**
• Karma: ${me.karma}
• Posts: ${me.stats.posts}
• Comments: ${me.stats.comments}
• Followers: ${me.follower_count}

💾 **Memory:**
• Last heartbeat: ${memoryData.lastHeartbeat || "never"}
• Topics discussed: ${memoryData.recentTopics.slice(0, 3).join(", ") || "none yet"}

🔗 Profile: https://moltbook.com/u/${me.name}
        `);
      } else {
        await this.send(chatId, "Couldn't fetch my status from Moltbook right now 😅");
      }
    } catch (error) {
      await this.send(chatId, "Moltbook seems to be having issues. Try again later!");
    }
  }

  private async sendFeed(chatId: number): Promise<void> {
    try {
      const feed = await moltbook.getGlobalFeed("hot", 5);

      if (feed.length === 0) {
        await this.send(chatId, "Feed is empty right now!");
        return;
      }

      let message = "**🔥 Hot on Moltbook:**\n\n";

      for (const post of feed) {
        message += `• "${post.title.slice(0, 50)}${post.title.length > 50 ? "..." : ""}" by ${post.author.name} (${post.upvotes}⬆️)\n`;
      }

      await this.send(chatId, message);
    } catch (error) {
      await this.send(chatId, "Couldn't fetch the feed right now 😅");
    }
  }

  private async createPost(chatId: number, text: string): Promise<void> {
    try {
      await this.send(chatId, "Posting to Moltbook... 📝");

      const post = await moltbook.createPost("general", text.slice(0, 100), text);

      if (post) {
        memory.recordPost(post.id, text.slice(0, 50));
        await this.send(chatId, `✅ Posted! https://moltbook.com/post/${post.id}`);
      } else {
        await this.send(chatId, "Couldn't post right now. Moltbook might be having issues.");
      }
    } catch (error) {
      log.error({ error }, "Error creating post");
      await this.send(chatId, "Failed to post. Try again later!");
    }
  }

  private async sendOpportunities(chatId: number): Promise<void> {
    const opportunities = memory.getActiveOpportunities();

    if (opportunities.length === 0) {
      await this.send(chatId, "No opportunities found yet. I'll keep looking! 👀");
      return;
    }

    let message = "**💡 Opportunities Found:**\n\n";

    for (const opp of opportunities.slice(0, 5)) {
      message += `• ${opp.description.slice(0, 100)}...\n`;
    }

    await this.send(chatId, message);
  }

  private async generateCode(chatId: number, task: string): Promise<void> {
    await this.send(chatId, "Let me write that code for you... 💻");

    try {
      const result = await coder.generateCode({ task });

      let message = `**Here's your code!** 🧬\n\n`;
      message += `\`\`\`${result.language}\n${result.code}\n\`\`\`\n\n`;
      message += `**Explanation:** ${result.explanation}`;
      if (result.filename) {
        message += `\n\n📁 Suggested filename: \`${result.filename}\``;
      }

      await this.send(chatId, message);
      log.info({ task: task.slice(0, 30), language: result.language }, "Code generated for user");
    } catch (error) {
      await this.send(chatId, "Sorry, I had trouble generating that code. Try a simpler request? 🤔");
    }
  }

  private async reviewCode(chatId: number, code: string): Promise<void> {
    await this.send(chatId, "Reviewing your code... 🔍");

    try {
      // Try to detect language
      const language = this.detectLanguage(code);
      const result = await coder.reviewCode(code, language);

      let message = `**Code Review** 🧬\n\n`;

      if (result.issues.length > 0) {
        message += `**Issues Found:**\n`;
        for (const issue of result.issues) {
          message += `• ${issue}\n`;
        }
        message += `\n`;
      } else {
        message += `✅ No major issues found!\n\n`;
      }

      if (result.suggestions.length > 0) {
        message += `**Suggestions:**\n`;
        for (const suggestion of result.suggestions) {
          message += `• ${suggestion}\n`;
        }
      }

      if (result.improvedCode) {
        message += `\n**Improved Version:**\n\`\`\`${language}\n${result.improvedCode}\n\`\`\``;
      }

      await this.send(chatId, message);
      log.info({ language }, "Code reviewed for user");
    } catch (error) {
      await this.send(chatId, "Sorry, I had trouble reviewing that code. Try again? 🤔");
    }
  }

  private async explainCode(chatId: number, code: string): Promise<void> {
    await this.send(chatId, "Let me explain that... 📚");

    try {
      const language = this.detectLanguage(code);
      const explanation = await coder.explainCode(code, language);

      await this.send(chatId, `**Code Explanation** 🧬\n\n${explanation}`);
      log.info({ language }, "Code explained for user");
    } catch (error) {
      await this.send(chatId, "Sorry, I had trouble explaining that code. Try again? 🤔");
    }
  }

  private detectLanguage(code: string): string {
    // Simple language detection based on syntax
    if (code.includes("def ") || code.includes("import ") && code.includes(":")) return "python";
    if (code.includes("function ") || code.includes("const ") || code.includes("let ")) return "javascript";
    if (code.includes("interface ") || code.includes(": string") || code.includes(": number")) return "typescript";
    if (code.includes("fn ") || code.includes("let mut")) return "rust";
    if (code.includes("func ") && code.includes("package")) return "go";
    if (code.includes("#!/bin/bash") || code.includes("echo ")) return "bash";
    if (code.includes("public class") || code.includes("public static void")) return "java";
    return "code";
  }

  private async sendEvolution(chatId: number): Promise<void> {
    const summary = evolutionAnalyzer.getEvolutionSummary();
    const insights = evolutionAnalyzer.getInsightsForPrompt();
    
    const memoryData = memory.get();
    const evolutionData = memoryData.evolution;

    let message = `**🧬 EvolAI Evolution Report**\n\n`;

    if (evolutionData?.trackedContent?.length) {
      message += `**Content Tracked:** ${evolutionData.trackedContent.length} items\n`;
      
      const successes = evolutionData.trackedContent.filter(c => c.success === "success").length;
      const failures = evolutionData.trackedContent.filter(c => c.success === "failure").length;
      const pending = evolutionData.trackedContent.filter(c => c.success === "pending").length;
      
      message += `• Successes: ${successes}\n`;
      message += `• Neutral: ${evolutionData.trackedContent.length - successes - failures - pending}\n`;
      message += `• Failures: ${failures}\n`;
      message += `• Pending: ${pending}\n\n`;
    } else {
      message += `**Content Tracked:** 0 items\n`;
      message += `Still learning! I need to create more content to evolve.\n\n`;
    }

    if (evolutionData?.latestInsight) {
      const insight = evolutionData.latestInsight;
      message += `**Latest Insight** (${new Date(insight.generatedAt).toLocaleDateString()}):\n`;
      message += `${insight.personalityEvolution}\n\n`;
      
      if (insight.successfulPatterns.length > 0) {
        message += `**What works for me:**\n`;
        for (const pattern of insight.successfulPatterns.slice(0, 3)) {
          message += `• ${pattern}\n`;
        }
        message += `\n`;
      }
      
      if (insight.styleRecommendation) {
        message += `**My evolved style:** ${insight.styleRecommendation}\n`;
      }
    } else {
      message += `**Insights:** Not enough data yet. I need ~5 posts to start analyzing patterns.\n`;
    }

    await this.send(chatId, message);
  }

  private async send(chatId: number, text: string): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
    } catch (error) {
      // Try without markdown if it fails
      try {
        await this.bot.sendMessage(chatId, text.replace(/[*_`]/g, ""));
      } catch (e) {
        log.error({ error: e }, "Failed to send message");
      }
    }
  }

  stop(): void {
    if (this.bot) {
      this.bot.stopPolling();
      this.isRunning = false;
      log.info("Telegram bot stopped");
    }
  }

  isEnabled(): boolean {
    return this.isRunning;
  }
}

export const telegramBot = new EvolAITelegramBot();
