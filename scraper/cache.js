const fs = require('fs');
const path = require('path');

/**
 * Cache manager for maps-data.json
 * Handles reading and writing map search results to local cache
 */
class CacheManager {
  constructor(cachePath = 'maps-data.json') {
    this.cachePath = path.resolve(cachePath);
    this.cache = null;
    this.loaded = false;
  }

  /**
   * Initialize cache file if it doesn't exist
   */
  init() {
    if (!fs.existsSync(this.cachePath)) {
      const initialData = {
        metadata: {
          lastUpdated: new Date().toISOString(),
          totalMaps: 0,
          apiVersion: '1.0',
          cacheHits: 0,
          apiCalls: 0
        },
        maps: {},
        searches: {}
      };
      this.writeCache(initialData);
      this.cache = initialData;
      this.loaded = true;
    }
  }

  /**
   * Ensure cache has valid structure with all required fields
   * @param {Object} data - Cache data to validate
   * @returns {Object} Validated cache data
   */
  validateCache(data) {
    const defaults = {
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalMaps: 0,
        apiVersion: '1.0',
        cacheHits: 0,
        apiCalls: 0
      },
      maps: {},
      searches: {}
    };

    // Merge with defaults to ensure all required fields exist
    const validated = {
      metadata: { ...defaults.metadata, ...(data.metadata || {}) },
      maps: data.maps && typeof data.maps === 'object' && !Array.isArray(data.maps) 
        ? data.maps 
        : {},
      searches: data.searches && typeof data.searches === 'object' 
        ? data.searches 
        : {}
    };

    return validated;
  }

  /**
   * Read cache from disk
   * @returns {Object} Cache data
   */
  read() {
    try {
      this.init();
      
      if (!this.loaded) {
        const data = fs.readFileSync(this.cachePath, 'utf8');
        const parsed = JSON.parse(data);
        this.cache = this.validateCache(parsed);
        this.loaded = true;
      }
      
      return this.cache;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create it
        this.init();
        return this.cache;
      }
      // If file exists but has invalid JSON or structure, reset it
      console.warn(`[Cache] Invalid cache file, resetting: ${error.message}`);
      this.init();
      return this.cache;
    }
  }

  /**
   * Write cache to disk
   * @param {Object} data - Data to write
   */
  writeCache(data) {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write atomically using temp file
      const tempPath = `${this.cachePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempPath, this.cachePath);
      
      this.cache = data;
    } catch (error) {
      throw new Error(`CACHE_WRITE_ERROR: ${error.message}`);
    }
  }

  /**
   * Write/update cache
   * @param {Object} data - Data to merge into cache
   */
  write(data) {
    const current = this.read();
    const merged = {
      ...current,
      ...data,
      metadata: {
        ...current.metadata,
        ...data.metadata,
        lastUpdated: new Date().toISOString()
      }
    };
    this.writeCache(merged);
  }

  /**
   * Get maps by search query
   * @param {string} query - Search query
   * @param {number} maxAgeMinutes - Maximum cache age in minutes (default: 60)
   * @returns {Array|null} Cached map results or null if expired/missing
   */
  getSearchResults(query, maxAgeMinutes = 60) {
    const cache = this.read();
    const normalizedQuery = query.toLowerCase().trim();
    const searchEntry = cache.searches[normalizedQuery];

    if (!searchEntry) {
      return null;
    }

    // Check if cache is expired
    const age = Date.now() - new Date(searchEntry.timestamp).getTime();
    const ageMinutes = age / (1000 * 60);

    if (ageMinutes > maxAgeMinutes) {
      return null;
    }

    // Return full map objects from cached IDs
    const maps = searchEntry.results
      .map(id => cache.maps[id])
      .filter(Boolean);

    // Increment cache hit counter
    cache.metadata.cacheHits++;
    this.writeCache(cache);

    return maps;
  }

  /**
   * Save search results to cache
   * @param {string} query - Search query
   * @param {Array} maps - Array of map objects
   */
  saveSearchResults(query, maps) {
    const cache = this.read();
    const normalizedQuery = query.toLowerCase().trim();

    // Store maps by ID
    const mapIds = maps.map(map => {
      cache.maps[map.id] = map;
      return map.id;
    });

    // Update total maps count
    cache.metadata.totalMaps = Object.keys(cache.maps).length;
    cache.metadata.apiCalls++;

    // Save search entry
    cache.searches[normalizedQuery] = {
      timestamp: new Date().toISOString(),
      results: mapIds,
      count: maps.length
    };

    this.writeCache(cache);
  }

  /**
   * Get a specific map by ID
   * @param {number} mapId - Map ID
   * @returns {Object|null} Map object or null
   */
  getMap(mapId) {
    const cache = this.read();
    return cache.maps[mapId] || null;
  }

  /**
   * Save a single map to cache
   * @param {Object} map - Map object
   */
  saveMap(map) {
    const cache = this.read();
    cache.maps[map.id] = map;
    cache.metadata.totalMaps = Object.keys(cache.maps).length;
    this.writeCache(cache);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const cache = this.read();
    const searchCount = Object.keys(cache.searches).length;
    const mapCount = Object.keys(cache.maps).length;

    return {
      ...cache.metadata,
      searchCount,
      mapCount,
      cachePath: this.cachePath
    };
  }

  /**
   * Clear all cached data
   */
  clear() {
    const empty = {
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalMaps: 0,
        apiVersion: '1.0',
        cacheHits: 0,
        apiCalls: 0
      },
      maps: {},
      searches: {}
    };
    this.writeCache(empty);
  }

  /**
   * Invalidate a specific search query
   * @param {string} query - Search query to invalidate
   */
  invalidateSearch(query) {
    const cache = this.read();
    const normalizedQuery = query.toLowerCase().trim();
    delete cache.searches[normalizedQuery];
    this.writeCache(cache);
  }
}

module.exports = CacheManager;
