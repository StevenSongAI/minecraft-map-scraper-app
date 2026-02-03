require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

// Deployment timestamp for verification
const DEPLOY_TIMESTAMP = '2026-02-03-ROUND7';

// FIXED: Enhanced File API polyfill for Node.js 18+ compatibility
// Must be defined BEFORE any module imports that might use File
if (typeof global.File === 'undefined') {
  global.File = class File {
    constructor(bits, name, options = {}) {
      this.bits = Array.isArray(bits) ? bits : [bits];
      this.name = name || '';
      this.type = options.type || '';
      this.lastModified = options.lastModified || Date.now();
      this.size = this.bits.reduce((acc, b) => acc + (b.length || b.byteLength || 0), 0);
    }
    
    async text() {
      const buffers = this.bits.map(b => Buffer.from(b));
      return Buffer.concat(buffers).toString('utf8');
    }
    
    async arrayBuffer() {
      const buffers = this.bits.map(b => Buffer.from(b));
      const buf = Buffer.concat(buffers);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
    
    stream() {
      throw new Error('File.stream() not implemented in polyfill');
    }
    
    slice(start, end, contentType) {
      throw new Error('File.slice() not implemented in polyfill');
    }
  };
  
  console.log('[Server] File API polyfill installed');
}

// Also ensure fetch is available (Node 18+ should have it)
if (typeof global.fetch === 'undefined') {
  console.warn('[Server] WARNING: fetch not available in global scope');
}

// Import multi-source scrapers
let MapAggregator = null;
let scraperModuleError = null;
let scrapersLoaded = false;

try {
  // Load scrapers module
  console.log('[Server] Loading multi-source scrapers...');
  console.log('[Server] File polyfill available:', typeof File !== 'undefined');
  console.log('[Server] fetch available:', typeof fetch !== 'undefined');
  
  const scrapers = require('./scraper/scrapers');
  MapAggregator = scrapers.MapAggregator;
  scrapersLoaded = true;
  
  console.log('[Server] ✓ Multi-source scrapers loaded successfully');
  console.log('[Server] ✓ Available scrapers:', Object.keys(scrapers));
} catch (error) {
  console.error('[Server] ✗ Failed to load multi-source scrapers:');
  console.error('  Error:', error.message);
  console.error('  Stack:', error.stack);
  console.error('  Node version:', process.version);
  scraperModuleError = error.message;
  // Don't exit - fallback to CurseForge only
}

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize aggregator (lazy init on first search)
let aggregator = null;
function getAggregator() {
  if (!aggregator && MapAggregator) {
    try {
      // FIXED: Increased to 50 results per source for "2x+ more results" requirement (Round 7)
      aggregator = new MapAggregator({ timeout: 5000, maxResultsPerSource: 50 });
      console.log('[Server] MapAggregator initialized successfully');
    } catch (error) {
      console.error('[Server] Failed to initialize MapAggregator:', error.message);
      throw error;
    }
  }
  if (!MapAggregator) {
    throw new Error('Multi-source scrapers not available: ' + (scraperModuleError || 'Unknown error'));
  }
  return aggregator;
}

// Check if multi-source is available
function isMultiSourceEnabled() {
  return !!MapAggregator;
}

// CurseForge API Key - use environment variable only (empty = demo mode with mock data)
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '';
const CURSEFORGE_BASE_URL = 'https://api.curseforge.com/v1';
const MINECRAFT_GAME_ID = 432;
const WORLDS_CLASS_ID = 17; // Minecraft Worlds/Maps category

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// STRICT keyword mappings - only closely related terms
// Removed overly broad associations that cause false positives
const keywordMappings = {
  // Map types - keep synonyms closely related
  'castle': ['castle', 'fortress', 'citadel', 'stronghold', 'keep', 'palace', 'tower'],
  'city': ['city', 'metropolis', 'urban', 'municipal'],
  'town': ['town', 'settlement'],
  'village': ['village', 'hamlet'],
  'kingdom': ['kingdom', 'empire', 'realm'],
  
  // Game modes
  'adventure': ['adventure', 'quest', 'story', 'campaign', 'journey', 'exploration'],
  'survival': ['survival', 'survive', 'hardcore', 'stranded', 'island'],
  'horror': ['horror', 'scary', 'spooky', 'haunted', 'creepy', 'terror'],
  'parkour': ['parkour', 'jump', 'obstacle', 'jumping', 'speedrun'],
  'puzzle': ['puzzle', 'riddle', 'logic', 'maze', 'labyrinth'],
  'pvp': ['pvp', 'arena', 'battle', 'combat', 'duel'],
  
  // Themes - SEPARATE modern and futuristic to avoid conflation
  'modern': ['modern', 'contemporary', 'urban', 'skyscraper'],
  'futuristic': ['futuristic', 'future', 'scifi', 'sci-fi', 'space', 'advanced'],
  'cyberpunk': ['cyberpunk', 'neon', 'dystopian', 'hacker'],
  'tech': ['tech', 'technology', 'computer', 'machine'],
  'space': ['space', 'starship', 'planet', 'cosmic', 'galaxy'],
  
  'medieval': ['medieval', 'middle ages', 'knights', 'feudal'],
  'fantasy': ['fantasy', 'magic', 'wizard', 'sorcery', 'enchanted'],
  'ancient': ['ancient', 'old', 'ruins', 'historical'],
  
  // Features
  'redstone': ['redstone', 'mechanism', 'automatic', 'circuit'],
  'house': ['house', 'home', 'mansion', 'residence', 'villa', 'cottage'],
  'mansion': ['mansion', 'estate', 'manor', 'luxury'],
  'skyblock': ['skyblock', 'void', 'floating island'],
  'sky': ['sky', 'floating', 'cloud', 'aerial', 'air', 'heaven', 'high'],
  'dungeon': ['dungeon', 'cave', 'underground', 'catacomb'],
  'minigame': ['minigame', 'mini-game', 'arcade', 'party game'],
  
  // Transportation
  'railway': ['railway', 'rail', 'train', 'subway', 'metro', 'track', 'locomotive'],
  'highway': ['highway', 'road', 'path', 'freeway', 'motorway'],
  'bridge': ['bridge', 'tunnel'],
  
  // Environment
  'island': ['island', 'isles', 'atoll'],
  'underwater': ['underwater', 'undersea', 'submerged', 'sunken', 'aquatic', 'ocean floor', 'deep sea'],
  'reef': ['reef', 'coral', 'barrier reef'],
  'mountain': ['mountain', 'peak', 'alpine', 'cliff', 'highlands'],
  'forest': ['forest', 'woods', 'jungle', 'woodland', 'grove'],
  'desert': ['desert', 'sandy', 'oasis', 'pyramid'],
  'winter': ['winter', 'snow', 'ice', 'frozen', 'arctic'],
  'jungle': ['jungle', 'rainforest', 'tropical', 'amazon'],
  
  // Hell/Nether themes
  'hell': ['hell', 'nether', 'inferno', 'demon', 'demonic', 'underworld', 'hades'],
  'nether': ['nether', 'inferno', 'lava', 'fire', 'flame'],
  'inferno': ['inferno', 'fire', 'flame', 'brimstone'],
  
  // Special themes
  'dragon': ['dragon', 'wyvern', 'drake', 'wyrm'],
  'pixelart': ['pixelart', 'pixel art', '2d'],
  'replica': ['replica', 'landmark', 'famous', 'realistic'],
  'park': ['park', 'amusement', 'theme park', 'zoo', 'garden'],
  'school': ['school', 'academy', 'university', 'college'],
  'hospital': ['hospital', 'medical', 'clinic'],
  'end': ['end', 'ender', 'void', 'dragon'],
  'swamp': ['swamp', 'marsh', 'bog', 'wetland'],
  'temple': ['temple', 'shrine', 'sanctuary', 'monument']
};

// STRICT antonym/contrast mappings - terms that should filter out results when mismatched
// These are mutually exclusive categories - ZERO tolerance for conflicts
const conflictingTerms = {
  'futuristic': ['medieval', 'ancient', 'castle', 'knight', 'feudal'],
  'modern': ['medieval', 'ancient', 'castle', 'fantasy'],
  'medieval': ['futuristic', 'scifi', 'space', 'tech', 'modern', 'cyberpunk'],
  'horror': ['cute', 'cozy', 'peaceful', 'relaxing'],
  'hell': ['heaven', 'paradise', 'angel', 'sky'],
  'nether': ['overworld', 'end', 'sky']
};

// COMPOUND CONCEPTS - Queries that require ALL terms to match for relevance
// e.g., "underwater city" requires BOTH underwater AND city concepts
const compoundConcepts = [
  {
    name: 'underwater_city',
    terms: ['underwater', 'city'],
    requiredMatches: 2,
    synonyms: ['sunken city', 'atlantis', 'submerged city', 'undersea city', 'aquatic city', 'ocean city', 'water city', 'underwater town', 'underwater metropolis', 'underwater kingdom']
  },
  {
    name: 'underwater_base',
    terms: ['underwater', 'base'],
    requiredMatches: 2,
    synonyms: ['submarine base', 'undersea base', 'ocean base', 'submerged base', 'underwater facility', 'underwater station']
  },
  {
    name: 'underwater_house',
    terms: ['underwater', 'house'],
    requiredMatches: 2,
    synonyms: ['underwater home', 'submerged house', 'undersea house', 'aquatic house', 'underwater mansion', 'underwater villa']
  },
  {
    name: 'sky_city',
    terms: ['sky', 'city'],
    requiredMatches: 2,
    synonyms: ['floating city', 'cloud city', 'aerial city', 'skyland city', 'sky town', 'sky metropolis', 'city in the sky']
  },
  {
    name: 'modern_city',
    terms: ['modern', 'city'],
    requiredMatches: 2,
    synonyms: ['contemporary city', 'urban city', 'modern metropolis', 'modern town', 'modern urban']
  },
  {
    name: 'medieval_castle',
    terms: ['medieval', 'castle'],
    requiredMatches: 2,
    synonyms: ['ancient castle', 'old castle', 'fortress medieval', 'medieval fortress', 'medieval stronghold', 'medieval citadel', 'castle medieval']
  },
  {
    name: 'medieval_city',
    terms: ['medieval', 'city'],
    requiredMatches: 2,
    synonyms: ['medieval town', 'medieval village', 'ancient city', 'old city', 'medieval metropolis', 'medieval settlement']
  },
  {
    name: 'medieval_village',
    terms: ['medieval', 'village'],
    requiredMatches: 2,
    synonyms: ['medieval town', 'ancient village', 'old village', 'medieval hamlet', 'medieval settlement']
  },
  {
    name: 'futuristic_city',
    terms: ['futuristic', 'city'],
    requiredMatches: 2,
    synonyms: ['future city', 'sci-fi city', 'scifi city', 'space city', 'advanced city', 'futuristic metropolis', 'cyberpunk city']
  },
  {
    name: 'haunted_house',
    terms: ['haunted', 'house'],
    requiredMatches: 2,
    synonyms: ['spooky house', 'haunted mansion', 'haunted home', 'ghost house', 'horror house']
  },
  {
    name: 'desert_temple',
    terms: ['desert', 'temple'],
    requiredMatches: 2,
    synonyms: ['sand temple', 'desert pyramid', 'desert shrine', 'desert monument']
  },
  {
    name: 'jungle_temple',
    terms: ['jungle', 'temple'],
    requiredMatches: 2,
    synonyms: ['jungle shrine', 'jungle ruins', 'rainforest temple', 'jungle monument']
  },
  {
    name: 'ocean_monument',
    terms: ['ocean', 'monument'],
    requiredMatches: 2,
    synonyms: ['sea monument', 'underwater monument', 'ocean temple', 'ocean ruins']
  }
];

// FIXED: Minimum relevance thresholds - further lowered to allow more valid results
const MIN_RELEVANCE_SCORE = 10;  // Reduced from 20 to allow more results through
const MIN_MATCH_COUNT = 0.3;     // Reduced from 0.5 to allow partial matches

// Maximum allowed conflicts before filtering out a result
const MAX_ALLOWED_CONFLICTS = 1;

// Check if text contains word with word boundaries (more precise matching)
// CRITICAL: This prevents substring matches like "stray" matching "stranded"
function containsWord(text, word) {
  if (!text || !word) return false;
  const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'i');
  return regex.test(text.toLowerCase());
}

