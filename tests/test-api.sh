#!/bin/bash

# Test the Vehicle Search API endpoint
# Requires server running on localhost:3000

echo "🔍 Testing /api/vehicles endpoint..."
echo ""

# Example 1: Search for Tesla vehicles
echo "1️⃣ Searching for TESLA vehicles..."
curl -X POST http://localhost:3000/api/scraper/vehicles \
  -H "Content-Type: application/json" \
  -d '{
    "query": "tesla",
    "count": 5
  }' | jq .

echo ""
echo ""

# Example 2: Search for Ford vehicles
echo "2️⃣ Searching for FORD vehicles..."
curl -X POST http://localhost:3000/api/scraper/vehicles \
  -H "Content-Type: application/json" \
  -d '{
    "query": "ford",
    "count": 3
  }' | jq .

echo ""
echo ""

# Example 3: Custom search query
echo "3️⃣ Searching for Honda Civic..."
curl -X POST http://localhost:3000/api/scraper/vehicles \
  -H "Content-Type: application/json" \
  -d '{
    "query": "honda civic",
    "count": 5
  }' | jq .
