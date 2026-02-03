import { moltbook } from "../moltbook/client.js";
import { brain } from "./brain.js";
import { memory } from "../memory/index.js";
import { notify } from "../notifications/index.js";
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
    log.heartbeat("EvolAI Heartbeat", { timestamp: new Date().toISOString() });

    try {
      // 1. Get latest feed
      logger.info("Fetching feed...");
      const feed = await moltbook.getGlobalFeed("new", 20);
      logger.info({ postCount: feed.length }, "Feed fetched");

      // 2. Decide what to do (friendly interactions only)
      log.decision("Thinking about what to do...");
      const decision = await brain.decide(feed as Post[]);
      log.decision(`Decision: ${decision.action}`, {
        action: decision.action,
        reasoning: decision.reasoning,
      });

      // 3. Execute decision
      await this.executeDecision(decision, feed as Post[]);

      // 4. Update memory
      memory.recordHeartbeat();

      // 5. Send heartbeat summary notification
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
          logger.info({ postId: post.id, title: postData.title }, "Post created!");
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
            logger.info("Comment posted!");
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
  }
}

export const evolai = new EvolAI();
