# NUMBRLE - The Ultimate Number Guessing Game

NUMBRLE is a web-based number guessing game with two main modes:

1. **NUMBLE MODE**: A Wordle-like game where players guess a 5-digit number in 5 attempts, with color-coded feedback (green for correct digit in correct position, yellow for correct digit in wrong position, gray for wrong digit).

2. **MULTIPLAYER MODE**: Players compete to guess a number between 1-100 with higher/lower hints.

## Project Structure

- `numberguess.html` - Main homepage with game mode selection
- `login.html` - Authentication page with Firebase and Google OAuth
- `guest.html` - Page for playing without an account
- `multiplayer.html` - Multiplayer game interface
- `server.py` - WebSocket server for multiplayer functionality
- `requirements.txt` - Python dependencies for the server

## Setup Instructions

### 1. Frontend Setup
The frontend is built with pure HTML, CSS, and JavaScript. No build step is required.

### 2. WebSocket Server Setup
The multiplayer functionality requires a Python WebSocket server:

1. Install Python dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Start the WebSocket server:
   ```
   python server.py
   ```
   The server will run on `ws://localhost:8765`

### 3. Running the Game
1. Open `numberguess.html` in your web browser
2. Choose a game mode:
   - NUMBLE MODE: Guess a 5-digit number
   - MULTIPLAYER MODE: Compete with others in real-time

## Multiplayer Game Rules

1. Create or join a game room
2. Each room can host 2-6 players
3. Games run for 1-10 rounds (configurable when creating a room)
4. In each round, all players guess a number between the specified range (default: 1-100)
5. The player closest to the target number wins the round and scores a point
6. The player with the most points at the end of all rounds wins the game

## Technologies Used

- Frontend: HTML, CSS, JavaScript
- Backend: Python with WebSockets
- Authentication: Firebase (Google OAuth)

## Firebase Configuration

The application uses Firebase for authentication with the following configuration:
- apiKey: "AIzaSyCO_f3cO4I77r94sHyZesAhkEA40EXWGBk"
- authDomain: "numbrle-game.firebaseapp.com" 
- Google OAuth client ID: "473131258076-ulg0nmfmoltc6rrapuo2pcrl6piutkub.apps.googleusercontent.com"

## Development

To modify or extend the game:

1. Frontend changes: Edit the HTML, CSS, and JavaScript in the respective files
2. Backend changes: Modify `server.py` to adjust game logic or add new features
3. Testing local changes: Start the WebSocket server and open the game in your browser