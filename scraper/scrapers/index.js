/**
 * Scrapers Module
 * Exports all scrapers and the aggregator - HTTP-only versions
 * FIXED (Round 7): Re-added Modrinth API - reliable JSON API with no Cloudflare
 */

const { BaseScraper, CircuitBreaker, CacheManager } = require('./base');

// Load HTTP-only scrapers (no Playwright required)
const PlanetMinecraftScraper = require('./planetminecraft');
const NineMinecraftScraper = require('./nineminecraft');
const ModrinthScraper = require('./modrinth');

const MapAggregator = require('./aggregator');

console.log('[Scrapers] HTTP-only scrapers loaded successfully (Modrinth + Planet Minecraft + 9Minecraft)');

module.exports = {
  BaseScraper,
  CircuitBreaker,
  CacheManager,
  PlanetMinecraftScraper,
  NineMinecraftScraper,
  ModrinthScraper,
  MapAggregator
};
