// Test the improved search algorithm

// Import functions from server.js (simulate the key functions)
const keywordMappings = {
  'castle': ['castle', 'fortress', 'citadel', 'stronghold', 'keep', 'palace', 'tower'],
  'city': ['city', 'town', 'metropolis', 'urban', 'municipal'],
  'village': ['village', 'hamlet', 'settlement'],
  'kingdom': ['kingdom', 'empire', 'realm'],
  'adventure': ['adventure', 'quest', 'story', 'campaign', 'journey', 'exploration'],
  'survival': ['survival', 'survive', 'hardcore', 'stranded', 'island'],
  'horror': ['horror', 'scary', 'spooky', 'haunted', 'creepy', 'terror'],
  'parkour': ['parkour', 'jump', 'obstacle', 'jumping', 'speedrun'],
  'puzzle': ['puzzle', 'riddle', 'logic', 'maze', 'labyrinth'],
  'pvp': ['pvp', 'arena', 'battle', 'combat', 'duel'],
  'modern': ['modern', 'contemporary', 'urban', 'skyscraper'],
  'futuristic': ['futuristic', 'future', 'scifi', 'sci-fi', 'space', 'advanced'],
  'cyberpunk': ['cyberpunk', 'neon', 'dystopian', 'hacker'],
  'tech': ['tech', 'technology', 'computer', 'machine'],
  'space': ['space', 'starship', 'planet', 'cosmic', 'galaxy'],
  'medieval': ['medieval', 'middle ages', 'knights', 'feudal'],
  'fantasy': ['fantasy', 'magic', 'wizard', 'sorcery', 'enchanted'],
  'ancient': ['ancient', 'old', 'ruins', 'historical'],
  'redstone': ['redstone', 'mechanism', 'automatic', 'circuit'],
  'house': ['house', 'home', 'mansion', 'residence', 'villa', 'cottage'],
  'mansion': ['mansion', 'estate', 'manor', 'luxury'],
  'skyblock': ['skyblock', 'sky', 'void', 'floating'],
  'dungeon': ['dungeon', 'cave', 'underground', 'catacomb'],
  'minigame': ['minigame', 'mini-game', 'arcade', 'party game'],
  'railway': ['railway', 'rail', 'train', 'subway', 'metro', 'track', 'locomotive'],
  'highway': ['highway', 'road', 'path', 'freeway', 'motorway'],
  'bridge': ['bridge', 'tunnel'],
  'island': ['island', 'isles', 'atoll'],
  'underwater': ['underwater', 'ocean', 'sea', 'submerged', 'aquatic', 'marine'],
  'atlantis': ['atlantis', 'sunken', 'lost city'],
  'reef': ['reef', 'coral', 'barrier reef'],
  'mountain': ['mountain', 'peak', 'alpine', 'cliff', 'highlands'],
  'forest': ['forest', 'woods', 'jungle', 'woodland', 'grove'],
  'desert': ['desert', 'sandy', 'oasis', 'pyramid'],
  'winter': ['winter', 'snow', 'ice', 'frozen', 'arctic'],
  'jungle': ['jungle', 'rainforest', 'tropical', 'amazon'],
  'hell': ['hell', 'nether', 'inferno', 'demon', 'demonic', 'underworld', 'hades'],
  'nether': ['nether', 'inferno', 'lava', 'fire', 'flame'],
  'inferno': ['inferno', 'fire', 'flame', 'brimstone'],
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

const conflictingTerms = {
  'futuristic': ['medieval', 'ancient', 'castle', 'knight', 'feudal'],
  'modern': ['medieval', 'ancient', 'castle', 'fantasy'],
  'medieval': ['futuristic', 'scifi', 'space', 'tech', 'modern', 'cyberpunk'],
  'underwater': ['castle', 'city', 'sky', 'mountain', 'air'],
  'reef': ['castle', 'city', 'urban', 'mountain', 'desert'],
  'skyblock': ['underwater', 'cave', 'dungeon', 'ocean'],
  'horror': ['cute', 'cozy', 'peaceful', 'relaxing'],
  'hell': ['heaven', 'paradise', 'angel', 'sky'],
  'nether': ['overworld', 'end', 'sky']
};

const MIN_RELEVANCE_SCORE = 30;
const MIN_MATCH_COUNT = 0.5;

function containsWord(text, word) {
  if (!text || !word) return false;
  const regex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'i');
  return regex.test(text.toLowerCase());
}

