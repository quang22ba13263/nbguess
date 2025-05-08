// Server for NUMBRLE game authentication with MongoDB and Google OAuth
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');

// Load environment variables if available
try {
  if (fs.existsSync('.env')) {
    require('dotenv').config();
  }
} catch (err) {
  console.log('No .env file found, using default environment');
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Environment detection
const isProduction = process.env.NODE_ENV === 'production';
console.log(`Running in ${isProduction ? 'production' : 'development'} mode`);
console.log(`Server port: ${PORT}`);

// Log environment info for debugging
console.log('Node environment:', process.env.NODE_ENV);
console.log('Platform:', process.platform);
console.log('Host:', process.env.HOST || 'not set');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(__dirname));

// Google OAuth client
const googleClient = new OAuth2Client('473131258076-ulg0nmfmoltc6rrapuo2pcrl6piutkub.apps.googleusercontent.com');

// Environment variables - Replace with your actual values in production
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Tạo URI MongoDB từ các thành phần riêng biệt nếu người dùng chia nhỏ biến môi trường
let MONGODB_URI;
if (process.env.MONGODB_USER && process.env.MONGODB_PASSWORD && process.env.MONGODB_CLUSTER) {
    MONGODB_URI = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=nbguess`;
} else {
    MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/numbrle';
}

// Thêm log để debug
console.log('MongoDB URI configuration:');
console.log('URI defined:', MONGODB_URI ? 'Yes' : 'No');
if (MONGODB_URI) {
    // Hiển thị URI an toàn (không hiện mật khẩu)
    const sanitizedURI = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log('Sanitized URI:', sanitizedURI);
}

// Cập nhật các tùy chọn kết nối MongoDB
const mongooseOptions = {
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 60000,
    heartbeatFrequencyMS: 30000,
    retryWrites: true,
    w: 'majority',
    family: 4  // Chỉ định IPv4 để tránh vấn đề IPv6
};

// Health check route for testing
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'Server is running', 
        mongoConnection: mongoose.connection.readyState === 1,
        mongodbURI: MONGODB_URI ? 'URI is defined' : 'URI is missing',
        nodeEnv: process.env.NODE_ENV || 'development'
    });
});

// Thiết lập kết nối MongoDB riêng biệt
async function connectToMongoDB() {
    try {
        await mongoose.connect(MONGODB_URI, mongooseOptions);
        console.log('MongoDB connected successfully');
        return true;
    } catch (err) {
        console.error('MongoDB connection error details:', err);
        // Hiển thị thông tin chi tiết lỗi
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

// Gọi hàm kết nối
connectToMongoDB().then(success => {
    if (!success) {
        console.log('Warning: Server running without MongoDB connection');
    }
});

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

// ROOT ROUTE - Serve the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'numberguess.html'));
});

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

// Route to handle all other page requests - serve the appropriate HTML files
app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    const validPages = ['numberguess', 'login', 'guest', 'numble', 'multiplayer'];
    
    if (validPages.includes(page)) {
        res.sendFile(path.join(__dirname, `${page}.html`));
    } else {
        res.status(404).send('Page not found');
    }
});

// Tạo HTTP server
const server = http.createServer(app);

// Khởi động Python WebSocket server như một process con
const startPythonServer = () => {
  console.log("Starting Python WebSocket server...");
  
  // Check if we're on Glitch or similar platform
  const isGlitch = process.env.PROJECT_DOMAIN || process.env.GLITCH || process.platform === 'linux';
  
  // Determine Python command based on environment
  const pythonCommand = isGlitch ? 'python3' : 'python';
  
  console.log(`Using Python command: ${pythonCommand}`);
  console.log(`Running on Glitch or similar platform: ${isGlitch ? 'Yes' : 'No'}`);
  
  // Set environment variables for Python process
  const env = {
    ...process.env,
    PORT: process.env.PYTHON_WEBSOCKET_PORT || 8765,
    NODE_ENV: process.env.NODE_ENV || 'development'
  };
  
  const pythonProcess = spawn(pythonCommand, ['server.py'], { env });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python server: ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python server error: ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python server exited with code ${code}`);
    // Restart nếu server bị crash
    if (code !== 0) {
      console.log("Restarting Python server...");
      setTimeout(startPythonServer, 5000);
    }
  });
  
  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python server:', err);
    console.log('Attempting to start Python server with python3 instead...');
    
    // Try with python3 if python fails
    if (pythonCommand === 'python') {
      const pythonProcess3 = spawn('python3', ['server.py'], { env });
      
      pythonProcess3.stdout.on('data', (data) => {
        console.log(`Python3 server: ${data.toString().trim()}`);
      });
      
      pythonProcess3.stderr.on('data', (data) => {
        console.error(`Python3 server error: ${data.toString().trim()}`);
      });
    }
  });

  return pythonProcess;
};

// Tạo một WebSocket proxy server
const wss = new WebSocket.Server({ noServer: true });

// Xử lý upgrade HTTP request thành WebSocket connection
server.on('upgrade', (request, socket, head) => {
  // Nếu đường dẫn là /ws - chuyển tiếp đến Python WebSocket server
  if (request.url === '/ws') {
    console.log('WebSocket upgrade request received for /ws');
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log('Client connected to proxy WebSocket server');
      
      // Xác định địa chỉ Python WebSocket server
      const pythonHost = process.env.NODE_ENV === 'production' ? '127.0.0.1' : 'localhost';
      const pythonPort = 8765;
      const pythonWsUrl = `ws://${pythonHost}:${pythonPort}`;
      
      console.log(`Connecting to Python WebSocket server at ${pythonWsUrl}`);
      
      // Tạo kết nối đến Python WebSocket server
      const pythonWs = new WebSocket(pythonWsUrl);
      
      pythonWs.on('open', () => {
        console.log('Successfully connected to Python WebSocket server');
      });
      
      // Chuyển tiếp messages từ client đến Python server
      ws.on('message', (message) => {
        if (pythonWs.readyState === WebSocket.OPEN) {
          console.log('Forwarding message from client to Python server');
          pythonWs.send(message);
        } else {
          console.error('Cannot forward message: Python WebSocket not open');
        }
      });
      
      // Chuyển tiếp messages từ Python server đến client
      pythonWs.on('message', (message) => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log('Forwarding message from Python server to client');
          ws.send(message);
        } else {
          console.error('Cannot forward message: Client WebSocket not open');
        }
      });
      
      // Xử lý đóng kết nối
      ws.on('close', () => {
        console.log('Client WebSocket closed, closing Python connection');
        pythonWs.close();
      });
      
      pythonWs.on('close', (code, reason) => {
        console.log(`Python WebSocket closed with code ${code}, reason: ${reason}`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
      
      // Xử lý lỗi
      ws.on('error', (error) => {
        console.error('Client WebSocket error:', error);
      });
      
      pythonWs.on('error', (error) => {
        console.error('Python WebSocket error:', error);
        console.log('Attempting to close client WebSocket due to Python error');
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    });
  } else {
    console.log(`WebSocket upgrade request received for unsupported path: ${request.url}`);
    socket.destroy();
  }
});

// Khởi động server
server.listen(PORT, () => {
  console.log(`Express server running at http://localhost:${PORT}`);
  
  // Khởi động Python WebSocket server
  const pythonServer = startPythonServer();
  
  // Xử lý khi Express server đóng
  process.on('SIGINT', () => {
    console.log('Shutting down servers...');
    pythonServer.kill();
    process.exit(0);
  });
}); 