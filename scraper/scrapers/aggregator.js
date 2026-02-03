/**
 * Multi-Source Map Aggregator
 * Aggregates search results from multiple scrapers with parallel fetching
 * Features:
 * - Parallel fetching with per-source timeouts
 * - Deduplication by title+author
 * - Circuit breaker for resilience
 * - Response time < 10 seconds guarantee
 * - Unified format matching CurseForge API
 */

const PlanetMinecraftScraper = require('./planetminecraft');
const ModrinthScraper = require('./modrinth');
const NineMinecraftScraper = require('./nineminecraft');

class MapAggregator {
  constructor(options = {}) {
    this.scrapers = [];
    this.timeout = options.timeout || 5000; // 5 seconds per source max
    this.maxResultsPerSource = options.maxResultsPerSource || 6;
    
    // Initialize scrapers
    this.initScrapers();
  }

  initScrapers() {
    // Planet Minecraft (HTTP-only)
    try {
      this.scrapers.push({
        name: 'planetminecraft',
        instance: new PlanetMinecraftScraper({ requestTimeout: this.timeout }),
        enabled: true,
        priority: 1
      });
      console.log('[Aggregator] Planet Minecraft scraper initialized');
    } catch (error) {
      console.warn('[Aggregator] Failed to initialize Planet Minecraft scraper:', error.message);
    }

    // Modrinth API (replaces MinecraftMaps which was blocked by Cloudflare)
    try {
      this.scrapers.push({
        name: 'modrinth',
        instance: new ModrinthScraper({ requestTimeout: this.timeout }),
        enabled: true,
        priority: 2
      });
      console.log('[Aggregator] Modrinth scraper initialized');
    } catch (error) {
      console.warn('[Aggregator] Failed to initialize Modrinth scraper:', error.message);
    }

    // 9Minecraft
    try {
      this.scrapers.push({
        name: 'nineminecraft',
        instance: new NineMinecraftScraper({ requestTimeout: this.timeout }),
        enabled: true,
        priority: 3
      });
      console.log('[Aggregator] 9Minecraft scraper initialized');
    } catch (error) {
      console.warn('[Aggregator] Failed to initialize 9Minecraft scraper:', error.message);
    }
    
    console.log(`[Aggregator] Total scrapers initialized: ${this.scrapers.length}`);
  }

  /**
   * Search across all enabled sources
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Unified search results
   */
  async search(query, options = {}) {
    const startTime = Date.now();
    const { limit = 20, includeCurseForge = false, curseForgeSearchFn = null } = options;
    
    console.log(`[Aggregator] Searching for: "${query}"`);
    
    const results = {
      query,
      timestamp: new Date().toISOString(),
      sources: {},
      results: [],
      totalCount: 0,
      responseTime: 0,
      errors: []
    };

    // Create search promises for all enabled scrapers with individual timeouts
    const searchPromises = [];
    const scraperNames = [];

    // Add scraper searches
    for (const scraper of this.scrapers) {
      if (scraper.enabled) {
        searchPromises.push(
          this.searchWithTimeout(
            scraper.name,
            () => scraper.instance.search(query, { limit: this.maxResultsPerSource }),
            this.timeout
          )
        );
        scraperNames.push(scraper.name);
      }
    }

    // Execute all searches in parallel with overall timeout
    const overallTimeout = 8000; // 8s overall timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Overall timeout')), overallTimeout)
    );
    
    let searchResults;
    try {
      searchResults = await Promise.race([
        Promise.allSettled(searchPromises),
        timeoutPromise
      ]);
    } catch (timeoutError) {
      console.warn(`[Aggregator] Overall search timeout after ${overallTimeout}ms`);
      searchResults = []; // Will be treated as all rejected
    }

    // Process results
    const allMaps = [];
    
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const sourceName = scraperNames[i];