function expandQuery(query) {
  const queryLower = query.toLowerCase().trim();
  let searchTerms = [query];
  
  for (const [key, synonyms] of Object.entries(keywordMappings)) {
    if (containsWord(queryLower, key)) {
      const relevantSynonyms = synonyms.filter(syn => {
        for (const [queryWord, conflicts] of Object.entries(conflictingTerms)) {
          if (containsWord(queryLower, queryWord) && conflicts.includes(syn)) {
            return false;
          }
        }
        return true;
      });
      
      searchTerms = [...searchTerms, ...relevantSynonyms];
    }
  }
  
  return [...new Set(searchTerms)];
}

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
  
  // EXACT query match
  if (containsWord(titleLower, queryLower)) {
    score += 150;
    matchCount += 2;
    hasExactMatch = true;
  } else if (titleLower.includes(queryLower)) {
    score += 100;
    matchCount += 1.5;
    hasExactMatch = true;
  }
  
  // Individual query word matches
  queryWords.forEach(word => {
    if (containsWord(titleLower, word)) {
      score += 50;
      matchCount += 0.75;
    } else if (titleLower.includes(word)) {
      score += 30;
      matchCount += 0.5;
    }
  });
  
  // Expanded term matches
  searchTerms.forEach(term => {
    if (term !== query && term.length > 2) {
      if (containsWord(titleLower, term)) {
        score += 25;
        matchCount += 0.4;
      } else if (titleLower.includes(term)) {
        score += 12;
        matchCount += 0.2;
      }
    }
  });
  
  // Description matches
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
  
  // Tag matches
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
  
  // Penalty for conflicting terms
  for (const [term, conflicts] of Object.entries(conflictingTerms)) {
    if (containsWord(queryLower, term)) {
      conflicts.forEach(conflict => {
        if (containsWord(allText, conflict)) {
          penalty += 35;
        }
      });
    }
  }
  
  score = Math.max(0, score - penalty);
  
  // Boost by popularity
  if (matchCount > 0) {
    score += Math.log10((map.downloads || 0) + 1) * 3;
    score += Math.log10((map.likes || 0) + 1) * 2;
  }
  
  return { score, matchCount, penalty, hasExactMatch };
}

function shouldKeep(result) {
  if (result.hasExactMatch) return true;
  return result.score >= MIN_RELEVANCE_SCORE && result.matchCount >= MIN_MATCH_COUNT;
}

// Test cases
const testCases = [
  {
    query: "reef",
    tests: [
      { title: "Coral Reef Paradise", description: "Beautiful underwater reef to explore", tags: ["ocean", "coral", "reef"], downloads: 1000, likes: 100, expected: true },
      { title: "Great Barrier Reef", description: "Diving adventure map", tags: ["reef"], downloads: 1000, likes: 100, expected: true },
      { title: "Reef Explorer", description: "Explore the coral reefs", tags: [], downloads: 1000, likes: 100, expected: true },
      { title: "Greek City Adventure", description: "Explore ancient greek architecture", tags: ["city", "greek"], downloads: 1000, likes: 100, expected: false },
      { title: "Pokemon World", description: "Catch them all in this pokemon map", tags: ["pokemon"], downloads: 1000, likes: 100, expected: false },
      { title: "Castle Kingdom", description: "Medieval castle with kingdom", tags: ["castle", "medieval"], downloads: 1000, likes: 100, expected: false },
      { title: "Urban Metropolis", description: "Modern city skyline", tags: ["city", "modern"], downloads: 1000, likes: 100, expected: false },
      { title: "Space Station Alpha", description: "Futuristic space habitat", tags: ["space", "futuristic"], downloads: 1000, likes: 100, expected: false }
    ]
  },
  {
    query: "futuristic city",
    tests: [
      { title: "Neo Tokyo 2150", description: "Futuristic city with advanced tech", tags: ["city", "futuristic"], downloads: 1000, likes: 100, expected: true },
      { title: "Cyberpunk City", description: "Future metropolis with neon lights", tags: ["city", "cyberpunk"], downloads: 1000, likes: 100, expected: true },
      { title: "Sci-Fi Urban Center", description: "Space age city buildings", tags: ["city", "scifi"], downloads: 1000, likes: 100, expected: true },
      { title: "Medieval Castle", description: "Old castle from middle ages", tags: ["castle", "medieval"], downloads: 1000, likes: 100, expected: false },
      { title: "Ancient Rome", description: "Historical ancient city", tags: ["ancient"], downloads: 1000, likes: 100, expected: false },
      { title: "Fantasy Kingdom", description: "Magic castle realm", tags: ["fantasy", "castle"], downloads: 1000, likes: 100, expected: false },
      { title: "Underwater Base", description: "Submerged ocean research facility", tags: ["underwater"], downloads: 1000, likes: 100, expected: false },
      { title: "Coral Reef", description: "Beautiful underwater reef", tags: ["reef"], downloads: 1000, likes: 100, expected: false }
    ]
  },
  {
    query: "medieval castle",
    tests: [
      { title: "Medieval Castle Siege", description: "Defend your castle from invaders", tags: ["castle", "medieval"], downloads: 1000, likes: 100, expected: true },
      { title: "Kingdom Fortress", description: "Medieval stronghold with knights", tags: ["fortress", "medieval"], downloads: 1000, likes: 100, expected: true },
      { title: "Ancient Citadel", description: "Historical castle from middle ages", tags: ["castle", "ancient"], downloads: 1000, likes: 100, expected: true },
      { title: "Futuristic Sky Base", description: "Advanced tech space station", tags: ["futuristic"], downloads: 1000, likes: 100, expected: false },
      { title: "Modern City", description: "Contemporary urban metropolis", tags: ["modern", "city"], downloads: 1000, likes: 100, expected: false },
      { title: "Sci-Fi Space Station", description: "Future orbital habitat", tags: ["scifi", "space"], downloads: 1000, likes: 100, expected: false },
      { title: "Coral Reef Paradise", description: "Underwater exploration", tags: ["reef"], downloads: 1000, likes: 100, expected: false },
      { title: "Pokemon Adventure", description: "Catch pokemon in this world", tags: ["pokemon"], downloads: 1000, likes: 100, expected: false }
    ]
  }
];