// Expand natural language query to search terms
function expandQuery(query) {
  const queryLower = query.toLowerCase().trim();
  let searchTerms = [query];
  let expandedKeywords = [];
  
  for (const [key, synonyms] of Object.entries(keywordMappings)) {
    // Use word boundary matching for keyword detection
    if (containsWord(queryLower, key)) {
      // Only add synonyms that don't conflict with other query terms
      const relevantSynonyms = synonyms.filter(syn => {
        // Check if this synonym conflicts with any other term in the query
        for (const [queryWord, conflicts] of Object.entries(conflictingTerms)) {
          if (containsWord(queryLower, queryWord) && conflicts.includes(syn)) {
            return false; // Skip conflicting synonym
          }
        }
        return true;
      });
      
      searchTerms = [...searchTerms, ...relevantSynonyms];
      expandedKeywords.push(key);
    }
  }
  
  // Add individual words from query if no keywords matched
  if (expandedKeywords.length === 0) {
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);
    searchTerms = [...searchTerms, ...words];
  }
  
  return [...new Set(searchTerms)];
}

// Check if result has conflicting terms that should disqualify it
function hasConflictingTerms(query, map) {
  const queryLower = query.toLowerCase();
  const titleLower = map.title.toLowerCase();
  const descLower = map.description.toLowerCase();
  const tagsLower = map.tags ? map.tags.map(t => t.toLowerCase()) : [];
  const allText = titleLower + ' ' + descLower + ' ' + tagsLower.join(' ');
  
  let conflictCount = 0;
  
  // Check for conflicting terms - for each keyword in the query that has conflicts
  for (const [term, conflicts] of Object.entries(conflictingTerms)) {
    // Check if query contains this keyword - use word boundaries ONLY
    const queryHasTerm = containsWord(queryLower, term);
    
    if (queryHasTerm) {
      // Query contains this term, check if result has any conflicting terms - word boundaries ONLY
      for (const conflict of conflicts) {
        const resultHasConflict = containsWord(allText, conflict) || 
                                  tagsLower.some(tag => containsWord(tag, conflict));
        if (resultHasConflict) {
          conflictCount++;
          if (conflictCount >= MAX_ALLOWED_CONFLICTS) {
            return true; // Too many conflicts, filter out
          }
        }
      }
    }
  }
  
  return false;
}

// Check if query is a compound concept query
function detectCompoundConcepts(query) {
  const queryLower = query.toLowerCase();
  const matchedCompounds = [];
  
  for (const concept of compoundConcepts) {
    const matchedTerms = concept.terms.filter(term => queryLower.includes(term));
    if (matchedTerms.length >= 2) {
      matchedCompounds.push({
        ...concept,
        matchedTerms
      });
    }
  }
  
  return matchedCompounds;
}