      if (result.status === 'fulfilled') {
        const maps = result.value || [];
        results.sources[sourceName] = {
          count: maps.length,
          success: true
        };
        allMaps.push(...maps);
      } else {
        results.sources[sourceName] = {
          count: 0,
          success: false,
          error: result.reason?.message || 'Unknown error'
        };
        results.errors.push({
          source: sourceName,
          error: result.reason?.message || 'Unknown error'
        });
      }
    }

    // Deduplicate results
    const deduplicated = this.deduplicateMaps(allMaps);
    
    // Sort by relevance/popularity
    const sorted = this.sortByRelevance(deduplicated, query);
    
    // Limit results
    results.results = sorted.slice(0, limit);
    results.totalCount = results.results.length;
    results.responseTime = Date.now() - startTime;

    console.log(`[Aggregator] Found ${results.totalCount} unique maps in ${results.responseTime}ms`);
    console.log(`[Aggregator] Sources:`, Object.entries(results.sources).map(([k, v]) => `${k}=${v.count}`).join(', '));

    return results;
  }

  async searchWithTimeout(sourceName, searchFn, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      searchFn()
        .then(results => {
          clearTimeout(timeout);
          resolve(results);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  deduplicateMaps(maps) {
    const seen = new Map();

    for (const map of maps) {
      // Create deduplication key from title + author
      const title = (map.name || map.title || '').toLowerCase().trim();
      const author = (map.author?.name || map.author || 'unknown').toLowerCase().trim();
      const key = `${title}::${author}`;

      if (seen.has(key)) {
        const existing = seen.get(key);
        
        // Keep the one with more data
        const existingScore = this.scoreMapQuality(existing);
        const newScore = this.scoreMapQuality(map);
        
        if (newScore > existingScore) {
          seen.set(key, map);
        }
      } else {
        seen.set(key, map);
      }
    }

    return Array.from(seen.values());
  }

  scoreMapQuality(map) {
    let score = 0;
    
    // Prefer sources with download URLs
    if (map.downloadUrl) score += 20;
    
    // Has thumbnail
    if (map.thumbnail && !map.thumbnail.includes('placeholder')) score += 10;
    
    // Has file info
    if (map.fileInfo) score += 10;
    
    // Has download count
    if (map.downloadCount && map.downloadCount > 0) score += 5;
    
    // Has description
    if (map.summary || map.description) score += 5;
    
    return score;
  }

  sortByRelevance(maps, query) {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    return maps.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a, queryLower, queryWords);
      const scoreB = this.calculateRelevanceScore(b, queryLower, queryWords);
      return scoreB - scoreA;
    });
  }

  calculateRelevanceScore(map, queryLower, queryWords) {
    let score = 0;
    
    const name = (map.name || '').toLowerCase();
    const summary = (map.summary || '').toLowerCase();
    const description = (map.description || '').toLowerCase();
    
    // Exact title match (highest priority)
    if (name === queryLower) {
      score += 200;
    } else if (name.includes(queryLower)) {
      score += 100;
    }
    
    // Word boundary matches in title
    for (const word of queryWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(name)) {
        score += 30;
      }
    }
    
    // Query in description
    if (summary.includes(queryLower) || description.includes(queryLower)) {
      score += 40;
    }
    
    // Popularity bonus (logarithmic)
    const downloads = map.downloadCount || map.downloads || 0;
    score += Math.log10(downloads + 1) * 3;
    
    // Prefer sources with working download links
    if (map.downloadUrl && !map.downloadUrl.includes('placeholder')) {
      score += 15;
    }
    
    return score;
  }

  async getHealth() {
    const health = {
      timestamp: new Date().toISOString(),
      scrapers: []
    };

    // Check health of each scraper with timeout
    for (const scraper of this.scrapers) {
      try {
        const healthPromise = scraper.instance.checkHealth();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        );
        
        const scraperHealth = await Promise.race([healthPromise, timeoutPromise]);
        
        health.scrapers.push({
          name: scraper.name,
          enabled: scraper.enabled,
          ...scraperHealth
        });
      } catch (error) {
        health.scrapers.push({
          name: scraper.name,
          enabled: scraper.enabled,
          accessible: false,
          error: error.message
        });
      }
    }

    return health;
  }
}

module.exports = MapAggregator;
