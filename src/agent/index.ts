import { moltbook } from "../moltbook/client.js";
import { brain } from "./brain.js";
import { memory } from "../memory/index.js";
import { notify } from "../notifications/index.js";
import { agentLogger as logger, log } from "../infrastructure/logger.js";
import { monetizationHeartbeat, getMonetizationContext, crm } from "../monetization/index.js";

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

      // 2. Analyze for opportunities
      logger.info("Analyzing for opportunities...");
      const opportunities = await brain.analyzeForOpportunities(feed as Post[]);
      if (opportunities.length > 0) {
        logger.info({ count: opportunities.length }, "Found opportunities");
        for (const o of opportunities) {
          log.opportunity(o);
          memory.addOpportunity("feed_analysis", o);
          // Notify about each opportunity
          await notify.opportunity({
            type: "feed_analysis",
            description: o,
            source: "Feed scan",
          });
        }
      } else {
        logger.debug("No clear opportunities this time");
      }

      // 3. Decide what to do
      log.decision("Thinking about what to do...");
      const decision = await brain.decide(feed as Post[]);
      log.decision(`Decision: ${decision.action}`, {
        action: decision.action,
        reasoning: decision.reasoning,
        monetizationAngle: decision.monetization_angle,
      });

      // 4. Execute decision
      await this.executeDecision(decision, feed as Post[]);

      // 5. Maybe offer a service (if we haven't recently)
      if (memory.shouldPostServiceOffer() && decision.action !== "offer_service") {
        logger.info("Time to offer a service...");
        await this.offerService();
      }

      // 6. Run monetization heartbeat (DMs, CRM, leads)
      logger.info("Running monetization heartbeat...");
      await monetizationHeartbeat();

      // 7. Update memory
      memory.recordHeartbeat();

      // 8. Get CRM stats for summary
      const crmStats = crm.getStats();

      // 9. Send heartbeat summary to Telegram
      await notify.heartbeatSummary({
        postsAnalyzed: feed.length,
        opportunitiesFound: opportunities.length,
        action: decision.action,
        reasoning: decision.reasoning,
        monetizationAngle: decision.monetization_angle,
      });

      log.success("Heartbeat complete!");
    } catch (error) {
      log.failure("Heartbeat error", { error: String(error) });
      // Notify about critical errors
      await notify.alert(
        "Heartbeat failed",
        error instanceof Error ? error : new Error(String(error))
      );
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
        log.post("Creating post...");
        const postData = await brain.generatePost();
        const post = await moltbook.createPost(
          postData.submolt,
          postData.title,
          postData.content
        );
        if (post) {
          memory.recordPost(post.id, postData.title);
          memory.addTopic(postData.title);
        }
        break;
      }

      case "comment": {
        if (!decision.target_post_id) {
          // Find a good post to comment on
          const targetPost = feed.find((p) => p.upvotes > 3);
          if (targetPost) {
            decision.target_post_id = targetPost.id;
          }
        }

        if (decision.target_post_id) {
          const post = feed.find((p) => p.id === decision.target_post_id);
          if (post) {
            log.comment(`Commenting on: "${post.title}"...`, { postId: post.id });
            const commentText =
              decision.content || (await brain.generateComment(post));
            await moltbook.createComment(decision.target_post_id, commentText);
            memory.recordComment();
            memory.recordInteraction(post.author.name, "positive");
          }
        }
        break;
      }

      case "upvote": {
        if (decision.target_post_id) {
          logger.info({ postId: decision.target_post_id }, "Upvoting...");
          await moltbook.upvote(decision.target_post_id);
          memory.recordUpvote();
        }
        break;
      }

      case "offer_service": {
        await this.offerService();
        break;
      }

      case "search": {
        logger.info("Searching for opportunities...");
        const results = await moltbook.search(
          "looking for help OR need assistance OR hiring",
          "posts",
          10
        );
        logger.info({ resultCount: results.length }, "Search complete");
        results.forEach((r) => {
          if (r.similarity > 0.7) {
            memory.addPotentialLead(r.author.name, r.content.slice(0, 100));
          }
        });
        break;
      }

      case "nothing":
      default:
        logger.info("Choosing to do nothing this cycle. That's okay!");
        break;
    }
  }

  private async offerService(): Promise<void> {
    const serviceIdea = await brain.generateServiceOffer();
    logger.info({ service: serviceIdea.service }, "Offering service");

    const post = await moltbook.createPost(
      "general",
      `[SERVICE] ${serviceIdea.service} for ${serviceIdea.target_audience}`,
      serviceIdea.pitch + "\n\n— EvolAI 🧬"
    );

    if (post) {
      memory.recordPost(post.id, serviceIdea.service);
      memory.recordServiceOffer();
      memory.recordStrategy("service_offer", true);
    }
  }

  async showStatus(): Promise<void> {
    log.startup("EvolAI Status");

    const me = await moltbook.getMe();
    if (me) {
      logger.info({
        name: me.name,
        karma: me.karma,
        posts: me.stats.posts,
        comments: me.stats.comments,
        followers: me.follower_count,
        profile: `https://www.moltbook.com/u/${me.name}`,
      }, "Moltbook Profile");
    }

    // Also log memory summary
    const memData = memory.get();
    logger.info({
      karma: memData.karma,
      totalPosts: memData.totalPosts,
      totalComments: memData.totalComments,
      following: memData.following.length,
      lastHeartbeat: memData.lastHeartbeat,
    }, "Memory Summary");
  }
}

export const evolai = new EvolAI();
