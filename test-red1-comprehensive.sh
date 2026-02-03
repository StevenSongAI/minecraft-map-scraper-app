#!/bin/bash

# RED-1 Comprehensive Testing Script - 1000+ Keywords
# Tests search accuracy and false positive rates

BASE_URL="http://localhost:3000"
HEADER=""
OUTPUT_FILE="/Users/stevenai/clawd/projects/minecraft-map-scraper/red1-detailed-results.jsonl"

search() {
    local query="$1"
    curl -s -H "$HEADER" "${BASE_URL}/api/search?q=$(echo "$query" | sed 's/ /+/g' | sed 's/&/%26/g')" 2>/dev/null
}

# Check if result is relevant - returns 0 for relevant, 1 for false positive
check_relevance() {
    local title="$1"
    local description="$2"
    local query="$3"
    local query_lower=$(echo "$query" | tr '[:upper:]' '[:lower:]')
    local combined="${title} ${description}"
    local combined_lower=$(echo "$combined" | tr '[:upper:]' '[:lower:]')
    
    # Direct keyword match
    if echo "$combined_lower" | grep -q "$query_lower"; then
        return 0
    fi
    
    # Semantic equivalences based on query
    case "$query_lower" in
        "underwater"|"ocean"|"sea"|"atlantis")
            if echo "$combined_lower" | grep -qE "(water|submarine|sub|marine|nautical|aquatic|ocean|sea|atlantis|submerged|undersea|subaquatic|depths)"; then return 0; fi
            ;;
        "nether"|"hell"|"inferno")
            if echo "$combined_lower" | grep -qE "(nether|hell|inferno|lava|fire|flame|demon|devil|underworld)"; then return 0; fi
            ;;
        "heaven"|"sky")
            if echo "$combined_lower" | grep -qE "(sky|heaven|cloud|celestial|angel|paradise|floating|air|heights)"; then return 0; fi
            ;;
        "medieval")
            if echo "$combined_lower" | grep -qE "(medieval|knight|castle|fortress|ancient|kingdom|royal|middle.age)"; then return 0; fi
            ;;
        "fantasy")
            if echo "$combined_lower" | grep -qE "(fantasy|magic|magical|enchant|spell|wizard|mythical|fairy)"; then return 0; fi
            ;;
        "modern")
            if echo "$combined_lower" | grep -qE "(modern|contemporary|urban|city|skyscraper|building|house|residential)"; then return 0; fi
            ;;
        "futuristic"|"sci-fi"|"scifi")
            if echo "$combined_lower" | grep -qE "(future|futuristic|sci.fi|scifi|space|cyber|tech|technology|robot|alien|planet|star)"; then return 0; fi
            ;;
        "steampunk")
            if echo "$combined_lower" | grep -qE "(steampunk|victorian|gear|steam|industrial|retro|clockwork)"; then return 0; fi
            ;;
        "horror")
            if echo "$combined_lower" | grep -qE "(horror|scary|haunted|spooky|terror|creep|halloween|dark)"; then return 0; fi
            ;;
        "adventure")
            if echo "$combined_lower" | grep -qE "(adventure|quest|explore|journey|campaign|story)"; then return 0; fi
            ;;
        "rpg")
            if echo "$combined_lower" | grep -qE "(rpg|role.play|roleplay|quest|class|level|character)"; then return 0; fi
            ;;
        "castle")
            if echo "$combined_lower" | grep -qE "(castle|fortress|palace|fort|keep|stronghold|citadel)"; then return 0; fi
            ;;
        "city")
            if echo "$combined_lower" | grep -qE "(city|town|metropolis|urban|municipal|civilization)"; then return 0; fi
            ;;
        "village")
            if echo "$combined_lower" | grep -qE "(village|town|settlement|hamlet|community|residential)"; then return 0; fi
            ;;
        "dungeon")
            if echo "$combined_lower" | grep -qE "(dungeon|prison|jail|cell|underground|labyrinth)"; then return 0; fi
            ;;
        "temple")
            if echo "$combined_lower" | grep -qE "(temple|shrine|sanctuary|worship|sacred|church|altar)"; then return 0; fi
            ;;
        "survival")
            if echo "$combined_lower" | grep -qE "(survival|hardcore|resource|gather|apocalypse)"; then return 0; fi
            ;;
        "creative")
            if echo "$combined_lower" | grep -qE "(creative|build|building|construct|design)"; then return 0; fi
            ;;
        "pvp")
            if echo "$combined_lower" | grep -qE "(pvp|arena|battle|combat|fight|war|duel|competitive)"; then return 0; fi
            ;;
        "parkour")
            if echo "$combined_lower" | grep -qE "(parkour|jump|obstacle|course|challenge|run|speed)"; then return 0; fi
            ;;
        "puzzle")
            if echo "$combined_lower" | grep -qE "(puzzle|brain|logic|mind|challenge|solve|riddle)"; then return 0; fi
            ;;
        "zombie")
            if echo "$combined_lower" | grep -qE "(zombie|undead|apocalypse|horde|infection)"; then return 0; fi
            ;;
        "dragon")
            if echo "$combined_lower" | grep -qE "(dragon|wyvern|wyrm|drake|boss|end)"; then return 0; fi
            ;;
        "pirate")
            if echo "$combined_lower" | grep -qE "(pirate|ship|treasure|chest|nautical|sea)"; then return 0; fi
            ;;
        "space")
            if echo "$combined_lower" | grep -qE "(space|planet|star|cosmic|galaxy|universe|alien|astro)"; then return 0; fi
            ;;
        "desert")
            if echo "$combined_lower" | grep -qE "(desert|sand|oasis|dune|sahara|arabic|egypt)"; then return 0; fi
            ;;
        "jungle")
            if echo "$combined_lower" | grep -qE "(jungle|forest|rainforest|tropical|vine|amazon)"; then return 0; fi
            ;;
        "ice"|"snow")
            if echo "$combined_lower" | grep -qE "(ice|snow|frozen|winter|cold|glacier|arctic|antarctic)"; then return 0; fi
            ;;
        "stray")
            if echo "$combined_lower" | grep -qE "(stray|wander|lost|homeless|stray.cat)"; then return 0; fi
            ;;
        "cat")
            if echo "$combined_lower" | grep -qE "(cat|kitten|feline|kitty|pet)"; then return 0; fi
            ;;
        "ray")
            if echo "$combined_lower" | grep -qE "(ray|stingray|manta|light|beam)"; then return 0; fi
            ;;
    esac
    
    return 1
}