console.log("=== Search Algorithm Test ===\n");

let totalTests = 0;
let truePositives = 0;
let falsePositives = 0;
let trueNegatives = 0;
let falseNegatives = 0;

testCases.forEach(({ query, tests }) => {
  console.log(`\nQuery: "${query}"`);
  console.log("-".repeat(60));
  
  const searchTerms = expandQuery(query);
  console.log(`Expanded terms: ${searchTerms.join(', ')}`);
  
  const results = tests.map(t => {
    const relevance = calculateRelevance(t, query, searchTerms);
    const passed = shouldKeep(relevance);
    return { ...t, ...relevance, passed };
  });
  
  console.log("\nResults:");
  results.forEach((r, i) => {
    const status = r.passed ? "KEEP" : "FILTER";
    const correct = r.passed === r.expected;
    const correctMark = correct ? "✓" : "✗";
    
    if (r.expected && r.passed) truePositives++;
    else if (!r.expected && r.passed) falsePositives++;
    else if (!r.expected && !r.passed) trueNegatives++;
    else if (r.expected && !r.passed) falseNegatives++;
    
    totalTests++;
    
    console.log(`  ${correctMark} ${status} | "${r.title}" (s:${Math.round(r.score)}, m:${r.matchCount.toFixed(1)})${r.penalty > 0 ? ` [p:-${r.penalty}]` : ''} ${r.expected ? '[EXPECTED]' : '[NOT EXPECTED]'}`);
  });
});

const precision = truePositives / (truePositives + falsePositives);
const recall = truePositives / (truePositives + falseNegatives);
const fpRate = falsePositives / (falsePositives + trueNegatives);

console.log("\n" + "=".repeat(60));
console.log("FINAL RESULTS:");
console.log(`  Total test cases: ${totalTests}`);
console.log(`  True Positives: ${truePositives}`);
console.log(`  False Positives: ${falsePositives}`);
console.log(`  True Negatives: ${trueNegatives}`);
console.log(`  False Negatives: ${falseNegatives}`);
console.log("");
console.log(`  Precision: ${(precision * 100).toFixed(2)}%`);
console.log(`  Recall: ${(recall * 100).toFixed(2)}%`);
console.log(`  False Positive Rate: ${(fpRate * 100).toFixed(2)}%`);
console.log(`  Target FP Rate: <5%`);
console.log(`  Status: ${(fpRate * 100) < 5 ? 'PASS ✓' : 'FAIL ✗'}`);

// Exit with appropriate code
process.exit(fpRate < 0.05 ? 0 : 1);
