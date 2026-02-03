/**
 * Base Scraper Class
 * Provides rate limiting, circuit breaker, caching, and common functionality for all scrapers
 */

const fs = require('fs');
const path = require('path');

// Simple rate limiter implementation (since p-limit v7 is ESM)
function pLimit(concurrency) {
  const queue = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const { fn, resolve, reject } = queue.shift();
      run(fn, resolve, reject);
    }
  };

  const run = async (fn, resolve, reject) => {
    activeCount++;
    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      next();
    }
  };

  const limit = (fn) => {
    return new Promise((resolve, reject) => {
      if (activeCount < concurrency) {
        run(fn, resolve, reject);
      } else {
        queue.push({ fn, resolve, reject });
      }
    });
  };

  return limit;
}

/**
 * Cache Manager for scraped results
 * Provides TTL-based caching with file persistence
 */
class CacheManager {
  constructor(options = {}) {
    this.ttl = options.ttl || 60 * 60 * 1000; // 1 hour default TTL
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.scraper-cache');
    this.memoryCache = new Map();
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate cache key from query and source
   */
  generateKey(query, source) {
    const crypto = require('crypto');
    const keyString = `${source}:${query.toLowerCase().trim()}`;
    return crypto.createHash('md5').update(keyString).digest('hex');
  }

  /**
   * Get cache file path for a key
   */
  getCacheFilePath(key) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  /**
   * Get cached results if still valid
   */
  get(query, source) {
    const key = this.generateKey(query, source);
    
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && Date.now() < memoryEntry.expiry) {
      console.log(`[Cache] Memory cache hit for ${source}: "${query}"`);
      return memoryEntry.data;
    }
    
    // Check file cache
    const cacheFile = this.getCacheFilePath(key);
    if (fs.existsSync(cacheFile)) {
      try {
        const entry = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (Date.now() < entry.expiry) {
          console.log(`[Cache] File cache hit for ${source}: "${query}"`);
          // Promote to memory cache
          this.memoryCache.set(key, entry);
          return entry.data;
        } else {
          // Expired - clean up
          fs.unlinkSync(cacheFile);
          this.memoryCache.delete(key);
        }
      } catch (error) {
        console.warn(`[Cache] Error reading cache file: ${error.message}`);
      }
    }
    
    return null;
  }

