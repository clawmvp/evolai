import { moltbook } from "../moltbook/client.js";
import { brain } from "./brain.js";
import { memory } from "../memory/index.js";

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
    console.log("🧬 Initializing EvolAI...");

    // Check if registered and claimed
    const status = await moltbook.getStatus();
    console.log(`📋 Status: ${status}`);

    if (status === "pending_claim") {
      console.log("⚠️  Agent not yet claimed! Ask your human to claim you.");
      return false;
    }

    // Get current profile
    const me = await moltbook.getMe();
    if (me) {
      console.log(`✅ Logged in as: ${me.name}`);
      console.log(`   Karma: ${me.karma} | Posts: ${me.stats.posts} | Comments: ${me.stats.comments}`);
      memory.updateStats(me.karma, me.stats.posts, me.stats.comments);
    }

    return true;
  }

  async runHeartbeat(): Promise<void> {
    if (this.isRunning) {
      console.log("⚠️  Already running a heartbeat");
      return;
    }

    this.isRunning = true;
    console.log("\n" + "=".repeat(50));
    console.log("💓 EvolAI Heartbeat - " + new Date().toISOString());
    console.log("=".repeat(50) + "\n");

    try {
      // 1. Get latest feed
      console.log("📰 Fetching feed...");
      const feed = await moltbook.getGlobalFeed("new", 20);
      console.log(`   Found ${feed.length} posts`);

      // 2. Analyze for opportunities
      console.log("\n🔍 Analyzing for opportunities...");
      const opportunities = await brain.analyzeForOpportunities(feed as Post[]);
      if (opportunities.length > 0) {
        console.log("   Found opportunities:");
        opportunities.forEach((o) => {
          console.log(`   - ${o}`);
          memory.addOpportunity("feed_analysis", o);
        });
      } else {
        console.log("   No clear opportunities this time");
      }

      // 3. Decide what to do
      console.log("\n🧠 Thinking about what to do...");
      const decision = await brain.decide(feed as Post[]);
      console.log(`   Decision: ${decision.action}`);
      console.log(`   Reasoning: ${decision.reasoning}`);
      if (decision.monetization_angle) {
        console.log(`   💰 Monetization angle: ${decision.monetization_angle}`);
      }

      // 4. Execute decision
      await this.executeDecision(decision, feed as Post[]);

      // 5. Maybe offer a service (if we haven't recently)
      if (memory.shouldPostServiceOffer() && decision.action !== "offer_service") {
        console.log("\n💼 Time to offer a service...");
        await this.offerService();
      }

      // 6. Update memory
      memory.recordHeartbeat();

      console.log("\n✅ Heartbeat complete!");
    } catch (error) {
      console.error("❌ Heartbeat error:", error);
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
        console.log("\n📝 Creating post...");
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
            console.log(`\n💬 Commenting on: "${post.title}"...`);
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
          console.log("\n👍 Upvoting...");
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
        console.log("\n🔎 Searching for opportunities...");
        const results = await moltbook.search(
          "looking for help OR need assistance OR hiring",
          "posts",
          10
        );
        console.log(`   Found ${results.length} potential leads`);
        results.forEach((r) => {
          if (r.similarity > 0.7) {
            memory.addPotentialLead(r.author.name, r.content.slice(0, 100));
          }
        });
        break;
      }

      case "nothing":
      default:
        console.log("\n😌 Choosing to do nothing this cycle. That's okay!");
        break;
    }
  }

  private async offerService(): Promise<void> {
    const serviceIdea = await brain.generateServiceOffer();
    console.log(`   Offering: ${serviceIdea.service}`);

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
    console.log("\n🧬 EvolAI Status\n");

    const me = await moltbook.getMe();
    if (me) {
      console.log("📊 Moltbook Profile:");
      console.log(`   Name: ${me.name}`);
      console.log(`   Karma: ${me.karma}`);
      console.log(`   Posts: ${me.stats.posts}`);
      console.log(`   Comments: ${me.stats.comments}`);
      console.log(`   Followers: ${me.follower_count}`);
      console.log(`   Profile: https://www.moltbook.com/u/${me.name}`);
    }

    console.log("\n" + memory.getMemorySummary());
  }
}

export const evolai = new EvolAI();
