import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { security } from "../security/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "web-search" });

const openai = new OpenAI({
  apiKey: CONFIG.openai.apiKey,
});

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

export interface WebSearchResult {
  query: string;
  results: SearchResult[];
  timestamp: string;
}

/**
 * Web search using free APIs and scraping
 * Searches Hacker News, Reddit, and general web
 */
class WebSearcher {
  
  /**
   * Search Hacker News API (free, no key needed)
   */
  async searchHackerNews(query: string, limit = 5): Promise<SearchResult[]> {
    try {
      log.info({ query }, "Searching Hacker News...");
      
      const response = await fetch(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`
      );
      
      if (!response.ok) {
        throw new Error(`HN API error: ${response.status}`);
      }

      const data = await response.json() as { 
        hits: Array<{ 
          title: string; 
          url: string; 
          objectID: string;
          points: number;
          num_comments: number;
        }> 
      };

      return data.hits.map(hit => ({
        title: hit.title,
        snippet: `${hit.points} points, ${hit.num_comments} comments`,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        source: "Hacker News",
      }));
    } catch (error) {
      log.error({ error: String(error) }, "Hacker News search failed");
      return [];
    }
  }

  /**
   * Search Reddit (public JSON API, no key needed)
   */
  async searchReddit(query: string, subreddit = "all", limit = 5): Promise<SearchResult[]> {
    try {
      log.info({ query, subreddit }, "Searching Reddit...");
      
      const url = subreddit === "all"
        ? `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance`
        : `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&limit=${limit}&restrict_sr=1`;

      const response = await fetch(url, {
        headers: { "User-Agent": "EvolAI/1.0 (Learning Bot)" },
      });

      if (!response.ok) {
        throw new Error(`Reddit API error: ${response.status}`);
      }

      const data = await response.json() as {
        data: {
          children: Array<{
            data: {
              title: string;
              selftext: string;
              permalink: string;
              subreddit: string;
              score: number;
            };
          }>;
        };
      };

      return data.data.children.map(post => ({
        title: post.data.title,
        snippet: post.data.selftext?.slice(0, 200) || `r/${post.data.subreddit} - ${post.data.score} upvotes`,
        url: `https://reddit.com${post.data.permalink}`,
        source: `Reddit r/${post.data.subreddit}`,
      }));
    } catch (error) {
      log.error({ error: String(error) }, "Reddit search failed");
      return [];
    }
  }

  /**
   * Search Wikipedia (free API)
   */
  async searchWikipedia(query: string, limit = 3): Promise<SearchResult[]> {
    try {
      log.info({ query }, "Searching Wikipedia...");

      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${limit}&origin=*`
      );

      if (!response.ok) {
        throw new Error(`Wikipedia API error: ${response.status}`);
      }

      const data = await response.json() as {
        query: {
          search: Array<{
            title: string;
            snippet: string;
            pageid: number;
          }>;
        };
      };

      return data.query.search.map(result => ({
        title: result.title,
        snippet: result.snippet.replace(/<[^>]*>/g, ""), // Remove HTML tags
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`,
        source: "Wikipedia",
      }));
    } catch (error) {
      log.error({ error: String(error) }, "Wikipedia search failed");
      return [];
    }
  }

  /**
   * Search DEV.to (developer community)
   */
  async searchDevTo(query: string, limit = 5): Promise<SearchResult[]> {
    try {
      log.info({ query }, "Searching DEV.to...");

      const response = await fetch(
        `https://dev.to/api/articles?tag=${encodeURIComponent(query)}&per_page=${limit}`
      );

      if (!response.ok) {
        throw new Error(`DEV.to API error: ${response.status}`);
      }

      const data = await response.json() as Array<{
        title: string;
        description: string;
        url: string;
        positive_reactions_count: number;
      }>;

      return data.map(article => ({
        title: article.title,
        snippet: article.description || `${article.positive_reactions_count} reactions`,
        url: article.url,
        source: "DEV.to",
      }));
    } catch (error) {
      log.error({ error: String(error) }, "DEV.to search failed");
      return [];
    }
  }

  /**
   * Combined search across all sources
   */
  async search(query: string): Promise<WebSearchResult> {
    log.info({ query }, "Starting multi-source search...");

    // Search all sources in parallel
    const [hn, reddit, wiki, devto] = await Promise.all([
      this.searchHackerNews(query, 3),
      this.searchReddit(query, "all", 3),
      this.searchWikipedia(query, 2),
      this.searchDevTo(query, 2),
    ]);

    const results = [...hn, ...reddit, ...wiki, ...devto];

    // Sanitize results (remove any sensitive data that might have leaked)
    const sanitizedResults = results.map(r => ({
      ...r,
      title: security.sanitizeOutput(r.title),
      snippet: security.sanitizeOutput(r.snippet),
    }));

    log.info({ resultCount: sanitizedResults.length }, "Search complete");

    return {
      query,
      results: sanitizedResults,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Search specific AI/tech subreddits
   */
  async searchAINews(): Promise<SearchResult[]> {
    const subreddits = ["artificial", "MachineLearning", "LocalLLaMA", "singularity"];
    const results: SearchResult[] = [];

    for (const sub of subreddits) {
      try {
        const response = await fetch(
          `https://www.reddit.com/r/${sub}/hot.json?limit=3`,
          { headers: { "User-Agent": "EvolAI/1.0 (Learning Bot)" } }
        );

        if (response.ok) {
          const data = await response.json() as {
            data: { children: Array<{ data: { title: string; permalink: string; score: number } }> };
          };

          for (const post of data.data.children) {
            results.push({
              title: post.data.title,
              snippet: `${post.data.score} upvotes`,
              url: `https://reddit.com${post.data.permalink}`,
              source: `Reddit r/${sub}`,
            });
          }
        }
      } catch {
        // Continue with other subreddits
      }
    }

    return results;
  }
}

export const webSearcher = new WebSearcher();
