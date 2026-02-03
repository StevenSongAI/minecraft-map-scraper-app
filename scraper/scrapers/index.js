/**
 * Scrapers Module
 * Exports all scrapers and the aggregator
 */

const { BaseScraper, CircuitBreaker, CacheManager } = require('./base');
const PlanetMinecraftScraper = require('./planetminecraft');
const MinecraftMapsScraper = require('./minecraftmaps');
const NineMinecraftScraper = require('./nineminecraft');
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