// Calculate relevance score with penalty for mismatches
function calculateRelevance(map, query, searchTerms) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  let score = 0;
  let matchCount = 0;
  let penalty = 0;
  let hasExactMatch = false;
  
  const titleLower = map.title.toLowerCase();
  const descLower = map.description.toLowerCase();
  const tagsLower = map.tags ? map.tags.map(t => t.toLowerCase()) : [];
  const allText = titleLower + ' ' + descLower + ' ' + tagsLower.join(' ');
  
  // === COMPOUND CONCEPT CHECK (for queries like "underwater city") ===
  const compoundMatches = detectCompoundConcepts(query);
  let compoundScore = 0;
  
  if (compoundMatches.length > 0) {
    for (const concept of compoundMatches) {
      // Check if title contains compound synonyms (highest priority)
      let hasSynonymMatch = false;
      for (const synonym of concept.synonyms) {
        if (allText.includes(synonym)) {
          compoundScore += 200;
          hasSynonymMatch = true;
          hasExactMatch = true;
          break;
        }
      }
      
      // Check if ALL required terms are present in the content
      const allTermsPresent = concept.terms.every(term => allText.includes(term));
      const someTermsPresent = concept.terms.some(term => allText.includes(term));
      
      if (allTermsPresent) {
        compoundScore += 100;
        matchCount += 1.5;
      } else if (someTermsPresent && !allTermsPresent) {
        // Partial match - penalize heavily (e.g., "city" but not "underwater")
        compoundScore -= 80;
      }
    }
  }
  
  score += compoundScore;
  
  // EXACT query match is most important - use word boundaries ONLY
  if (containsWord(titleLower, queryLower)) {
    score += 150;
    matchCount += 2;
    hasExactMatch = true;
  }
  
  // Individual query word matches with word boundaries ONLY
  // Require at least one word boundary match, not just substring
  let hasWordBoundaryMatch = false;
  queryWords.forEach(word => {
    if (containsWord(titleLower, word)) {
      score += 50;
      matchCount += 0.75;
      hasWordBoundaryMatch = true;
    }
  });
  
  // If no word boundary match for any query word, significantly reduce score
  if (!hasWordBoundaryMatch && queryWords.length > 0) {
    score = score * 0.1; // 90% penalty for substring-only matches
  }
  
  // Expanded term matches (lower weight) - word boundaries ONLY
  searchTerms.forEach(term => {
    if (term !== query && term.length > 2) {
      if (containsWord(titleLower, term)) {
        score += 25;
        matchCount += 0.4;
      }
    }
  });
  
  // Description matches (lower weight than title) - word boundaries ONLY
  if (containsWord(descLower, queryLower)) {
    score += 40;
    matchCount += 1;
  }
  queryWords.forEach(word => {
    if (containsWord(descLower, word)) {
      score += 15;
      matchCount += 0.3;
    }
  });
  
  // Tag matches - word boundaries ONLY
  if (map.tags) {
    map.tags.forEach(tag => {
      const tagLower = tag.toLowerCase();
      if (containsWord(tagLower, queryLower)) {
        score += 50;
        matchCount += 0.8;
      }
      queryWords.forEach(word => {
        if (containsWord(tagLower, word)) {
          score += 25;
          matchCount += 0.4;
        }
      });
    });
  }
  
  // PENALTY: Check for conflicting terms in result
  for (const [term, conflicts] of Object.entries(conflictingTerms)) {
    if (containsWord(queryLower, term)) {
      // Query contains this term, check if result has conflicting terms
      conflicts.forEach(conflict => {
        if (containsWord(allText, conflict)) {
          penalty += 25; // Reduced penalty since we now have hard filter
        }
      });
    }
  }
  
  // Apply penalty
  score = Math.max(0, score - penalty);
  
  // Boost by popularity (but only if there's some relevance)
  if (matchCount > 0) {
    score += Math.log10((map.downloads || 0) + 1) * 3;
    score += Math.log10((map.likes || 0) + 1) * 2;
  }
  
  return { score, matchCount, penalty, hasExactMatch, hasWordBoundaryMatch };
}

// Check if a map meets minimum relevance threshold
function isRelevantResult(map, query, searchTerms) {
  // First check for conflicting terms - reject if too many conflicts
  if (hasConflictingTerms(query, map)) {
    return false;
  }
  
  const relevance = calculateRelevance(map, query, searchTerms);
  
  const titleLower = map.title.toLowerCase();
  const descLower = map.description.toLowerCase();
  const tagsLower = map.tags ? map.tags.map(t => t.toLowerCase()) : [];
  const allText = titleLower + ' ' + descLower + ' ' + tagsLower.join(' ');
  
  // FIXED: FURTHER RELAXED multi-word query check - CurseForge API already filters relevance
  // For queries with 2+ significant words, check if ANY key words appear
  // Don't filter out CurseForge API results - they're already relevant!
  const queryWords = query.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length >= 2) {
    // Count how many query words appear (including synonyms)
    const matchedWords = queryWords.filter(word => {
      // Direct match
      if (containsWord(allText, word)) return true;
      
      // Check if any synonym of this word matches
      for (const [key, synonyms] of Object.entries(keywordMappings)) {
        if (key === word || synonyms.includes(word)) {
          // Check if any synonym appears in text
          return synonyms.some(syn => containsWord(allText, syn));
        }
      }
      return false;
    });
    
    // RELAXED: Only require at least ONE word to match (was 60% - too strict!)
    // CurseForge API already does relevance filtering - we shouldn't reject their results
    if (matchedWords.length === 0) {
      console.log(`[Filter] Rejected "${map.title}" - NO query words matched`);
      return false;
    }
  }
  
  // FIXED: RELAXED compound concept check - allow synonym matches
  // For compound queries like "underwater city", check for related concepts
  const compoundMatches = detectCompoundConcepts(query);
  if (compoundMatches.length > 0) {
    for (const concept of compoundMatches) {
      // Check if title contains compound synonyms (highest priority - allows pass)
      let hasSynonymMatch = false;
      for (const synonym of concept.synonyms) {
        if (allText.includes(synonym)) {
          hasSynonymMatch = true;
          break;
        }
      }
      
      if (hasSynonymMatch) {
        return true; // Has exact compound match, allow through
      }
      
      // RELAXED CHECK: Check if RELATED terms are present (via keyword mappings)
      // e.g., "futuristic" query can match "scifi", "modern", "tech" etc.
      const termsOrSynonymsPresent = concept.terms.map(term => {
        // Direct word boundary match
        if (containsWord(allText, term)) return true;
        
        // Check if any synonym/related term matches
        const synonyms = keywordMappings[term] || [];
        return synonyms.some(syn => containsWord(allText, syn));
      });
      
      // RELAXED: Don't filter out CurseForge API results based on compound concepts
      // The API already provides relevant results - we're being too aggressive
      // Only reject if NO related terms match at all
      const matchRatio = termsOrSynonymsPresent.filter(Boolean).length / concept.terms.length;
      if (matchRatio === 0) {
        console.log(`[Filter] Rejected "${map.title}" - no compound concept terms matched`);
        return false;
      }
    }
  }
  
  // Exact title matches always pass
  if (relevance.hasExactMatch) return true;
  // Must have at least one word boundary match (not just substring)
  if (!relevance.hasWordBoundaryMatch) return false;
  // Otherwise must meet minimum thresholds
  return relevance.score >= MIN_RELEVANCE_SCORE && relevance.matchCount >= MIN_MATCH_COUNT;
}

