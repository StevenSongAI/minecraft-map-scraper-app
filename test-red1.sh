#!/bin/bash

# RED-1 Testing Script for Minecraft Map Scraper
# Tests search accuracy across diverse keywords

BASE_URL="https://dull-ravens-tie.loca.lt"
HEADER="bypass-tunnel-reminder: 1"

search() {
    local query="$1"
    curl -s -H "$HEADER" "${BASE_URL}/api/search?q=$(echo "$query" | sed 's/ /+/g')" 2>/dev/null
}

# Test a keyword and check relevance
test_keyword() {
    local keyword="$1"
    local category="$2"
    local expected_terms="$3"  # comma-separated terms that indicate relevance
    
    local response=$(search "$keyword")
    
    # Check if we got results
    local count=$(echo "$response" | grep -o '"count":[0-9]*' | cut -d: -f2)
    
    if [ -z "$count" ] || [ "$count" -eq 0 ]; then
        echo "{\"keyword\":\"$keyword\",\"category\":\"$category\",\"count\":0,\"false_positives\":0,\"notes\":\"No results\"}"
        return
    fi
    
    # Analyze top 5 results for relevance
    local fp_count=0
    local titles=$(echo "$response" | grep -o '"title":"[^"]*"' | cut -d'"' -f4 | head -5)
    local descriptions=$(echo "$response" | grep -o '"description":"[^"]*"' | cut -d'"' -f4 | head -5)
    
    local i=0
    while IFS= read -r title && [ $i -lt 5 ]; do
        local desc=$(echo "$descriptions" | sed -n "$((i+1))p")
        local combined="${title} ${desc}"
        local is_relevant=false
        
        # Check if any expected term is in the combined text
        IFS=',' read -ra terms <<< "$expected_terms"
        for term in "${terms[@]}"; do
            if echo "$combined" | grep -qi "$term"; then
                is_relevant=true
                break
            fi
        done
        
        if [ "$is_relevant" = false ]; then
            ((fp_count++))
        fi
        ((i++))
    done <<< "$titles"
    
    echo "{\"keyword\":\"$keyword\",\"category\":\"$category\",\"count\":$count,\"false_positives\":$fp_count,\"total_checked\":$i}"
}

# Environment keywords
echo "=== Testing Environment Keywords ==="
test_keyword "underwater" "environment" "underwater,ocean,sea,water,subaquatic"
test_keyword "ocean" "environment" "ocean,sea,water,underwater,maritime"
test_keyword "sea" "environment" "sea,ocean,water,maritime,nautical"
test_keyword "atlantis" "environment" "atlantis,underwater,ancient,lost,city"
test_keyword "nether" "environment" "nether,hell,inferno,lava,fire"
test_keyword "hell" "environment" "hell,nether,inferno,demon,demon"
test_keyword "inferno" "environment" "inferno,fire,nether,hell,lava"
test_keyword "heaven" "environment" "heaven,sky,angel,cloud,celestial"
test_keyword "sky" "environment" "sky,cloud,air,floating,heaven"
test_keyword "skyblock" "environment" "sky,block,island,floating,void"

# Theme keywords
echo "=== Testing Theme Keywords ==="
test_keyword "medieval" "theme" "medieval,knight,castle,fantasy,ancient"
test_keyword "fantasy" "theme" "fantasy,magic,dragon,adventure,mythical"
test_keyword "modern" "theme" "modern,city,urban,contemporary,building"
test_keyword "futuristic" "theme" "futuristic,sci-fi,space,future,tech"
test_keyword "steampunk" "theme" "steampunk,victorian,gear,industrial,retro"
test_keyword "horror" "theme" "horror,scary,haunted,spooky,terror"
test_keyword "adventure" "theme" "adventure,quest,story,journey,campaign"
test_keyword "rpg" "theme" "rpg,roleplay,quest,adventure,story"

# Structure keywords
echo "=== Testing Structure Keywords ==="
test_keyword "castle" "structure" "castle,fortress,palace,fort,keep"
test_keyword "city" "structure" "city,town,urban,metropolis,buildings"
test_keyword "village" "structure" "village,town,settlement,hamlet,community"
test_keyword "dungeon" "structure" "dungeon,crawl,prison,maze,underground"
test_keyword "temple" "structure" "temple,shrine,sanctuary,worship,ancient"
test_keyword "fortress" "structure" "fortress,fort,castle,stronghold,citadel"
test_keyword "mansion" "structure" "mansion,house,estate,villa,residence"

# Game mode keywords
echo "=== Testing Game Mode Keywords ==="
test_keyword "survival" "gamemode" "survival,hardcore,resource,adventure"
test_keyword "creative" "gamemode" "creative,build,building,construct"
test_keyword "pvp" "gamemode" "pvp,arena,battle,combat,fight"
test_keyword "parkour" "gamemode" "parkour,jump,obstacle,course,challenge"
test_keyword "puzzle" "gamemode" "puzzle,mind,challenge,brain,logic"

# Specific keywords
echo "=== Testing Specific Keywords ==="
test_keyword "zombie" "specific" "zombie,undead,horror,apocalypse,survival"
test_keyword "dragon" "specific" "dragon,wyvern,mythical,boss,end"
test_keyword "pirate" "specific" "pirate,ship,treasure,sea,ocean"
test_keyword "space" "specific" "space,planet,star,cosmic,alien"
test_keyword "desert" "specific" "desert,sand,oasis,sahara,arabic"
test_keyword "jungle" "specific" "jungle,forest,rainforest,tropical,vine"
test_keyword "ice" "specific" "ice,snow,frozen,winter,cold,glacier"

# Focus tests - Word boundaries
echo "=== Focus Tests: Word Boundaries ==="
test_keyword "stray" "boundary" "stray,lost,wander,cat"
test_keyword "cat" "boundary" "cat,kitten,feline,pet"
test_keyword "ray" "boundary" "ray,light,beam,fish"

# Focus tests - Semantic boundaries
echo "=== Focus Tests: Semantic Boundaries ==="
test_keyword "futuristic city" "semantic" "futuristic,sci-fi,space,future,city,urban,tech,modern"
test_keyword "underwater city" "semantic" "underwater,ocean,sea,water,atlantis,city,subaquatic"
test_keyword "medieval castle" "semantic" "medieval,knight,castle,fortress,fantasy,ancient"

echo "=== Testing Complete ==="
