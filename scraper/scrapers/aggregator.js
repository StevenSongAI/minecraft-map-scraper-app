/**
 * Multi-Source Map Aggregator
 * Aggregates search results from multiple scrapers with parallel fetching
 * FIXED (Round 27): Disabled Planet Minecraft (Cloudflare issues), enhanced result counts
 * 
 * Features:
 * - Parallel fetching with per-source timeouts
 * - Deduplication by title+author
 * - Circuit breaker for resilience
 * - Response time < 10 seconds guarantee
 * - Unified format matching CurseForge API
 */

const ModrinthScraper = require('./modrinth');
const MCMapsScraper = require('./mcmaps');
const MinecraftMapsScraper = require('./minecraftmaps');
const PlanetMinecraftPuppeteerScraper = require('./planetminecraft-puppeteer');
// 9Minecraft REMOVED (Round 31): Downloads broken, placeholder data, not fixable
// const NineMinecraftScraper = require('./nineminecraft');

class MapAggregator {
  constructor(options = {}) {
    this.scrapers = [];
    this.timeout = options.timeout || 6000; // FIXED (Round 29): Reduced to 6s for faster response
    this.maxResultsPerSource = options.maxResultsPerSource || 25; // FIXED: Balance between speed and results
    
    // Circuit breaker settings
    this.failureThreshold = 5;  // FIXED (Round 52): Increased from 3 to 5 to be more lenient
    this.disableTimeMs = 2 * 60 * 1000; // FIXED (Round 52): Reduced from 5 min to 2 min
    this.failures = new Map(); // Track failures per source
    
    // Download URL cache to avoid repeated fetches
    this.downloadUrlCache = new Map();
    this.downloadCacheTtl = 30 * 60 * 1000; // 30 minutes
    
    // Initialize scrapers
    this.initScrapers();
  }

  initScrapers() {
    // ROUND 34: Enabled Planet Minecraft Puppeteer scraper to bypass Cloudflare
    // REMOVED: 9Minecraft (broken downloads, placeholder data, external hosting)
    // ACTIVE: CurseForge API, Modrinth API, Planet Minecraft (Puppeteer), MC-Maps, MinecraftMaps
    
    // Modrinth API as PRIMARY additional source (no Cloudflare!)
    try {
      this.scrapers.push({
        name: 'modrinth',
        instance: new ModrinthScraper({ requestTimeout: 10000 }),
        enabled: true,
        priority: 1
      });
      console.log('[Aggregator] ✓ Modrinth scraper initialized (No Cloudflare!)');
    } catch (error) {
      console.warn('[Aggregator] ✗ Failed to initialize Modrinth scraper:', error.message);
    }

    // ROUND 34: Planet Minecraft with Puppeteer (bypasses Cloudflare!)
    try {
      this.scrapers.push({
        name: 'planetminecraft',
        instance: new PlanetMinecraftPuppeteerScraper({ requestTimeout: 10000 }),
        enabled: true,
        priority: 2
      });
      console.log('[Aggregator] ✓ Planet Minecraft (Puppeteer) scraper initialized');
    } catch (error) {
      console.warn('[Aggregator] ✗ Failed to initialize Planet Minecraft scraper:', error.message);
    }

    // ROUND 31: 9Minecraft REMOVED - downloads broken, returns page links not ZIPs, all downloads=0
    // External hosting (Dropbox, Mediafire) makes direct downloads unreliable

    // MC-Maps.com as alternative source
    try {
      this.scrapers.push({
        name: 'mcmaps',
        instance: new MCMapsScraper({ requestTimeout: 6000 }),
        enabled: true,
        priority: 3
      });
      console.log('[Aggregator] ✓ MC-Maps scraper initialized');
    } catch (error) {
      console.warn('[Aggregator] ✗ Failed to initialize MC-Maps scraper:', error.message);
    }

    // MinecraftMaps.com as additional source
    try {
      this.scrapers.push({
        name: 'minecraftmaps',
        instance: new MinecraftMapsScraper({ requestTimeout: 6000 }),
        enabled: true,
        priority: 4
      });
      console.log('[Aggregator] ✓ MinecraftMaps scraper initialized');
    } catch (error) {
      console.warn('[Aggregator] ✗ Failed to initialize MinecraftMaps scraper:', error.message);
    }
    
    console.log(`[Aggregator] Total scrapers initialized: ${this.scrapers.length} (Modrinth + Planet Minecraft + MC-Maps + MinecraftMaps)`);
    console.log('[Aggregator] NOTE: 9Minecraft REMOVED (broken downloads)');
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
      errors: [],
      downloadUrlsResolved: 0
    };

    // FIXED (Round 52): Log current circuit breaker status before search
    console.log(`[Aggregator] Circuit breaker status:`, 
      this.scrapers.map(s => `${s.name}: ${this.isCircuitOpen(s.name) ? 'OPEN' : 'closed'}`).join(', ')
    );

    // Create search promises for all enabled scrapers with individual timeouts
    const searchPromises = [];
    const scraperNames = [];

