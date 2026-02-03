/**
 * Scrapers Module
 * Exports all scrapers and the aggregator
 * ROUND 34: Added Planet Minecraft Puppeteer (bypasses Cloudflare)
 * ROUND 31: Removed 9Minecraft (broken downloads)
 */

const { BaseScraper, CircuitBreaker, CacheManager } = require('./base');

// ROUND 34: Added Planet Minecraft Puppeteer for Cloudflare bypass
// ROUND 31: Removed 9Minecraft - downloads broken (page links not ZIPs, placeholder data)
const ModrinthScraper = require('./modrinth');
const MCMapsScraper = require('./mcmaps');
const MinecraftMapsScraper = require('./minecraftmaps');
const PlanetMinecraftPuppeteerScraper = require('./planetminecraft-puppeteer');

const MapAggregator = require('./aggregator');

console.log('[Scrapers] Scrapers loaded (Modrinth + Planet Minecraft + MC-Maps + MinecraftMaps)');
console.log('[Scrapers] ROUND 34: Planet Minecraft enabled (Puppeteer Cloudflare bypass)');
console.log('[Scrapers] ROUND 31: 9Minecraft removed (broken downloads)');

module.exports = {
  BaseScraper,
  CircuitBreaker,
  CacheManager,
  // ROUND 31 REMOVED: NineMinecraftScraper - broken downloads, not fixable
  ModrinthScraper,
  MCMapsScraper,
  MinecraftMapsScraper,
  PlanetMinecraftPuppeteerScraper,
  MapAggregator
};
