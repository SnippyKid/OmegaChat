import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import session from 'express-session';
import passport from 'passport';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables FIRST
dotenv.config();

// Import routes AFTER dotenv.config()
import User from './models/User.js';
import Project from './models/Project.js';
import ChatRoom from './models/ChatRoom.js';
import authRoutes, { configureGitHubStrategy } from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import chatRoutes from './routes/chat.js';
import { setupSocketIO } from './socket/socketHandler.js';

// Configure GitHub OAuth strategy after dotenv loads
configureGitHubStrategy();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.JWT_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Serve uploaded files - use absolute path
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/omega-chat';

// Configure mongoose to handle connection better
mongoose.set('bufferCommands', false); // Disable mongoose buffering

// Connection options
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  connectTimeoutMS: 10000, // Give up initial connection after 10s
  maxPoolSize: 10, // Maintain up to 10 socket connections
  minPoolSize: 1, // Maintain at least 1 socket connection
};

mongoose.connect(MONGODB_URI, mongooseOptions)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('💡 Tip: Make sure MongoDB is running or check your MONGODB_URI in .env');
    console.log('💡 If using local MongoDB, start it with: mongod');
    console.log('💡 If using MongoDB Atlas, check your connection string');
  });

// MongoDB connection state
const db = mongoose.connection;
db.on('error', (error) => {
  console.error('❌ MongoDB error:', error);
});
db.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
});
db.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});
db.on('connecting', () => {
  console.log('🔄 Connecting to MongoDB...');
});

// Health check endpoint - must be before routes to catch early errors
app.get('/api/health', (req, res) => {
  try {
    console.log('📊 Health check requested');
    
    // Safely get mongoose connection state
    let mongoStatus = 0;
    try {
      mongoStatus = mongoose?.connection?.readyState ?? 0;
    } catch (mongoError) {
      console.error('Error accessing mongoose connection:', mongoError);
      mongoStatus = 0;
    }
    
    // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const statusMessages = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    // Safely hide credentials in URI
    let safeUri = MONGODB_URI || 'not set';
    try {
      if (MONGODB_URI && typeof MONGODB_URI === 'string') {
        safeUri = MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
      }
    } catch (uriError) {
      console.error('URI processing error:', uriError);
      safeUri = MONGODB_URI || 'not set';
    }
    
    const response = { 
      status: mongoStatus === 1 ? 'ok' : 'degraded', 
      message: mongoStatus === 1 ? 'Omega Chat API is running!' : 'API is running but MongoDB is not connected',
      timestamp: new Date().toISOString(),
      database: {
        status: statusMessages[mongoStatus] || 'unknown',
        readyState: mongoStatus,
        connected: mongoStatus === 1,
        uri: safeUri
      }
    };
    
    console.log('✅ Health check response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('❌ Health check error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Routes - wrap in try-catch to handle any route initialization errors
try {
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/chat', chatRoutes);
  console.log('✅ Routes registered successfully');
} catch (routeError) {
  console.error('❌ Error registering routes:', routeError);
  console.error('Route error stack:', routeError.stack);
  // Continue - health endpoint should still work
}

// (Error handlers will be registered after all routes and test endpoints)

// Test endpoint to verify models work
app.get('/api/test/models', async (req, res) => {
  try {
    // Count documents in each collection
    const userCount = await User.countDocuments();
    const projectCount = await Project.countDocuments();
    const chatRoomCount = await ChatRoom.countDocuments();
    
    res.json({
      success: true,
      message: 'Database models are working!',
      counts: {
        users: userCount,
        projects: projectCount,
        chatRooms: chatRoomCount
      },
      models: {
        User: '✅ Loaded',
        Project: '✅ Loaded',
        ChatRoom: '✅ Loaded'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint for AI service
app.get('/api/test/ai', async (req, res) => {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const axios = (await import('axios')).default;
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'GEMINI_API_KEY not set in environment variables'
      });
    }
    
    // First, try to list available models
    let availableModels = [];
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models';
      const response = await axios.get(url, {
        headers: {
          'x-goog-api-key': apiKey
        }
      });
      
      if (response.data && response.data.models) {
        availableModels = response.data.models
          .filter(model => 
            model.supportedGenerationMethods && 
            model.supportedGenerationMethods.includes('generateContent')
          )
          .map(model => model.name.replace('models/', ''));
      }
    } catch (e) {
      console.log('Could not list models:', e.message);
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use available models from API, or fallback
    const testModels = availableModels.length > 0 
      ? availableModels 
      : ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
    
    let workingModel = null;
    let lastError = null;
    
    for (const modelName of testModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Say hello');
        const response = result.response.text();
        workingModel = modelName;
        break;
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }
    
    if (workingModel) {
      res.json({
        success: true,
        message: 'AI service is working!',
        workingModel: workingModel,
        availableModels: availableModels,
        apiKeyLength: apiKey.length
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'No working models found',
        testedModels: testModels,
        availableModelsFromAPI: availableModels,
        lastError: lastError
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

const PORT = process.env.PORT || 5000;

// Create HTTP server
const httpServer = createServer(app);

// Setup Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true
  }
});

// Initialize Socket.io handlers
setupSocketIO(io);

// Make io instance available to routes for webhooks
app.set('io', io);

// Global error handler middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  console.error('Error stack:', err.stack);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler (must be after all routes)
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    path: req.path
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Test models: http://localhost:${PORT}/api/test/models`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🗄️  MongoDB URI: ${MONGODB_URI}`);
  console.log(`🔌 Socket.io ready for real-time chat`);
}).on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
    console.error(`💡 Solution: Kill the process using port ${PORT} or use a different port.`);
    console.error(`💡 Windows: netstat -ano | findstr :${PORT} then taskkill /F /PID <PID>`);
    console.error(`💡 Or use: start.bat (it will auto-kill processes)`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});
