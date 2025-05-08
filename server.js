// Server for NUMBRLE game authentication with MongoDB and Google OAuth
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Google OAuth client
const googleClient = new OAuth2Client('473131258076-ulg0nmfmoltc6rrapuo2pcrl6piutkub.apps.googleusercontent.com');

// Environment variables - Replace with your actual values in production
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/numbrle';

// MongoDB Connection
mongoose.connect(MONGODB_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false }, // Not required for OAuth users
    googleId: { type: String, required: false },
    profilePicture: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    stats: {
        gamesPlayed: { type: Number, default: 0 },
        gamesWon: { type: Number, default: 0 },
        highScore: { type: Number, default: 0 }
    }
});

// User Model
const User = mongoose.model('User', userSchema);

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' } // Token expires in 7 days
    );
};

// Sanitize user data for client
const sanitizeUser = (user) => {
    return {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        stats: user.stats
    };
};

// Verify JWT token middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access denied. No token provided.' 
        });
    }
    
    const token = authHeader.split(' ')[1]; // Format: "Bearer TOKEN"
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid token.' 
        });
    }
};

// Routes
// Register new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email already exists.' 
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create new user
        const user = new User({
            username,
            email,
            password: hashedPassword
        });
        
        // Save user to database
        await user.save();
        
        // Generate JWT token
        const token = generateToken(user);
        
        res.status(201).json({
            success: true,
            token,
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during registration.' 
        });
    }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email or password.' 
            });
        }
        
        // Check if password is correct
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email or password.' 
            });
        }
        
        // Generate JWT token
        const token = generateToken(user);
        
        res.json({
            success: true,
            token,
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login.' 
        });
    }
});

// Google OAuth login/register
app.post('/api/auth/google', async (req, res) => {
    try {
        const { token } = req.body;
        
        // Verify Google token
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: '473131258076-ulg0nmfmoltc6rrapuo2pcrl6piutkub.apps.googleusercontent.com'
        });
        
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;
        
        // Check if user already exists
        let user = await User.findOne({ googleId });
        
        if (!user) {
            // Check if email already exists
            user = await User.findOne({ email });
            
            if (user) {
                // Update existing user with Google ID
                user.googleId = googleId;
                if (!user.profilePicture && picture) {
                    user.profilePicture = picture;
                }
                await user.save();
            } else {
                // Create new user
                user = new User({
                    username: name,
                    email,
                    googleId,
                    profilePicture: picture
                });
                await user.save();
            }
        }
        
        // Generate JWT token
        const jwtToken = generateToken(user);
        
        res.json({
            success: true,
            token: jwtToken,
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during Google authentication.' 
        });
    }
});

// Verify token
app.get('/api/auth/verify', verifyToken, (req, res) => {
    res.json({ success: true });
});

// Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }
        
        // In a real application, send password reset email
        // For this example, we'll just return success
        
        res.json({ 
            success: true, 
            message: 'Password reset email sent.' 
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during password reset request.' 
        });
    }
});

// Get user profile
app.get('/api/users/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }
        
        res.json({
            success: true,
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching profile.' 
        });
    }
});

// Update user stats
app.put('/api/users/stats', verifyToken, async (req, res) => {
    try {
        const { gamesPlayed, gamesWon, highScore } = req.body;
        
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }
        
        // Update stats
        if (gamesPlayed !== undefined) user.stats.gamesPlayed = gamesPlayed;
        if (gamesWon !== undefined) user.stats.gamesWon = gamesWon;
        if (highScore !== undefined && highScore > user.stats.highScore) {
            user.stats.highScore = highScore;
        }
        
        await user.save();
        
        res.json({
            success: true,
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error('Update stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while updating stats.' 
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 