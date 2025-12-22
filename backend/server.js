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

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('💡 Tip: Make sure MongoDB is running or check your MONGODB_URI in .env');
  });

// MongoDB connection state
const db = mongoose.connection;
db.on('error', (error) => {
  console.error('MongoDB error:', error);
});
db.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const mongoStatus = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  
  res.json({ 
    status: 'ok', 
    message: 'Omega Chat API is running!',
    timestamp: new Date().toISOString(),
    database: {
      status: mongoStatus === 1 ? 'connected' : 'disconnected',
      readyState: mongoStatus
    }
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/chat', chatRoutes);

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

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Test models: http://localhost:${PORT}/api/test/models`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🗄️  MongoDB URI: ${MONGODB_URI}`);
  console.log(`🔌 Socket.io ready for real-time chat`);
});
