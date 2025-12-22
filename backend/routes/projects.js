import express from 'express';
import Project from '../models/Project.js';
import ChatRoom from '../models/ChatRoom.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import axios from 'axios';

const router = express.Router();

// Get user's projects
router.get('/my-projects', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'projects',
      populate: {
        path: 'members.user',
        select: 'username avatar'
      }
    });
    
    res.json({ projects: user.projects || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create project from GitHub repo and auto-invite contributors
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { repoFullName } = req.body;
    const user = await User.findById(req.userId);
    
    if (!user.githubToken) {
      return res.status(400).json({ error: 'GitHub token not available' });
    }
    
    // Fetch repo details from GitHub
    const repoResponse = await axios.get(
      `https://api.github.com/repos/${repoFullName}`,
      {
        headers: { Authorization: `token ${user.githubToken}` }
      }
    );
    
    const repo = repoResponse.data;
    
    // Fetch contributors from GitHub
    const contributorsResponse = await axios.get(
      `https://api.github.com/repos/${repoFullName}/contributors`,
      {
        headers: { Authorization: `token ${user.githubToken}` }
      }
    );
    
    const contributors = contributorsResponse.data;
    
    // Check if project already exists
    let project = await Project.findOne({ 'githubRepo.fullName': repo.full_name });
    
    if (project) {
      // Add user to project if not already member
      const isMember = project.members.some(m => m.user.toString() === req.userId);
      if (!isMember) {
        project.members.push({
          user: req.userId,
          role: 'contributor'
        });
        await project.save();
        user.projects.push(project._id);
        await user.save();
      }
      
      // Update chatroom with new contributors
      const chatRoom = await ChatRoom.findById(project.chatRoom);
      await inviteContributorsToProjectAndChatroom(contributors, project, chatRoom, user.githubToken);
    } else {
      // Create new project first (without chatRoom reference initially)
      project = new Project({
        name: repo.name,
        githubRepo: {
          owner: repo.owner.login,
          repo: repo.name,
          fullName: repo.full_name,
          url: repo.html_url
        },
        description: repo.description,
        members: [{
          user: req.userId,
          role: 'owner'
        }]
      });
      await project.save();
      
      // Now create chatroom with project reference
      const chatRoom = new ChatRoom({
        name: `${repo.name} Chat`,
        project: project._id,
        repository: repo.full_name,
        members: [req.userId]
      });
      await chatRoom.save();
      
      // Update project with chatroom reference
      project.chatRoom = chatRoom._id;
      await project.save();
      
      // Invite all contributors to both project and chatroom
      await inviteContributorsToProjectAndChatroom(contributors, project, chatRoom, user.githubToken);
      
      user.projects.push(project._id);
      await user.save();
    }
    
    await project.populate('members.user', 'username avatar');
    await project.populate('chatRoom');
    await project.populate('chatRoom.members', 'username avatar');
    
    res.json({ project });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project: ' + error.message });
  }
});

// Helper function to invite contributors to both project and chatroom
async function inviteContributorsToProjectAndChatroom(contributors, project, chatRoom, githubToken) {
  const chatRoomMemberIds = new Set(chatRoom.members.map(m => m.toString()));
  const projectMemberIds = new Set(project.members.map(m => m.user.toString()));
  
  for (const contributor of contributors) {
    try {
      // Find or create user by GitHub username
      let dbUser = await User.findOne({ username: contributor.login });
      
      if (!dbUser) {
        // Fetch GitHub user details
        const githubUserResponse = await axios.get(
          `https://api.github.com/users/${contributor.login}`,
          {
            headers: { Authorization: `token ${githubToken}` }
          }
        );
        
        const githubUser = githubUserResponse.data;
        
        // Create new user
        dbUser = new User({
          githubId: githubUser.id.toString(),
          username: githubUser.login,
          email: githubUser.email,
          avatar: githubUser.avatar_url,
          online: false
        });
        await dbUser.save();
      }
      
      // Add to project members if not already a member
      if (!projectMemberIds.has(dbUser._id.toString())) {
        project.members.push({
          user: dbUser._id,
          role: 'contributor'
        });
        projectMemberIds.add(dbUser._id.toString());
      }
      
      // Add to chatroom if not already a member
      if (!chatRoomMemberIds.has(dbUser._id.toString())) {
        chatRoom.members.push(dbUser._id);
        chatRoomMemberIds.add(dbUser._id.toString());
      }
    } catch (error) {
      console.error(`Error inviting contributor ${contributor.login}:`, error.message);
      // Continue with next contributor
    }
  }
  
  // Save both project and chatroom
  await Promise.all([project.save(), chatRoom.save()]);
}

// Get project by ID
router.get('/:projectId', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate('members.user', 'username avatar online')
      .populate('chatRoom');
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ project });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Invite member via email
router.post('/:projectId/invite/email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user is project member
    const isMember = project.members.some(m => m.user.toString() === req.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }
    
    // Generate invitation link
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join/${project._id}`;
    
    // In a real app, you'd send an email here using a service like SendGrid, Nodemailer, etc.
    // For now, we'll just return the invitation link
    console.log(`📧 Email invitation for ${email} to join ${project.name}: ${inviteLink}`);
    
    res.json({ 
      success: true, 
      message: 'Invitation link generated',
      inviteLink,
      email 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

export default router;
