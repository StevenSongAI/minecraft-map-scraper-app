/**
 * Scrapers Module
 * Exports all scrapers and the aggregator
 */

const { BaseScraper, CircuitBreaker, CacheManager } = require('./base');

// Try to load scrapers, gracefully handle missing dependencies
let PlanetMinecraftScraper = null;
let MinecraftMapsScraper = null;
let NineMinecraftScraper = null;

// Try to load Planet Minecraft scraper - first try Playwright version, then HTTP fallback
try {
  // Check if Playwright is available
  require('playwright');
  PlanetMinecraftScraper = require('./planetminecraft');
  console.log('[Scrapers] Planet Minecraft Playwright scraper loaded');
} catch (error) {
  console.warn('[Scrapers] Playwright not available, using HTTP fallback for Planet Minecraft:', error.message);
  // Fall back to simple HTTP scraper
  try {
    PlanetMinecraftScraper = require('./planetminecraft_simple');
    console.log('[Scrapers] Planet Minecraft HTTP scraper loaded as fallback');
  } catch (fallbackError) {
    console.warn('[Scrapers] Planet Minecraft HTTP scraper also unavailable:', fallbackError.message);
    // Provide stub that returns empty results
    PlanetMinecraftScraper = class StubPlanetMinecraftScraper extends BaseScraper {
      constructor(options = {}) {
        super({ name: 'planetminecraft', baseUrl: 'https://www.planetminecraft.com', sourceName: 'Planet Minecraft', ...options });
      }
      async search() { return []; }
      async checkHealth() { return { ...this.getHealth(), accessible: false, error: 'Playwright not installed and HTTP fallback failed' }; }
    };
  }
}

// Try to load MinecraftMaps scraper
try {
  MinecraftMapsScraper = require('./minecraftmaps');
  console.log('[Scrapers] MinecraftMaps scraper loaded');
} catch (error) {
  console.warn('[Scrapers] MinecraftMaps scraper not available:', error.message);
  // Provide stub that returns empty results
  MinecraftMapsScraper = class StubMinecraftMapsScraper extends BaseScraper {
    constructor(options = {}) {
      super({ name: 'minecraftmaps', baseUrl: 'https://www.minecraftmaps.com', sourceName: 'MinecraftMaps', ...options });
    }
    async search() { return []; }
    async checkHealth() { return { ...this.getHealth(), accessible: false, error: error.message }; }
  };
}

// Try to load 9Minecraft scraper
try {
  NineMinecraftScraper = require('./nineminecraft');
  console.log('[Scrapers] 9Minecraft scraper loaded');
} catch (error) {
  console.warn('[Scrapers] 9Minecraft scraper not available:', error.message);
  // Provide stub that returns empty results
  NineMinecraftScraper = class StubNineMinecraftScraper extends BaseScraper {
    constructor(options = {}) {
      super({ name: 'nineminecraft', baseUrl: 'https://www.9minecraft.net', sourceName: '9Minecraft', ...options });
    }
    async search() { return []; }
    async checkHealth() { return { ...this.getHealth(), accessible: false, error: error.message }; }
  };
}

const MapAggregator = require('./aggregator');

module.exports = {
  BaseScraper,
  CircuitBreaker,
  CacheManager,
  PlanetMinecraftScraper,
  MinecraftMapsScraper,
  NineMinecraftScraper,
  MapAggregator
};
