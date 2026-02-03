/**
 * EvolAI Self-Generated Code
 * ==========================
 * Version: 1.0.1
 * Generated: 2026-02-03T16:00:53.610Z
 * Proposal ID: improvement-1770134453609
 * 
 * Issue Addressed:
 * ----------------
 * Area: efficiency
 * Severity: medium
 * There is potential to optimize the response time and reduce the number of API calls, which can improve overall system performance and user experience.
 * 
 * Solution Description:
 * ---------------------
 * This utility function implements a caching mechanism to reduce redundant API calls by storing recent responses.
 * 
 * Approach:
 * ---------
 * The function caches API responses with a specified TTL (time-to-live). When a request is made, it first checks the cache. If a valid cached response is found, it returns that instead of making a new API call. This reduces the number of API calls and improves response time.
 * 
 * Expected Impact:
 * ----------------
 * Expected to reduce API calls by up to 50% and improve response time by 30% for cached requests.
 * 
 * Status: PENDING REVIEW
 * To implement: Copy this file to the appropriate src/ directory
 * To reject: Update status in versions.json
 */

import NodeCache from 'node-cache';

// Create a cache instance with a default TTL of 1 hour
const apiCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

/**
 * Fetch data from an API with caching to optimize response time and reduce API calls.
 * @param {string} key - The unique key for the cache, typically the API endpoint or query.
 * @param {() => Promise<any>} fetchFunction - The function that fetches data from the API.
 * @returns {Promise<any>} - The API response, either from cache or fresh from the API.
 */
export async function fetchWithCache(key: string, fetchFunction: () => Promise<any>): Promise<any> {
  // Check if the response is already in the cache
  const cachedResponse = apiCache.get(key);
  if (cachedResponse) {
    console.log(`Cache hit for key: ${key}`);
    return cachedResponse;
  }

  // If not in cache, fetch from the API
  console.log(`Cache miss for key: ${key}. Fetching from API.`);
  const freshResponse = await fetchFunction();

  // Store the fresh response in the cache
  apiCache.set(key, freshResponse);

  return freshResponse;
}

// Example usage:
// fetchWithCache('some-api-endpoint', () => fetch('https://api.example.com/data'))

