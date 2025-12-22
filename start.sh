#!/bin/bash

echo "========================================"
echo "  Omega Chat - Quick Start"
echo "========================================"
echo ""

# Check if node_modules exist
if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
fi

if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend
    npm install
    cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

echo ""
echo "✅ All dependencies are installed!"
echo ""
echo "Starting development servers..."
echo ""

# Start the dev servers
npm run dev
