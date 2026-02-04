#!/bin/bash
set -e

# Read tokens from GitHub secrets
RAILWAY_TOKEN="${STEVENS_RAILWAY_ACCOUNT:-$STEVENS_RAILWAY}"
CURSEFORGE_KEY="${CURSEFORGE_API_KEY}"

# Railway project details from live URL
# web-production-9af19.up.railway.app suggests project/service IDs

echo "Attempting to set CURSEFORGE_API_KEY via Railway GraphQL API..."

# Try variableUpsert mutation
curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer ${RAILWAY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"mutation { variableUpsert(input: { projectId: \\\"PROJECT_ID\\\", environmentId: \\\"ENVIRONMENT_ID\\\", serviceId: \\\"SERVICE_ID\\\", name: \\\"CURSEFORGE_API_KEY\\\", value: \\\"${CURSEFORGE_KEY}\\\" }) }\"
  }"
