# NUMBRLE - The Ultimate Number Guessing Game

A multiplayer number guessing game with two exciting modes:
1. **NUMBLE MODE**: A Wordle-like game for numbers where you guess a 5-digit number
2. **MULTIPLAYER MODE**: Compete with others to guess a number between 1-100

## Features

- Google OAuth Authentication
- MongoDB Atlas for data storage
- JWT token-based authentication
- User profiles and statistics tracking
- Responsive design

## Setup Instructions for Glitch

1. **Import this project to Glitch**:
   - Create a new project on Glitch
   - Import from GitHub or upload all files

2. **Set up environment variables**:
   - In your Glitch project, go to `.env` file
   - Add the following variables:
     ```
     MONGODB_URI=mongodb+srv://quan9bright:<db_password>@nbguess.m5jq0pt.mongodb.net/?retryWrites=true&w=majority&appName=nbguess
     JWT_SECRET=your_secure_jwt_secret
     ```
   - Replace `<db_password>` with your actual MongoDB password

3. **Update API endpoint in login.html**:
   - Open `login.html`
   - Update the `API_BASE_URL` variable with your actual Glitch project URL:
     ```javascript
     const API_BASE_URL = window.location.hostname === 'localhost' 
         ? 'http://localhost:3000/api' 
         : 'https://your-glitch-project-name.glitch.me/api';
     ```

4. **Start the application**:
   - Glitch should automatically start the application
   - If not, run `npm start` in the Glitch console

## Project Structure

- **Frontend Files**:
  - `numberguess.html`: Main page with game mode selection
  - `login.html`: Authentication page with Google OAuth
  - `guest.html`: Play without an account
  - `numble.html`: 5-digit number guessing game
  - `multiplayer.html`: Competitive mode

- **Backend Files**:
  - `server.js`: Express server with authentication routes
  - `package.json`: Project dependencies

## API Endpoints

- **Authentication**:
  - `POST /api/auth/register`: Register a new user
  - `POST /api/auth/login`: Login existing user
  - `POST /api/auth/google`: Google OAuth login/register
  - `GET /api/auth/verify`: Verify JWT token
  - `POST /api/auth/forgot-password`: Request password reset

- **User**:
  - `GET /api/users/profile`: Get user profile
  - `PUT /api/users/stats`: Update user statistics

## MongoDB Schema

The user schema includes:
- Username, email, password (hashed)
- Google ID for OAuth users
- Profile picture
- Game statistics (games played, won, high score)

## Google OAuth

The project uses Google OAuth for authentication with the client ID:
`473131258076-ulg0nmfmoltc6rrapuo2pcrl6piutkub.apps.googleusercontent.com`

## Development

To run this project locally:
1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with MongoDB connection string and JWT secret
4. Run the server: `npm run dev`