  /**
   * Store results in cache
   */
  set(query, source, data) {
    const key = this.generateKey(query, source);
    const entry = {
      data,
      expiry: Date.now() + this.ttl,
      created: Date.now()
    };
    
    // Store in memory
    this.memoryCache.set(key, entry);
    
    // Persist to file
    const cacheFile = this.getCacheFilePath(key);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
    } catch (error) {
      console.warn(`[Cache] Error writing cache file: ${error.message}`);
    }
  }

  /**
   * Clear expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiry) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    
    // Clean file cache
    if (fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.cacheDir, file);
            const entry = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (now > entry.expiry) {
              fs.unlinkSync(filePath);
              cleaned++;
            }
          } catch (error) {
            // Skip invalid files
          }
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(`[Cache] Cleaned up ${cleaned} expired entries`);
    }
    
    return cleaned;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let fileCount = 0;
    let fileSize = 0;
    
    if (fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fileCount++;
          const stats = fs.statSync(path.join(this.cacheDir, file));
          fileSize += stats.size;
        }
      }
    }
    
    return {
      memoryEntries: this.memoryCache.size,
      fileEntries: fileCount,
      totalSize: fileSize,
      ttl: this.ttl
    };
  }
}

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }

  async execute(fn, ...args) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
        this.successCount = 0;
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.constructor.name}`);
      }
    }

    try {
      const result = await fn(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxCalls) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

class BaseScraper {
  constructor(options = {}) {
    this.name = options.name || 'base';
    this.baseUrl = options.baseUrl || '';
    this.sourceName = options.sourceName || 'Unknown';
    
    // Rate limiting: 1 req/sec per source
    this.limit = pLimit(1);
    this.minRequestInterval = options.minRequestInterval || 1000; // 1 second
    this.lastRequestTime = 0;
    
    // Circuit breaker for resilience
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: options.failureThreshold || 5,
      resetTimeout: options.resetTimeout || 60000
    });
    
    // Cache manager - 1 hour TTL for popular queries
    this.cache = new CacheManager({
      ttl: options.cacheTtl || 60 * 60 * 1000, // 1 hour
      cacheDir: options.cacheDir || path.join(process.cwd(), '.scraper-cache')
    });
    
    // FIXED: Use ethical scraper identification instead of impersonating browsers
    // This complies with web scraping best practices
    this.userAgent = 'MinecraftMapScraper/2.0';
    
    // Robots.txt cache
    this.robotsTxtCache = new Map();
  }

  getUserAgent() {
    return this.userAgent;
  }

  getRandomUserAgent() {
    // Keep this method for backward compatibility, but return scraper user agent
    return this.userAgent;
  }

  /**
   * Check if scraping is allowed by robots.txt
   * Returns { allowed: boolean, reason: string }
   */
  async checkRobotsTxt(url) {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      
      // Check cache first
      if (this.robotsTxtCache.has(robotsUrl)) {
        const cached = this.robotsTxtCache.get(robotsUrl);
        if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
          return cached.result;
        }
      }
      
      // Fetch robots.txt
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': this.userAgent }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // No robots.txt or error = allow by default
        const result = { allowed: true, reason: 'No robots.txt found' };
        this.robotsTxtCache.set(robotsUrl, { result, timestamp: Date.now() });
        return result;
      }
      
      const robotsTxt = await response.text();
      
      // Parse robots.txt for our user agent
      const lines = robotsTxt.split('\n');
      let isOurSection = false;
      let disallowPaths = [];
      let allowPaths = [];
      
      for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        
        // Check if this section applies to us
        if (trimmed.startsWith('user-agent:')) {
          const agent = trimmed.substring('user-agent:'.length).trim();
          isOurSection = agent === '*' || agent === 'minecraftmapscraper' || agent.includes('scraper');
        }
        
        if (isOurSection) {
          if (trimmed.startsWith('disallow:')) {
            const path = trimmed.substring('disallow:'.length).trim();
            if (path) disallowPaths.push(path);
          } else if (trimmed.startsWith('allow:')) {
            const path = trimmed.substring('allow:'.length).trim();
            if (path) allowPaths.push(path);
          }
        }
      }
      
      // Check if the URL path is disallowed
      const urlPath = urlObj.pathname;
      let allowed = true;
      let reason = 'Allowed by robots.txt';
      
      for (const disallow of disallowPaths) {
        if (disallow === '/') {
          allowed = false;
          reason = 'Disallowed by robots.txt: all paths blocked';
          break;
        }
        if (urlPath.startsWith(disallow)) {
          // Check if there's a more specific allow rule
          let hasAllowOverride = false;
          for (const allow of allowPaths) {
            if (urlPath.startsWith(allow) && allow.length > disallow.length) {
              hasAllowOverride = true;
              break;
            }
          }
          if (!hasAllowOverride) {
            allowed = false;
            reason = `Disallowed by robots.txt: ${disallow}`;
            break;
          }
        }
      }
      
      const result = { allowed, reason };
      this.robotsTxtCache.set(robotsUrl, { result, timestamp: Date.now() });
      return result;
      
    } catch (error) {
      // On error, default to allow (fail open)
      console.warn(`[${this.name}] robots.txt check failed: ${error.message}`);
      return { allowed: true, reason: 'robots.txt check failed, defaulting to allow' };
    }
  }

  async rateLimitedRequest(fn) {
    return this.limit(async () => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.minRequestInterval) {
        const delay = this.minRequestInterval - timeSinceLastRequest;
        await this.sleep(delay);
      }
      
      this.lastRequestTime = Date.now();
      return fn();
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async search(query, options = {}) {
    throw new Error('Search method must be implemented by subclass');
  }

  normalizeToCurseForgeFormat(rawData) {
    // Transform raw scraped data to match CurseForge API format
    return {
      id: rawData.id || this.generateId(rawData),
      name: rawData.title || rawData.name || 'Untitled',
      slug: rawData.slug || this.generateSlug(rawData.title || rawData.name || ''),
      summary: rawData.description || rawData.summary || '',
      description: rawData.description || '',
      author: {
        name: rawData.author || 'Unknown',
        url: rawData.authorUrl || ''
      },
      thumbnail: rawData.thumbnail || rawData.image || '',
      screenshots: rawData.screenshots || [],
      url: rawData.url || '',  // FIXED (Round 12): Include detail page URL
      downloadUrl: rawData.downloadUrl || '',
      downloadType: rawData.downloadType || null, // FIXED (Round 7): Preserve download type (e.g., 'page', 'direct')
      downloadNote: rawData.downloadNote || null, // FIXED (Round 7): Preserve download notes
      fileInfo: rawData.fileInfo || null,
      downloadCount: rawData.downloads || rawData.downloadCount || 0,
      gameVersions: rawData.gameVersions || [],
      primaryGameVersion: rawData.gameVersions?.[0] || null,
      category: rawData.category || 'World',
      dateCreated: rawData.dateCreated || new Date().toISOString(),
      dateModified: rawData.dateModified || new Date().toISOString(),
      source: this.sourceName.toLowerCase().replace(/\s+/g, ''),
      sourceName: this.sourceName, // FIXED: Add sourceName for display (e.g., "9Minecraft", "Planet Minecraft")
      isFeatured: rawData.isFeatured || false,
      popularityScore: rawData.popularityScore || Math.log10((rawData.downloads || 0) + 1),
      primaryLanguage: 'en',
      curseforge: {
        modId: null, // Not from CurseForge
        fileId: null
      }
    };
  }

  generateId(rawData) {
    // Generate a unique ID based on source and title
    const str = `${this.sourceName}-${rawData.title || rawData.name || Math.random()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) + 10000000; // Offset to avoid collision with CurseForge IDs
  }

  generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Search with caching support
   * Subclasses should call this method to get cached results
   */
  async searchWithCache(query, options = {}, searchFn) {
    const cacheKey = `${query}:${JSON.stringify(options)}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey, this.name);
    if (cached) {
      return cached;
    }
    
    // Execute search
    const results = await searchFn(query, options);
    
    // Store in cache
    this.cache.set(cacheKey, this.name, results);
    
    return results;
  }

  /**
   * Validate a download URL by checking HTTP status
   * Returns the validated URL or null if invalid
   */
  async validateDownloadUrl(url, options = {}) {
    if (!url) return null;
    
    const timeout = options.timeout || 10000;
    const maxRedirects = options.maxRedirects || 5;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.status === 200) {
        // Return the final URL (after redirects)
        return response.url;
      }
      
      // If HEAD fails, try GET (some servers don't support HEAD)
      if (response.status === 405 || response.status === 501) {
        const getController = new AbortController();
        const getTimeoutId = setTimeout(() => getController.abort(), timeout);
        
        const getResponse = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: getController.signal,
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': '*/*',
            'Range': 'bytes=0-1' // Only fetch first byte to check availability
          }
        });
        
        clearTimeout(getTimeoutId);
        
        if (getResponse.status === 200 || getResponse.status === 206) {
          return getResponse.url;
        }
      }
      
      console.warn(`[${this.name}] Download URL returned ${response.status}: ${url.substring(0, 100)}`);
      return null;
    } catch (error) {
      console.warn(`[${this.name}] Failed to validate download URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract and validate download URL from a map detail page
   * This should be overridden by subclasses with source-specific logic
   */
  async extractDownloadUrl(mapUrl, options = {}) {
    // Default implementation - subclasses should override
    console.warn(`[${this.name}] extractDownloadUrl not implemented`);
    return null;
  }

  /**
   * Validate and update download URLs for a list of maps
   */
  async validateMapDownloads(maps, options = {}) {
    const maxConcurrent = options.maxConcurrent || 3;
    const validatedMaps = [];
    
    // Process in batches to avoid overwhelming the server
    for (let i = 0; i < maps.length; i += maxConcurrent) {
      const batch = maps.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (map) => {
        const downloadUrl = map.downloadUrl || map.url;
        
        // Try to extract direct download URL if needed
        let validatedUrl = null;
        
        if (this.extractDownloadUrl && this.extractDownloadUrl !== BaseScraper.prototype.extractDownloadUrl) {
          // Use source-specific extraction
          try {
            validatedUrl = await this.extractDownloadUrl(map.url, options);
          } catch (error) {
            console.warn(`[${this.name}] Extraction failed: ${error.message}`);
          }
        }
        
        // Fallback to validating the existing URL
        if (!validatedUrl && downloadUrl) {
          validatedUrl = await this.validateDownloadUrl(downloadUrl, options);
        }
        
        return {
          ...map,
          downloadUrl: validatedUrl || map.downloadUrl,
          downloadVerified: !!validatedUrl,
          downloadStatus: validatedUrl ? 'verified' : 'unverified'
        };
      });
      
      const validatedBatch = await Promise.all(batchPromises);
      validatedMaps.push(...validatedBatch);
      
      // Small delay between batches
      if (i + maxConcurrent < maps.length) {
        await this.sleep(500);
      }
    }
    
    return validatedMaps;
  }

  getHealth() {
    return {
      name: this.name,
      source: this.sourceName,
      circuitBreaker: this.circuitBreaker.getState(),
      baseUrl: this.baseUrl,
      cache: this.cache.getStats()
    };
  }
}

module.exports = { BaseScraper, CircuitBreaker, CacheManager };
