// Server for NUMBRLE game authentication with MongoDB and Google OAuth
const express = require('express');
const http = require('http'); // Cần http để làm việc với WebSocket proxy
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware'); // THÊM DÒNG NÀY

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_WS_PORT_INTERNAL = process.env.PYTHON_WS_PORT || 8001; // Port Python server chạy nội bộ

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(__dirname));

// ... (Phần còn lại của code Google OAuth, JWT_SECRET, MongoDB URI, Mongoose Options, Health Check giữ nguyên) ...
// Google OAuth client
const googleClient = new OAuth2Client('473131258076-ulg0nmfmoltc6rrapuo2pcrl6piutkub.apps.googleusercontent.com');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
let MONGODB_URI;
if (process.env.MONGODB_USER && process.env.MONGODB_PASSWORD && process.env.MONGODB_CLUSTER) {
    MONGODB_URI = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=nbguess`;
} else {
    MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/numbrle';
}
console.log('MongoDB URI configuration:');
console.log('URI defined:', MONGODB_URI ? 'Yes' : 'No');
if (MONGODB_URI) {
    const sanitizedURI = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log('Sanitized URI:', sanitizedURI);
}
const mongooseOptions = {
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 60000,
    heartbeatFrequencyMS: 30000,
    retryWrites: true,
    w: 'majority',
    family: 4
};
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'Server is running', 
        mongoConnection: mongoose.connection.readyState === 1,
        mongodbURI: MONGODB_URI ? 'URI is defined' : 'URI is missing',
        nodeEnv: process.env.NODE_ENV || 'development'
    });
});
async function connectToMongoDB() {
    try {
        await mongoose.connect(MONGODB_URI, mongooseOptions);
        console.log('MongoDB connected successfully');
        return true;
    } catch (err) {
        console.error('MongoDB connection error details:', err);
        if (err.name === 'MongoServerSelectionError') {
            console.error('Cannot connect to MongoDB server. Please check:');
            console.error('1. Network access/whitelist settings in MongoDB Atlas');
            console.error('2. Username and password are correct');
            console.error('3. Database cluster name is correct');
            console.error('Error details:', err.message);
        }
        return false;
    }
}
connectToMongoDB().then(success => {
    if (!success) {
        console.log('Warning: Server running without MongoDB connection');
    }
});
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false }, 
    googleId: { type: String, required: false },
    profilePicture: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    stats: {
        gamesPlayed: { type: Number, default: 0 },
        gamesWon: { type: Number, default: 0 },
        highScore: { type: Number, default: 0 }
    }
});
const User = mongoose.model('User', userSchema);
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: '7d' } 
    );
};
const sanitizeUser = (user) => {
    return {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        stats: user.stats
    };
};
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }
    const token = authHeader.split(' ')[1]; 
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
};
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'numberguess.html'));
});
app.post('/api/auth/register', async (req, res) => { /* ... giữ nguyên ... */ });
app.post('/api/auth/login', async (req, res) => { /* ... giữ nguyên ... */ });
app.post('/api/auth/google', async (req, res) => { /* ... giữ nguyên ... */ });
app.get('/api/auth/verify', verifyToken, (req, res) => { /* ... giữ nguyên ... */ });
app.post('/api/auth/forgot-password', async (req, res) => { /* ... giữ nguyên ... */ });
app.get('/api/users/profile', verifyToken, async (req, res) => { /* ... giữ nguyên ... */ });
app.put('/api/users/stats', verifyToken, async (req, res) => { /* ... giữ nguyên ... */ });
app.get('/:page.html', (req, res) => { /* ... giữ nguyên ... */ });
// --- GIỮ NGUYÊN CÁC ROUTES Ở TRÊN ---
// API routes (đã có sẵn của bạn)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'User with this email already exists.' 
            });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const user = new User({
            username,
            email,
            password: hashedPassword
        });
        await user.save();
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

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email or password.' 
            });
        }
        // Kiểm tra xem user có password không (trường hợp user đăng nhập bằng Google trước đó)
        if (!user.password) {
             return res.status(400).json({ 
                success: false, 
                message: 'Please log in using Google, or reset your password if you created account via email before.' 
            });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid email or password.' 
            });
        }
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

app.post('/api/auth/google', async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: '473131258076-ulg0nmfmoltc6rrapuo2pcrl6piutkub.apps.googleusercontent.com'
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;
        let user = await User.findOne({ googleId });
        if (!user) {
            user = await User.findOne({ email });
            if (user) {
                user.googleId = googleId;
                if (!user.profilePicture && picture) {
                    user.profilePicture = picture;
                }
                await user.save();
            } else {
                user = new User({
                    username: name,
                    email,
                    googleId,
                    profilePicture: picture
                });
                await user.save();
            }
        }
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

app.get('/api/auth/verify', verifyToken, (req, res) => {
    res.json({ success: true });
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }
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

app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    const validPages = ['numberguess', 'login', 'guest', 'numble', 'multiplayer']; // Thêm 'multiplayer' nếu có file multiplayer.html
    if (validPages.includes(page)) {
        res.sendFile(path.join(__dirname, `${page}.html`));
    } else {
        res.status(404).send('Page not found');
    }
});


// --- THÊM PHẦN PROXY CHO PYTHON WEBSOCKET SERVER ---
// Proxy WebSocket requests đến Python server
const wsPythonProxy = createProxyMiddleware({
  target: `http://127.0.0.1:${PYTHON_WS_PORT_INTERNAL}`, // Target là Python server nội bộ
  ws: true, // Quan trọng: Bật proxy cho WebSocket
  logLevel: 'debug', // Để xem log nếu có vấn đề
  onError: (err, req, res) => {
    console.error('Proxy Error:', err);
    // Nếu res có thể ghi (ví dụ, không phải WebSocket upgrade)
    if (res && res.writeHead && !res.headersSent) {
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        });
        res.end('Proxy error: Could not connect to WebSocket service.');
    }
  }
});

// Áp dụng proxy cho một đường dẫn cụ thể, ví dụ /ws_python
// Client sẽ kết nối tới wss://your-project.glitch.me/ws_python
app.use('/ws_python', wsPythonProxy);


// Tạo HTTP server từ Express app
const server = http.createServer(app); // THAY ĐỔI: Dùng http.createServer

// Nâng cấp kết nối WebSocket cho proxy (quan trọng khi dùng http-proxy-middleware với ws:true)
// server.on('upgrade', wsPythonProxy.upgrade); // http-proxy-middleware phiên bản mới thường tự xử lý khi ws:true và dùng với app


// Start server (dùng server.listen thay vì app.listen)
server.listen(PORT, () => { // THAY ĐỔI: Dùng server.listen
    console.log(`Node.js server running on port ${PORT}`);
    console.log(`Python WebSocket will be proxied from /ws_python to internal port ${PYTHON_WS_PORT_INTERNAL}`);
});