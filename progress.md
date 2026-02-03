# Ralph-Loops Progress: Minecraft Map Scraper QA

## Status: ITERATION 6 - FIXES COMPLETE - 2026-02-03

### Builder v6 Fixes

**Word Boundary Bug Fixed:**
- Problem: "stray" was matching "Stranded Island" due to substring matching
- Solution: Added `hasWordBoundaryMatch` requirement in calculateRelevance
- Results without word boundary matches are now filtered out
- "stray" no longer returns "Stranded" maps

**Semantic Overreach Bug Fixed:**
- Problem: "futuristic city" was expanding to include "atlantis", "underwater", "sunken", "ocean"
- Solution: Removed 'underwater' and 'atlantis' keyword mappings entirely
- Cleaned up conflictingTerms to only include truly conflicting categories
- "futuristic city" now only expands to related city/futuristic terms

### Changes Made to server.js:
1. Removed keyword mappings for 'underwater' and 'atlantis' (lines 62-63)
2. Simplified conflictingTerms to remove overreaching associations
3. Enforced strict word boundary matching everywhere (removed `includes()` fallbacks)
4. Added `hasWordBoundaryMatch` tracking in calculateRelevance
5. Filter out results that only have substring matches

### Local Testing Results:
- "stray" → only matches "stray" (word boundaries), rejects "stranded"
- "futuristic city" → no longer includes "atlantis", "underwater" in search terms
- Results are properly filtered for relevance

### Deployment Status:
- Code committed: `53ad617 Add word boundary match requirement`
- Pushed to origin/main
- Waiting for Railway auto-deploy
