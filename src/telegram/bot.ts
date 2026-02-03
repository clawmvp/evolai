import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { EVOLAI_PERSONALITY } from "../config/personality.js";
import { memory } from "../memory/index.js";
import { moltbook } from "../moltbook/client.js";
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
/post <text> - I'll post this to Moltbook
/comment <post_id> <text> - Comment on a post
/opportunities - Opportunities I've found
/clear - Clear chat history
/help - This message

**Or just chat with me!** I love conversations 💬
        `);
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
        max_tokens: 500,
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
