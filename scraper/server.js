const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const CurseForgeClient = require('./curseforge');
const CacheManager = require('./cache');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Use environment variable only - no hardcoded fallback
// For demo mode, don't set CURSEFORGE_API_KEY and the app will use mock data
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '';

// Demo mode is only when NO API key is available
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

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * GET /health
 * Simple health check endpoint for load balancers
 */
app.get('/health', async (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
  let apiStatus;
  
  if (IS_DEMO_MODE) {
    apiStatus = { valid: false, error: 'Running in demo mode' };
  } else {
    apiStatus = await cfClient.getStatus();
  }
  
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
 */
function generateMockMaps(query, count = 10) {
  const mockMaps = [
    {
      id: 1001,
      name: 'Neo Tokyo 2088',
      slug: 'neo-tokyo-2088',
      summary: 'A futuristic cyberpunk city with high-speed magnetic railways, neon skyscrapers, and automated transport systems.',
      description: 'Experience the future in this massive cyberpunk metropolis featuring working high-speed rail networks.',
      author: { name: 'FutureBuilder', url: 'https://www.curseforge.com/members/FutureBuilder' },
      thumbnail: 'https://placehold.co/300x200/1a1a2e/00d4ff?text=Neo+Tokyo+2088',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/neo-tokyo-2088/download',
      fileInfo: { filename: 'neo-tokyo-2088.zip', filesize: 52428800 },
      downloadCount: 125400,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-08-15T00:00:00Z',
      dateModified: '2024-01-20T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1001, fileId: 10001 }
    },
    {
      id: 1002,
      name: 'SkyRail Metropolis',
      slug: 'skyrail-metropolis',
      summary: 'Modern city with elevated high-speed rail systems connecting residential, commercial, and industrial districts.',
      description: 'A functional modern city featuring an extensive network of elevated railways and subway systems.',
      author: { name: 'UrbanPlanner', url: 'https://www.curseforge.com/members/UrbanPlanner' },
      thumbnail: 'https://placehold.co/300x200/2c3e50/3498db?text=SkyRail+Metropolis',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/skyrail-metropolis/download',
      fileInfo: { filename: 'skyrail-metropolis.zip', filesize: 45875200 },
      downloadCount: 89300,
      gameVersions: ['1.20.4', '1.20.1'],
      category: 'World',
      dateCreated: '2023-11-10T00:00:00Z',
      dateModified: '2024-02-01T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1002, fileId: 10002 }
    },
    {
      id: 1003,
      name: 'HyperLoop Central',
      slug: 'hyperloop-central',
      summary: 'Futuristic transport hub with vacuum tube high-speed trains connecting multiple biomes.',
      description: 'Experience next-generation transport with vacuum-sealed hyperloop trains.',
      author: { name: 'TechArchitect', url: 'https://www.curseforge.com/members/TechArchitect' },
      thumbnail: 'https://placehold.co/300x200/0f3460/e94560?text=HyperLoop+Central',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/hyperloop-central/download',
      fileInfo: { filename: 'hyperloop-central.zip', filesize: 67108864 },
      downloadCount: 67200,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2024-01-05T00:00:00Z',
      dateModified: '2024-02-15T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1003, fileId: 10003 }
    },
    {
      id: 1004,
      name: 'Kingslanding Fortress',
      slug: 'kingslanding-fortress',
      summary: 'Epic medieval castle with towering walls, secret passages, and a grand throne room.',
      description: 'An authentic medieval fortress complete with defensive walls, a keep, stables, armory, and living quarters.',
      author: { name: 'CastleBuilder', url: 'https://www.curseforge.com/members/CastleBuilder' },
      thumbnail: 'https://placehold.co/300x200/4a3728/c9b896?text=Kingslanding+Fortress',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/kingslanding-fortress/download',
      fileInfo: { filename: 'kingslanding-fortress.zip', filesize: 35651584 },
      downloadCount: 156000,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2023-03-20T00:00:00Z',
      dateModified: '2023-12-10T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1004, fileId: 10004 }
    },
    {
      id: 1005,
      name: 'Dragonstone Citadel',
      slug: 'dragonstone-citadel',
      summary: 'Ancient castle built into a volcanic mountain, featuring dragon nests and obsidian architecture.',
      description: 'A dark and mysterious fortress carved from volcanic stone with dragon-themed architecture.',
      author: { name: 'DarkBuilder', url: 'https://www.curseforge.com/members/DarkBuilder' },
      thumbnail: 'https://placehold.co/300x200/2d1b1b/e74c3c?text=Dragonstone+Citadel',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/dragonstone-citadel/download',
      fileInfo: { filename: 'dragonstone-citadel.zip', filesize: 48234560 },
      downloadCount: 98700,
      gameVersions: ['1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-06-15T00:00:00Z',
      dateModified: '2024-01-15T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1005, fileId: 10005 }
    },
    {
      id: 1006,
      name: 'Rivendell Estate',
      slug: 'rivendell-estate',
      summary: 'Elven palace with elegant architecture, waterfalls, and lush gardens in a scenic valley.',
      description: 'A breathtaking elven sanctuary featuring flowing water features and ethereal lighting.',
      author: { name: 'ElvenArchitect', url: 'https://www.curseforge.com/members/ElvenArchitect' },
      thumbnail: 'https://placehold.co/300x200/27ae60/a8e6cf?text=Rivendell+Estate',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/rivendell-estate/download',
      fileInfo: { filename: 'rivendell-estate.zip', filesize: 39845888 },
      downloadCount: 134200,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-09-01T00:00:00Z',
      dateModified: '2024-01-30T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1006, fileId: 10006 }
    },
    {
      id: 1007,
      name: 'Stranded Deep',
      slug: 'stranded-deep',
      summary: 'Hardcore survival on a deserted tropical island with limited resources and hidden dangers.',
      description: 'Test your survival skills on this challenging island map with scarce resources.',
      author: { name: 'SurvivalExpert', url: 'https://www.curseforge.com/members/SurvivalExpert' },
      thumbnail: 'https://placehold.co/300x200/f39c12/f1c40f?text=Stranded+Deep',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/stranded-deep/download',
      fileInfo: { filename: 'stranded-deep.zip', filesize: 25165824 },
      downloadCount: 201000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2022-05-10T00:00:00Z',
      dateModified: '2023-12-01T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1007, fileId: 10007 }
    },
    {
      id: 1008,
      name: 'Arctic Survival',
      slug: 'arctic-survival',
      summary: 'Survive the frozen wilderness with limited supplies in this ice-covered archipelago.',
      description: 'Face the challenges of extreme cold, scarce food sources, and isolation.',
      author: { name: 'IceExplorer', url: 'https://www.curseforge.com/members/IceExplorer' },
      thumbnail: 'https://placehold.co/300x200/a8dadc/457b9d?text=Arctic+Survival',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/arctic-survival/download',
      fileInfo: { filename: 'arctic-survival.zip', filesize: 18874368 },
      downloadCount: 87600,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2023-01-20T00:00:00Z',
      dateModified: '2023-11-15T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1008, fileId: 10008 }
    },
    {
      id: 1009,
      name: 'Beverly Hills Mansion',
      slug: 'beverly-hills-mansion',
      summary: 'Luxurious modern mansion with pool, garage, cinema room, and stunning ocean views.',
      description: 'Live the high life in this fully furnished modern estate featuring a home theater and infinity pool.',
      author: { name: 'LuxuryLiving', url: 'https://www.curseforge.com/members/LuxuryLiving' },
      thumbnail: 'https://placehold.co/300x200/34495e/bdc3c7?text=Beverly+Hills+Mansion',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/beverly-hills-mansion/download',
      fileInfo: { filename: 'beverly-hills-mansion.zip', filesize: 42991616 },
      downloadCount: 178000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-07-15T00:00:00Z',
      dateModified: '2024-01-10T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1009, fileId: 10009 }
    },
    {
      id: 1010,
      name: 'Glass House Modern',
      slug: 'glass-house-modern',
      summary: 'Stunning contemporary home with floor-to-ceiling glass walls and minimalist design.',
      description: 'An architectural masterpiece featuring transparent walls and seamless indoor-outdoor living.',
      author: { name: 'Modernist', url: 'https://www.curseforge.com/members/Modernist' },
      thumbnail: 'https://placehold.co/300x200/95a5a6/ecf0f1?text=Glass+House',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/glass-house-modern/download',
      fileInfo: { filename: 'glass-house-modern.zip', filesize: 32505856 },
      downloadCount: 92300,
      gameVersions: ['1.20.4', '1.20.1'],
      category: 'World',
      dateCreated: '2023-10-05T00:00:00Z',
      dateModified: '2024-02-10T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1010, fileId: 10010 }
    },
    {
      id: 1011,
      name: 'Asylum of Shadows',
      slug: 'asylum-of-shadows',
      summary: 'Terrifying horror map in an abandoned mental institution with dark secrets.',
      description: 'Face your fears in this psychological horror experience with custom sound design.',
      author: { name: 'NightmareMaker', url: 'https://www.curseforge.com/members/NightmareMaker' },
      thumbnail: 'https://placehold.co/300x200/1a1a1a/8e44ad?text=Asylum+of+Shadows',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/asylum-of-shadows/download',
      fileInfo: { filename: 'asylum-of-shadows.zip', filesize: 36700160 },
      downloadCount: 145600,
      gameVersions: ['1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-10-31T00:00:00Z',
      dateModified: '2024-01-05T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1011, fileId: 10011 }
    },
    {
      id: 1012,
      name: 'The Haunted Manor',
      slug: 'the-haunted-manor',
      summary: 'Explore a Victorian mansion haunted by tragic spirits and uncover its dark history.',
      description: 'A story-driven horror experience with puzzles and encounters with the supernatural.',
      author: { name: 'GhostWriter', url: 'https://www.curseforge.com/members/GhostWriter' },
      thumbnail: 'https://placehold.co/300x200/2c3e50/7f8c8d?text=Haunted+Manor',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/the-haunted-manor/download',
      fileInfo: { filename: 'the-haunted-manor.zip', filesize: 28311552 },
      downloadCount: 112300,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2023-09-15T00:00:00Z',
      dateModified: '2023-12-20T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1012, fileId: 10012 }
    },
    {
      id: 1013,
      name: 'Neon Parkour City',
      slug: 'neon-parkour-city',
      summary: 'Cyberpunk-themed parkour map with 50+ levels of increasing difficulty.',
      description: 'Jump, sprint, and navigate through a neon-lit metropolis with carefully designed parkour courses.',
      author: { name: 'ParkourPro', url: 'https://www.curseforge.com/members/ParkourPro' },
      thumbnail: 'https://placehold.co/300x200/8e44ad/00ffff?text=Neon+Parkour',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/neon-parkour-city/download',
      fileInfo: { filename: 'neon-parkour-city.zip', filesize: 41943040 },
      downloadCount: 234000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2022-08-20T00:00:00Z',
      dateModified: '2024-01-25T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1013, fileId: 10013 }
    },
    {
      id: 1014,
      name: 'Sky High Parkour',
      slug: 'sky-high-parkour',
      summary: 'Extreme altitude parkour challenges floating in the clouds with breathtaking views.',
      description: 'Test your skills at dizzying heights with cloud-themed platforms and precision jumps.',
      author: { name: 'CloudJumper', url: 'https://www.curseforge.com/members/CloudJumper' },
      thumbnail: 'https://placehold.co/300x200/3498db/ecf0f1?text=Sky+High+Parkour',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/sky-high-parkour/download',
      fileInfo: { filename: 'sky-high-parkour.zip', filesize: 29360128 },
      downloadCount: 167800,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-04-10T00:00:00Z',
      dateModified: '2023-12-15T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1014, fileId: 10014 }
    },
    {
      id: 1015,
      name: 'Temple of Trials',
      slug: 'temple-of-trials',
      summary: 'Ancient temple filled with puzzles, traps, and treasures waiting to be discovered.',
      description: 'An adventure map featuring complex puzzles and Indiana Jones-style trap sequences.',
      author: { name: 'AdventureMaker', url: 'https://www.curseforge.com/members/AdventureMaker' },
      thumbnail: 'https://placehold.co/300x200/d35400/f39c12?text=Temple+of+Trials',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/temple-of-trials/download',
      fileInfo: { filename: 'temple-of-trials.zip', filesize: 51380224 },
      downloadCount: 189000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-02-15T00:00:00Z',
      dateModified: '2024-01-20T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1015, fileId: 10015 }
    },
    {
      id: 1016,
      name: 'Puzzle Box Factory',
      slug: 'puzzle-box-factory',
      summary: 'Mind-bending puzzle map set in an abandoned industrial facility with redstone contraptions.',
      description: 'Challenge your brain with increasingly complex puzzles using redstone mechanics.',
      author: { name: 'RedstoneWiz', url: 'https://www.curseforge.com/members/RedstoneWiz' },
      thumbnail: 'https://placehold.co/300x200/e67e22/2c3e50?text=Puzzle+Box+Factory',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/puzzle-box-factory/download',
      fileInfo: { filename: 'puzzle-box-factory.zip', filesize: 34603008 },
      downloadCount: 76500,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-11-20T00:00:00Z',
      dateModified: '2024-02-05T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1016, fileId: 10016 }
    },
    {
      id: 1017,
      name: 'Battle Royale Arena',
      slug: 'battle-royale-arena',
      summary: 'Multiplayer PvP arena with loot chests, shrinking zones, and multiple biomes.',
      description: 'A competitive multiplayer map inspired by battle royale games.',
      author: { name: 'PvPMaster', url: 'https://www.curseforge.com/members/PvPMaster' },
      thumbnail: 'https://placehold.co/300x200/c0392b/f1c40f?text=Battle+Royale',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/battle-royale-arena/download',
      fileInfo: { filename: 'battle-royale-arena.zip', filesize: 57671680 },
      downloadCount: 267000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2022-12-01T00:00:00Z',
      dateModified: '2024-01-15T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1017, fileId: 10017 }
    },
    {
      id: 1018,
      name: 'Medieval Warfare',
      slug: 'medieval-warfare',
      summary: 'Castle siege PvP map with siege weapons and defendable fortresses.',
      description: 'Lead your team to victory in epic castle sieges with trebuchets and battering rams.',
      author: { name: 'SiegeCommander', url: 'https://www.curseforge.com/members/SiegeCommander' },
      thumbnail: 'https://placehold.co/300x200/5d4037/8d6e63?text=Medieval+Warfare',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/medieval-warfare/download',
      fileInfo: { filename: 'medieval-warfare.zip', filesize: 49283072 },
      downloadCount: 134500,
      gameVersions: ['1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2023-05-20T00:00:00Z',
      dateModified: '2023-12-30T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1018, fileId: 10018 }
    },
    {
      id: 1019,
      name: 'One Block Skyblock',
      slug: 'one-block-skyblock',
      summary: 'Ultimate skyblock challenge starting with just one block that regenerates.',
      description: 'The ultimate minimalist survival experience - one block regenerates into random materials.',
      author: { name: 'MinimalistGamer', url: 'https://www.curseforge.com/members/MinimalistGamer' },
      thumbnail: 'https://placehold.co/300x200/87ceeb/4682b4?text=One+Block',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/one-block-skyblock/download',
      fileInfo: { filename: 'one-block-skyblock.zip', filesize: 10485760 },
      downloadCount: 312000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4', '1.18.2'],
      category: 'World',
      dateCreated: '2022-06-10T00:00:00Z',
      dateModified: '2024-02-01T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1019, fileId: 10019 }
    },
    {
      id: 1020,
      name: 'SkyFactory Complex',
      slug: 'skyfactory-complex',
      summary: 'Tech-focused skyblock with automation, factories, and resource processing.',
      description: 'Build massive floating factories and automate everything in this tech-heavy skyblock.',
      author: { name: 'FactoryBuilder', url: 'https://www.curseforge.com/members/FactoryBuilder' },
      thumbnail: 'https://placehold.co/300x200/5c6bc0/7986cb?text=SkyFactory',
      downloadUrl: 'https://www.curseforge.com/minecraft/worlds/skyfactory-complex/download',
      fileInfo: { filename: 'skyfactory-complex.zip', filesize: 62914560 },
      downloadCount: 198000,
      gameVersions: ['1.20.4', '1.20.1', '1.19.4'],
      category: 'World',
      dateCreated: '2023-03-01T00:00:00Z',
      dateModified: '2024-01-25T00:00:00Z',
      source: 'demo',
      curseforge: { modId: 1020, fileId: 10020 }
    }
  ];
  
  // Smart filtering based on query
  const lowerQuery = query.toLowerCase();
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
  
  const filtered = mockMaps.filter(map => {
    const searchableText = `${map.name} ${map.summary} ${map.description}`.toLowerCase();
    
    if (searchableText.includes(lowerQuery)) return true;
    
    const matchCount = queryWords.filter(word => searchableText.includes(word)).length;
    return matchCount >= Math.max(1, queryWords.length * 0.4);
  });
  
  if (filtered.length === 0) {
    // Return relevant maps based on query keywords
    if (lowerQuery.includes('futur') || lowerQuery.includes('modern') || lowerQuery.includes('tech')) {
      return mockMaps.filter(m => /futur|modern|tech|city|neon|cyber/i.test(m.name + m.summary)).slice(0, count);
    }
    if (lowerQuery.includes('castle') || lowerQuery.includes('medieval')) {
      return mockMaps.filter(m => /castle|medieval|fortress|citadel/i.test(m.name + m.summary)).slice(0, count);
    }
    if (lowerQuery.includes('survival') || lowerQuery.includes('island')) {
      return mockMaps.filter(m => /survival|island|stranded|arctic/i.test(m.name + m.summary)).slice(0, count);
    }
    if (lowerQuery.includes('horror') || lowerQuery.includes('scary')) {
      return mockMaps.filter(m => /horror|haunted|asylum|dark/i.test(m.name + m.summary)).slice(0, count);
    }
    if (lowerQuery.includes('house') || lowerQuery.includes('mansion')) {
      return mockMaps.filter(m => /house|mansion|estate|home/i.test(m.name + m.summary)).slice(0, count);
    }
    if (lowerQuery.includes('parkour')) {
      return mockMaps.filter(m => /parkour|jump/i.test(m.name + m.summary)).slice(0, count);
    }
    if (lowerQuery.includes('adventure')) {
      return mockMaps.filter(m => /adventure|temple|puzzle/i.test(m.name + m.summary)).slice(0, count);
    }
    if (lowerQuery.includes('rail') || lowerQuery.includes('train')) {
      return mockMaps.filter(m => /rail|train|metro|hyperloop/i.test(m.name + m.summary)).slice(0, count);
    }
    return mockMaps.slice(0, count);
  }
  
  return filtered.slice(0, count);
}

/**
 * GET /api/search
 * Search for Minecraft maps with natural language support
 */
app.get('/api/search', async (req, res) => {
  try {
    const { q, version, pageSize = 20, index = 0, nocache } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Query parameter "q" is required'
      });
    }

    const query = q.trim();
    const pageSizeNum = Math.min(parseInt(pageSize) || 20, 50);

    // Check cache first
    if (!nocache) {
      const cached = cache.getSearchResults(query);
      if (cached) {
        console.log(`[CACHE HIT] "${query}"`);
        return res.json({
          query,
          results: cached,
          count: cached.length,
          source: 'cache',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Demo mode - return mock data
    if (IS_DEMO_MODE) {
      console.log(`[DEMO] "${query}"`);
      const mockResults = generateMockMaps(query, pageSizeNum);
      return res.json({
        query,
        results: mockResults,
        count: mockResults.length,
        source: 'demo',
        mode: 'demo',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[API] Searching: "${query}"`);

    // Call CurseForge API
    const maps = await cfClient.searchMaps(query, {
      gameVersion: version,
      pageSize: pageSizeNum,
      index: parseInt(index) || 0
    });

    // Cache results
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

    if (error.message.startsWith('RATE_LIMITED')) {
      return res.status(429).json({ error: 'RATE_LIMITED', message: error.message, retryAfter: 60 });
    }
    if (error.message.startsWith('AUTH_ERROR')) {
      return res.status(401).json({ error: 'AUTH_ERROR', message: error.message });
    }
    if (error.message.startsWith('TIMEOUT')) {
      return res.status(504).json({ error: 'TIMEOUT', message: error.message });
    }
    if (error.message.startsWith('NETWORK_ERROR')) {
      return res.status(503).json({ error: 'NETWORK_ERROR', message: error.message });
    }

    // Fallback to demo data on error
    const mockResults = generateMockMaps(req.query.q || 'minecraft', 10);
    return res.json({
      query: req.query.q,
      results: mockResults,
      count: mockResults.length,
      source: 'demo-fallback',
      mode: 'demo',
      warning: 'API error - showing demo data',
      timestamp: new Date().toISOString()
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
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid map ID' });
    }

    // Check cache
    const cached = cache.getMap(mapId);
    if (cached) {
      return res.json({ map: cached, source: 'cache' });
    }

    // Demo mode
    if (IS_DEMO_MODE) {
      const mockMaps = generateMockMaps('all', 20);
      const mockMap = mockMaps.find(m => m.id === mapId);
      if (mockMap) {
        return res.json({ map: mockMap, source: 'demo' });
      }
    }

    if (!CURSEFORGE_API_KEY) {
      return res.status(503).json({ error: 'API_KEY_MISSING', message: 'CURSEFORGE_API_KEY not configured' });
    }

    const map = await cfClient.getMap(mapId);
    cache.saveMap(map);

    res.json({ map, source: 'api' });

  } catch (error) {
    console.error('Get map error:', error.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * GET /api/cache/stats
 * Get cache statistics
 */
app.get('/api/cache/stats', (req, res) => {
  res.json(cache.getStats());
});

/**
 * POST /api/cache/clear
 * Clear the cache
 */
app.post('/api/cache/clear', (req, res) => {
  cache.clear();
  res.json({ message: 'Cache cleared', timestamp: new Date().toISOString() });
});

/**
 * GET /api/categories
 * Get available categories
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
 * GET /api/download/:modId
 * Download endpoint - path parameter format
 * Supports: /api/download/123 or /api/download/:modId
 */
app.get('/api/download/:modId', async (req, res) => {
  // Redirect to query param format for consistent handling
  const modId = req.params.modId;
  return res.redirect(307, `/api/download?id=${modId}`);
});

/**
 * GET /api/download
 * Download endpoint - fetches map files from CurseForge
 * Supports: /api/download?id=X or /api/download?url=...
 */
app.get('/api/download', async (req, res) => {
  try {
    const { url, id, filename } = req.query;
    let mapId = null;
    
    // Validate and parse ID
    if (id !== undefined && id !== '') {
      mapId = parseInt(id);
      if (isNaN(mapId) || mapId <= 0) {
        return res.status(400).json({ 
          error: 'INVALID_ID', 
          message: 'Invalid map ID. ID must be a positive number.' 
        });
      }
    }

    // Check if demo download
    const isDemoDownload = IS_DEMO_MODE || (mapId && mapId >= 1001 && mapId <= 1020);
    
    if (isDemoDownload) {
      console.log(`[DEMO DOWNLOAD] ID: ${mapId}`);
      
      const JSZip = require('jszip');
      const zip = new JSZip();
      
      // Create minimal Minecraft world structure
      const levelDatHeader = Buffer.from([
        0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x03, 0x0b, 0xc9, 0x48, 0x4d, 0x4c, 0x49,
        0x55, 0x30, 0x80, 0x00, 0x71, 0x0b, 0x00, 0x00, 0x00
      ]);
      zip.file('level.dat', levelDatHeader);
      
      const regionFolder = zip.folder('region');
      regionFolder.file('r.0.0.mca', Buffer.alloc(8192));
      
      zip.file('session.lock', Buffer.from(Date.now().toString()));
      zip.folder('data');
      zip.folder('datapacks');
      
      zip.file('README.txt', 
        `DEMO MAP FILE\n\n` +
        `This is a demo file for testing.\n` +
        `Configure CURSEFORGE_API_KEY for real maps.\n\n` +
        `Map ID: ${mapId || 'N/A'}\n` +
        `Generated: ${new Date().toISOString()}\n`
      );
      
      const zipBuffer = await zip.generateAsync({ 
        type: 'nodebuffer', 
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      const downloadFilename = filename || `minecraft-map-${mapId || 'demo'}.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Content-Length', zipBuffer.length);
      res.setHeader('X-Demo-Mode', 'true');
      
      return res.send(zipBuffer);
    }

    // Live mode - require either url or valid id
    if (!url && !mapId) {
      return res.status(400).json({ 
        error: 'BAD_REQUEST', 
        message: 'Missing required parameter: url or id',
        usage: '/api/download?id=<map_id> or /api/download?url=<download_url>'
      });
    }

    let downloadUrl = url;
    let finalFilename = filename;

    // Get download URL from map ID if needed
    if (mapId && !url) {
      try {
        const map = await cfClient.getMap(mapId);
        if (map.downloadUrl) {
          downloadUrl = map.downloadUrl;
          finalFilename = finalFilename || `${map.slug || mapId}.zip`;
        } else if (map.curseforge?.fileId) {
          downloadUrl = await cfClient.getDownloadUrl(mapId, map.curseforge.fileId);
          finalFilename = finalFilename || `${map.slug || mapId}.zip`;
        }
      } catch (error) {
        console.error(`[Download] Failed to get map ${mapId}:`, error.message);
        if (error.message.includes('API_ERROR') || error.message.includes('404')) {
          return res.status(404).json({ 
            error: 'MAP_NOT_FOUND', 
            message: `Map ${mapId} not found`,
            id: mapId
          });
        }
        return res.status(500).json({ 
          error: 'API_ERROR', 
          message: 'Failed to fetch map details from CurseForge',
          details: error.message
        });
      }
    }

    if (!downloadUrl) {
      return res.status(404).json({ 
        error: 'DOWNLOAD_URL_NOT_FOUND', 
        message: 'Could not determine download URL for this map',
        id: mapId
      });
    }

    console.log(`[Download] Fetching: ${downloadUrl}`);

    try {
      const response = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/zip,application/x-zip-compressed,application/octet-stream,*/*',
          'Referer': 'https://www.curseforge.com/'
        },
        redirect: 'follow'
      });

      if (!response.ok) {
        // Redirect to CurseForge page as fallback
        if (mapId) {
          const redirectUrl = `https://www.curseforge.com/minecraft/worlds/${mapId}`;
          return res.redirect(redirectUrl);
        }
        return res.status(response.status).json({ 
          error: 'DOWNLOAD_FAILED', 
          message: `HTTP ${response.status}`,
          statusCode: response.status
        });
      }

      // Determine filename
      let downloadFilename = finalFilename;
      if (!downloadFilename) {
        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match) downloadFilename = match[1].replace(/['"]/g, '');
        }
        if (!downloadFilename) {
          downloadFilename = downloadUrl.split('/').pop() || 'minecraft-map.zip';
          downloadFilename = downloadFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        }
      }

      if (!downloadFilename.match(/\.(zip|rar|mcworld)$/i)) {
        downloadFilename += '.zip';
      }

      const contentType = response.headers.get('content-type') || 'application/zip';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      // Stream response
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();

    } catch (fetchError) {
      console.error(`[Download] Fetch error:`, fetchError.message);
      if (mapId) {
        return res.redirect(`https://www.curseforge.com/minecraft/worlds/${mapId}`);
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ 
      error: 'DOWNLOAD_ERROR', 
      message: 'An unexpected error occurred while processing the download',
      details: error.message 
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `Endpoint ${req.path} not found` });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     Minecraft Map Scraper API Server                     ║
╠══════════════════════════════════════════════════════════╣
║  Server running on http://${HOST}:${PORT}                    ║
╠══════════════════════════════════════════════════════════╣
║  Endpoints:                                              ║
║    GET  /                  - Dashboard UI                ║
║    GET  /api/health        - Health check                ║
║    GET  /api/search?q=...  - Search for maps (NL)        ║
║    GET  /api/map/:id       - Get map details             ║
║    GET  /api/download      - Download map                ║
║    GET  /api/cache/stats   - Cache statistics            ║
║    POST /api/cache/clear   - Clear cache                 ║
╠══════════════════════════════════════════════════════════╣
║  Mode: ${IS_DEMO_MODE ? 'DEMO (Mock Data)' : 'LIVE (CurseForge API)'}                    ║
╚══════════════════════════════════════════════════════════╝
  `);

  if (IS_DEMO_MODE) {
    console.log('\n⚠️  RUNNING IN DEMO MODE');
    console.log('   Set CURSEFORGE_API_KEY for live data.\n');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[Server] SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});

module.exports = app;