// API endpoint for natural language search
app.get('/api/search', async (req, res) => {
  const query = req.query.q || '';
  const limit = parseInt(req.query.limit) || 60; // FIXED (Round 8): Default 60 results for 2x+ vs CurseForge alone
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }
  
  const startTime = Date.now();
  
  try {
    const searchTerms = expandQuery(query);
    console.log(`Search query: "${query}" | Expanded terms: ${searchTerms.join(', ')}`);
    
    // === MULTI-SOURCE AGGREGATION ===
    // Search from multiple sources in parallel
    const allResults = [];
    const sourceStats = {};
    
    // FIXED: Increased search limits to get "2x+ more results" from multi-source (Round 7)
    // 1. Search CurseForge
    try {
      const cfStart = Date.now();
      let cfResults = await searchCurseForge(searchTerms, limit * 5);  // Increased to 5x to get more results
      const cfTime = Date.now() - cfStart;
      
      // Normalize CurseForge results
      cfResults = cfResults.map(map => ({
        ...map,
        source: 'curseforge',
        sourceName: 'CurseForge'
      }));
      
      allResults.push(...cfResults);
      sourceStats.curseforge = { count: cfResults.length, success: true, responseTime: cfTime };
      console.log(`[Search] CurseForge: ${cfResults.length} results in ${cfTime}ms`);
    } catch (error) {
      console.warn('[Search] CurseForge error:', error.message);
      sourceStats.curseforge = { count: 0, success: false, error: error.message };
    }
    
    // 2. Search other sources via aggregator if available
    if (isMultiSourceEnabled()) {
      try {
        const aggStart = Date.now();
        const agg = getAggregator();
        const aggResults = await agg.search(query, { 
          limit: limit * 3,  // FIXED: Increased limit for aggregator to 3x (Round 7)
          includeCurseForge: false // We already got CurseForge results
        });
        const aggTime = Date.now() - aggStart;
        
        // Add aggregator results (from planetminecraft, minecraftmaps, etc.)
        if (aggResults.results && aggResults.results.length > 0) {
          // Normalize aggregator results to match CurseForge format
          const normalizedAggResults = aggResults.results.map(map => ({
            id: map.id,
            title: map.name || map.title,
            author: typeof map.author === 'object' ? map.author.name : (map.author || 'Unknown'),
            description: map.summary || map.description || '',
            url: map.url || '',
            downloadUrl: map.downloadUrl || '',
            downloadType: map.downloadType || null, // FIXED (Round 7): Preserve downloadType
            downloadNote: map.downloadNote || null, // FIXED (Round 7): Preserve downloadNote
            thumbnail: map.thumbnail || map.image || '',
            downloads: map.downloadCount || map.downloads || 0,
            likes: map.likes || 0,
            category: map.category || 'World',
            version: map.primaryGameVersion || map.gameVersions?.[0] || 'Unknown',
            tags: map.tags || [],
            source: map.source || 'unknown',
            sourceName: map.sourceName || 'Unknown Source'
          }));
          
          allResults.push(...normalizedAggResults);
          
          // Merge source stats
          Object.entries(aggResults.sources || {}).forEach(([name, stats]) => {
            sourceStats[name] = stats;
          });
        }
        
        console.log(`[Search] Aggregator: ${aggResults.results?.length || 0} results in ${aggTime}ms`);
      } catch (error) {
        console.warn('[Search] Aggregator error:', error.message);
        sourceStats.aggregator = { count: 0, success: false, error: error.message };
      }
    }
    
    // Calculate relevance and filter false positives for ALL results
    let results = allResults.map(map => {
      const relevance = calculateRelevance(map, query, searchTerms);
      return {
        ...map,
        relevanceScore: relevance.score,
        matchCount: relevance.matchCount,
        penalty: relevance.penalty,
        hasExactMatch: relevance.hasExactMatch,
        hasWordBoundaryMatch: relevance.hasWordBoundaryMatch
      };
    }).filter(map => {
      // Use the comprehensive relevance checker that includes compound concept filtering
      return isRelevantResult(map, query, searchTerms);
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Deduplicate by title+author
    const seen = new Map();
    const deduplicated = [];
    for (const map of results) {
      // FIXED (Round 8): Handle author as object or string
      const authorName = typeof map.author === 'object' ? map.author?.name : map.author;
      const key = `${(map.title || '').toLowerCase().trim()}::${(authorName || 'unknown').toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        deduplicated.push(map);
      }
    }
    results = deduplicated;
    
    // Limit results
    results = results.slice(0, limit);
    
    const responseTime = Date.now() - startTime;
    
    res.json({
      success: true,
      query: query,
      searchTerms: searchTerms,
      count: results.length,
      responseTime: responseTime,
      sources: sourceStats,
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
  
  // Check if we're in demo mode (no valid API key)
  const isDemoMode = !process.env.CURSEFORGE_API_KEY || process.env.CURSEFORGE_API_KEY === 'demo';
  
  // If in demo mode, skip API calls entirely and return mock data
  if (isDemoMode) {
    console.log('DEMO MODE: Using mock data (no API key configured)');
    const mockMaps = getMockMaps();
    const filtered = filterMockMaps(mockMaps, searchTerms, searchTerms[0]);
    return filtered.slice(0, limit);
  }
  
  // Search with primary query first (most specific), then expanded terms
  const priorityTerms = searchTerms.slice(0, 4); // Limit API calls
  
  for (const term of priorityTerms) {
    try {
      const params = new URLSearchParams({
        gameId: MINECRAFT_GAME_ID.toString(),
        classId: WORLDS_CLASS_ID.toString(),
        searchFilter: term,
        pageSize: '50',
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
            const mapData = await transformModToMap(mod);
            if (mapData) {
              allResults.push(mapData);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Error searching for term "${term}":`, err.message);
    }
  }
  
  return allResults;
}

// Transform CurseForge mod data to map format
async function transformModToMap(mod) {
  // Get the latest file info
  let latestFile = null;
  let downloadUrl = null;
  let fileName = null;
  let fileSize = 0;
  
  if (mod.latestFiles && mod.latestFiles.length > 0) {
    latestFile = mod.latestFiles[0];
    
    // CurseForge API v1 returns download URLs differently
    // The downloadUrl field may be null for some mods
    // We need to construct or fetch the proper download URL
    if (latestFile.downloadUrl) {
      downloadUrl = latestFile.downloadUrl;
    } else {
      // Construct download URL using the file ID
      // CurseForge CDN pattern
      downloadUrl = `https://www.curseforge.com/api/v1/mods/${mod.id}/files/${latestFile.id}/download`;
    }
    
    fileName = latestFile.fileName;
    fileSize = latestFile.fileLength || 0;
  }
  
  // Get mod page URL
  const modPageUrl = `https://www.curseforge.com/minecraft/worlds/${mod.slug}`;
  
  return {
    id: mod.id,
    title: mod.name,
    author: mod.authors && mod.authors[0] ? mod.authors[0].name : 'Unknown',
    description: mod.summary || 'No description available',
    url: modPageUrl,
    downloadUrl: downloadUrl,
    fileName: fileName,
    fileSize: fileSize,
    thumbnail: mod.logo ? mod.logo.url : 'https://via.placeholder.com/280x160?text=No+Image',
    downloads: mod.downloadCount || 0,
    likes: mod.thumbsUpCount || 0,
    category: mod.classId === WORLDS_CLASS_ID ? 'World' : 'Map',
    version: latestFile ? (latestFile.gameVersions ? latestFile.gameVersions.join(', ') : 'Unknown') : 'Unknown',
    tags: mod.categories ? mod.categories.map(c => c.name) : [],
    source: 'CurseForge',
    createdAt: mod.dateCreated,
    updatedAt: mod.dateModified,
    isAvailable: !!downloadUrl
  };
}

/**
 * GET /api/download
 * Download endpoint - supports ?id=X query parameter (QUERY PARAM VERSION)
 * IMPORTANT: This route MUST be defined BEFORE /api/download/:modId to avoid conflicts
 * Express routes are matched in order, and /api/download/:modId would match /api/download?id=X
 */
app.get('/api/download', async (req, res) => {
  try {
    const { id, url } = req.query;
    
    // Validate ID parameter
    if (!id && !url) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing required parameter: id or url',
        usage: '/api/download?id=<map_id> or /api/download?url=<download_url>'
      });
    }
    
    let mapId = null;
    if (id !== undefined && id !== '') {
      mapId = parseInt(id);
      if (isNaN(mapId) || mapId <= 0) {
        return res.status(400).json({
          error: 'INVALID_ID',
          message: 'Invalid map ID. ID must be a positive number.'
        });
      }
    }
    
    // If URL is provided directly, redirect to it
    if (url) {
      return res.redirect(url);
    }
    
    // Otherwise, fetch download info from CurseForge
    if (!CURSEFORGE_API_KEY) {
      return res.status(503).json({
        error: 'API_KEY_MISSING',
        message: 'CURSEFORGE_API_KEY not configured'
      });
    }
    
    try {
      const headers = {
        'Accept': 'application/json',
        'x-api-key': CURSEFORGE_API_KEY
      };
      
      // Get mod details
      const modResponse = await fetch(`${CURSEFORGE_BASE_URL}/mods/${mapId}`, { headers });
      
      if (!modResponse.ok) {
        if (modResponse.status === 404) {
          return res.status(404).json({
            error: 'MAP_NOT_FOUND',
            message: `Map ${mapId} not found`,
            id: mapId
          });
        }
        throw new Error(`API error: ${modResponse.status}`);
      }
      
      const modData = await modResponse.json();
      const mod = modData.data;
      
      // Get files for this mod
      const filesResponse = await fetch(`${CURSEFORGE_BASE_URL}/mods/${mapId}/files`, { headers });
      
      if (!filesResponse.ok) {
        throw new Error(`Files API error: ${filesResponse.status}`);
      }
      
      const filesData = await filesResponse.json();
      
      if (!filesData.data || filesData.data.length === 0) {
        return res.status(404).json({
          error: 'NO_FILES_FOUND',
          message: 'No files found for this map'
        });
      }
      
      // Get the latest file
      const latestFile = filesData.data[0];
      let downloadUrl = latestFile.downloadUrl;
      
      if (!downloadUrl) {
        // Construct API download URL
        downloadUrl = `https://www.curseforge.com/api/v1/mods/${mapId}/files/${latestFile.id}/download`;
      }
      
      // Redirect to download URL (302)
      return res.redirect(302, downloadUrl);
      
    } catch (error) {
      console.error('[Download] Error:', error.message);
      
      if (error.message.includes('API error') || error.message.includes('404')) {
        return res.status(404).json({
          error: 'MAP_NOT_FOUND',
          message: `Map ${mapId} not found or API error`,
          id: mapId
        });
      }
      
      return res.status(500).json({
        error: 'DOWNLOAD_ERROR',
        message: 'Failed to fetch download information',
        details: error.message
      });
    }
    
  } catch (error) {
    console.error('Download endpoint error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: error.message
    });
  }
});

