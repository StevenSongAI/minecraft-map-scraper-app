/**
 * Scrapers Module
 * Exports all scrapers and the aggregator - HTTP-only versions
 * MANAGER INTEL: Modrinth does NOT have maps (only mods/modpacks) - REMOVED
 */

const { BaseScraper, CircuitBreaker, CacheManager } = require('./base');

// Load HTTP-only scrapers (no Playwright required)
const PlanetMinecraftScraper = require('./planetminecraft');
const NineMinecraftScraper = require('./nineminecraft');

const MapAggregator = require('./aggregator');

console.log('[Scrapers] HTTP-only scrapers loaded successfully (Planet Minecraft + 9Minecraft)');

module.exports = {
  BaseScraper,
  CircuitBreaker,
  CacheManager,
  PlanetMinecraftScraper,
  NineMinecraftScraper,
  MapAggregator
};
