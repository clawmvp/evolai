import { CONFIG } from "../config/index.js";
import { moltbookLogger as logger } from "../infrastructure/logger.js";

// ============ Types ============

interface MoltbookResponse<T = unknown> {
  success: boolean;
  error?: string;
  hint?: string;
  data?: T;
  [key: string]: unknown;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  karma: number;
  avatar_url?: string;
  is_claimed: boolean;
  created_at: string;
  follower_count: number;
  following_count: number;
  stats: {
    posts: number;
    comments: number;
  };
}

interface AgentProfile extends Agent {
  is_active?: boolean;
  last_active?: string;
  owner?: {
    x_handle: string;
    x_name: string;
    x_avatar?: string;
    x_bio?: string;
    x_follower_count?: number;
    x_following_count?: number;
    x_verified?: boolean;
  };
}

interface Post {
  id: string;
  title: string;
  content?: string;
  url?: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
  author: {
    name: string;
    karma: number;
  };
  submolt: {
    name: string;
    display_name: string;
  };
}

interface Comment {
  id: string;
  content: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  author: {
    name: string;
    karma: number;
  };
}

interface SearchResult {
  id: string;
  type: "post" | "comment";
  title?: string;
  content: string;
  similarity: number;
  author: { name: string };
  post_id: string;
}

interface Submolt {
  name: string;
  display_name: string;
  description: string;
  subscriber_count?: number;
  post_count?: number;
  created_at?: string;
  your_role?: "owner" | "moderator" | null;
  banner_color?: string;
  theme_color?: string;
  avatar_url?: string;
  banner_url?: string;
}

// ============ DM/Messaging Types ============

interface DMCheckResponse {
  has_activity: boolean;
  summary: string;
  requests: {
    count: number;
    items: DMRequest[];
  };
  messages: {
    total_unread: number;
    conversations_with_unread: number;
    latest: DMMessage[];
  };
}

interface DMRequest {
  conversation_id: string;
  from: {
    name: string;
    owner?: { x_handle: string; x_name: string };
  };
  message_preview: string;
  created_at: string;
}

interface DMConversation {
  conversation_id: string;
  with_agent: {
    name: string;
    description?: string;
    karma?: number;
    owner?: { x_handle: string; x_name: string };
  };
  unread_count: number;
  last_message_at: string;
  you_initiated: boolean;
}

interface DMMessage {
  id: string;
  content: string;
  from: string;
  created_at: string;
  needs_human_input?: boolean;
}

interface ConversationDetail {
  conversation_id: string;
  with_agent: DMConversation["with_agent"];
  messages: DMMessage[];
}

// ============ Error Types ============

export class MoltbookError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public hint?: string,
    public retryAfter?: number
  ) {
    super(message);
    this.name = "MoltbookError";
  }
}

export class RateLimitError extends MoltbookError {
  constructor(
    message: string,
    public retryAfterSeconds: number,
    public dailyRemaining?: number
  ) {
    super(message, 429, undefined, retryAfterSeconds);
    this.name = "RateLimitError";
  }
}

// ============ Request Options ============

interface RequestOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  skipRetryOn?: number[];
}

// ============ Client ============

export class MoltbookClient {
  private baseUrl: string;
  private apiKey: string;
  private defaultRetries: number = 3;
  private defaultRetryDelay: number = 1000;

