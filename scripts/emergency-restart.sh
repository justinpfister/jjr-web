#!/bin/bash

echo "🚨 Emergency Server Restart Script"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo "❌ Error: server.js not found. Are you in the right directory?"
    echo "   Expected: /var/www/jjr-web or similar"
    exit 1
fi

echo "📁 Current directory: $(pwd)"
echo "📄 Found server.js: ✅"

# Check PM2 status
echo ""
echo "📊 Checking PM2 status..."
pm2 status

# Try to restart jjr-web
echo ""
echo "🔄 Attempting to restart jjr-web..."
pm2 restart jjr-web

if [ $? -eq 0 ]; then
    echo "✅ PM2 restart successful!"
else
    echo "❌ PM2 restart failed. Trying to start fresh..."
    pm2 start server.js --name jjr-web
fi

# Check status again
echo ""
echo "📊 Final PM2 status:"
pm2 status

echo ""
echo "🌐 Testing server connection..."
sleep 2

# Test if server is responding
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ Server is responding on port 3000"
else
    echo "❌ Server is not responding on port 3000"
    echo "   Check PM2 logs: pm2 logs jjr-web"
fi

echo ""
echo "🔧 If server is still not working:"
echo "   1. Check PM2 logs: pm2 logs jjr-web"
echo "   2. Check if port 3000 is in use: lsof -i :3000"
echo "   3. Restart PM2 daemon: pm2 kill && pm2 start server.js --name jjr-web"
