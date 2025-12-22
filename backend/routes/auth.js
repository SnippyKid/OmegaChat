import express from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import axios from 'axios';

const router = express.Router();

// Function to configure GitHub OAuth Strategy (called from server.js after dotenv loads)
export function configureGitHubStrategy() {
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    // Remove existing strategy if any
    if (passport._strategies.github) {
      passport.unuse('github');
    }
    
    passport.use('github', new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || "http://localhost:5000/api/auth/github/callback"
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ githubId: profile.id });
        
        if (!user) {
          // Fetch user repositories
          const reposResponse = await axios.get('https://api.github.com/user/repos', {
            headers: { Authorization: `token ${accessToken}` }
          });
          
          user = new User({
            githubId: profile.id,
            username: profile.username,
            email: profile.emails?.[0]?.value,
            avatar: profile.photos?.[0]?.value,
            githubToken: accessToken,
            repositories: reposResponse.data.map(repo => ({
              name: repo.name,
              fullName: repo.full_name,
              url: repo.html_url,
              private: repo.private
            }))
          });
          await user.save();
        } else {
          // Update existing user
          user.githubToken = accessToken;
          user.avatar = profile.photos?.[0]?.value;
          
          // Update repositories
          const reposResponse = await axios.get('https://api.github.com/user/repos', {
            headers: { Authorization: `token ${accessToken}` }
          });
          user.repositories = reposResponse.data.map(repo => ({
            name: repo.name,
            fullName: repo.full_name,
            url: repo.html_url,
            private: repo.private
          }));
          
          await user.save();
        }
        
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }));
    
    console.log('✅ GitHub OAuth strategy configured');
    return true;
  } else {
    console.warn('⚠️ GitHub OAuth credentials not set. GitHub login will not work.');
    return false;
  }
}

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// GitHub OAuth routes
router.get('/github', (req, res, next) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return res.status(500).json({ error: 'GitHub OAuth not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env' });
  }
  
  // Ensure strategy is configured
  if (!passport._strategies.github) {
    configureGitHubStrategy();
  }
  
  if (!passport._strategies.github) {
    return res.status(500).json({ error: 'GitHub OAuth strategy not configured' });
  }
  
  passport.authenticate('github', { scope: ['user:email', 'repo'] })(req, res, next);
});

router.get('/github/callback',
  (req, res, next) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.status(500).json({ error: 'GitHub OAuth not configured' });
    }
    
    // Ensure strategy is configured
    if (!passport._strategies.github) {
      configureGitHubStrategy();
    }
    
    if (!passport._strategies.github) {
      return res.status(500).json({ error: 'GitHub OAuth strategy not configured' });
    }
    
    passport.authenticate('github', { failureRedirect: '/login' })(req, res, next);
  },
  async (req, res) => {
    try {
      const token = jwt.sign(
        { userId: req.user._id },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '7d' }
      );
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?token=${token}`);
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=auth_failed`);
    }
  }
);

// Verify token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.userId).select('-githubToken');
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.userId).select('-githubToken');
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Get user's GitHub repositories
router.get('/repositories', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // If user has GitHub token, fetch fresh repositories from GitHub API
    if (user.githubToken) {
      try {
        const reposResponse = await axios.get('https://api.github.com/user/repos', {
          headers: { Authorization: `token ${user.githubToken}` },
          params: {
            per_page: 100,
            sort: 'updated',
            type: 'all' // Include both owned and contributed repos
          }
        });
        
        const repositories = reposResponse.data.map(repo => ({
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
          private: repo.private,
          description: repo.description,
          updatedAt: repo.updated_at
        }));
        
        // Update user's repositories cache
        user.repositories = repositories;
        await user.save();
        
        return res.json({ repositories });
      } catch (githubError) {
        console.error('Error fetching from GitHub API:', githubError.message);
        // Fall back to cached repositories if GitHub API fails
      }
    }
    
    // Return repositories from user document (cached or empty)
    res.json({ repositories: user.repositories || [] });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
