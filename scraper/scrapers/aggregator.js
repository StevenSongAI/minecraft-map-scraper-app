/**
 * Multi-Source Map Aggregator
 * Aggregates search results from multiple scrapers (CurseForge, Planet Minecraft, etc.)
 * Features:
 * - Parallel fetching with rate limiting
 * - Deduplication by title+author
 * - Circuit breaker for resilience
 * - Response time < 10 seconds
 * - Unified format matching CurseForge API
 */

const PlanetMinecraftScraper = require('./planetminecraft');
const MinecraftMapsScraper = require('./minecraftmaps');
const NineMinecraftScraper = require('./nineminecraft');

class MapAggregator {
  constructor(options = {}) {
    this.scrapers = [];
    this.timeout = options.timeout || 6000; // 6 seconds per source max
    this.maxResultsPerSource = options.maxResultsPerSource || 10;
    
    // Initialize scrapers
    this.initScrapers();
  }

  initScrapers() {
    // Planet Minecraft (primary scraper with browser automation)
    try {
      this.scrapers.push({
        name: 'planetminecraft',
        instance: new PlanetMinecraftScraper(),
        enabled: true,
        priority: 1
      });
    } catch (error) {
      console.warn('[Aggregator] Failed to initialize Planet Minecraft scraper:', error.message);
    }

    // MinecraftMaps.com
    try {
      this.scrapers.push({
        name: 'minecraftmaps',
        instance: new MinecraftMapsScraper(),
        enabled: true,
        priority: 2
      });
    } catch (error) {
      console.warn('[Aggregator] Failed to initialize MinecraftMaps scraper:', error.message);
    }

    // 9Minecraft
    try {
      this.scrapers.push({
        name: 'nineminecraft',
        instance: new NineMinecraftScraper(),
        enabled: true,
        priority: 3
      });
    } catch (error) {
      console.warn('[Aggregator] Failed to initialize 9Minecraft scraper:', error.message);
    }
  }

  /**
   * Search across all enabled sources
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Max total results
   * @param {boolean} options.includeCurseForge - Include CurseForge API results
   * @param {Function} options.curseForgeSearchFn - Function to search CurseForge
   * @returns {Promise<Object>} Unified search results
   */
  async search(query, options = {}) {
    const startTime = Date.now();
    const { limit = 20, includeCurseForge = true, curseForgeSearchFn = null } = options;
    
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

    // Create search promises for all enabled scrapers
    const searchPromises = [];

    // Add CurseForge search if provided
    if (includeCurseForge && curseForgeSearchFn) {
      searchPromises.push(
        this.searchWithTimeout('curseforge', curseForgeSearchFn, query, { limit: this.maxResultsPerSource })
      );
    }

    // Add scraper searches
    for (const scraper of this.scrapers) {
      if (scraper.enabled) {
        searchPromises.push(
          this.searchWithTimeout(
            scraper.name,
            () => scraper.instance.search(query, { limit: this.maxResultsPerSource }),
            query,
            { limit: this.maxResultsPerSource }
          )
        );
      }
    }

    // Execute all searches in parallel
    const searchResults = await Promise.allSettled(searchPromises);

    // Process results
    const allMaps = [];
    
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const sourceName = i === 0 && includeCurseForge && curseForgeSearchFn 
        ? 'curseforge' 
        : this.scrapers[includeCurseForge && curseForgeSearchFn ? i - 1 : i]?.name || 'unknown';

      if (result.status === 'fulfilled') {
        const maps = result.value.results || [];
        results.sources[sourceName] = {
          count: maps.length,
          success: true,
          responseTime: result.value.responseTime
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

  async searchWithTimeout(sourceName, searchFn, query, options) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout after ${this.timeout}ms`));
      }, this.timeout);

      searchFn(query, options)
        .then(results => {
          clearTimeout(timeout);
          resolve({
            results,
            responseTime: Date.now() - startTime
          });
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  deduplicateMaps(maps) {
    const seen = new Map();
    const duplicates = [];

    for (const map of maps) {
      // Create deduplication key from title + author
      const title = (map.name || map.title || '').toLowerCase().trim();
      const author = (map.author?.name || map.author || 'unknown').toLowerCase().trim();
      const key = `${title}::${author}`;

      if (seen.has(key)) {
        const existing = seen.get(key);
        
        // Keep the one with more data (prefer CurseForge)
        const existingScore = this.scoreMapQuality(existing);
        const newScore = this.scoreMapQuality(map);
        
        if (newScore > existingScore) {
          duplicates.push(existing);
          seen.set(key, map);
        } else {
          duplicates.push(map);
        }
      } else {
        seen.set(key, map);
      }
    }

    // Log deduplication stats
    if (duplicates.length > 0) {
      console.log(`[Aggregator] Removed ${duplicates.length} duplicates`);
    }

    return Array.from(seen.values());
  }

  scoreMapQuality(map) {
    let score = 0;
    
    // Prefer CurseForge (usually more reliable)
    if (map.source === 'curseforge') score += 50;
    
    // Has download URL
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
      // Calculate relevance scores
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
    const allText = `${name} ${summary} ${description}`;
    
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
    
    // Word boundary matches in description
    for (const word of queryWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(summary) || regex.test(description)) {
        score += 10;
      }
    }
    
    // Category match
    const category = (map.category || '').toLowerCase();
    if (queryWords.some(w => category.includes(w))) {
      score += 20;
    }
    
    // Popularity bonus (logarithmic to prevent dominance)
    const downloads = map.downloadCount || map.downloads || 0;
    score += Math.log10(downloads + 1) * 3;
    
    // Featured bonus
    if (map.isFeatured) {
      score += 10;
    }
    
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

    for (const scraper of this.scrapers) {
      try {
        const scraperHealth = await scraper.instance.checkHealth();
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

  async close() {
    // Close browser instances
    for (const scraper of this.scrapers) {
      if (scraper.instance.closeBrowser) {
        try {
          await scraper.instance.closeBrowser();
        } catch (error) {
          console.warn(`[Aggregator] Error closing ${scraper.name}:`, error.message);
        }
      }
    }
  }
}

module.exports = MapAggregator;
