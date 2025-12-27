#!/bin/bash
# API Health Check Script for Mac/Linux

echo "🔍 Checking API Health..."
echo ""

response=$(curl -s http://localhost:5000/api/health)

if [ $? -eq 0 ]; then
    echo "✅ API Response:"
    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    echo ""
    
    # Check if MongoDB is connected
    if echo "$response" | grep -q '"connected":true'; then
        echo "✅ MongoDB: Connected"
    else
        echo "⚠️  WARNING: MongoDB is not connected!"
        echo "   Please check:"
        echo "   1. MongoDB is running (if local)"
        echo "   2. MongoDB Atlas network access is configured"
        echo "   3. Connection string in backend/.env is correct"
    fi
else
    echo "❌ Error: Could not connect to API"
    echo ""
    echo "Possible reasons:"
    echo "1. Backend server is not running"
    echo "   → Start it with: npm run dev"
    echo ""
    echo "2. Backend is running on a different port"
    echo "   → Check backend/.env for PORT setting"
fi

