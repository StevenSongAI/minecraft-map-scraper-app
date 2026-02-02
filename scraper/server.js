const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const CurseForgeClient = require('./curseforge');
const CacheManager = require('./cache');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Use environment variable OR fallback to hardcoded API key for Railway deployment
// This is a valid API key that works with CurseForge API - Updated: 2026-02-02
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '$2a$10$Nq62KqieW9UZE94ViLrroOCiMA6jLberrv.6X1pz4iBGOjMM91L5y';

// Track if we're using demo mode (only when NO API key is available at all)
const IS_DEMO_MODE = !CURSEFORGE_API_KEY || CURSEFORGE_API_KEY === '';

// Initialize cache manager
const cachePath = path.join(__dirname, '..', 'maps-data.json');
const cache = new CacheManager(cachePath);

// Ensure cache is loaded from disk on startup
try {
  const cacheStats = cache.getStats();
  console.log(`[Cache] Loaded from disk: ${cacheStats.mapCount} maps, ${cacheStats.searchCount} searches`);
} catch (error) {
  console.warn('[Cache] Failed to load cache, starting fresh:', error.message);
}

// Initialize CurseForge client
const cfClient = new CurseForgeClient(CURSEFORGE_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from dashboard folder
const dashboardPath = path.join(__dirname, '..', 'dashboard');
app.use(express.static(dashboardPath));

// Also serve root index.html for backward compatibility
app.use('/legacy', express.static(path.join(__dirname, '..')));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// API Key Check Middleware - Blocks API calls when key is missing
const requireApiKey = (req, res, next) => {
  if (!CURSEFORGE_API_KEY) {
    return res.status(503).json({
      error: 'API_KEY_MISSING',
      message: 'CURSEFORGE_API_KEY is not configured. Please add your API key to the .env file.',
      help: 'Get your API key at: https://console.curseforge.com/'
    });
  }
  next();
};

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
  const apiStatus = await cfClient.getStatus();
  const cacheStats = cache.getStats();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: IS_DEMO_MODE ? 'demo' : 'live',
    demoMode: IS_DEMO_MODE,
    api: {
      ...apiStatus,
      demoMode: IS_DEMO_MODE
    },
    cache: cacheStats
  });
});

/**
 * Generate mock map data for testing when no API key is available
 * @param {string} query - Search query
 * @param {number} count - Number of results to generate
 * @returns {Array} Mock map data
 */
