/**
 * Scrapers Module
 * Exports all scrapers and the aggregator
 */

const { BaseScraper, CircuitBreaker, CacheManager } = require('./base');

// Try to load scrapers, gracefully handle missing dependencies
let PlanetMinecraftScraper = null;
let MinecraftMapsScraper = null;
let NineMinecraftScraper = null;

// Try to load Planet Minecraft scraper
try {
  PlanetMinecraftScraper = require('./planetminecraft');
} catch (error) {
  console.warn('[Scrapers] Planet Minecraft scraper not available:', error.message);
  // Provide stub
  PlanetMinecraftScraper = class StubScraper {
    constructor() { throw new Error('Planet Minecraft scraper not available - Playwright not installed'); }
  };
}

// Try to load MinecraftMaps scraper
try {
  MinecraftMapsScraper = require('./minecraftmaps');
} catch (error) {
  console.warn('[Scrapers] MinecraftMaps scraper not available:', error.message);
  MinecraftMapsScraper = class StubScraper {
    constructor() { throw new Error('MinecraftMaps scraper not available'); }
  };
}

// Try to load 9Minecraft scraper
try {
  NineMinecraftScraper = require('./nineminecraft');
} catch (error) {
  console.warn('[Scrapers] 9Minecraft scraper not available:', error.message);
  NineMinecraftScraper = class StubScraper {
    constructor() { throw new Error('9Minecraft scraper not available'); }
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