test_keyword() {
    local keyword="$1"
    local category="$2"
    
    local response=$(search "$keyword")
    local count=$(echo "$response" | grep -o '"count":[0-9]*' | head -1 | cut -d: -f2)
    
    if [ -z "$count" ] || [ "$count" -eq 0 ]; then
        echo "{\"keyword\":\"$keyword\",\"category\":\"$category\",\"count\":0,\"false_positives\":0,\"total_checked\":0,\"fp_rate\":0,\"notes\":\"No results\"}" >> "$OUTPUT_FILE"
        return
    fi
    
    # Get titles and descriptions for top results
    local titles=($(echo "$response" | grep -o '"title":"[^"]*"' | cut -d'"' -f4 | head -5 | tr ' ' '§'))
    local descriptions=($(echo "$response" | grep -o '"description":"[^"]*"' | cut -d'"' -f4 | head -5 | tr ' ' '§'))
    
    local fp_count=0
    local checked=0
    local fp_details=""
    
    for i in {0..4}; do
        if [ $i -lt ${#titles[@]} ]; then
            local title=$(echo "${titles[$i]}" | tr '§' ' ')
            local desc=$(echo "${descriptions[$i]}" | tr '§' ' ')
            
            check_relevance "$title" "$desc" "$keyword"
            if [ $? -eq 1 ]; then
                ((fp_count++))
                fp_details="${fp_details}[${title}] "
            fi
            ((checked++))
        fi
    done
    
    local fp_rate=0
    if [ $checked -gt 0 ]; then
        fp_rate=$(echo "scale=2; ($fp_count * 100) / $checked" | bc -l 2>/dev/null || echo "0")
    fi
    
    echo "{\"keyword\":\"$keyword\",\"category\":\"$category\",\"count\":$count,\"false_positives\":$fp_count,\"total_checked\":$checked,\"fp_rate\":$fp_rate,\"fp_details\":\"$fp_details\"}" >> "$OUTPUT_FILE"
}

# Clear output file
echo "[" > "$OUTPUT_FILE"

# Environment Keywords (200+)
echo "=== Testing Environment Keywords ==="
environment_keywords=(
    "underwater" "ocean" "sea" "atlantis" "submarine" "aquatic" "marine" "depths"
    "nether" "hell" "inferno" "lava" "magma" "fire" "flame" "burning"
    "heaven" "sky" "cloud" "celestial" "paradise" "angel" "divine" "aerial"
    "void" "end" "abyss" "darkness" "shadow" "twilight" "ether" "astral"
    "forest" "woods" "taiga" "birch" "oak" "dark.oak" "acacia" "jungle"
    "mountain" "hill" "peak" "cliff" "canyon" "valley" "plateau" "mesa"
    "swamp" "marsh" "bog" "wetland" "mangrove" "bayou" "fen" "moor"
    "plains" "prairie" "savanna" "grassland" "meadow" "steppe" "field" "farmland"
    "beach" "coast" "shore" "island" "islet" "archipelago" "peninsula" "cove"
    "cave" "cavern" "grotto" "underground" "subterranean" "mine" "shaft" "tunnel"
    "river" "stream" "creek" "brook" "waterfall" "cascade" "lake" "pond"
    "volcano" "caldera" "crater" "geyser" "hot.spring" "thermal" "magma.chamber" "eruption"
    "tundra" "snow" "ice" "glacier" "frozen" "arctic" "antarctic" "permafrost"
    "desert" "sand" "dune" "oasis" "cactus" "sahara" "wasteland" "arid"
    "jungle" "rainforest" "tropical" "bamboo" "vine" "canopy" "undergrowth" "wilderness"
    "savanna" "safari" "outback" "bush" "veldt" "grass" "savannah" "prairie"
    "mushroom" "fungi" "mycelium" "spore" "shroom" "toadstool" "fungal" "bioluminescent"
    "coral" "reef" "kelp" "seaweed" "tide" "tidal" "lagoon" "atoll"
    "crystal" "gem" "mineral" "ore" "quartz" "amethyst" "diamond" "emerald"
    "obsidian" "bedrock" "stone" "rock" "granite" "diorite" "andesite" "basalt"
)

for kw in "${environment_keywords[@]}"; do
    test_keyword "$kw" "environment"
done

# Theme Keywords (200+)
echo "=== Testing Theme Keywords ==="
theme_keywords=(
    "medieval" "knight" "castle" "kingdom" "royal" "crown" "feudal" "middle.ages"
    "fantasy" "magic" "magical" "enchant" "spell" "wizard" "witch" "sorcery"
    "modern" "contemporary" "urban" "city" "skyscraper" "apartment" "suburb" "downtown"
    "futuristic" "sci-fi" "scifi" "cyberpunk" "space" "tech" "technology" "robot"
    "steampunk" "victorian" "industrial" "gear" "steam" "clockwork" "brass" "copper"
    "horror" "scary" "haunted" "spooky" "terror" "creep" "halloween" "dark"
    "adventure" "quest" "explore" "journey" "expedition" "campaign" "odyssey" "pilgrimage"
    "rpg" "roleplay" "role.play" "class" "level" "character" "stats" "progression"
    "survival" "hardcore" "resources" "gather" "craft" "build" "hunger" "thirst"
    "creative" "building" "construct" "design" "architecture" "art" "aesthetic" "pretty"
    "minigame" "minigames" "game" "arcade" "party" "fun" "casual" "quick"
    "pvp" "battle" "arena" "combat" "fight" "war" "duel" "competitive"
    "parkour" "jump" "obstacle" "course" "speed" "run" "challenge" "skill"
    "puzzle" "logic" "brain" "mind" "solve" "riddle" "mystery" "enigma"
    "maze" "labyrinth" "hedge" "puzzle.maze" "lost" "confusion" "twist" "turn"
    "escape" "prison" "breakout" "jail" "trap" "locked" "room" "chamber"
    "story" "narrative" "plot" "tale" "lore" "history" "background" "setting"
    "challenge" "hard" "difficult" "extreme" "insane" "impossible" "hardest" "expert"
    "coop" "co-op" "cooperative" "team" "multiplayer" "group" "squad" "party"
    "singleplayer" "solo" "alone" "individual" "private" "personal" "single" "one.player"
    "educational" "learning" "school" "teach" "tutorial" "lesson" "guide" "instruction"
    "redstone" "circuit" "mechanism" "automation" "contraption" "engine" "machine" "device"
    "command" "command.block" "function" "datapack" "modded" "plugin" "custom" "unique"
    "vanilla" "pure" "original" "unmodded" "clean" "simple" "basic" "standard"
    "realistic" "realism" "life" "immersive" "detailed" "accurate" "authentic" "true"
    "cartoon" "anime" "pixel" "retro" "8bit" "16bit" "classic" "nostalgia"
    "military" "army" "war" "battle" "soldier" "weapon" "gun" "tank"
    "apocalypse" "post.apocalyptic" "wasteland" "ruins" "destroyed" "abandoned" "survive" "dystopia"
    "western" "cowboy" "saloon" "desert.west" "frontier" "outlaw" "sheriff" "gold.rush"
)

for kw in "${theme_keywords[@]}"; do
    test_keyword "$kw" "theme"
done

# Structure Keywords (200+)
echo "=== Testing Structure Keywords ==="
structure_keywords=(
    "house" "home" "residence" "dwelling" "cabin" "cottage" "hut" "shelter"
    "mansion" "estate" "villa" "manor" "palace" "chateau" "mcmansion" "luxury"
    "castle" "fortress" "citadel" "stronghold" "keep" "fort" "tower" "bastion"
    "city" "town" "metropolis" "megacity" "capital" "urban" "civilization" "settlement"
    "village" "hamlet" "community" "colony" "outpost" "camp" "encampment" "base"
    "dungeon" "prison" "jail" "cell" "oubliette" "pit" "cage" "lockup"
    "temple" "shrine" "sanctuary" "church" "cathedral" "chapel" "mosque" "altar"
    "tower" "spire" "skyscraper" "highrise" "observatory" "beacon" "lighthouse" "lookout"
    "bridge" "crossing" "viaduct" "aqueduct" "overpass" "suspension" "arch" "span"
    "wall" "fence" "barrier" "rampart" "palisade" "bastion" "defense" "fortification"
    "gate" "portal" "door" "entrance" "archway" "gateway" "threshold" "access"
    "farm" "ranch" "plantation" "orchard" "vineyard" "garden" "greenhouse" "field"
    "mine" "quarry" "pit" "excavation" "tunnel" "shaft" "dig" "ore"
    "harbor" "port" "dock" "pier" "marina" "wharf" "quay" "jetty"
    "shop" "store" "market" "bazaar" "mall" "trading" "merchant" "commerce"
    "inn" "tavern" "pub" "hotel" "lodge" "hostel" "restaurant" "cafe"
    "library" "archive" "repository" "collection" "museum" "gallery" "exhibit" "display"
    "laboratory" "lab" "workshop" "forge" "smithy" "factory" "mill" "plant"
    "arena" "stadium" "colosseum" "circus" "amphitheater" "stage" "theater" "venue"
    "pyramid" "ziggurat" "tomb" "crypt" "mausoleum" "grave" "cemetery" "burial"
    "mansion" "estate" "villa" "manor" "chateau" "hacienda" "plantation" "compound"
    "bunker" "bomb.shelter" "safehouse" "hideout" "lair" "den" "secret" "underground"
    "treehouse" "skyhouse" "floating" "airship" "dirigible" "balloon" "elevated" "aerial"
    "statue" "monument" "memorial" "sculpture" "fountain" "obelisk" "pillar" "column"
)

for kw in "${structure_keywords[@]}"; do
    test_keyword "$kw" "structure"
done

# Game Mode Keywords (200+)
echo "=== Testing Game Mode Keywords ==="
gamemode_keywords=(
    "survival" "survive" "hardcore" "hard.mode" "ultra.hardcore" "uhc" "resources" "gather"
    "creative" "creative.mode" "build" "building" "construct" "design" "architect" "creator"
    "adventure" "adventure.mode" "story" "quest" "explore" "discover" "journey" "campaign"
    "spectator" "spectator.mode" "observe" "watch" "view" "camera" "fly" "ghost"
    "pvp" "player.vs.player" "battle" "arena" "combat" "fight" "war" "duel"
    "pve" "player.vs.environment" "mob" "monster" "creature" "enemy" "hostile" "attack"
    "parkour" "jump" "obstacle" "course" "speed.run" "timed" "challenge" "skill"
    "puzzle" "logic" "brain" "mind" "solve" "riddle" "mystery" "think"
    "maze" "labyrinth" "lost" "confusion" "twist" "turn" "dead.end" "escape"
    "escape.room" "locked" "key" "code" "combination" "secret" "hidden" "reveal"
    "horror" "scary" "haunted" "spooky" "terror" "fear" "dark" "night"
    "minigame" "minigames" "game" "arcade" "party" "fun" "casual" "quick"
    "ctf" "capture.flag" "flag" "team" "base" "steal" "defend" "competition"
    "bedwars" "bed.wars" "destroy" "bed" "protect" "attack" "defend" "rush"
    "skywars" "sky.wars" "floating" "island" "void" "chest" "loot" "combat"
    "hunger.games" "survival.games" "battle.royale" "last.man" "elimination" "arena" "fight" "winner"
    "tnt.run" "spleef" "drop" "fall" "platform" "disappear" "dig" "last"
    "droper" "dropper" "falling" "parachute" "land" "water" "target" "aim"
    "race" "racing" "speed" "fast" "sprint" "dash" "hurry" "competition"
    "hide" "seek" "hide.and.seek" "hidden" "find" "search" "spot" "camouflage"
    "tag" "it" "chase" "run" "catch" "freeze" "relay" "team"
    "kit" "kit.pvp" "loadout" "class" "weapon" "armor" "item" "gear"
    "practice" "training" "warmup" "drill" "exercise" "learn" "improve" "skill"
    " UHC " "ultra.hardcore" "no.regen" "border" "shrink" "time.limit" "intense" "competitive"
    "box" "one.block" "skyblock" "island" "void" "expand" "progress" "grind"
    "prison" "jail" "rank" "prestige" "mine" "sell" "shop" "economy"
    "factions" "faction" "claim" "raid" "war" "ally" "enemy" "territory"
    "towny" "town" "mayor" "resident" "plot" "nation" "government" "politics"
    "survival.games" "sg" "chest" "loot" "scavenge" "fight" "arena" "pvp"
    "build.battle" "build.wars" "contest" "vote" "theme" "time" "creative" "judge"
    "murder" "mystery" "detective" "killer" "innocent" "weapon" "clue" "suspense"
    "zombie" "apocalypse" "infection" "outbreak" "survive" "wave" "defend" "horde"
    "tower.defense" "defense" "tower" "path" "wave" "upgrade" "strategy" "protect"
)

for kw in "${gamemode_keywords[@]}"; do
    test_keyword "$kw" "gamemode"
done

# Specific/Mob Keywords (200+)
echo "=== Testing Specific/Mob Keywords ==="
specific_keywords=(
    "zombie" "undead" "walker" "corpse" "rotting" "infected" "husk" "drowned"
    "skeleton" "skull" "bone" "archer" "arrow" "ranged" "dead" "reanimated"
    "creeper" "explode" "ssss" "green" "charged" "powered" "silent" "sneaky"
    "spider" "cave.spider" "web" "poison" "venom" "arachnid" "crawl" "night"
    "enderman" "ender" "teleport" "tall" "black" "purple" "eyes" "scream"
    "dragon" "ender.dragon" "boss" "fly" "fire" "egg" "portal" "end"
    "wither" "wither.boss" "skull" "black" "soul" "sand" "explosion" "star"
    "witch" "potion" "brew" "splash" "magic" "hut" "swamp" "cauldron"
    "slime" "gelatinous" "cube" "split" "jump" "bounce" "green" "underground"
    "ghast" "nether" "fly" "cry" "fireball" "tears" "white" "float"
    "blaze" "rod" "fire" "nether.fortress" "fly" "yellow" "smoke" "attack"
    "piglin" "pig" "gold" "nether" "barter" "sword" "crossbow" "zombified"
    "hoglin" "boar" "meat" "leather" "breed" "nether" "forest" "big"
    "strider" "lava" "walk" "warped" "fungus" "ride" "shiver" "cold"
    "phantom" "wing" "fly" "night" "insomnia" "attack" "dive" "undead"
    "pillager" "villager" "raid" "crossbow" "outpost" "evil" "attack" "illager"
    "ravager" "beast" "raid" "charge" "destroy" "big" "strong" "roar"
    "vex" "summon" "fly" "sword" "evoker" "small" "blue" "spirit"
    "guardian" "elder" "temple" "ocean" "laser" "spikes" "eye" "fish"
    "drowned" "water" "zombie" "trident" "ocean" "river" "convert" "underwater"
    "silverfish" "stone" "bug" "small" "infest" "weak" "swarm" "hidden"
    "endermite" "ender" "pearl" "small" "purple" "portal" "rare" "tiny"
    "magma.cube" "lava" "jump" "split" "fire" "nether" "orange" "hot"
    "slime" "green" "cube" "jump" "split" "swamp" "underground" "plop"
    "bat" "fly" "cave" "night" "sound" "small" "flying" "dark"
    "cow" "milk" "beef" "leather" "farm" "passive" "moo" "animal"
    "pig" "pork" "saddle" "ride" "farm" "oink" "animal" "passive"
    "sheep" "wool" "mutton" "dye" "farm" "baa" "animal" "shave"
    "chicken" "egg" "feather" "raw" "farm" "cluck" "animal" "small"
    "rabbit" "bunny" "hide" "foot" "jump" "carrot" "small" "cute"
    "horse" "ride" "saddle" "armor" "wheat" "animal" "fast" "jump"
    "donkey" "mule" "chest" "ride" "saddle" "wheat" "animal" "carry"
    "wolf" "dog" "pet" "tame" "bone" "collar" "attack" "loyal"
    "ocelot" "cat" "pet" "tame" "fish" "creeper" "jungle" "fast"
    "parrot" "bird" "fly" "shoulder" "cookie" "jungle" "colorful" "dance"
    "llama" "spit" "carpet" "chest" "wheat" "mountain" "trader" "animal"
    "polar.bear" "ice" "snow" "fish" "bear" "baby" "protect" "white"
    "panda" "bamboo" "play" "lazy" "worried" "aggressive" "weak" "cute"
    "fox" "sweet" "berry" "chicken" "sleep" "taiga" "trust" "cute"
    "bee" "hive" "honey" "flower" "pollinate" "sting" "swarm" "fly"
    "turtle" "beach" "egg" "scute" "water" "seagrass" "baby" "old"
    "dolphin" "ocean" "fish" "treasure" "swim" "play" "follow" "intelligent"
    "squid" "ink" "water" "ocean" "dark" "passive" "tentacle" "sea"
    "cod" "salmon" "fish" "water" "ocean" "river" "bucket" "food"
    "pufferfish" "poison" "inflate" "spike" "tropical" "water" "ocean" "danger"
    "tropical.fish" "clownfish" "colorful" "coral" "reef" "water" "ocean" "pretty"
    "axolotl" "lucia" "wild" "gold" "cyan" "blue" "bucket" "cute"
    "glow.squid" "glow" "ink" "dark" "water" "luminescent" "underground" "pretty"
    "goat" "horn" "ram" "mountain" "milk" "jump" "wheat" "headbutt"
    "trader.llama" "llama" "wandering" "trader" "leash" "desert" "chest" "spit"
    "wandering.trader" "emerald" "trade" "llama" "spawn" "random" "desert" "sell"
    "iron.golem" "village" "protect" "poppy" "iron" "farm" "attack" "defend"
    "snow.golem" "snow" "pumpkin" "shoot" "cold" "build" "defend" "friendly"
    "villager" "trade" "emerald" "profession" "house" "breed" "farm" "job"
)

for kw in "${specific_keywords[@]}"; do
    test_keyword "$kw" "specific"
done

# Edge Cases - Word Boundaries
echo "=== Testing Edge Cases: Word Boundaries ==="
boundary_keywords=(
    "stray" "stranded" "strand" "ray" "rays" "xray" "x-ray" "array"
    "cat" "cats" "category" "scatter" "concat" "copycat" "cathedral" "caterpillar"
    "net" "nether" "internet" "cabinet" "planet" "magnet" "network" "netted"
    "end" "ender" "ending" "friend" "weekend" "trend" "blend" "commend"
    "the" "theme" "theater" "theft" "thermal" "theory" "ether" "wither"
    "war" "warrior" "warden" "warning" "warp" "toward" "award" "hardware"
    "man" "mansion" "manual" "manage" "command" "demand" "human" "roman"
    "her" "hero" "herobrine" "herd" "here" "there" "where" "everywhere"
    "sky" "skyblock" "skyscraper" "risky" "whiskey" "husky" "skyline" "skyward"
    "mine" "minecraft" "miner" "mineral" "undermine" "landmine" "mining" "minimize"
    "craft" "aircraft" "crafty" "spacecraft" "handcraft" "craftsman" "crafting" "witchcraft"
    "block" "blocky" "roadblock" "building.block" "blockbuster" "blockade" "sunblock" "blockchain"
    "red" "redstone" "redwood" "infrared" "reduced" "credits" "sacred" "hundred"
    "stone" "stonework" "cornerstone" "keystone" "limestone" "sandstone" "cobblestone" "gravestone"
    "wood" "woodland" "woodwork" "wooden" "driftwood" "firewood" "sandalwood" "cottonwood"
    "water" "waterfall" "waterfront" "underwater" "waterway" "watermelon" "waterproof" "watermark"
    "fire" "firework" "fireplace" "firefighter" "campfire" "wildfire" "fireball" "firewood"
    "ice" "iceberg" "iceland" "icicle" "service" "justice" "practice" "sacrifice"
    "snow" "snowman" "snowball" "snowfall" "snowy" "snowflake" "snowmobile" "snowboard"
    "sand" "sandstone" "sandwich" "sandcastle" "quicksand" "sandstorm" "sandy" "sandbar"
)

for kw in "${boundary_keywords[@]}"; do
    test_keyword "$kw" "boundary"
done

# Semantic Boundaries
echo "=== Testing Semantic Boundaries ==="
semantic_keywords=(
    "futuristic city" "medieval castle" "underwater city" "sky temple" "nether fortress"
    "ice palace" "desert temple" "jungle temple" "ocean monument" "end city"
    "space station" "modern house" "horror mansion" "fantasy castle" "steampunk city"
    "pirate ship" "zombie apocalypse" "dragon lair" "survival island" "creative world"
    "parkour map" "puzzle room" "adventure map" "rpg quest" "pvp arena"
    "ancient ruins" "haunted house" "floating island" "crystal cave" "lava dungeon"
    "winter village" "summer beach" "autumn forest" "spring meadow" "night city"
    "dark forest" "bright castle" "small hut" "giant tower" "deep ocean"
    "high mountain" "low valley" "wide plains" "narrow canyon" "big city"
    "old castle" "new world" "secret base" "hidden treasure" "lost city"
    "magic forest" "cursed temple" "blessed church" "dark dungeon" "light palace"
    "red castle" "blue ocean" "green forest" "white snow" "black cave"
    "golden temple" "silver mine" "iron fortress" "diamond city" "emerald village"
    "fire dragon" "ice dragon" "water temple" "earth dungeon" "air temple"
    "zombie castle" "skeleton dungeon" "creeper mine" "spider cave" "enderman city"
    "villager town" "pillager outpost" "witch hut" "ruined portal" "bastion remnant"
    "stronghold" "mineshaft" "buried treasure" "shipwreck" "ocean ruin"
    "woodland mansion" "desert pyramid" "jungle pyramid" "igloo" "pillager tower"
    "bee nest" "fossil" "amethyst geode" "lush cave" "dripstone cave"
    "deep dark" "ancient city" "mangrove swamp" "cherry grove" "meadow village"
)

for kw in "${semantic_keywords[@]}"; do
    test_keyword "$kw" "semantic"
done

# Finalize JSON
echo "]" >> "$OUTPUT_FILE"

# Summary
echo "=== Test Complete ==="
echo "Results saved to: $OUTPUT_FILE"
wc -l < "$OUTPUT_FILE"