    // Add scraper searches (with circuit breaker check)
    for (const scraper of this.scrapers) {
      const circuitOpen = this.isCircuitOpen(scraper.name);
      if (scraper.enabled && !circuitOpen) {
        console.log(`[Aggregator] Starting search for ${scraper.name}...`);
        searchPromises.push(
          this.searchWithTimeout(
            scraper.name,
            () => scraper.instance.search(query, { 
              limit: this.maxResultsPerSource,
              fetchDirectDownloads: true // FIXED: Enable direct download fetching
            }),
            this.timeout
          )
        );
        scraperNames.push(scraper.name);
      } else if (circuitOpen) {
        console.log(`[Aggregator] ${scraper.name} disabled by circuit breaker`);
        results.sources[scraper.name] = {
          count: 0,
          success: false,
          note: 'Circuit breaker open'
        };
      } else if (!scraper.enabled) {
        console.log(`[Aggregator] ${scraper.name} is disabled`);
        results.sources[scraper.name] = {
          count: 0,
          success: false,
          note: 'Scraper disabled'
        };
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

    // Execute all searches in parallel with Promise.allSettled
    let searchResults;
    try {
      searchResults = await Promise.allSettled(searchPromises);
    } catch (error) {
      console.warn(`[Aggregator] Unexpected error during search: ${error.message}`);
      searchResults = [];
    }

    // Process results
    const allMaps = [];
    
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const sourceName = scraperNames[i];

      if (result.status === 'fulfilled') {
        const maps = result.value || [];
        const hasResults = maps.length > 0;
        results.sources[sourceName] = {
          count: maps.length,
          success: hasResults,
          note: hasResults ? null : 'No results returned'
        };
        allMaps.push(...maps);
        
        // FIXED (Round 52): Only record success if we got results
        // Empty results don't count as failure - the scraper worked but query had no matches
        if (hasResults) {
          console.log(`[Aggregator] ${sourceName} returned ${maps.length} results - recording success`);
          this.recordSuccess(sourceName);
        } else {
          console.log(`[Aggregator] ${sourceName} returned 0 results (query may have no matches)`);
          // Don't record failure for empty results - the scraper worked correctly
        }
      } else {
        // Only record failure for actual errors, not empty results
        console.warn(`[Aggregator] ${sourceName} failed: ${result.reason?.message || 'Unknown error'}`);
        results.sources[sourceName] = {
          count: 0,
          success: false,
          error: result.reason?.message || 'Unknown error'
        };
        results.errors.push({
          source: sourceName,
          error: result.reason?.message || 'Unknown error'
        });
        this.recordFailure(sourceName);
      }
    }

    // FIXED (Round 27): MINIMAL filtering - only remove obvious mods, keep everything else
    const filtered = this.minimalModFilter(allMaps);
    
    // Deduplicate results
    const deduplicated = this.deduplicateMaps(filtered);
    
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

  /**
   * FIXED (Round 27): Minimal mod filtering - ONLY filter obvious mods
   * This maximizes result count while ensuring quality
   */
  minimalModFilter(maps) {
    const filtered = maps.filter(map => {
      const title = (map.name || map.title || '').toLowerCase();
      const description = (map.summary || map.description || '').toLowerCase();
      const downloadUrl = (map.downloadUrl || '').toLowerCase();
      
      // CRITICAL: Filter by file extension - ALWAYS remove mod files
      if (/\.(jar|mrpack|litemod)(\?.*)?$/i.test(downloadUrl)) {
        return false;
      }
      
      // Check for mod file extensions in fileInfo
      if (map.fileInfo?.filename) {
        const filename = map.fileInfo.filename.toLowerCase();
        if (/\.(jar|mrpack|litemod)$/i.test(filename)) {
          return false;
        }
      }
      
      // Only filter if explicitly marked as mod by source
      if (map.project_type === 'mod' || map.project_type === 'modpack') {
        return false;
      }
      
      // Keep everything else - don't over-filter
      return true;
    });
    
    console.log(`[Aggregator] Mod filter: ${maps.length} -> ${filtered.length} results`);
    return filtered;
  }

  /**
   * FIXED (Round 27): Enhanced deduplication with download URL merging
   * FIXED (Round 44): Added thumbnail validation and fallback
   */
  deduplicateMaps(maps) {
    const seen = new Map();
    const DEFAULT_THUMBNAIL = 'https://via.placeholder.com/300x200.png?text=Minecraft+Map';

    for (const map of maps) {
      // FIXED (Round 44): Validate and clean thumbnail URL
      if (!map.thumbnail || map.thumbnail.trim() === '') {
        map.thumbnail = DEFAULT_THUMBNAIL;
        console.log(`[Thumbnail] Added fallback for "${map.name || map.title}"`);
      } else {
        // Ensure thumbnail is a valid URL
        const thumb = map.thumbnail.trim();
        if (!thumb.startsWith('http://') && !thumb.startsWith('https://')) {
          map.thumbnail = DEFAULT_THUMBNAIL;
          console.log(`[Thumbnail] Invalid URL "${thumb}", using fallback for "${map.name || map.title}"`);
        }
      }
      
      // Create deduplication key from normalized title + author
      const title = (map.name || map.title || '').toLowerCase().trim();
      
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
        
        // Merge sources
        if (!existing.sources) {
          existing.sources = [{
            source: existing.source || 'unknown',
            sourceName: existing.sourceName || 'Unknown',
            downloadUrl: existing.downloadUrl,
            downloadType: existing.downloadType,
            url: existing.url
          }];
        }
        
        const newSource = map.source || 'unknown';
        const alreadyHasSource = existing.sources.some(s => s.source === newSource);
        
        if (!alreadyHasSource) {
          existing.sources.push({
            source: newSource,
            sourceName: map.sourceName || newSource,
            downloadUrl: map.downloadUrl,
            downloadType: map.downloadType,
            url: map.url
          });
        }
        
        // FIXED: Prefer direct downloads over page links
        if (existing.downloadType === 'page' && map.downloadType === 'direct') {
          existing.downloadUrl = map.downloadUrl;
          existing.downloadType = 'direct';
          existing.downloadNote = null;
          console.log(`[Deduplication] Upgraded "${title}" to direct download from ${newSource}`);
        }
        
        // FIXED (Round 44): Merge thumbnails - prefer valid non-placeholder ones
        if (existing.thumbnail === DEFAULT_THUMBNAIL && map.thumbnail !== DEFAULT_THUMBNAIL) {
          existing.thumbnail = map.thumbnail;
          console.log(`[Thumbnail] Upgraded "${title}" with better thumbnail from ${newSource}`);
        } else if (!existing.thumbnail && map.thumbnail) {
          existing.thumbnail = map.thumbnail;
        }
        
        // Combine download counts
        existing.downloads = Math.max(existing.downloads || 0, map.downloads || 0);
        existing.downloadCount = existing.downloads;
        
      } else {
        seen.set(key, map);
      }
    }

    return Array.from(seen.values());
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
    if (map.downloadUrl && map.downloadType === 'direct') {
      score += 25;
    } else if (map.downloadUrl) {
      score += 10;
    }
    
    // Thumbnail bonus
    if (map.thumbnail && !map.thumbnail.includes('placeholder')) {
      score += 5;
    }
    
    return score;
  }

