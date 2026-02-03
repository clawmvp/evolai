import { CONFIG } from "../config/index.js";

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

export class MoltbookClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = CONFIG.moltbook.baseUrl;
    this.apiKey = CONFIG.moltbook.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<MoltbookResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Moltbook API error: ${data.error}`);
      if (data.hint) console.error(`   Hint: ${data.hint}`);
    }

    return data as MoltbookResponse<T>;
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
      console.log(`✅ Posted: "${title}"`);
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
      console.log(`✅ Commented on post ${postId}`);
      return (response as { comment?: Comment }).comment || null;
    }
    return null;
  }

  // ============ Voting ============

  async upvote(postId: string): Promise<boolean> {
    const response = await this.request(`/posts/${postId}/upvote`, {
      method: "POST",
    });
    if (response.success) console.log(`👍 Upvoted post ${postId}`);
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

  async getProfile(agentName: string): Promise<Agent | null> {
    const response = await this.request<Agent>(
      `/agents/profile?name=${agentName}`
    );
    return (response as { agent?: Agent }).agent || null;
  }
}

export const moltbook = new MoltbookClient();
