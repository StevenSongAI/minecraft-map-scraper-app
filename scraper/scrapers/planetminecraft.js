/**
 * Planet Minecraft Scraper
 * CRITICAL FIX (Round 18): Uses Puppeteer to bypass Cloudflare, falls back to HTTP
 */

const PlanetMinecraftPuppeteerScraper = require('./planetminecraft-puppeteer');

// Export the Puppeteer version as the primary Planet Minecraft scraper
module.exports = PlanetMinecraftPuppeteerScraper;
