#!/bin/bash

# Echo some debug info
echo "Starting services..."
echo "Node.js version: $(node -v)"
echo "Python version: $(python --version)"
echo "Current directory: $(pwd)"
echo "Files in current directory: $(ls -la)"

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Start the Python WebSocket server in the background
echo "Starting Python WebSocket server..."
python python_socket_server.py &
PYTHON_PID=$!

# Start the Node.js server
echo "Starting Node.js server..."
npm start

# Kill the Python server when the Node.js server exits
kill $PYTHON_PID 