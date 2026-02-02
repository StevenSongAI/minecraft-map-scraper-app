const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CurseForge API Key - use environment variable only (empty = demo mode with mock data)
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '';
const CURSEFORGE_BASE_URL = 'https://api.curseforge.com/v1';
const MINECRAFT_GAME_ID = 432;
const WORLDS_CLASS_ID = 17; // Minecraft Worlds/Maps category

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Natural language keyword mapping for better search
const keywordMappings = {
  // Map types
  'castle': ['castle', 'fortress', 'citadel', 'stronghold', 'palace'],
  'city': ['city', 'town', 'village', 'metropolis', 'urban'],
  'adventure': ['adventure', 'quest', 'story', 'rpg', 'campaign'],
  'survival': ['survival', 'survive', 'hardcore', 'stranded'],
  'horror': ['horror', 'scary', 'spooky', 'haunted', 'creepy'],
  'parkour': ['parkour', 'jump', 'challenge', 'obstacle'],
  'puzzle': ['puzzle', 'mystery', 'riddle', 'logic'],
  'pvp': ['pvp', 'arena', 'battle', 'combat', 'fight'],
  'modern': ['modern', 'contemporary', 'futuristic', 'scifi', 'sci-fi'],
  'medieval': ['medieval', 'fantasy', 'ancient', 'historical'],
  'redstone': ['redstone', 'mechanism', 'automatic', 'contraption'],
  'house': ['house', 'home', 'mansion', 'estate', 'building'],
  'skyblock': ['skyblock', 'sky', 'island', 'void'],
  'dungeon': ['dungeon', 'cave', 'underground', 'mines'],
  'minigame': ['minigame', 'mini-game', 'game', 'arcade']
};

// Expand natural language query to search terms
function expandQuery(query) {
  const queryLower = query.toLowerCase();
  let searchTerms = [query];
  
  for (const [key, synonyms] of Object.entries(keywordMappings)) {
    if (queryLower.includes(key)) {
      searchTerms = [...searchTerms, ...synonyms];
    }
  }
  
  return [...new Set(searchTerms)];
}

// API endpoint for natural language search
app.get('/api/search', async (req, res) => {
  const query = req.query.q || '';
  const limit = parseInt(req.query.limit) || 20;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }
  
  try {
    const searchTerms = expandQuery(query);
    const results = await searchCurseForge(searchTerms, limit);
    
    res.json({
      success: true,
      query: query,
      searchTerms: searchTerms,
      count: results.length,
      maps: results
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: 'Search failed', 
      message: error.message 
    });
  }
});

