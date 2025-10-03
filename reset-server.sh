#!/bin/bash

echo "Killing processes on port 3000..."

# Find and kill processes using port 3000
PID=$(lsof -ti:3000)
if [ ! -z "$PID" ]; then
    echo "Killing process $PID"
    kill -9 $PID
else
    echo "No process found on port 3000"
fi

# Wait a moment for processes to fully terminate
sleep 2

echo "Starting server..."
npm run api
