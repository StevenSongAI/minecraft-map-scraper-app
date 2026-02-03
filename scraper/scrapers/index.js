/**
 * Scrapers Module
 * Exports all scrapers and the aggregator - HTTP-only versions
 */

const { BaseScraper, CircuitBreaker, CacheManager } = require('./base');

// Load HTTP-only scrapers (no Playwright required)
const PlanetMinecraftScraper = require('./planetminecraft');
const ModrinthScraper = require('./modrinth');
const NineMinecraftScraper = require('./nineminecraft');

const MapAggregator = require('./aggregator');

console.log('[Scrapers] HTTP-only scrapers loaded successfully');

module.exports = {
  BaseScraper,
  CircuitBreaker,
  CacheManager,
  PlanetMinecraftScraper,
  ModrinthScraper,
  NineMinecraftScraper,
  MapAggregator
};
