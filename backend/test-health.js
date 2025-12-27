// Quick test script to check health endpoint
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/omega-chat';

// Test health endpoint logic
app.get('/api/health', (req, res) => {
  try {
    console.log('Health check called');
    const mongoStatus = mongoose.connection.readyState;
    console.log('MongoDB readyState:', mongoStatus);
    
    const statusMessages = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    let safeUri = MONGODB_URI || 'not set';
    try {
      if (MONGODB_URI && typeof MONGODB_URI === 'string') {
        safeUri = MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
      }
    } catch (uriError) {
      console.error('URI replace error:', uriError);
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
    
    console.log('Sending response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
});

const PORT = 5001; // Use different port to avoid conflicts
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test: http://localhost:${PORT}/api/health`);
});