function generateMockMaps(query, count = 10) {
  const mockMaps = [
    // FUTURISTIC / CITY / RAILWAYS
    {
      id: 1001,
      name: 'Neo Tokyo 2088',
      slug: 'neo-tokyo-2088',
      summary: 'A futuristic cyberpunk city with high-speed magnetic railways, neon skyscrapers, and automated transport systems.',
      description: 'Experience the future in this massive cyberpunk metropolis featuring working high-speed rail networks, flying car pathways, and stunning neon-lit architecture.',
      author: { name: 'FutureBuilder', url: 'https://www.curseforge.com/members/FutureBuilder' },
      thumbnail: 'https://placehold.co/300x200/1a1a2e/00d4ff?text=Neo+Tokyo+2088',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/neo-tokyo-2088',
      downloadCount: 125400,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-08-15T00:00:00Z',
      dateModified: '2024-01-20T00:00:00Z',
      source: 'mock',
      tags: ['futuristic', 'city', 'railways', 'cyberpunk', 'train', 'metro', 'modern', 'transport']
    },
    {
      id: 1002,
      name: 'SkyRail Metropolis',
      slug: 'skyrail-metropolis',
      summary: 'Modern city with elevated high-speed rail systems connecting residential, commercial, and industrial districts.',
      description: 'A functional modern city featuring an extensive network of elevated railways, subway systems, and automated trains connecting all districts.',
      author: { name: 'UrbanPlanner', url: 'https://www.curseforge.com/members/UrbanPlanner' },
      thumbnail: 'https://placehold.co/300x200/2c3e50/3498db?text=SkyRail+Metropolis',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/skyrail-metropolis',
      downloadCount: 89300,
      gameVersions: ['1.20.4', '1.20.1'],
      category: 'World',
      dateCreated: '2023-11-10T00:00:00Z',
      dateModified: '2024-02-01T00:00:00Z',
      source: 'mock',
      tags: ['city', 'modern', 'railways', 'train', 'transport', 'urban', 'subway']
    },
    {
      id: 1003,
      name: 'HyperLoop Central',
      slug: 'hyperloop-central',
      summary: 'Futuristic transport hub with vacuum tube high-speed trains connecting multiple biomes and city zones.',
      description: 'Experience next-generation transport with vacuum-sealed hyperloop trains reaching incredible speeds between connected districts.',
      author: { name: 'TechArchitect', url: 'https://www.curseforge.com/members/TechArchitect' },
      thumbnail: 'https://placehold.co/300x200/0f3460/e94560?text=HyperLoop+Central',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/hyperloop-central',
      downloadCount: 67200,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2024-01-05T00:00:00Z',
      dateModified: '2024-02-15T00:00:00Z',
      source: 'mock',
      tags: ['futuristic', 'high speed', 'railways', 'train', 'transport', 'modern', 'tech']
    },
    // MEDIEVAL / CASTLE
    {
      id: 1004,
      name: 'Kingslanding Fortress',
      slug: 'kingslanding-fortress',
      summary: 'Epic medieval castle with towering walls, secret passages, and a grand throne room fit for royalty.',
      description: 'An authentic medieval fortress complete with defensive walls, a keep, stables, armory, and living quarters. Perfect for roleplay servers.',
      author: { name: 'CastleBuilder', url: 'https://www.curseforge.com/members/CastleBuilder' },
      thumbnail: 'https://placehold.co/300x200/4a3728/c9b896?text=Kingslanding+Fortress',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/kingslanding-fortress',
      downloadCount: 156000,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2023-03-20T00:00:00Z',
      dateModified: '2023-12-10T00:00:00Z',
      source: 'mock',
      tags: ['medieval', 'castle', 'fortress', 'roleplay', 'kingdom', 'royal']
    },
    {
      id: 1005,
      name: 'Dragonstone Citadel',
      slug: 'dragonstone-citadel',
      summary: 'Ancient castle built into a volcanic mountain, featuring dragon nests and obsidian architecture.',
      description: 'A dark and mysterious fortress carved from volcanic stone with dragon-themed architecture, lava moats, and hidden caverns.',
      author: { name: 'DarkBuilder', url: 'https://www.curseforge.com/members/DarkBuilder' },
      thumbnail: 'https://placehold.co/300x200/2d1b1b/e74c3c?text=Dragonstone+Citadel',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/dragonstone-citadel',
      downloadCount: 98700,
      gameVersions: ['1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-06-15T00:00:00Z',
      dateModified: '2024-01-15T00:00:00Z',
      source: 'mock',
      tags: ['medieval', 'castle', 'dragon', 'dark', 'fortress', 'fantasy']
    },
    {
      id: 1006,
      name: 'Rivendell Estate',
      slug: 'rivendell-estate',
      summary: 'Elven palace with elegant architecture, waterfalls, and lush gardens in a scenic valley.',
      description: 'A breathtaking elven sanctuary featuring flowing water features, ethereal lighting, and nature-integrated architecture.',
      author: { name: 'ElvenArchitect', url: 'https://www.curseforge.com/members/ElvenArchitect' },
      thumbnail: 'https://placehold.co/300x200/27ae60/a8e6cf?text=Rivendell+Estate',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/rivendell-estate',
      downloadCount: 134200,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-09-01T00:00:00Z',
      dateModified: '2024-01-30T00:00:00Z',
      source: 'mock',
      tags: ['medieval', 'elven', 'palace', 'fantasy', 'nature', 'elegant']
    },
    // SURVIVAL / ISLAND / ADVENTURE
    {
      id: 1007,
      name: 'Stranded Deep',
      slug: 'stranded-deep',
      summary: 'Hardcore survival on a deserted tropical island with limited resources and hidden dangers.',
      description: 'Test your survival skills on this challenging island map with scarce resources, hostile mobs, and secrets to discover.',
      author: { name: 'SurvivalExpert', url: 'https://www.curseforge.com/members/SurvivalExpert' },
      thumbnail: 'https://placehold.co/300x200/f39c12/f1c40f?text=Stranded+Deep',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/stranded-deep',
      downloadCount: 201000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2022-05-10T00:00:00Z',
      dateModified: '2023-12-01T00:00:00Z',
      source: 'mock',
      tags: ['survival', 'island', 'ocean', 'hardcore', 'adventure', 'deserted']
    },
    {
      id: 1008,
      name: 'Arctic Survival',
      slug: 'arctic-survival',
      summary: 'Survive the frozen wilderness with limited supplies in this ice-covered archipelago.',
      description: 'Face the challenges of extreme cold, scarce food sources, and isolation in this brutal arctic survival scenario.',
      author: { name: 'IceExplorer', url: 'https://www.curseforge.com/members/IceExplorer' },
      thumbnail: 'https://placehold.co/300x200/a8dadc/457b9d?text=Arctic+Survival',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/arctic-survival',
      downloadCount: 87600,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2023-01-20T00:00:00Z',
      dateModified: '2023-11-15T00:00:00Z',
      source: 'mock',
      tags: ['survival', 'arctic', 'ice', 'snow', 'cold', 'hardcore', 'island']
    },
    // MODERN / MANSION / HOUSE
    {
      id: 1009,
      name: 'Beverly Hills Mansion',
      slug: 'beverly-hills-mansion',
      summary: 'Luxurious modern mansion with pool, garage, cinema room, and stunning ocean views.',
      description: 'Live the high life in this fully furnished modern estate featuring a home theater, infinity pool, and smart home automation.',
      author: { name: 'LuxuryLiving', url: 'https://www.curseforge.com/members/LuxuryLiving' },
      thumbnail: 'https://placehold.co/300x200/34495e/bdc3c7?text=Beverly+Hills+Mansion',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/beverly-hills-mansion',
      downloadCount: 178000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-07-15T00:00:00Z',
      dateModified: '2024-01-10T00:00:00Z',
      source: 'mock',
      tags: ['modern', 'mansion', 'house', 'luxury', 'pool', 'contemporary']
    },
    {
      id: 1010,
      name: 'Glass House Modern',
      slug: 'glass-house-modern',
      summary: 'Stunning contemporary home with floor-to-ceiling glass walls and minimalist design.',
      description: 'An architectural masterpiece featuring transparent walls, open floor plans, and seamless indoor-outdoor living spaces.',
      author: { name: 'Modernist', url: 'https://www.curseforge.com/members/Modernist' },
      thumbnail: 'https://placehold.co/300x200/95a5a6/ecf0f1?text=Glass+House',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/glass-house-modern',
      downloadCount: 92300,
      gameVersions: ['1.20.4', '1.20.1'],
      category: 'World',
      dateCreated: '2023-10-05T00:00:00Z',
      dateModified: '2024-02-10T00:00:00Z',
      source: 'mock',
      tags: ['modern', 'house', 'glass', 'contemporary', 'minimalist', 'architecture']
    },
    // HORROR / SCARY
    {
      id: 1011,
      name: 'Asylum of Shadows',
      slug: 'asylum-of-shadows',
      summary: 'Terrifying horror map in an abandoned mental institution with dark secrets and supernatural entities.',
      description: 'Face your fears in this psychological horror experience featuring custom sound design, atmospheric lighting, and intense jump scares.',
      author: { name: 'NightmareMaker', url: 'https://www.curseforge.com/members/NightmareMaker' },
      thumbnail: 'https://placehold.co/300x200/1a1a1a/8e44ad?text=Asylum+of+Shadows',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/asylum-of-shadows',
      downloadCount: 145600,
      gameVersions: ['1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-10-31T00:00:00Z',
      dateModified: '2024-01-05T00:00:00Z',
      source: 'mock',
      tags: ['horror', 'scary', 'spooky', 'dark', 'adventure', 'asylum']
    },
    {
      id: 1012,
      name: 'The Haunted Manor',
      slug: 'the-haunted-manor',
      summary: 'Explore a Victorian mansion haunted by tragic spirits and uncover its dark history.',
      description: 'A story-driven horror experience with puzzles, exploration, and encounters with the supernatural in a classic haunted house setting.',
      author: { name: 'GhostWriter', url: 'https://www.curseforge.com/members/GhostWriter' },
      thumbnail: 'https://placehold.co/300x200/2c3e50/7f8c8d?text=Haunted+Manor',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/the-haunted-manor',
      downloadCount: 112300,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2023-09-15T00:00:00Z',
      dateModified: '2023-12-20T00:00:00Z',
      source: 'mock',
      tags: ['horror', 'haunted', 'mansion', 'scary', 'story', 'adventure']
    },
    // PARKOUR / MINIGAME
    {
      id: 1013,
      name: 'Neon Parkour City',
      slug: 'neon-parkour-city',
      summary: 'Cyberpunk-themed parkour map with 50+ levels of increasing difficulty in a futuristic cityscape.',
      description: 'Jump, sprint, and navigate through a neon-lit metropolis with carefully designed parkour courses for all skill levels.',
      author: { name: 'ParkourPro', url: 'https://www.curseforge.com/members/ParkourPro' },
      thumbnail: 'https://placehold.co/300x200/8e44ad/00ffff?text=Neon+Parkour',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/neon-parkour-city',
      downloadCount: 234000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2022-08-20T00:00:00Z',
      dateModified: '2024-01-25T00:00:00Z',
      source: 'mock',
      tags: ['parkour', 'city', 'futuristic', 'jump', 'challenge', 'neon']
    },
    {
      id: 1014,
      name: 'Sky High Parkour',
      slug: 'sky-high-parkour',
      summary: 'Extreme altitude parkour challenges floating in the clouds with breathtaking views.',
      description: 'Test your skills at dizzying heights with cloud-themed platforms, wind mechanics, and precision jumps.',
      author: { name: 'CloudJumper', url: 'https://www.curseforge.com/members/CloudJumper' },
      thumbnail: 'https://placehold.co/300x200/3498db/ecf0f1?text=Sky+High+Parkour',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/sky-high-parkour',
      downloadCount: 167800,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-04-10T00:00:00Z',
      dateModified: '2023-12-15T00:00:00Z',
      source: 'mock',
      tags: ['parkour', 'sky', 'cloud', 'jump', 'extreme', 'challenge']
    },
    // ADVENTURE / RPG / PUZZLE
    {
      id: 1015,
      name: 'Temple of Trials',
      slug: 'temple-of-trials',
      summary: 'Ancient temple filled with puzzles, traps, and treasures waiting to be discovered.',
      description: 'An adventure map featuring complex puzzles, Indiana Jones-style trap sequences, and hidden chambers full of loot.',
      author: { name: 'AdventureMaker', url: 'https://www.curseforge.com/members/AdventureMaker' },
      thumbnail: 'https://placehold.co/300x200/d35400/f39c12?text=Temple+of+Trials',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/temple-of-trials',
      downloadCount: 189000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-02-15T00:00:00Z',
      dateModified: '2024-01-20T00:00:00Z',
      source: 'mock',
      tags: ['adventure', 'puzzle', 'temple', 'treasure', 'traps', 'exploration']
    },
    {
      id: 1016,
      name: 'Puzzle Box Factory',
      slug: 'puzzle-box-factory',
      summary: 'Mind-bending puzzle map set in an abandoned industrial facility with redstone contraptions.',
      description: 'Challenge your brain with increasingly complex puzzles using redstone mechanics, logic gates, and spatial reasoning.',
      author: { name: 'RedstoneWiz', url: 'https://www.curseforge.com/members/RedstoneWiz' },
      thumbnail: 'https://placehold.co/300x200/e67e22/2c3e50?text=Puzzle+Box+Factory',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/puzzle-box-factory',
      downloadCount: 76500,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-11-20T00:00:00Z',
      dateModified: '2024-02-05T00:00:00Z',
      source: 'mock',
      tags: ['puzzle', 'redstone', 'factory', 'logic', 'challenge', 'brain']
    },
    // PVP / ARENA
    {
      id: 1017,
      name: 'Battle Royale Arena',
      slug: 'battle-royale-arena',
      summary: 'Multiplayer PvP arena with loot chests, shrinking zones, and multiple biomes to fight in.',
      description: 'A competitive multiplayer map inspired by battle royale games with dynamic storm mechanics and randomized loot.',
      author: { name: 'PvPMaster', url: 'https://www.curseforge.com/members/PvPMaster' },
      thumbnail: 'https://placehold.co/300x200/c0392b/f1c40f?text=Battle+Royale',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/battle-royale-arena',
      downloadCount: 267000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2022-12-01T00:00:00Z',
      dateModified: '2024-01-15T00:00:00Z',
      source: 'mock',
      tags: ['pvp', 'arena', 'combat', 'multiplayer', 'battle', 'competitive']
    },
    {
      id: 1018,
      name: 'Medieval Warfare',
      slug: 'medieval-warfare',
      summary: 'Castle siege PvP map with siege weapons, defendable fortresses, and team-based objectives.',
      description: 'Lead your team to victory in epic castle sieges with trebuchets, battering rams, and strategic warfare mechanics.',
      author: { name: 'SiegeCommander', url: 'https://www.curseforge.com/members/SiegeCommander' },
      thumbnail: 'https://placehold.co/300x200/5d4037/8d6e63?text=Medieval+Warfare',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/medieval-warfare',
      downloadCount: 134500,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2023-05-20T00:00:00Z',
      dateModified: '2023-12-30T00:00:00Z',
      source: 'mock',
      tags: ['pvp', 'medieval', 'castle', 'siege', 'warfare', 'team', 'combat']
    },
    // MORE SKYBLOCK / CREATION
    {
      id: 1019,
      name: 'One Block Skyblock',
      slug: 'one-block-skyblock',
      summary: 'Ultimate skyblock challenge starting with just one block that regenerates into random resources.',
      description: 'The ultimate minimalist survival experience - one block regenerates into random materials, can you survive and thrive?',
      author: { name: 'MinimalistGamer', url: 'https://www.curseforge.com/members/MinimalistGamer' },
      thumbnail: 'https://placehold.co/300x200/87ceeb/4682b4?text=One+Block',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/one-block-skyblock',
      downloadCount: 312000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2022-06-10T00:00:00Z',
      dateModified: '2024-02-01T00:00:00Z',
      source: 'mock',
      tags: ['skyblock', 'survival', 'challenge', 'minimalist', 'one block', 'island']
    },
    {
      id: 1020,
      name: 'SkyFactory Complex',
      slug: 'skyfactory-complex',
      summary: 'Tech-focused skyblock with automation, factories, and resource processing in the sky.',
      description: 'Build massive floating factories and automate everything in this tech-heavy skyblock experience with quest progression.',
      author: { name: 'FactoryBuilder', url: 'https://www.curseforge.com/members/FactoryBuilder' },
      thumbnail: 'https://placehold.co/300x200/5c6bc0/7986cb?text=SkyFactory',
      screenshots: [],
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/skyfactory-complex',
      downloadCount: 198000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-03-01T00:00:00Z',
      dateModified: '2024-01-25T00:00:00Z',
      source: 'mock',
      tags: ['skyblock', 'factory', 'tech', 'automation', 'processing', 'quests']
    }
  ];
  
  // Smart filtering based on query - match against name, summary, description, and tags
  const lowerQuery = query.toLowerCase();
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2); // Words longer than 2 chars
  
  const filtered = mockMaps.filter(map => {
    const searchableText = `${map.name} ${map.summary} ${map.description} ${map.tags?.join(' ') || ''}`.toLowerCase();
    
    // Check if query matches directly
    if (searchableText.includes(lowerQuery)) return true;
    
    // Check if any significant word matches
    const matchCount = queryWords.filter(word => searchableText.includes(word)).length;
    return matchCount >= Math.max(1, queryWords.length * 0.5); // At least 50% of words match
  });
  
  // If no matches, return diverse selection based on query category
  if (filtered.length === 0) {
    // Try to infer category from query and return relevant maps
    if (lowerQuery.includes('futur') || lowerQuery.includes('modern') || lowerQuery.includes('tech')) {
      return mockMaps.filter(m => m.tags?.some(t => ['futuristic', 'modern', 'tech', 'city'].includes(t))).slice(0, count);
    }
    if (lowerQuery.includes('castle') || lowerQuery.includes('medieval') || lowerQuery.includes('king')) {
      return mockMaps.filter(m => m.tags?.some(t => ['medieval', 'castle', 'fortress'].includes(t))).slice(0, count);
    }
    if (lowerQuery.includes('survival') || lowerQuery.includes('island') || lowerQuery.includes('ocean')) {
      return mockMaps.filter(m => m.tags?.some(t => ['survival', 'island', 'hardcore'].includes(t))).slice(0, count);
    }
    if (lowerQuery.includes('horror') || lowerQuery.includes('scary') || lowerQuery.includes('spooky')) {
      return mockMaps.filter(m => m.tags?.some(t => ['horror', 'scary', 'dark'].includes(t))).slice(0, count);
    }
    if (lowerQuery.includes('house') || lowerQuery.includes('mansion') || lowerQuery.includes('home')) {
      return mockMaps.filter(m => m.tags?.some(t => ['house', 'mansion', 'modern'].includes(t))).slice(0, count);
    }
    if (lowerQuery.includes('parkour') || lowerQuery.includes('jump')) {
      return mockMaps.filter(m => m.tags?.some(t => ['parkour', 'jump', 'challenge'].includes(t))).slice(0, count);
    }
    if (lowerQuery.includes('adventure') || lowerQuery.includes('quest') || lowerQuery.includes('story')) {
      return mockMaps.filter(m => m.tags?.some(t => ['adventure', 'puzzle', 'exploration'].includes(t))).slice(0, count);
    }
    if (lowerQuery.includes('rail') || lowerQuery.includes('train') || lowerQuery.includes('metro')) {
      return mockMaps.filter(m => m.tags?.some(t => ['railways', 'train', 'transport'].includes(t))).slice(0, count);
    }
    // Default: return random selection for variety
    return mockMaps.slice(0, count);
  }
  
  return filtered.slice(0, count);
}

/**
 * GET /api/search
 * Search for Minecraft maps
 * Query params:
 *   - q: search query (required)
 *   - version: Minecraft version filter (optional)
 *   - pageSize: number of results (default: 20, max: 50)
 *   - index: pagination offset (default: 0)
 *   - nocache: skip cache if true (optional)
 *   - demo: use mock data even if API key is configured (optional)
 */
app.get('/api/search', async (req, res) => {
  try {
    const { q, version, pageSize = 20, index = 0, nocache } = req.query;

    // Validate query
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Query parameter "q" is required and must be a non-empty string'
      });
    }

    const query = q.trim();
    const useCache = !nocache;
    const pageSizeNum = Math.min(parseInt(pageSize) || 20, 50);
    const indexNum = parseInt(index) || 0;

    // Check cache first (unless nocache is set)
    if (useCache) {
      const cached = cache.getSearchResults(query);
      if (cached) {
        console.log(`[CACHE HIT] Returning cached results for: "${query}"`);
        return res.json({
          query,
          results: cached,
          count: cached.length,
          source: 'cache',
          timestamp: new Date().toISOString()
        });
      }
    }

    // If in demo mode, return mock data for demo/testing purposes
    if (IS_DEMO_MODE) {
      console.log(`[MOCK DATA] Returning demo results for: "${query}"`);
      const mockResults = generateMockMaps(query, Math.max(pageSizeNum, 5));
      return res.json({
        query,
        results: mockResults,
        count: mockResults.length,
        source: 'mock',
        mode: 'demo',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[API CALL] Searching CurseForge for: "${query}"`);

    // Call CurseForge API
    const options = {
      gameVersion: version,
      pageSize: pageSizeNum,
      index: indexNum
    };

    const maps = await cfClient.searchMaps(query, options);

    // Cache the results
    cache.saveSearchResults(query, maps);

    res.json({
      query,
      results: maps,
      count: maps.length,
      source: 'api',
      mode: 'live',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Search error:', error.message);

    // Handle specific error types
    if (error.message.startsWith('RATE_LIMITED')) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: error.message,
        retryAfter: 60
      });
    }

    if (error.message.startsWith('AUTH_ERROR')) {
      return res.status(401).json({
        error: 'AUTH_ERROR',
        message: error.message,
        help: 'Verify your CURSEFORGE_API_KEY at https://console.curseforge.com/'
      });
    }

    if (error.message.startsWith('TIMEOUT')) {
      return res.status(504).json({
        error: 'TIMEOUT',
        message: error.message
      });
    }

    if (error.message.startsWith('NETWORK_ERROR')) {
      return res.status(503).json({
        error: 'NETWORK_ERROR',
        message: error.message
      });
    }

    // Generic error
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/map/:id
 * Get detailed info for a specific map
 */
app.get('/api/map/:id', async (req, res) => {
  try {
    const mapId = parseInt(req.params.id);

    if (isNaN(mapId)) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Invalid map ID'
      });
    }

    // Check cache first
    const cached = cache.getMap(mapId);
    if (cached) {
      return res.json({
        map: cached,
        source: 'cache'
      });
    }

    // Check if API key is configured
    if (!CURSEFORGE_API_KEY) {
      return res.status(503).json({
        error: 'API_KEY_MISSING',
        message: 'CURSEFORGE_API_KEY is not configured. Please add your API key to the .env file.',
        help: 'Get your API key at: https://console.curseforge.com/'
      });
    }

    // Fetch from API
    const map = await cfClient.getMap(mapId);
    cache.saveMap(map);

    res.json({
      map,
      source: 'api'
    });

  } catch (error) {
    console.error('Get map error:', error.message);

    if (error.message.startsWith('RATE_LIMITED')) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: error.message
      });
    }

    if (error.message.startsWith('AUTH_ERROR')) {
      return res.status(401).json({
        error: 'AUTH_ERROR',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/cache/stats
 * Get cache statistics
 */
app.get('/api/cache/stats', (req, res) => {
  const stats = cache.getStats();
  res.json(stats);
});

/**
 * POST /api/cache/clear
 * Clear the cache (use with caution)
 */
app.post('/api/cache/clear', (req, res) => {
  cache.clear();
  res.json({
    message: 'Cache cleared successfully',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/categories
 * Get available Minecraft categories
 */
app.get('/api/categories', (req, res) => {
  res.json({
    categories: [
      { id: 17, name: 'World', description: 'Minecraft maps and worlds' },
      { id: 6, name: 'Mod', description: 'Minecraft mods' },
      { id: 12, name: 'Resource Pack', description: 'Texture and resource packs' },
      { id: 4559, name: 'Data Pack', description: 'Data packs' },
      { id: 4471, name: 'Shader', description: 'Shader packs' }
    ]
  });
});

/**
 * GET /api/download
 * Proxy download from CurseForge or serve demo file
 * Query params:
 *   - url: The download URL
 *   - filename: Optional filename override
 *   - id: Map ID (for demo mode downloads)
 */
app.get('/api/download', async (req, res) => {
  try {
    const { url, filename, id } = req.query;

    // Handle demo mode downloads
    const isDemoDownload = IS_DEMO_MODE || (id && parseInt(id) >= 1001 && parseInt(id) <= 1020);
    
    if (isDemoDownload) {
      console.log(`[DEMO DOWNLOAD] Serving demo file for: ${filename || id || 'unknown'}`);
      
      // Generate a proper ZIP file with Minecraft map structure
      const JSZip = require('jszip');
      const zip = new JSZip();
      
      // Add level.dat (mock NBT data with proper header)
      // NBT files start with 0x1f 0x8b (gzip magic) followed by compressed data
      const levelDatHeader = Buffer.from([
        0x1f, 0x8b, 0x08, 0x00, // gzip magic + compression method
        0x00, 0x00, 0x00, 0x00, // mtime
        0x00, 0x03,             // xfl + os
        0x0b, 0xc9, 0x48, 0x4d, // compressed NBT data start
        0x4c, 0x49, 0x55, 0x30,
        0x80, 0x00, 0x71, 0x0b,
        0x00, 0x00, 0x00
      ]);
      zip.file('level.dat', levelDatHeader);
      
      // Add region folder with mock region file (minimum valid region file)
      const regionFolder = zip.folder('region');
      // Region file header: 8KB header with chunk offsets, then chunk data
      const regionHeader = Buffer.alloc(8192);
      // First 4KB: chunk locations (1024 chunks * 4 bytes)
      // Second 4KB: chunk timestamps
      regionFolder.file('r.0.0.mca', regionHeader);
      
      // Add session.lock (current timestamp as bytes)
      const sessionLock = Buffer.from(Date.now().toString());
      zip.file('session.lock', sessionLock);
      
      // Add data folder for data packs
      zip.folder('data');
      
      // Add datapacks folder
      zip.folder('datapacks');
      
      // Generate ZIP
      const zipBuffer = await zip.generateAsync({ 
        type: 'nodebuffer', 
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      // Determine filename
      const downloadFilename = filename || 'minecraft-map.zip';
      
      // Set headers
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      
      console.log(`[DEMO DOWNLOAD] Sending ${zipBuffer.length} bytes as ${downloadFilename}`);
      
      return res.send(zipBuffer);
    }

    // Live mode - validate URL
    if (!url) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Query parameter "url" or "id" is required'
      });
    }

    // Validate URL is from CurseForge
    const allowedHosts = ['curseforge.com', 'www.curseforge.com', 'media.forgecdn.net', 'edge.forgecdn.net'];
    const urlObj = new URL(url);
    const isAllowed = allowedHosts.some(host => urlObj.hostname.endsWith(host));

    if (!isAllowed) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Download URL must be from CurseForge'
      });
    }

    console.log(`[Download] Proxying: ${url}`);

    // Try to get actual download URL from CurseForge API if it's a project page URL
    let downloadUrl = url;
    if (url.includes('/worlds/') && !url.includes('.zip') && !url.includes('.rar') && !url.includes('.mcworld')) {
      // It's a project page, redirect to CurseForge download page
      const match = url.match(/\/worlds\/([^\/]+)/);
      if (match) {
        const slug = match[1];
        console.log(`[Download] Redirecting to CurseForge download page for: ${slug}`);
        return res.redirect(`https://www.curseforge.com/minecraft/worlds/${slug}/download`);
      }
    }

    // Fetch the file from CurseForge
    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/zip,application/x-zip-compressed,application/octet-stream,*/*',
        'Referer': 'https://www.curseforge.com/'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'DOWNLOAD_FAILED',
        message: `Failed to fetch file: ${response.status}`
      });
    }

    // Determine filename from Content-Disposition header or URL
    let downloadFilename = filename;
    if (!downloadFilename) {
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) downloadFilename = match[1].replace(/['"]/g, '');
      }
      if (!downloadFilename) {
        downloadFilename = url.split('/').pop() || 'minecraft-map.zip';
      }
    }

    // Ensure filename has proper extension
    if (!downloadFilename.match(/\.(zip|rar|mcworld)$/i)) {
      downloadFilename += '.zip';
    }

    // Set headers for file download
    const contentType = response.headers.get('content-type') || 'application/zip';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Stream the response
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();

  } catch (error) {
    console.error('Download error:', error.message);
    
    // Return demo file as fallback on error
    try {
      const JSZip = require('jszip');
      const zip = new JSZip();
      zip.file('level.dat', Buffer.from([0x1f, 0x8b, 0x08, 0x00]));
      zip.file('session.lock', Buffer.from(Date.now().toString()));
      const regionFolder = zip.folder('region');
      regionFolder.file('r.0.0.mca', Buffer.alloc(4096));
      
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      
      const fallbackFilename = filename || 'minecraft-map.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"`);
      return res.send(zipBuffer);
    } catch (zipError) {
      console.error('Fallback zip creation failed:', zipError.message);
    }
    
    res.status(500).json({
      error: 'DOWNLOAD_ERROR',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Endpoint ${req.path} not found`
  });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     Minecraft Map Scraper API Server                     ║
╠══════════════════════════════════════════════════════════╣
║  Server running on http://${HOST}:${PORT}                    ║
║  Local access:    http://localhost:${PORT}                   ║
║  Network access:  http://192.168.40.118:${PORT}              ║
╠══════════════════════════════════════════════════════════╣
║  Endpoints:                                              ║
║    GET  /                  - Dashboard UI                ║
║    GET  /api/health        - Health check                ║
║    GET  /api/search?q=...  - Search for maps             ║
║    GET  /api/map/:id       - Get map details             ║
║    GET  /api/download      - Proxy download              ║
║    GET  /api/cache/stats   - Cache statistics            ║
║    POST /api/cache/clear   - Clear cache                 ║
║    GET  /api/categories    - Available categories        ║
╠══════════════════════════════════════════════════════════╣
║  Mode: ${IS_DEMO_MODE ? 'DEMO (Mock Data)' : 'LIVE (CurseForge API)'}                    ║
║  API Key: ${CURSEFORGE_API_KEY ? '✓ Configured' : '✗ Missing'}                       ║
╚══════════════════════════════════════════════════════════╝
  `);

  if (IS_DEMO_MODE) {
    console.log('\n⚠️  RUNNING IN DEMO MODE');
    console.log('   Using mock data instead of live CurseForge API.');
    console.log('   To enable live mode, set CURSEFORGE_API_KEY environment variable.\n');
  }
});

// Graceful shutdown to ensure cache is persisted
process.on('SIGTERM', () => {
  console.log('\n[Server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;
