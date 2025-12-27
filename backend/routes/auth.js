import express from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import axios from 'axios';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Function to configure GitHub OAuth Strategy (called from server.js after dotenv loads)
export function configureGitHubStrategy() {
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    // Remove existing strategy if any
    if (passport._strategies.github) {
      passport.unuse('github');
    }
    
    const callbackURL = process.env.GITHUB_CALLBACK_URL || "http://localhost:5000/api/auth/github/callback";
    console.log('🔧 Configuring GitHub OAuth with callback URL:', callbackURL);
    
    passport.use('github', new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: callbackURL
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if MongoDB is connected
        if (mongoose.connection.readyState !== 1) {
          console.error('❌ MongoDB not connected. ReadyState:', mongoose.connection.readyState);
          return done(new Error('Database not connected. Please ensure MongoDB is running.'), null);
        }
        
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
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/login?error=oauth_not_configured`);
  }
  
  // Ensure strategy is configured
  if (!passport._strategies.github) {
    configureGitHubStrategy();
  }
  
  if (!passport._strategies.github) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/login?error=oauth_strategy_failed`);
  }
  
  passport.authenticate('github', { scope: ['user:email', 'repo'] })(req, res, next);
});

router.get('/github/callback',
  (req, res, next) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/login?error=oauth_not_configured`);
    }
    
    // Ensure strategy is configured
    if (!passport._strategies.github) {
      configureGitHubStrategy();
    }
    
    if (!passport._strategies.github) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/login?error=oauth_strategy_failed`);
    }
    
    // Log callback URL for debugging
    const callbackURL = process.env.GITHUB_CALLBACK_URL || "http://localhost:5000/api/auth/github/callback";
    console.log('🔗 GitHub OAuth callback URL:', callbackURL);
    console.log('🔑 Client ID:', process.env.GITHUB_CLIENT_ID?.substring(0, 10) + '...');
    
    passport.authenticate('github', { 
      failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=oauth_failed`
    }, (err, user, info) => {
      if (err) {
        console.error('❌ GitHub OAuth error:', err);
        console.error('Error details:', {
          message: err.message,
          statusCode: err.statusCode,
          oauthError: err.oauthError
        });
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/login?error=oauth_failed&details=${encodeURIComponent(err.message || 'Unknown error')}`);
      }
      if (!user) {
        console.error('❌ GitHub OAuth: No user returned');
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/login?error=oauth_failed&details=no_user`);
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  async (req, res) => {
    try {
      if (!req.user) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/login?error=auth_failed`);
      }
      
      const token = jwt.sign(
        { userId: req.user._id },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '7d' }
      );
      
      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('❌ Error generating token:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/login?error=auth_failed`);
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

// Get user's personal GitHub stats
router.get('/github-stats', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    if (!user.githubToken) {
      return res.status(400).json({ 
        success: false,
        error: 'GitHub token not available. Please reconnect your GitHub account.' 
      });
    }
    
    try {
      // Fetch user profile stats
      const [profileResponse, reposResponse, followersResponse, followingResponse] = await Promise.all([
        axios.get('https://api.github.com/user', {
          headers: { Authorization: `token ${user.githubToken}` },
          timeout: 10000
        }),
        axios.get('https://api.github.com/user/repos', {
          headers: { Authorization: `token ${user.githubToken}` },
          params: { per_page: 100, sort: 'updated' },
          timeout: 10000
        }),
        axios.get('https://api.github.com/user/followers', {
          headers: { Authorization: `token ${user.githubToken}` },
          params: { per_page: 1 },
          timeout: 10000
        }),
        axios.get('https://api.github.com/user/following', {
          headers: { Authorization: `token ${user.githubToken}` },
          params: { per_page: 1 },
          timeout: 10000
        })
      ]);
      
      const profile = profileResponse.data;
      const repos = reposResponse.data || [];
      
      // Calculate stats
      const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
      const totalForks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
      const publicRepos = repos.filter(r => !r.private).length;
      const privateRepos = repos.filter(r => r.private).length;
      
      // Get followers and following count from headers
      const followersCount = followersResponse.headers.link 
        ? parseInt(followersResponse.headers.link.match(/page=(\d+)>; rel="last"/)?.[1] || '0')
        : followersResponse.data?.length || 0;
      const followingCount = followingResponse.headers.link 
        ? parseInt(followingResponse.headers.link.match(/page=(\d+)>; rel="last"/)?.[1] || '0')
        : followingResponse.data?.length || 0;
      
      // Get top languages
      const languageCounts = {};
      repos.forEach(repo => {
        if (repo.language) {
          languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
        }
      });
      const topLanguages = Object.entries(languageCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([lang, count]) => ({ language: lang, count }));
      
      const stats = {
        username: profile.login,
        name: profile.name || profile.login,
        bio: profile.bio || '',
        avatar: profile.avatar_url,
        profileUrl: profile.html_url,
        followers: profile.followers || followersCount,
        following: profile.following || followingCount,
        publicRepos: profile.public_repos || publicRepos,
        totalRepos: repos.length,
        privateRepos: privateRepos,
        totalStars: totalStars,
        totalForks: totalForks,
        topLanguages: topLanguages,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        location: profile.location,
        company: profile.company,
        blog: profile.blog
      };
      
      res.json({ 
        success: true,
        stats 
      });
    } catch (githubError) {
      console.error('GitHub API error:', githubError);
      if (githubError.response?.status === 403) {
        return res.status(403).json({ 
          success: false,
          error: 'GitHub API rate limit exceeded. Please try again later.' 
        });
      }
      throw new Error('Failed to fetch GitHub stats: ' + (githubError.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error fetching GitHub stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch GitHub stats: ' + (error.message || 'Unknown error') 
    });
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
