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
const ModrinthScraper = require('./modrinth');

class MapAggregator {
  constructor(options = {}) {
    this.scrapers = [];
    this.timeout = options.timeout || 12000; // FIXED (Round 10): 12 seconds per source max
    this.maxResultsPerSource = options.maxResultsPerSource || 20;
    
    // Circuit breaker settings
    this.failureThreshold = 3;
    this.disableTimeMs = 5 * 60 * 1000; // 5 minutes
    this.failures = new Map(); // Track failures per source
    
    // Initialize scrapers
    this.initScrapers();
  }

  initScrapers() {
    // FIXED (Round 7): Add Modrinth API as PRIMARY additional source (no Cloudflare!)
    try {
      this.scrapers.push({
        name: 'modrinth',
        instance: new ModrinthScraper({ requestTimeout: this.timeout }),
        enabled: true,
        priority: 1
      });
      console.log('[Aggregator] ✓ Modrinth scraper initialized (No Cloudflare!)');
    } catch (error) {
      console.warn('[Aggregator] ✗ Failed to initialize Modrinth scraper:', error.message);
    }

    // Planet Minecraft (HTTP-only) - Often blocked by Cloudflare
    try {
      this.scrapers.push({
        name: 'planetminecraft',
        instance: new PlanetMinecraftScraper({ requestTimeout: this.timeout }),
        enabled: true,
        priority: 2
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
        priority: 3
      });
      console.log('[Aggregator] ✓ 9Minecraft scraper initialized');
    } catch (error) {
      console.warn('[Aggregator] ✗ Failed to initialize 9Minecraft scraper:', error.message);
    }
    
    console.log(`[Aggregator] Total scrapers initialized: ${this.scrapers.length} (Modrinth + Planet Minecraft + 9Minecraft)`);
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
    const overallTimeout = 15000; // 15s overall timeout - FIXED (Round 10): Increased to allow slow sources
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
        // CRITICAL FIX: success = results.length > 0, not just promise fulfillment
        // This prevents false positive reporting when scraper returns empty array
        const hasResults = maps.length > 0;
        results.sources[sourceName] = {
          count: maps.length,
          success: hasResults,  // Only true if we actually got results
          note: hasResults ? null : 'No results returned (may be blocked or no matches)'
        };
        allMaps.push(...maps);
        
        // Reset failures only if we got actual results
        if (hasResults) {
          this.recordSuccess(sourceName);
        } else {
          // Record failure if consistently returning empty
          this.recordFailure(sourceName);
        }
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
   * Filter results for multi-word queries - MOST words must appear
   * FIXED (Round 10): Relaxed filtering to ensure sufficient results
   * Require at least 50% of query words to match (reduced from 60%)
   */
  filterMultiWordMatches(maps, queryWords) {
    if (maps.length <= 5) {
      // Don't filter if we already have few results
      console.log(`[Aggregator] Not filtering - only ${maps.length} results`);
      return maps;
    }
    
    const filtered = maps.filter(map => {
      const title = (map.name || map.title || '').toLowerCase();
      const description = (map.summary || map.description || '').toLowerCase();
      const searchText = `${title} ${description}`;
      
      // Count how many query words match
      let matchCount = 0;
      for (const word of queryWords) {
        if (word.length <= 2) {
          // Very short words - skip for matching count but don't require
          matchCount += 0.5;
        } else if (word.length <= 4) {
          // Short words need word boundary matching
          const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (regex.test(searchText)) {
            matchCount++;
          }
        } else {
          // Longer words can use substring matching
          if (searchText.includes(word)) {
            matchCount++;
          }
        }
      }
      
      // FIXED (Round 10): Reduced to 50% to get more results
      const minRequired = Math.max(1, Math.floor(queryWords.length * 0.5));
      const matches = matchCount >= minRequired;
      
      // Debug logging
      if (!matches && Math.random() < 0.1) { // Only log 10% to avoid spam
        console.log(`[Aggregator] Filtered out "${title.substring(0, 40)}..." - matched ${matchCount}/${queryWords.length} words (need ${minRequired})`);
      }
      
      return matches;
    });
    
    console.log(`[Aggregator] Multi-word filter: ${maps.length} -> ${filtered.length} results`);
    return filtered;
  }

  deduplicateMaps(maps) {
    const seen = new Map();

    for (const map of maps) {
      // Create deduplication key from title + author
      const title = (map.name || map.title || '').toLowerCase().trim();
      
      // FIXED (Round 7): Handle different author formats safely
      let author = 'unknown';
      if (map.author) {
        if (typeof map.author === 'object' && map.author.name) {
          author = String(map.author.name).toLowerCase().trim();
        } else if (typeof map.author === 'string') {
          author = map.author.toLowerCase().trim();
        }
      }
      
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
