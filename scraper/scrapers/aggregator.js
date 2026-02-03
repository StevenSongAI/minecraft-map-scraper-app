/**
 * Multi-Source Map Aggregator
 * Aggregates search results from multiple scrapers with parallel fetching
 * MANAGER INTEL: Modrinth does NOT have maps (only mods/modpacks) - REMOVED
 * 
 * Features:
 * - Parallel fetching with per-source timeouts
 * - Deduplication by title+author
 * - Circuit breaker for resilience
 * - Response time < 10 seconds guarantee
 * - Unified format matching CurseForge API
 */

const PlanetMinecraftScraper = require('./planetminecraft');
const NineMinecraftScraper = require('./nineminecraft');

class MapAggregator {
  constructor(options = {}) {
    this.scrapers = [];
    this.timeout = options.timeout || 5000; // 5 seconds per source max
    this.maxResultsPerSource = options.maxResultsPerSource || 6;
    
    // Circuit breaker settings
    this.failureThreshold = 3;
    this.disableTimeMs = 5 * 60 * 1000; // 5 minutes
    this.failures = new Map(); // Track failures per source
    
    // Initialize scrapers
    this.initScrapers();
  }

  initScrapers() {
    // Planet Minecraft (HTTP-only) - PRIMARY required source
    try {
      this.scrapers.push({
        name: 'planetminecraft',
        instance: new PlanetMinecraftScraper({ requestTimeout: this.timeout }),
        enabled: true,
        priority: 1
      });
      console.log('[Aggregator] ✓ Planet Minecraft scraper initialized');
    } catch (error) {
      console.warn('[Aggregator] ✗ Failed to initialize Planet Minecraft scraper:', error.message);
    }

    // 9Minecraft
    try {
      this.scrapers.push({
        name: 'nineminecraft',
        instance: new NineMinecraftScraper({ requestTimeout: this.timeout }),
        enabled: true,
        priority: 2
      });
      console.log('[Aggregator] ✓ 9Minecraft scraper initialized');
    } catch (error) {
      console.warn('[Aggregator] ✗ Failed to initialize 9Minecraft scraper:', error.message);
    }
    
    console.log(`[Aggregator] Total scrapers initialized: ${this.scrapers.length} (Modrinth removed - no map support)`);
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
    
    // Parse query into words for multi-word filtering
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const isMultiWordQuery = queryWords.length >= 2;
    
    const results = {
      query,
      timestamp: new Date().toISOString(),
      sources: {},
      results: [],
      totalCount: 0,
      responseTime: 0,
      errors: [],
      multiWordFilter: isMultiWordQuery
    };

    // Create search promises for all enabled scrapers with individual timeouts
    const searchPromises = [];
    const scraperNames = [];

    // Add scraper searches (with circuit breaker check)
    for (const scraper of this.scrapers) {
      if (scraper.enabled && !this.isCircuitOpen(scraper.name)) {
        searchPromises.push(
          this.searchWithTimeout(
            scraper.name,
            () => scraper.instance.search(query, { limit: this.maxResultsPerSource }),
            this.timeout
          )
        );
        scraperNames.push(scraper.name);
      } else if (this.isCircuitOpen(scraper.name)) {
        console.log(`[Aggregator] ${scraper.name} disabled by circuit breaker`);
      }
    }

    // Add CurseForge if provided
    if (includeCurseForge && curseForgeSearchFn) {
      if (!this.isCircuitOpen('curseforge')) {
        searchPromises.push(
          this.searchWithTimeout(
            'curseforge',
            () => curseForgeSearchFn(query, { limit: this.maxResultsPerSource }),
            this.timeout
          )
        );
        scraperNames.push('curseforge');
      } else {
        console.log(`[Aggregator] curseforge disabled by circuit breaker`);
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
        // Reset failures on success
        this.recordSuccess(sourceName);
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
        // Record failure for circuit breaker
        this.recordFailure(sourceName);
      }
    }

    // Deduplicate results
    const deduplicated = this.deduplicateMaps(allMaps);
    
    // Apply multi-word filtering if needed (for queries like "underwater city")
    const filtered = isMultiWordQuery 
      ? this.filterMultiWordMatches(deduplicated, queryWords)
      : deduplicated;
    
    // Sort by relevance/popularity
    const sorted = this.sortByRelevance(filtered, query);
    
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

  /**
   * Filter results for multi-word queries - ALL words must appear in title or description
   * Example: "underwater city" should only return results containing BOTH "underwater" AND "city"
   */
  filterMultiWordMatches(maps, queryWords) {
    return maps.filter(map => {
      const title = (map.name || map.title || '').toLowerCase();
      const description = (map.summary || map.description || '').toLowerCase();
      const searchText = `${title} ${description}`;
      
      // Check if ALL query words appear in the title or description
      const allWordsPresent = queryWords.every(word => searchText.includes(word));
      
      return allWordsPresent;
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
          circuitOpen: this.isCircuitOpen(scraper.name),
          ...scraperHealth
        });
      } catch (error) {
        health.scrapers.push({
          name: scraper.name,
          enabled: scraper.enabled,
          circuitOpen: this.isCircuitOpen(scraper.name),
          accessible: false,
          error: error.message
        });
      }
    }

    return health;
  }

  /**
   * Circuit breaker: check if a source should be disabled
   */
  isCircuitOpen(sourceName) {
    const failure = this.failures.get(sourceName);
    if (!failure) return false;
    
    // If we've hit the failure threshold
    if (failure.count >= this.failureThreshold) {
      // Check if the disable time has passed
      const now = Date.now();
      if (now - failure.lastFailureTime < this.disableTimeMs) {
        return true;
      } else {
        // Reset the circuit after the timeout
        this.failures.delete(sourceName);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Record a failure for circuit breaker
   */
  recordFailure(sourceName) {
    const failure = this.failures.get(sourceName) || { count: 0, lastFailureTime: 0 };
    failure.count++;
    failure.lastFailureTime = Date.now();
    this.failures.set(sourceName, failure);
    
    if (failure.count >= this.failureThreshold) {
      console.log(`[Circuit Breaker] ${sourceName} disabled for ${this.disableTimeMs / 1000}s after ${failure.count} failures`);
    }
  }

  /**
   * Record a success to reset failure count
   */
  recordSuccess(sourceName) {
    this.failures.delete(sourceName);
  }
}

module.exports = MapAggregator;