// Search CurseForge API
async function searchCurseForge(searchTerms, limit) {
  const headers = {
    'Accept': 'application/json',
    'x-api-key': CURSEFORGE_API_KEY
  };
  
  const allResults = [];
  const seenIds = new Set();
  
  // Search with each term and combine results
  for (const term of searchTerms.slice(0, 3)) {
    try {
      const params = new URLSearchParams({
        gameId: MINECRAFT_GAME_ID.toString(),
        classId: WORLDS_CLASS_ID.toString(),
        searchFilter: term,
        pageSize: Math.min(limit * 2, 50).toString(),
        sortField: '2', // Popularity
        sortOrder: 'desc'
      });
      
      const response = await fetch(`${CURSEFORGE_BASE_URL}/mods/search?${params}`, {
        headers,
        timeout: 30000
      });
      
      if (!response.ok) {
        console.warn(`CurseForge API error for term "${term}": ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.data) {
        for (const mod of data.data) {
          if (!seenIds.has(mod.id)) {
            seenIds.add(mod.id);
            allResults.push(transformModToMap(mod));
          }
        }
      }
    } catch (err) {
      console.warn(`Error searching for term "${term}":`, err.message);
    }
  }
  
  // If no results from API, return mock data for demo
  if (allResults.length === 0) {
    return getMockMaps().filter(m => 
      searchTerms.some(term => 
        m.title.toLowerCase().includes(term.toLowerCase()) ||
        m.description.toLowerCase().includes(term.toLowerCase()) ||
        m.tags.some(tag => tag.toLowerCase().includes(term.toLowerCase()))
      )
    ).slice(0, limit);
  }
  
  return allResults.slice(0, limit);
}

// Transform CurseForge mod data to map format
function transformModToMap(mod) {
  const latestFile = mod.latestFiles && mod.latestFiles[0];
  
  return {
    id: mod.id,
    title: mod.name,
    author: mod.authors && mod.authors[0] ? mod.authors[0].name : 'Unknown',
    description: mod.summary || 'No description available',
    url: `https://www.curseforge.com/minecraft/worlds/${mod.slug}`,
    downloadUrl: latestFile ? latestFile.downloadUrl : null,
    thumbnail: mod.logo ? mod.logo.url : 'https://via.placeholder.com/280x160?text=No+Image',
    downloads: mod.downloadCount || 0,
    likes: mod.thumbsUpCount || 0,
    category: mod.classId === WORLDS_CLASS_ID ? 'World' : 'Map',
    version: latestFile ? latestFile.gameVersions.join(', ') : 'Unknown',
    tags: mod.categories ? mod.categories.map(c => c.name) : [],
    source: 'CurseForge',
    createdAt: mod.dateCreated,
    updatedAt: mod.dateModified
  };
}

// Get download URL for a specific map
app.get('/api/download/:modId', async (req, res) => {
  const modId = req.params.modId;
  
  try {
    const headers = {
      'Accept': 'application/json',
      'x-api-key': CURSEFORGE_API_KEY
    };
    
    const response = await fetch(`${CURSEFORGE_BASE_URL}/mods/${modId}/files`, {
      headers
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      return res.status(404).json({ error: 'No files found' });
    }
    
    // Get the latest file with download URL
    const latestFile = data.data[0];
    
    res.json({
      success: true,
      modId: modId,
      downloadUrl: latestFile.downloadUrl,
      fileName: latestFile.fileName,
      fileSize: latestFile.fileLength,
      version: latestFile.gameVersions.join(', ')
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to get download URL' });
  }
});

// Mock data for fallback
function getMockMaps() {
  return [
    {
      id: 1,
      title: "Epic Medieval Castle",
      author: "CastleBuilder99",
      description: "A massive medieval castle with dungeons, throne room, and secret passages. Perfect for roleplay servers!",
      url: "https://www.curseforge.com/minecraft/worlds/epic-medieval-castle",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/epic-medieval-castle/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Medieval+Castle",
      downloads: 125000,
      likes: 8500,
      category: "Castle",
      version: "1.20.1",
      tags: ["castle", "medieval", "roleplay"],
      source: "CurseForge"
    },
    {
      id: 2,
      title: "Futuristic City 2099",
      author: "FutureCraft",
      description: "A sprawling futuristic city with skyscrapers, flying cars, and high-speed railway systems.",
      url: "https://www.curseforge.com/minecraft/worlds/futuristic-city-2099",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/futuristic-city-2099/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Futuristic+City",
      downloads: 89000,
      likes: 6200,
      category: "City",
      version: "1.19.4",
      tags: ["city", "futuristic", "modern", "railway"],
      source: "CurseForge"
    },
    {
      id: 3,
      title: "Horror Mansion Adventure",
      author: "ScaryMaps",
      description: "A terrifying horror adventure map with jumpscares, puzzles, and a dark story to uncover.",
      url: "https://www.curseforge.com/minecraft/worlds/horror-mansion-adventure",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/horror-mansion-adventure/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Horror+Mansion",
      downloads: 67000,
      likes: 4800,
      category: "Adventure",
      version: "1.20.2",
      tags: ["horror", "adventure", "puzzle"],
      source: "CurseForge"
    },
    {
      id: 4,
      title: "Skyblock Survival Challenge",
      author: "SkyMaster",
      description: "Classic skyblock survival with custom islands, shops, and challenges. Can you survive?",
      url: "https://www.curseforge.com/minecraft/worlds/skyblock-survival-challenge",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/skyblock-survival-challenge/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Skyblock",
      downloads: 210000,
      likes: 15200,
      category: "Survival",
      version: "1.20.1",
      tags: ["survival", "skyblock", "challenge"],
      source: "CurseForge"
    },
    {
      id: 5,
      title: "Redstone Mansion",
      author: "RedstoneWizard",
      description: "Modern mansion with fully functional redstone systems - automated doors, lights, security!",
      url: "https://www.curseforge.com/minecraft/worlds/redstone-mansion",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/redstone-mansion/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Redstone+Mansion",
      downloads: 95000,
      likes: 7100,
      category: "Redstone",
      version: "1.20.4",
      tags: ["redstone", "modern", "mansion", "automatic"],
      source: "CurseForge"
    },
    {
      id: 6,
      title: "Parkour Paradise",
      author: "JumpMaster",
      description: "50+ challenging parkour levels with checkpoints, timers, and leaderboards.",
      url: "https://www.curseforge.com/minecraft/worlds/parkour-paradise",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/parkour-paradise/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Parkour",
      downloads: 180000,
      likes: 12500,
      category: "Parkour",
      version: "1.19.2",
      tags: ["parkour", "challenge", "minigame"],
      source: "CurseForge"
    },
    {
      id: 7,
      title: "Ancient Dungeon Crawler",
      author: "DungeonMaster",
      description: "Explore ancient dungeons, fight bosses, find legendary loot in this RPG adventure map.",
      url: "https://www.curseforge.com/minecraft/worlds/ancient-dungeon-crawler",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/ancient-dungeon-crawler/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Dungeon",
      downloads: 78000,
      likes: 5900,
      category: "Adventure",
      version: "1.20.1",
      tags: ["dungeon", "adventure", "rpg", "combat"],
      source: "CurseForge"
    },
    {
      id: 8,
      title: "Modern Beach House",
      author: "BeachBuilder",
      description: "Stunning modern beach house with ocean views, infinity pool, and luxury interiors.",
      url: "https://www.curseforge.com/minecraft/worlds/modern-beach-house",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/modern-beach-house/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Beach+House",
      downloads: 56000,
      likes: 4200,
      category: "House",
      version: "1.19.4",
      tags: ["house", "modern", "beach"],
      source: "CurseForge"
    },
    {
      id: 9,
      title: "PvP Arena Wars",
      author: "CombatKing",
      description: "Multiplayer PvP arena with multiple game modes: capture the flag, team deathmatch, free-for-all.",
      url: "https://www.curseforge.com/minecraft/worlds/pvp-arena-wars",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/pvp-arena-wars/download",
      thumbnail: "https://via.placeholder.com/280x160?text=PvP+Arena",
      downloads: 112000,
      likes: 8300,
      category: "PvP",
      version: "1.20.2",
      tags: ["pvp", "arena", "combat", "multiplayer"],
      source: "CurseForge"
    },
    {
      id: 10,
      title: "Puzzle Master Collection",
      author: "PuzzleGenius",
      description: "25 mind-bending puzzles that will test your logic and problem-solving skills.",
      url: "https://www.curseforge.com/minecraft/worlds/puzzle-master-collection",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/puzzle-master-collection/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Puzzles",
      downloads: 45000,
      likes: 3800,
      category: "Puzzle",
      version: "1.19.3",
      tags: ["puzzle", "logic", "challenge"],
      source: "CurseForge"
    },
    {
      id: 11,
      title: "Fantasy RPG World",
      author: "FantasyCraft",
      description: "Complete fantasy world with quests, NPCs, custom items, and an epic storyline.",
      url: "https://www.curseforge.com/minecraft/worlds/fantasy-rpg-world",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/fantasy-rpg-world/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Fantasy+RPG",
      downloads: 145000,
      likes: 10200,
      category: "Adventure",
      version: "1.20.1",
      tags: ["fantasy", "rpg", "adventure", "medieval"],
      source: "CurseForge"
    },
    {
      id: 12,
      title: "Survival Island Hardcore",
      author: "IslandSurvivor",
      description: "Stranded on an island with limited resources. Survive and thrive in this hardcore challenge!",
      url: "https://www.curseforge.com/minecraft/worlds/survival-island-hardcore",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/survival-island-hardcore/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Survival+Island",
      downloads: 82000,
      likes: 6100,
      category: "Survival",
      version: "1.20.4",
      tags: ["survival", "island", "hardcore", "challenge"],
      source: "CurseForge"
    },
    {
      id: 13,
      title: "Mega Minigame Hub",
      author: "GameMaster",
      description: "20+ minigames in one map: spleef, bedwars, skywars, hide and seek, and more!",
      url: "https://www.curseforge.com/minecraft/worlds/mega-minigame-hub",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/mega-minigame-hub/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Minigames",
      downloads: 195000,
      likes: 14800,
      category: "Minigame",
      version: "1.19.4",
      tags: ["minigame", "multiplayer", "arcade"],
      source: "CurseForge"
    },
    {
      id: 14,
      title: "Underwater City Atlantis",
      author: "AtlantisBuilder",
      description: "Explore the lost city of Atlantis with underwater structures, tunnels, and marine life.",
      url: "https://www.curseforge.com/minecraft/worlds/underwater-city-atlantis",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/underwater-city-atlantis/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Atlantis",
      downloads: 67000,
      likes: 5200,
      category: "City",
      version: "1.20.2",
      tags: ["city", "underwater", "adventure"],
      source: "CurseForge"
    },
    {
      id: 15,
      title: "Haunted Asylum Horror",
      author: "NightmareMaps",
      description: "The scariest Minecraft horror map ever made. Not for the faint of heart!",
      url: "https://www.curseforge.com/minecraft/worlds/haunted-asylum-horror",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/haunted-asylum-horror/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Haunted+Asylum",
      downloads: 134000,
      likes: 9200,
      category: "Horror",
      version: "1.20.1",
      tags: ["horror", "scary", "adventure", "spooky"],
      source: "CurseForge"
    },
    {
      id: 16,
      title: "Japanese Village",
      author: "ZenBuilder",
      description: "Beautiful Japanese village with temples, gardens, cherry blossoms, and traditional architecture.",
      url: "https://www.curseforge.com/minecraft/worlds/japanese-village",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/japanese-village/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Japanese+Village",
      downloads: 72000,
      likes: 5800,
      category: "Village",
      version: "1.19.3",
      tags: ["village", "japanese", "asian", "peaceful"],
      source: "CurseForge"
    },
    {
      id: 17,
      title: "Space Station Alpha",
      author: "SpaceCraft",
      description: "Live among the stars in this detailed space station with zero-gravity sections and more!",
      url: "https://www.curseforge.com/minecraft/worlds/space-station-alpha",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/space-station-alpha/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Space+Station",
      downloads: 58000,
      likes: 4600,
      category: "Sci-Fi",
      version: "1.20.1",
      tags: ["scifi", "space", "futuristic", "modern"],
      source: "CurseForge"
    },
    {
      id: 18,
      title: "Treasure Island Adventure",
      author: "PirateMaps",
      description: "Follow the map, find the treasure, avoid the traps! Pirate-themed adventure map.",
      url: "https://www.curseforge.com/minecraft/worlds/treasure-island-adventure",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/treasure-island-adventure/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Treasure+Island",
      downloads: 91000,
      likes: 7200,
      category: "Adventure",
      version: "1.19.4",
      tags: ["adventure", "pirate", "treasure", "island"],
      source: "CurseForge"
    },
    {
      id: 19,
      title: "Factory Redstone Complex",
      author: "RedstoneEngineer",
      description: "Massive factory with automated crafting, sorting, and item transportation systems.",
      url: "https://www.curseforge.com/minecraft/worlds/factory-redstone-complex",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/factory-redstone-complex/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Redstone+Factory",
      downloads: 48000,
      likes: 3900,
      category: "Redstone",
      version: "1.20.2",
      tags: ["redstone", "automatic", "factory", "technical"],
      source: "CurseForge"
    },
    {
      id: 20,
      title: "Medieval Kingdom Wars",
      author: "KingdomCraft",
      description: "Large-scale medieval kingdom with castles, villages, and PvP warfare mechanics.",
      url: "https://www.curseforge.com/minecraft/worlds/medieval-kingdom-wars",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/medieval-kingdom-wars/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Medieval+Kingdom",
      downloads: 156000,
      likes: 11500,
      category: "PvP",
      version: "1.20.1",
      tags: ["medieval", "pvp", "castle", "kingdom", "war"],
      source: "CurseForge"
    }
  ];
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    apiConfigured: !!CURSEFORGE_API_KEY
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Minecraft Map Scraper Server running on port ${PORT}`);
  console.log(`API Key configured: ${CURSEFORGE_API_KEY ? 'Yes' : 'No'}`);
});