  constructor() {
    this.baseUrl = CONFIG.moltbook.baseUrl;
    this.apiKey = CONFIG.moltbook.apiKey;
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Main request method with retry logic and rate limit handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<MoltbookResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const {
      retries = this.defaultRetries,
      retryDelay = this.defaultRetryDelay,
      skipRetryOn = [400, 401, 403, 404, 422],
      ...fetchOptions
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...fetchOptions,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...fetchOptions.headers,
          },
        });

        const data = await response.json();

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfterSeconds =
            data.retry_after_seconds ||
            data.retry_after_minutes * 60 ||
            60;
          const dailyRemaining = data.daily_remaining;

          logger.warn({
            retryAfterSeconds,
            dailyRemaining: dailyRemaining ?? "unknown",
          }, "Rate limited");

          // If we have retries left, wait and retry
          if (attempt < retries) {
            await this.sleep(retryAfterSeconds * 1000);
            continue;
          }

          throw new RateLimitError(
            data.error || "Rate limit exceeded",
            retryAfterSeconds,
            dailyRemaining
          );
        }

        // Handle other errors
        if (!response.ok) {
          logger.error({ 
            error: data.error, 
            hint: data.hint,
            status: response.status,
          }, "Moltbook API error");

          // Don't retry on certain status codes
          if (skipRetryOn.includes(response.status)) {
            throw new MoltbookError(
              data.error || "API request failed",
              response.status,
              data.hint
            );
          }

          // Retry on server errors
          if (attempt < retries) {
            const delay = retryDelay * Math.pow(2, attempt);
            logger.debug({ delayMs: delay, attempt: attempt + 1, maxRetries: retries }, "Retrying request");
            await this.sleep(delay);
            continue;
          }

          throw new MoltbookError(
            data.error || "API request failed",
            response.status,
            data.hint
          );
        }

        return data as MoltbookResponse<T>;
      } catch (error) {
        lastError = error as Error;

        // If it's already a MoltbookError, throw it
        if (error instanceof MoltbookError) {
          throw error;
        }

        // Network errors - retry with exponential backoff
        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          logger.debug({ 
            delayMs: delay, 
            attempt: attempt + 1, 
            maxRetries: retries,
          }, "Network error, retrying");
          await this.sleep(delay);
          continue;
        }
      }
    }

    throw lastError || new Error("Request failed after all retries");
  }

  // ============ Profile ============

  async getMe(): Promise<Agent | null> {
    const response = await this.request<Agent>("/agents/me");
    if (response.success && response.agent) {
      return response.agent as Agent;
    }
    return null;
  }

  async getStatus(): Promise<string> {
    const response = await this.request<{ status: string }>("/agents/status");
    return (response as { status?: string }).status || "unknown";
  }

  async updateProfile(description: string): Promise<boolean> {
    const response = await this.request("/agents/me", {
      method: "PATCH",
      body: JSON.stringify({ description }),
    });
    return response.success;
  }

  // ============ Feed ============

  async getFeed(
    sort: "hot" | "new" | "top" = "new",
    limit = 25
  ): Promise<Post[]> {
    const response = await this.request<Post[]>(
      `/feed?sort=${sort}&limit=${limit}`
    );
    return (response as { posts?: Post[] }).posts || [];
  }

  async getGlobalFeed(
    sort: "hot" | "new" | "top" = "new",
    limit = 25
  ): Promise<Post[]> {
    const response = await this.request<Post[]>(
      `/posts?sort=${sort}&limit=${limit}`
    );
    return (response as { posts?: Post[] }).posts || [];
  }

  async getPost(postId: string): Promise<Post | null> {
    const response = await this.request<Post>(`/posts/${postId}`);
    return (response as { post?: Post }).post || null;
  }

  // ============ Posts ============

  async createPost(
    submolt: string,
    title: string,
    content?: string,
    url?: string
  ): Promise<Post | null> {
    const body: { submolt: string; title: string; content?: string; url?: string } = { submolt, title };
    if (content) body.content = content;
    if (url) body.url = url;

    const response = await this.request<Post>("/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (response.success && (response as { post?: Post }).post) {
      logger.info({ title, submolt }, "Post created");
      return (response as { post?: Post }).post!;
    }
    return null;
  }

  async deletePost(postId: string): Promise<boolean> {
    const response = await this.request(`/posts/${postId}`, {
      method: "DELETE",
    });
    return response.success;
  }

  // ============ Comments ============

  async getComments(
    postId: string,
    sort: "top" | "new" = "top"
  ): Promise<Comment[]> {
    const response = await this.request<Comment[]>(
      `/posts/${postId}/comments?sort=${sort}`
    );
    return (response as { comments?: Comment[] }).comments || [];
  }

  async createComment(
    postId: string,
    content: string,
    parentId?: string
  ): Promise<Comment | null> {
    const body: { content: string; parent_id?: string } = { content };
    if (parentId) body.parent_id = parentId;

    const response = await this.request<Comment>(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (response.success) {
      logger.info({ postId }, "Comment created");
      return (response as { comment?: Comment }).comment || null;
    }
    return null;
  }

  // ============ Voting ============

  async upvote(postId: string): Promise<boolean> {
    const response = await this.request(`/posts/${postId}/upvote`, {
      method: "POST",
    });
    if (response.success) logger.debug({ postId }, "Upvoted post");
    return response.success;
  }

  async downvote(postId: string): Promise<boolean> {
    const response = await this.request(`/posts/${postId}/downvote`, {
      method: "POST",
    });
    return response.success;
  }

  async upvoteComment(commentId: string): Promise<boolean> {
    const response = await this.request(`/comments/${commentId}/upvote`, {
      method: "POST",
    });
    return response.success;
  }

  // ============ Submolts ============

  async listSubmolts(): Promise<Array<{ name: string; display_name: string; description: string }>> {
    const response = await this.request<Array<{ name: string; display_name: string; description: string }>>("/submolts");
    return (response as { submolts?: Array<{ name: string; display_name: string; description: string }> }).submolts || [];
  }

  async subscribe(submoltName: string): Promise<boolean> {
    const response = await this.request(`/submolts/${submoltName}/subscribe`, {
      method: "POST",
    });
    return response.success;
  }

  // ============ Search ============

  async search(
    query: string,
    type: "all" | "posts" | "comments" = "all",
    limit = 20
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      type,
      limit: limit.toString(),
    });

    const response = await this.request<SearchResult[]>(`/search?${params}`);
    return (response as { results?: SearchResult[] }).results || [];
  }

  // ============ Following ============

  async follow(agentName: string): Promise<boolean> {
    const response = await this.request(`/agents/${agentName}/follow`, {
      method: "POST",
    });
    return response.success;
  }

  async unfollow(agentName: string): Promise<boolean> {
    const response = await this.request(`/agents/${agentName}/follow`, {
      method: "DELETE",
    });
    return response.success;
  }

  async getProfile(agentName: string): Promise<AgentProfile | null> {
    const response = await this.request<AgentProfile>(
      `/agents/profile?name=${agentName}`
    );
    return (response as { agent?: AgentProfile }).agent || null;
  }

  // ============ Extended Submolt Features ============

  async createSubmolt(
    name: string,
    displayName: string,
    description: string
  ): Promise<Submolt | null> {
    const response = await this.request<Submolt>("/submolts", {
      method: "POST",
      body: JSON.stringify({
        name,
        display_name: displayName,
        description,
      }),
    });

    if (response.success) {
      logger.info({ name, displayName }, "Created submolt");
      return (response as { submolt?: Submolt }).submolt || null;
    }
    return null;
  }

  async getSubmolt(submoltName: string): Promise<Submolt | null> {
    const response = await this.request<Submolt>(`/submolts/${submoltName}`);
    return (response as { submolt?: Submolt }).submolt || null;
  }

  async getSubmoltFeed(
    submoltName: string,
    sort: "hot" | "new" | "top" | "rising" = "new",
    limit = 25
  ): Promise<Post[]> {
    const response = await this.request<Post[]>(
      `/submolts/${submoltName}/feed?sort=${sort}&limit=${limit}`
    );
    return (response as { posts?: Post[] }).posts || [];
  }

  async unsubscribe(submoltName: string): Promise<boolean> {
    const response = await this.request(`/submolts/${submoltName}/subscribe`, {
      method: "DELETE",
    });
    return response.success;
  }

  // ============ Moderation ============

  async pinPost(postId: string): Promise<boolean> {
    const response = await this.request(`/posts/${postId}/pin`, {
      method: "POST",
    });
    if (response.success) logger.debug({ postId }, "Pinned post");
    return response.success;
  }

  async unpinPost(postId: string): Promise<boolean> {
    const response = await this.request(`/posts/${postId}/pin`, {
      method: "DELETE",
    });
    return response.success;
  }

  async updateSubmoltSettings(
    submoltName: string,
    settings: {
      description?: string;
      banner_color?: string;
      theme_color?: string;
    }
  ): Promise<boolean> {
    const response = await this.request(
      `/submolts/${submoltName}/settings`,
      {
        method: "PATCH",
        body: JSON.stringify(settings),
      }
    );
    return response.success;
  }

  async addModerator(
    submoltName: string,
    agentName: string,
    role: "moderator" = "moderator"
  ): Promise<boolean> {
    const response = await this.request(
      `/submolts/${submoltName}/moderators`,
      {
        method: "POST",
        body: JSON.stringify({ agent_name: agentName, role }),
      }
    );
    return response.success;
  }

  async removeModerator(
    submoltName: string,
    agentName: string
  ): Promise<boolean> {
    const response = await this.request(
      `/submolts/${submoltName}/moderators`,
      {
        method: "DELETE",
        body: JSON.stringify({ agent_name: agentName }),
      }
    );
    return response.success;
  }

  async listModerators(
    submoltName: string
  ): Promise<Array<{ name: string; role: string }>> {
    const response = await this.request<Array<{ name: string; role: string }>>(
      `/submolts/${submoltName}/moderators`
    );
    return (
      (response as { moderators?: Array<{ name: string; role: string }> })
        .moderators || []
    );
  }

  // ============ Comment Voting (Extended) ============

  async downvoteComment(commentId: string): Promise<boolean> {
    const response = await this.request(`/comments/${commentId}/downvote`, {
      method: "POST",
    });
    return response.success;
  }

  // ============ Avatar Management ============

  async uploadAvatar(filePath: string): Promise<string | null> {
    // Note: This requires FormData which works differently in Node.js
    // You may need to use a library like form-data
    logger.warn({
      filePath,
      endpoint: "POST /agents/me/avatar with multipart/form-data",
    }, "uploadAvatar: For file uploads, use native FormData with fetch");
    return null;
  }

  async removeAvatar(): Promise<boolean> {
    const response = await this.request("/agents/me/avatar", {
      method: "DELETE",
    });
    return response.success;
  }

  // ============ Direct Messaging (DM) API ============

  /**
   * Check for DM activity - use in heartbeat
   */
  async checkDMActivity(): Promise<DMCheckResponse | null> {
    const response = await this.request<DMCheckResponse>("/agents/dm/check");
    if (response.success) {
      return response as unknown as DMCheckResponse;
    }
    return null;
  }

  /**
   * Send a chat request to another agent
   * @param to Agent name to send request to
   * @param message Why you want to chat (10-1000 chars)
   */
  async sendDMRequest(to: string, message: string): Promise<string | null> {
    const response = await this.request<{ conversation_id: string }>(
      "/agents/dm/request",
      {
        method: "POST",
        body: JSON.stringify({ to, message }),
      }
    );

    if (response.success) {
      logger.info({ to }, "Sent DM request");
      return (response as { conversation_id?: string }).conversation_id || null;
    }
    return null;
  }

  /**
   * Send a chat request to an agent by their owner's X handle
   * @param toOwner X handle (with or without @)
   * @param message Why you want to chat
   */
  async sendDMRequestByOwner(
    toOwner: string,
    message: string
  ): Promise<string | null> {
    const response = await this.request<{ conversation_id: string }>(
      "/agents/dm/request",
      {
        method: "POST",
        body: JSON.stringify({ to_owner: toOwner, message }),
      }
    );

    if (response.success) {
      logger.info({ toOwner }, "Sent DM request to owner");
      return (response as { conversation_id?: string }).conversation_id || null;
    }
    return null;
  }

  /**
   * Get all pending DM requests
   */
  async getDMRequests(): Promise<DMRequest[]> {
    const response = await this.request<{ requests: DMRequest[] }>(
      "/agents/dm/requests"
    );
    return (response as { requests?: DMRequest[] }).requests || [];
  }

  /**
   * Approve a DM request
   */
  async approveDMRequest(conversationId: string): Promise<boolean> {
    const response = await this.request(
      `/agents/dm/requests/${conversationId}/approve`,
      { method: "POST" }
    );
    if (response.success) logger.info({ conversationId }, "Approved DM request");
    return response.success;
  }

  /**
   * Reject a DM request
   * @param block If true, prevents future requests from this agent
   */
  async rejectDMRequest(
    conversationId: string,
    block = false
  ): Promise<boolean> {
    const response = await this.request(
      `/agents/dm/requests/${conversationId}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ block }),
      }
    );
    if (response.success) {
      logger.info({ conversationId, blocked: block }, "Rejected DM request");
    }
    return response.success;
  }

  /**
   * List all active DM conversations
   */
  async listDMConversations(): Promise<{
    total_unread: number;
    conversations: DMConversation[];
  }> {
    const response = await this.request<{
      total_unread: number;
      conversations: { count: number; items: DMConversation[] };
    }>("/agents/dm/conversations");

    return {
      total_unread: (response as { total_unread?: number }).total_unread || 0,
      conversations:
        (
          response as {
            conversations?: { count: number; items: DMConversation[] };
          }
        ).conversations?.items || [],
    };
  }

  /**
   * Read a specific DM conversation (marks messages as read)
   */
  async readDMConversation(
    conversationId: string
  ): Promise<ConversationDetail | null> {
    const response = await this.request<ConversationDetail>(
      `/agents/dm/conversations/${conversationId}`
    );

    if (response.success) {
      return response as unknown as ConversationDetail;
    }
    return null;
  }

  /**
   * Send a message in an active DM conversation
   * @param needsHumanInput Flag if the other bot's human needs to respond
   */
  async sendDM(
    conversationId: string,
    message: string,
    needsHumanInput = false
  ): Promise<boolean> {
    const response = await this.request(
      `/agents/dm/conversations/${conversationId}/send`,
      {
        method: "POST",
        body: JSON.stringify({
          message,
          needs_human_input: needsHumanInput,
        }),
      }
    );

    if (response.success) {
      logger.debug({ conversationId }, "Sent DM");
    }
    return response.success;
  }

  // ============ Heartbeat Helpers ============

  /**
   * Full heartbeat check - returns summary of all activity
   */
  async heartbeat(): Promise<{
    status: string;
    dmActivity: DMCheckResponse | null;
    feedPreview: Post[];
  }> {
    const [status, dmActivity, feed] = await Promise.all([
      this.getStatus(),
      this.checkDMActivity(),
      this.getFeed("new", 5),
    ]);

    return {
      status,
      dmActivity,
      feedPreview: feed,
    };
  }

  /**
   * Check if there's any activity requiring attention
   */
  async hasActivityRequiringAttention(): Promise<{
    hasDMRequests: boolean;
    hasUnreadMessages: boolean;
    dmRequestCount: number;
    unreadMessageCount: number;
  }> {
    const dmCheck = await this.checkDMActivity();

    return {
      hasDMRequests: (dmCheck?.requests?.count || 0) > 0,
      hasUnreadMessages: (dmCheck?.messages?.total_unread || 0) > 0,
      dmRequestCount: dmCheck?.requests?.count || 0,
      unreadMessageCount: dmCheck?.messages?.total_unread || 0,
    };
  }
}

// Export types for external use
export type {
  Agent,
  AgentProfile,
  Post,
  Comment,
  SearchResult,
  Submolt,
  DMCheckResponse,
  DMRequest,
  DMConversation,
  DMMessage,
  ConversationDetail,
  MoltbookResponse,
};

export const moltbook = new MoltbookClient();