  /**
   * FIXED (Round 27): Cached download URL resolution
   * Reduces timeout issues by caching download URLs
   */
  async getCachedDownloadUrl(source, id, fetchFn) {
    const cacheKey = `${source}:${id}`;
    const cached = this.downloadUrlCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.downloadCacheTtl) {
      console.log(`[DownloadCache] Hit for ${source}:${id}`);
      return cached.url;
    }
    
    // Fetch fresh URL
    const url = await fetchFn();
    
    if (url) {
      this.downloadUrlCache.set(cacheKey, {
        url,
        timestamp: Date.now()
      });
    }
    
    return url;
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
          setTimeout(() => reject(new Error('Health check timeout')), 10000)
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

  isCircuitOpen(sourceName) {
    const failure = this.failures.get(sourceName);
    if (!failure) return false;
    
    if (failure.count >= this.failureThreshold) {
      const now = Date.now();
      const timeSinceFailure = now - failure.lastFailureTime;
      if (timeSinceFailure < this.disableTimeMs) {
        const remainingMs = this.disableTimeMs - timeSinceFailure;
        console.log(`[Circuit Breaker] ${sourceName} disabled for ${Math.ceil(remainingMs / 1000)}s (${failure.count} failures)`);
        return true;
      } else {
        // FIXED (Round 52): Auto-reset circuit breaker after disable time expires
        console.log(`[Circuit Breaker] ${sourceName} auto-reset after ${this.disableTimeMs / 1000}s cooldown`);
        this.failures.delete(sourceName);
        return false;
      }
    }
    
    return false;
  }

  /**
   * FIXED (Round 52): Manual reset of circuit breaker for a source
   * Call this to forcibly re-enable a source
   */
  resetCircuitBreaker(sourceName) {
    if (sourceName) {
      this.failures.delete(sourceName);
      console.log(`[Circuit Breaker] Manually reset for ${sourceName}`);
    } else {
      // Reset all
      this.failures.clear();
      console.log('[Circuit Breaker] All circuit breakers reset');
    }
  }

  recordFailure(sourceName) {
    const failure = this.failures.get(sourceName) || { count: 0, lastFailureTime: 0 };
    failure.count++;
    failure.lastFailureTime = Date.now();
    this.failures.set(sourceName, failure);
    
    if (failure.count >= this.failureThreshold) {
      console.log(`[Circuit Breaker] ${sourceName} disabled for ${this.disableTimeMs / 1000}s after ${failure.count} failures`);
    }
  }

  recordSuccess(sourceName) {
    this.failures.delete(sourceName);
  }
}

module.exports = MapAggregator;
