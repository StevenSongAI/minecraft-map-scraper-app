/**
 * Configuration for Minecraft Map Scraper
 * Non-map search term blacklist
 */

// Terms that indicate non-map search queries
const BLACKLIST_TERMS = [
  'texture pack',
  'resource pack',
  'mod',
  'modpack',
  'shader',
  'optifine',
  'forge',
  'fabric',
  'plugin',
  'datapack',
  'data pack'
];

module.exports = { BLACKLIST_TERMS };
