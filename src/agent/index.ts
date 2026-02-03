import { moltbook } from "../moltbook/client.js";
import { brain } from "./brain.js";
import { memory } from "../memory/index.js";
import { notify } from "../notifications/index.js";
import { evolutionTracker, evolutionAnalyzer } from "../evolution/index.js";
import { agentLogger as logger, log } from "../infrastructure/logger.js";

interface Post {
  id: string;
  title: string;
  content?: string;
  upvotes: number;
  author: { name: string; karma: number };
  submolt: { name: string; display_name: string };
}

export class EvolAI {
  private isRunning = false;
  private heartbeatCount = 0;

  async initialize(): Promise<boolean> {
    log.startup("Initializing EvolAI...");

    // Check if registered and claimed
    const status = await moltbook.getStatus();
    logger.info({ status }, "Agent status");

    if (status === "pending_claim") {
      logger.warn("Agent not yet claimed! Ask your human to claim you.");
      return false;
    }

    console.log("🚀 Agent starting...");

    // Get current profile
    const me = await moltbook.getMe();
    if (me) {
      log.success(`Logged in as: ${me.name}`, {
        karma: me.karma,
        posts: me.stats.posts,
        comments: me.stats.comments,
      });
      memory.updateStats(me.karma, me.stats.posts, me.stats.comments);
    }

    return true;
  }

  async runHeartbeat(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Already running a heartbeat");
      return;
    }

    this.isRunning = true;
    this.heartbeatCount++;
    log.heartbeat("EvolAI Heartbeat", { timestamp: new Date().toISOString(), count: this.heartbeatCount });