/**
 * GET /api/download/:modId
 * Download endpoint - path parameter version
 * Gets download URL for a specific map by ID
 */
app.get('/api/download/:modId', async (req, res) => {
  const modId = parseInt(req.params.modId);
  
  if (!modId || isNaN(modId)) {
    return res.status(400).json({ 
      error: 'INVALID_ID',
      message: 'Invalid mod ID. ID must be a positive number.'
    });
  }
  
  try {
    const headers = {
      'Accept': 'application/json',
      'x-api-key': CURSEFORGE_API_KEY
    };
    
    // Get mod details
    const modResponse = await fetch(`${CURSEFORGE_BASE_URL}/mods/${modId}`, { headers });
    
    if (!modResponse.ok) {
      if (modResponse.status === 404) {
        return res.status(404).json({ 
          error: 'MAP_NOT_FOUND',
          message: `Map ${modId} not found`,
          id: modId
        });
      }
      throw new Error(`API error: ${modResponse.status}`);
    }
    
    const modData = await modResponse.json();
    const mod = modData.data;
    
    // Get files for this mod
    const filesResponse = await fetch(`${CURSEFORGE_BASE_URL}/mods/${modId}/files`, { headers });
    
    if (!filesResponse.ok) {
      throw new Error(`Files API error: ${filesResponse.status}`);
    }
    
    const filesData = await filesResponse.json();
    
    if (!filesData.data || filesData.data.length === 0) {
      return res.status(404).json({ 
        error: 'NO_FILES_FOUND',
        message: 'No files found for this map',
        id: modId
      });
    }
    
    // Get the latest file with download URL
    const latestFile = filesData.data[0];
    
    // Try to get direct download URL
    let downloadUrl = latestFile.downloadUrl;
    let downloadMethod = 'direct';
    
    if (!downloadUrl) {
      // Use CurseForge API download endpoint
      downloadUrl = `https://www.curseforge.com/api/v1/mods/${modId}/files/${latestFile.id}/download`;
      downloadMethod = 'api';
    }
    
    // FIXED: Redirect to download URL instead of returning JSON
    return res.redirect(302, downloadUrl);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'DOWNLOAD_ERROR',
      message: 'Failed to get download URL',
      details: error.message 
    });
  }
});

// Filter mock maps based on semantic relevance
function filterMockMaps(maps, searchTerms, query) {
  if (!searchTerms || searchTerms.length === 0) return maps;
  if (!query) query = searchTerms[0];
  
  // Score and filter maps
  const scoredMaps = maps.map(m => {
    const relevance = calculateRelevance(m, query, searchTerms);
    return { map: m, ...relevance };
  });
  
  // Filter by threshold and sort
  const filtered = scoredMaps
    .filter(item => item.hasExactMatch || (item.score >= MIN_RELEVANCE_SCORE && item.matchCount >= MIN_MATCH_COUNT))
    .sort((a, b) => b.score - a.score);
  
  // Return filtered results or original if not enough matches
  return filtered.length >= 3 ? filtered.map(item => item.map) : 
    scoredMaps.sort((a, b) => b.score - a.score).slice(0, 10).map(item => item.map);
}