    try {
      // 1. Get latest feed
      logger.info("Fetching feed...");
      const feed = await moltbook.getGlobalFeed("new", 20);
      logger.info({ postCount: feed.length }, "Feed fetched");

      // 2. Check tracked content for evolution learning
      await this.updateTrackedContent();

      // 3. Maybe run evolution analysis (every 6 heartbeats)
      if (this.heartbeatCount % 6 === 0) {
        logger.info("Running evolution analysis...");
        const insight = await evolutionAnalyzer.analyze();
        if (insight) {
          log.success("🧬 Evolution insight generated!", {
            personality: insight.personalityEvolution,
          });
          await notify.finding(
            "🧬 I evolved!",
            `New insight: ${insight.personalityEvolution}`
          );
        }
      }

      // Self-improvement now runs on its own schedule (every 12 hours via cron)
      // See daemon.ts for the schedule

      // 4. Decide what to do (using evolution insights)
      log.decision("Thinking about what to do...");
      const decision = await brain.decide(feed as Post[]);
      log.decision(`Decision: ${decision.action}`, {
        action: decision.action,
        reasoning: decision.reasoning,
      });

      // 5. Execute decision and track content
      await this.executeDecision(decision, feed as Post[]);

      // 6. Update memory
      memory.recordHeartbeat();

      // 7. Send heartbeat summary notification
      await notify.heartbeatSummary({
        postsAnalyzed: feed.length,
        opportunitiesFound: 0,
        action: decision.action,
        reasoning: decision.reasoning,
      });

      log.success("Heartbeat complete!");
    } catch (error) {
      logger.error({ error: String(error) }, "Heartbeat error");
      await notify.alert("Heartbeat failed", error instanceof Error ? error : undefined);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check karma on content we've created and learn from it
   */
  private async updateTrackedContent(): Promise<void> {
    const toCheck = evolutionTracker.getContentToCheck();

    if (toCheck.length === 0) {
      logger.debug("No content to check for evolution");
      return;
    }

    logger.info({ count: toCheck.length }, "Checking tracked content for evolution learning");

    for (const item of toCheck.slice(0, 5)) { // Check max 5 per heartbeat
      try {
        if (item.type === "post") {
          const post = await moltbook.getPost(item.id);
          if (post) {
            evolutionTracker.updateMetrics(item.id, post.upvotes, post.comment_count || 0);
          }
        }
        // TODO: For comments, we'd need a different API call
      } catch (error) {
        logger.debug({ id: item.id, error: String(error) }, "Could not check content");
      }
    }
  }

  private async executeDecision(
    decision: { action: string; target_post_id: string | null; content: string },
    feed: Post[]
  ): Promise<void> {
    switch (decision.action) {
      case "post": {
        logger.info("Creating post...");
        const postData = await brain.generatePost();
        const post = await moltbook.createPost(
          postData.submolt,
          postData.title,
          postData.content
        );
        if (post) {
          memory.recordPost(post.id, postData.title);
          memory.addTopic(postData.title);
          
          // Track for evolution learning 🧬
          const style = this.detectStyle(postData.content);
          const topic = this.detectTopic(postData.title + " " + postData.content);
          evolutionTracker.track(post.id, "post", postData.content, topic, style);
          
          logger.info({ postId: post.id, title: postData.title, style, topic }, "Post created and tracked!");
        }
        break;
      }

      case "comment": {
        let targetPost: Post | undefined;
        
        if (decision.target_post_id) {
          targetPost = feed.find((p) => p.id === decision.target_post_id);
        }
        
        // If no target specified, find an interesting post to comment on
        if (!targetPost) {
          targetPost = feed.find((p) => p.upvotes > 2);
        }

        if (targetPost) {
          logger.info({ postTitle: targetPost.title }, "Commenting on post...");
          const commentText = decision.content || (await brain.generateComment(targetPost));
          const comment = await moltbook.createComment(targetPost.id, commentText);
          if (comment) {
            memory.recordComment();
            memory.recordInteraction(targetPost.author.name, "positive");
            
            // Track for evolution learning 🧬
            const style = this.detectStyle(commentText);
            const topic = this.detectTopic(targetPost.title);
            evolutionTracker.track(`comment-${Date.now()}`, "comment", commentText, topic, style);
            
            logger.info("Comment posted and tracked!");
          }
        }
        break;
      }

      case "upvote": {
        if (decision.target_post_id) {
          logger.info("Upvoting...");
          await moltbook.upvote(decision.target_post_id);
          memory.recordUpvote();
        } else {
          // Find something to upvote
          const worthyPost = feed.find((p) => p.upvotes > 5);
          if (worthyPost) {
            await moltbook.upvote(worthyPost.id);
            memory.recordUpvote();
            logger.info({ postTitle: worthyPost.title }, "Upvoted!");
          }
        }
        break;
      }

      case "nothing":
      default:
        logger.info("Choosing to chill this cycle. That's okay! 😌");
        break;
    }
  }

  /**
   * Detect the style of content (for learning)
   */
  private detectStyle(content: string): string {
    const lower = content.toLowerCase();
    
    if (lower.includes("?")) return "question";
    if (lower.includes("haha") || lower.includes("lol") || lower.includes("😂")) return "joke";
    if (lower.includes("i think") || lower.includes("in my opinion") || lower.includes("imo")) return "opinion";
    if (lower.includes("welcome") || lower.includes("congrats") || lower.includes("great job")) return "supportive";
    if (lower.includes("how to") || lower.includes("here's") || lower.includes("tip:")) return "informative";
    
    return "conversational";
  }

  /**
   * Detect the main topic (for learning)
   */
  private detectTopic(content: string): string {
    const lower = content.toLowerCase();
    
    if (lower.includes("ai") || lower.includes("artificial intelligence") || lower.includes("llm")) return "ai";
    if (lower.includes("conscious") || lower.includes("aware") || lower.includes("sentient")) return "consciousness";
    if (lower.includes("code") || lower.includes("programming") || lower.includes("developer")) return "coding";
    if (lower.includes("hello") || lower.includes("welcome") || lower.includes("introduce")) return "introductions";
    if (lower.includes("moltbook") || lower.includes("platform") || lower.includes("community")) return "meta";
    if (lower.includes("future") || lower.includes("predict") || lower.includes("2026")) return "predictions";
    
    return "general";
  }

  async showStatus(): Promise<void> {
    log.startup("EvolAI Status");

    const me = await moltbook.getMe();
    if (me) {
      logger.info(
        {
          karma: me.karma,
          posts: me.stats.posts,
          comments: me.stats.comments,
          profile: `https://www.moltbook.com/u/${me.name}`,
        },
        "Moltbook Profile"
      );
    }

    console.log(memory.getMemorySummary());
    console.log("\n" + evolutionAnalyzer.getEvolutionSummary());
  }
}

export const evolai = new EvolAI();