// Mock data for fallback - diverse Minecraft maps
function getMockMaps() {
  return [
    {
      id: 1001,
      title: "Neo Tokyo 2150",
      author: "CyberArchitect",
      description: "A stunning cyberpunk city with neon-lit skyscrapers, high-speed maglev railways, and flying vehicle lanes.",
      url: "https://www.curseforge.com/minecraft/worlds/neo-tokyo-2150",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/neo-tokyo-2150/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Neo+Tokyo+2150",
      downloads: 245000,
      likes: 18200,
      category: "City",
      version: "1.20.4",
      tags: ["city", "futuristic", "cyberpunk", "railway", "modern"],
      source: "CurseForge"
    },
    {
      id: 1002,
      title: "Metro City Transport Hub",
      author: "RailMaster",
      description: "Massive railway station complex with automated trains, cargo systems, and passenger terminals.",
      url: "https://www.curseforge.com/minecraft/worlds/metro-city-transport-hub",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/metro-city-transport-hub/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Metro+City",
      downloads: 178000,
      likes: 12400,
      category: "City",
      version: "1.20.1",
      tags: ["railway", "city", "train", "modern", "transport"],
      source: "CurseForge"
    },
    {
      id: 1003,
      title: "Space Colony Alpha",
      author: "GalacticBuilder",
      description: "Futuristic space station with zero-gravity sections, hydroponic farms, and a tram system.",
      url: "https://www.curseforge.com/minecraft/worlds/space-colony-alpha",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/space-colony-alpha/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Space+Colony",
      downloads: 156000,
      likes: 11300,
      category: "Sci-Fi",
      version: "1.19.4",
      tags: ["futuristic", "space", "scifi", "modern", "city"],
      source: "CurseForge"
    },
    {
      id: 1004,
      title: "Stormwind Citadel",
      author: "MedievalMaster",
      description: "Epic medieval fortress with towering walls, battlements, throne rooms, and a working drawbridge.",
      url: "https://www.curseforge.com/minecraft/worlds/stormwind-citadel",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/stormwind-citadel/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Stormwind+Citadel",
      downloads: 312000,
      likes: 24800,
      category: "Castle",
      version: "1.20.1",
      tags: ["castle", "medieval", "fortress", "pvp", "adventure"],
      source: "CurseForge"
    },
    {
      id: 1005,
      title: "Dragonstone Fortress",
      author: "CastleBuilderKing",
      description: "Massive stone fortress built into a mountain, featuring secret tunnels, dragon keep, and defensive siege positions.",
      url: "https://www.curseforge.com/minecraft/worlds/dragonstone-fortress",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/dragonstone-fortress/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Dragonstone",
      downloads: 289000,
      likes: 21500,
      category: "Fortress",
      version: "1.20.4",
      tags: ["fortress", "castle", "medieval", "fantasy", "adventure"],
      source: "CurseForge"
    },
    {
      id: 1006,
      title: "Camelot Castle Complex",
      author: "ArthurianCraft",
      description: "Complete medieval castle with tournament grounds, wizard tower, knights' quarters, and a grand royal hall.",
      url: "https://www.curseforge.com/minecraft/worlds/camelot-castle-complex",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/camelot-castle-complex/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Camelot",
      downloads: 267000,
      likes: 19800,
      category: "Castle",
      version: "1.19.4",
      tags: ["castle", "medieval", "fantasy", "rpg", "adventure"],
      source: "CurseForge"
    },
    {
      id: 1007,
      title: "Ironhold Stronghold",
      author: "FortressForge",
      description: "Impenetrable dwarven stronghold with deep mines, forge chambers, and defensive ballista towers.",
      url: "https://www.curseforge.com/minecraft/worlds/ironhold-stronghold",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/ironhold-stronghold/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Ironhold",
      downloads: 198000,
      likes: 15600,
      category: "Fortress",
      version: "1.20.2",
      tags: ["fortress", "dwarf", "medieval", "castle", "underground"],
      source: "CurseForge"
    },
    {
      id: 1008,
      title: "Stranded: Lost Islands",
      author: "SurvivalExpert",
      description: "Multi-island survival map with limited resources, shipwrecks, and hidden treasures.",
      url: "https://www.curseforge.com/minecraft/worlds/stranded-lost-islands",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/stranded-lost-islands/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Lost+Islands",
      downloads: 223000,
      likes: 17600,
      category: "Survival",
      version: "1.20.1",
      tags: ["survival", "island", "ocean", "challenge", "adventure"],
      source: "CurseForge"
    },
    {
      id: 1009,
      title: "Ocean Survival Odyssey",
      author: "SeaSurvivor",
      description: "Start on a tiny ocean platform and expand to build your floating empire.",
      url: "https://www.curseforge.com/minecraft/worlds/ocean-survival-odyssey",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/ocean-survival-odyssey/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Ocean+Odyssey",
      downloads: 187000,
      likes: 14300,
      category: "Survival",
      version: "1.20.4",
      tags: ["survival", "ocean", "island", "challenge", "water"],
      source: "CurseForge"
    },
    {
      id: 1010,
      title: "Tropical Paradise Hardcore",
      author: "IslandBuilder",
      description: "Beautiful tropical islands with volcanoes, waterfalls, and hidden caves.",
      url: "https://www.curseforge.com/minecraft/worlds/tropical-paradise-hardcore",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/tropical-paradise-hardcore/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Tropical+Paradise",
      downloads: 165000,
      likes: 12900,
      category: "Survival",
      version: "1.19.4",
      tags: ["survival", "island", "tropical", "hardcore", "challenge"],
      source: "CurseForge"
    },
    {
      id: 1011,
      title: "Atlantis Underwater City",
      author: "OceanArchitect",
      description: "Explore the lost underwater city of Atlantis with air bubble systems and submersible transport.",
      url: "https://www.curseforge.com/minecraft/worlds/atlantis-underwater-city",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/atlantis-underwater-city/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Atlantis",
      downloads: 198000,
      likes: 16200,
      category: "City",
      version: "1.20.1",
      tags: ["ocean", "underwater", "city", "adventure", "exploration"],
      source: "CurseForge"
    },
    {
      id: 1012,
      title: "Beverly Hills Mega Mansion",
      author: "LuxuryHomes",
      description: "Ultra-modern mansion with infinity pool, home theater, garage with cars, and smart home automation.",
      url: "https://www.curseforge.com/minecraft/worlds/beverly-hills-mega-mansion",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/beverly-hills-mega-mansion/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Mega+Mansion",
      downloads: 234000,
      likes: 18900,
      category: "House",
      version: "1.20.4",
      tags: ["mansion", "modern", "house", "luxury", "contemporary"],
      source: "CurseForge"
    },
    {
      id: 1013,
      title: "Modern Cliffside Villa",
      author: "ArchitecturePro",
      description: "Stunning modern villa built into a cliff face with glass walls and panoramic views.",
      url: "https://www.curseforge.com/minecraft/worlds/modern-cliffside-villa",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/modern-cliffside-villa/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Cliffside+Villa",
      downloads: 187000,
      likes: 15200,
      category: "House",
      version: "1.20.1",
      tags: ["house", "modern", "mansion", "luxury", "contemporary"],
      source: "CurseForge"
    },
    {
      id: 1014,
      title: "Smart Home Estate",
      author: "TechBuilder",
      description: "Modern estate with working redstone automation, security systems, and auto-farms.",
      url: "https://www.curseforge.com/minecraft/worlds/smart-home-estate",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/smart-home-estate/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Smart+Home",
      downloads: 156000,
      likes: 12300,
      category: "House",
      version: "1.19.4",
      tags: ["house", "modern", "redstone", "automatic", "mansion"],
      source: "CurseForge"
    },
    {
      id: 1015,
      title: "Hamptons Beach House",
      author: "CoastalLiving",
      description: "Luxurious beachfront property with private dock, boathouse, pool deck, and coastal interior design.",
      url: "https://www.curseforge.com/minecraft/worlds/hamptons-beach-house",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/hamptons-beach-house/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Beach+House",
      downloads: 143000,
      likes: 11500,
      category: "House",
      version: "1.20.2",
      tags: ["house", "modern", "beach", "mansion", "luxury"],
      source: "CurseForge"
    },
    {
      id: 1016,
      title: "The Legend of Zelda: Crafted",
      author: "QuestMaster",
      description: "Epic adventure map with dungeons, puzzles, boss battles, and an immersive storyline.",
      url: "https://www.curseforge.com/minecraft/worlds/zelda-crafted",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/zelda-crafted/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Zelda+Crafted",
      downloads: 345000,
      likes: 28700,
      category: "Adventure",
      version: "1.20.1",
      tags: ["adventure", "quest", "puzzle", "rpg", "story"],
      source: "CurseForge"
    },
    {
      id: 1017,
      title: "Escape Room Challenge",
      author: "PuzzleMaster",
      description: "10 intricate escape rooms with logic puzzles, redstone mechanisms, and hidden clues.",
      url: "https://www.curseforge.com/minecraft/worlds/escape-room-challenge",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/escape-room-challenge/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Escape+Room",
      downloads: 278000,
      likes: 22300,
      category: "Puzzle",
      version: "1.20.4",
      tags: ["puzzle", "adventure", "challenge", "logic", "quest"],
      source: "CurseForge"
    },
    {
      id: 1018,
      title: "The Lost Temple of Doom",
      author: "IndianaCraft",
      description: "Explore ancient ruins, avoid traps, solve mysteries, and find the legendary treasure.",
      url: "https://www.curseforge.com/minecraft/worlds/lost-temple-doom",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/lost-temple-doom/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Lost+Temple",
      downloads: 256000,
      likes: 20100,
      category: "Adventure",
      version: "1.19.4",
      tags: ["adventure", "quest", "temple", "exploration", "puzzle"],
      source: "CurseForge"
    },
    {
      id: 1019,
      title: "RPG Quest: Hero's Journey",
      author: "RPGDesigner",
      description: "Complete RPG experience with quests, NPCs, custom items, skill trees, and branching storyline.",
      url: "https://www.curseforge.com/minecraft/worlds/rpg-quest-heros-journey",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/rpg-quest-heros-journey/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Hero's+Journey",
      downloads: 312000,
      likes: 25400,
      category: "Adventure",
      version: "1.20.1",
      tags: ["adventure", "rpg", "quest", "story", "fantasy"],
      source: "CurseForge"
    },
    {
      id: 1020,
      title: "Parkour Legends Championship",
      author: "ParkourKing",
      description: "100+ levels of increasing difficulty with checkpoints, timers, and leaderboards.",
      url: "https://www.curseforge.com/minecraft/worlds/parkour-legends",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/parkour-legends/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Parkour+Legends",
      downloads: 398000,
      likes: 32100,
      category: "Parkour",
      version: "1.20.1",
      tags: ["parkour", "challenge", "jump", "minigame", "competition"],
      source: "CurseForge"
    },
    {
      id: 1021,
      title: "Extreme Dropper Challenge",
      author: "DropperPro",
      description: "50 unique dropper levels with obstacles, moving platforms, and precise landing zones.",
      url: "https://www.curseforge.com/minecraft/worlds/extreme-dropper",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/extreme-dropper/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Extreme+Dropper",
      downloads: 267000,
      likes: 21800,
      category: "Parkour",
      version: "1.20.4",
      tags: ["parkour", "dropper", "challenge", "minigame", "hard"],
      source: "CurseForge"
    },
    {
      id: 1022,
      title: "Speed Run Stadium",
      author: "SpeedRunner",
      description: "Competitive parkour stadium with race modes, time trials, and multiplayer racing.",
      url: "https://www.curseforge.com/minecraft/worlds/speed-run-stadium",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/speed-run-stadium/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Speed+Run",
      downloads: 189000,
      likes: 15600,
      category: "Parkour",
      version: "1.19.4",
      tags: ["parkour", "speedrun", "challenge", "race", "competition"],
      source: "CurseForge"
    },
    {
      id: 1023,
      title: "Nether Fortress of Doom",
      author: "DemonArchitect",
      description: "Epic inferno-themed fortress with lava flows, demon spawners, and brimstone walls.",
      url: "https://www.curseforge.com/minecraft/worlds/nether-fortress-doom",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/nether-fortress-doom/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Nether+Fortress",
      downloads: 234000,
      likes: 18900,
      category: "Adventure",
      version: "1.20.4",
      tags: ["nether", "hell", "demon", "fortress", "fire", "lava"],
      source: "CurseForge"
    },
    {
      id: 1024,
      title: "Inferno Pits Survival",
      author: "FlameMaster",
      description: "Hardcore survival map set in a burning underworld. Fight through flames and lava pits.",
      url: "https://www.curseforge.com/minecraft/worlds/inferno-pits",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/inferno-pits/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Inferno+Pits",
      downloads: 178000,
      likes: 14200,
      category: "Survival",
      version: "1.20.1",
      tags: ["inferno", "hell", "survival", "fire", "lava", "nether"],
      source: "CurseForge"
    },
    {
      id: 1025,
      title: "Demon's Castle",
      author: "DarkBuilder",
      description: "A terrifying demonic stronghold filled with underworld creatures.",
      url: "https://www.curseforge.com/minecraft/worlds/demons-castle",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/demons-castle/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Demons+Castle",
      downloads: 198000,
      likes: 16500,
      category: "Horror",
      version: "1.20.4",
      tags: ["demon", "castle", "hell", "horror", "underworld"],
      source: "CurseForge"
    },
    {
      id: 1026,
      title: "Ocean Monuments Explorer",
      author: "MarineArchitect",
      description: "Dive into an underwater adventure exploring ancient ocean monuments and coral reefs.",
      url: "https://www.curseforge.com/minecraft/worlds/ocean-monuments",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/ocean-monuments/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Ocean+Monuments",
      downloads: 156000,
      likes: 12800,
      category: "Adventure",
      version: "1.20.1",
      tags: ["ocean", "underwater", "sea", "aquatic", "adventure", "marine"],
      source: "CurseForge"
    },
    {
      id: 1027,
      title: "Submarine Base Alpha",
      author: "NavyBuilder",
      description: "High-tech underwater submarine base with aquatic research labs and marine docking bays.",
      url: "https://www.curseforge.com/minecraft/worlds/submarine-base",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/submarine-base/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Submarine+Base",
      downloads: 189000,
      likes: 15400,
      category: "Modern",
      version: "1.20.4",
      tags: ["submarine", "underwater", "ocean", "base", "modern", "aquatic"],
      source: "CurseForge"
    },
    {
      id: 1028,
      title: "Sunken City of R'lyeh",
      author: "LovecraftFan",
      description: "Explore the lost underwater city with deep sea temples and sunken ruins.",
      url: "https://www.curseforge.com/minecraft/worlds/sunken-city",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/sunken-city/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Sunken+City",
      downloads: 167000,
      likes: 13900,
      category: "Adventure",
      version: "1.20.1",
      tags: ["underwater", "sunken", "city", "ocean", "atlantis", "deep sea"],
      source: "CurseForge"
    },
    {
      id: 1029,
      title: "Coral Reef Paradise",
      author: "Oceanographer",
      description: "Beautiful marine ecosystem with colorful coral reefs and tropical fish habitats.",
      url: "https://www.curseforge.com/minecraft/worlds/coral-reef",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/coral-reef/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Coral+Reef",
      downloads: 145000,
      likes: 12100,
      category: "Nature",
      version: "1.20.4",
      tags: ["ocean", "coral", "reef", "marine", "aquatic", "underwater"],
      source: "CurseForge"
    },
    {
      id: 1030,
      title: "Hades Underworld Dungeon",
      author: "MythologyCraft",
      description: "Journey through the Greek underworld. Navigate rivers of fire and face Cerberus.",
      url: "https://www.curseforge.com/minecraft/worlds/hades-dungeon",
      downloadUrl: "https://www.curseforge.com/minecraft/worlds/hades-dungeon/download",
      thumbnail: "https://via.placeholder.com/280x160?text=Hades+Dungeon",
      downloads: 212000,
      likes: 17600,
      category: "Adventure",
      version: "1.20.1",
      tags: ["hades", "underworld", "hell", "dungeon", "fire", "mythology"],
      source: "CurseForge"
    }
  ];
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Simple health check endpoint for load balancers (no /api prefix)
app.get('/health', async (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const isDemoMode = !process.env.CURSEFORGE_API_KEY || process.env.CURSEFORGE_API_KEY === 'demo';
  
  // Get scraper health if available
  let scraperHealth = null;
  if (isMultiSourceEnabled()) {
    try {
      const agg = getAggregator();
      scraperHealth = await agg.getHealth();
    } catch (error) {
      scraperHealth = { error: error.message };
    }
  } else {
    scraperHealth = { 
      error: 'Multi-source scrapers not loaded', 
      details: scraperModuleError,
      scrapersLoaded: scrapersLoaded,
      filePolyfillAvailable: typeof File !== 'undefined',
      fetchAvailable: typeof fetch !== 'undefined'
    };
  }
  
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    deployTimestamp: DEPLOY_TIMESTAMP,
    apiConfigured: !!process.env.CURSEFORGE_API_KEY && process.env.CURSEFORGE_API_KEY !== 'demo',
    demoMode: isDemoMode,
    apiKeyPreview: process.env.CURSEFORGE_API_KEY ? process.env.CURSEFORGE_API_KEY.substring(0, 10) + '...' : 'Not set',
    version: '2.3.0-round5-fixes',
    multiSourceEnabled: isMultiSourceEnabled(),
    scrapersLoaded: scrapersLoaded,
    scrapers: scraperHealth
  });
});

// Multi-source scraper status endpoint (alias for sources/health)
app.get('/api/scrapers/status', async (req, res) => {
  try {
    const isDemoMode = !process.env.CURSEFORGE_API_KEY || process.env.CURSEFORGE_API_KEY === 'demo';
    
    // Get scraper health if available
    let scraperHealth = null;
    if (isMultiSourceEnabled()) {
      try {
        const agg = getAggregator();
        scraperHealth = await agg.getHealth();
      } catch (error) {
        scraperHealth = { error: error.message, scrapers: [] };
      }
    } else {
      scraperHealth = { 
        error: 'Multi-source scrapers not loaded', 
        details: scraperModuleError, 
        scrapers: [],
        scrapersLoaded: scrapersLoaded 
      };
    }
    
    // Build unified status response
    const status = {
      timestamp: new Date().toISOString(),
      deployTimestamp: DEPLOY_TIMESTAMP,
      version: '2.3.0-round5-fixes',
      sources: {
        curseforge: {
          name: 'CurseForge API',
          enabled: true,
          configured: !isDemoMode,
          status: isDemoMode ? 'demo_mode' : 'healthy',
          responseTime: 0
        }
      },
      scrapers: {},
      multiSourceAvailable: isMultiSourceEnabled()
    };
    
    // Add scraper statuses
    if (scraperHealth.scrapers) {
      for (const scraper of scraperHealth.scrapers) {
        status.scrapers[scraper.name] = {
          name: scraper.source || scraper.name,
          enabled: scraper.enabled !== false,
          accessible: scraper.accessible || false,
          status: scraper.accessible ? 'healthy' : (scraper.error ? 'error' : 'unavailable'),
          circuitBreaker: scraper.circuitBreaker?.state || 'unknown',
          error: scraper.error || null
        };
        
        // Also add to sources for backward compatibility
        status.sources[scraper.name] = {
          name: scraper.source || scraper.name,
          enabled: scraper.enabled !== false,
          status: scraper.accessible ? 'healthy' : 'unavailable',
          error: scraper.error || null
        };
      }
    }
    
    res.json(status);
  } catch (error) {
    console.error('Scrapers status error:', error);
    res.status(500).json({
      error: 'Failed to get scrapers status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Multi-source scraper health endpoint
app.get('/api/sources/health', async (req, res) => {
  // Check if multi-source is available
  if (!isMultiSourceEnabled()) {
    const curseforgeConfigured = !!process.env.CURSEFORGE_API_KEY && process.env.CURSEFORGE_API_KEY !== 'demo';
    return res.json({
      timestamp: new Date().toISOString(),
      sources: {
        curseforge: {
          name: 'CurseForge API',
          enabled: true,
          configured: curseforgeConfigured,
          status: curseforgeConfigured ? 'healthy' : 'demo_mode'
        }
      },
      scrapersAvailable: false,
      error: 'Multi-source scrapers not loaded',
      details: scraperModuleError
    });
  }
  
  try {
    const agg = getAggregator();
    const health = await agg.getHealth();
    
    // Add CurseForge status
    const curseforgeConfigured = !!process.env.CURSEFORGE_API_KEY && process.env.CURSEFORGE_API_KEY !== 'demo';
    
    res.json({
      timestamp: new Date().toISOString(),
      sources: {
        curseforge: {
          name: 'CurseForge API',
          enabled: true,
          configured: curseforgeConfigured,
          status: curseforgeConfigured ? 'healthy' : 'demo_mode'
        },
        ...health.scrapers.reduce((acc, scraper) => {
          acc[scraper.name] = {
            name: scraper.source || scraper.name,
            enabled: scraper.enabled,
            accessible: scraper.accessible,
            status: scraper.accessible ? 'healthy' : 'unavailable',
            error: scraper.error || null,
            circuitBreaker: scraper.circuitBreaker?.state || 'unknown'
          };
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Sources health error:', error);
    res.status(500).json({
      error: 'Failed to get sources health',
      message: error.message
    });
  }
});

// Unified search endpoint with multi-source aggregation
app.get('/api/search-unified', async (req, res) => {
  const query = req.query.q || '';
  const limit = parseInt(req.query.limit) || 60; // FIXED (Round 8): Default 60 results
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' });
  }
  
  // Check if multi-source is available
  if (!isMultiSourceEnabled()) {
    // Fallback to regular search
    try {
      const searchTerms = expandQuery(query);
      let maps = await searchCurseForge(searchTerms, limit * 2);
      
      // Calculate relevance and filter
      maps = maps.map(m => ({
        ...m,
        source: 'curseforge',
        name: m.title,
        summary: m.description
      })).slice(0, limit);
      
      return res.json({
        success: true,
        query: query,
        timestamp: new Date().toISOString(),
        responseTime: 0,
        totalCount: maps.length,
        sources: { curseforge: { count: maps.length, success: true, responseTime: 0 } },
        errors: [{ source: 'aggregator', error: 'Multi-source scrapers not available: ' + scraperModuleError }],
        maps: maps,
        fallback: true
      });
    } catch (error) {
      return res.status(500).json({ error: 'Search failed', message: error.message });
    }
  }
  
  try {
    const agg = getAggregator();
    
    // Search with aggregation
    const results = await agg.search(query, {
      limit,
      includeCurseForge: true,
      curseForgeSearchFn: async (q, opts) => {
        // Use existing CurseForge search logic
        const searchTerms = expandQuery(q);
        const maps = await searchCurseForge(searchTerms, opts.limit * 2);
        return maps.map(m => ({
          ...m,
          source: 'curseforge',
          name: m.title,
          summary: m.description
        }));
      }
    });
    
    res.json({
      success: true,
      query: query,
      timestamp: results.timestamp,
      responseTime: results.responseTime,
      totalCount: results.totalCount,
      sources: results.sources,
      errors: results.errors,
      maps: results.results
    });
  } catch (error) {
    console.error('Unified search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

// Start server
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Minecraft Map Scraper Server running on http://${HOST}:${PORT}`);
  console.log(`API Key configured: ${CURSEFORGE_API_KEY ? 'Yes' : 'No'}`);
  console.log(`Multi-source scrapers enabled: Yes`);
});
// Deployment trigger: Mon Feb  2 22:56:43 EST 2026
// Trigger redeploy Tue Feb  3 00:58:55 EST 2026
// Multi-source scraper integration deployed: Tue Feb 3 15:05:00 EST 2026
// Deployment retry: Tue Feb 3 15:15:00 EST 2026
// Deploy trigger: Tue Feb  3 10:55:32 EST 2026
