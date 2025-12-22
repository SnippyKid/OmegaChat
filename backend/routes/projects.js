import express from 'express';
import Project from '../models/Project.js';
import ChatRoom from '../models/ChatRoom.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();

// Helper function to generate unique group code
async function generateGroupCode(model, fieldName = 'groupCode') {
  let code;
  let exists = true;
  while (exists) {
    // Generate a 6-character alphanumeric code (uppercase, excluding confusing characters)
    code = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
    const existing = await model.findOne({ [fieldName]: code });
    exists = !!existing;
  }
  return code;
}

// Get user's projects
router.get('/my-projects', authenticateToken, async (req, res) => {
  try {
    // Populate projects with members and the linked chatRoom (including chatRoom members)
    const user = await User.findById(req.userId).populate({
      path: 'projects',
      populate: [
        { path: 'members.user', select: 'username avatar' },
        { 
          path: 'chatRoom',
          populate: { path: 'members', select: 'username avatar' }
        }
      ]
    });
    
    res.json({ projects: user.projects || [] });
  } catch (error) {
    console.error('Error fetching user projects:', error);
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
      
      // Generate group codes
      const projectGroupCode = await generateGroupCode(Project);
      const chatRoomGroupCode = await generateGroupCode(ChatRoom);
      
      // Now create chatroom with project reference
      const chatRoom = new ChatRoom({
        name: `${repo.name} Chat`,
        project: project._id,
        repository: repo.full_name,
        members: [req.userId],
        groupCode: chatRoomGroupCode
      });
      await chatRoom.save();
      
      // Update project with chatroom reference and group code
      project.chatRoom = chatRoom._id;
      project.groupCode = projectGroupCode;
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
        try {
          // Fetch GitHub user details
          const githubUserResponse = await axios.get(
            `https://api.github.com/users/${contributor.login}`,
            {
              headers: { Authorization: `token ${githubToken}` }
            }
          );
          
          const githubUser = githubUserResponse.data;
          
          // Check if user with same githubId exists (in case username changed)
          dbUser = await User.findOne({ githubId: githubUser.id.toString() });
          
          if (!dbUser) {
            // Create new user - check if email is public, otherwise use placeholder
            const userEmail = githubUser.email || `${contributor.login}@users.noreply.github.com`;
            
            // Check for duplicate username/email
            const existingUser = await User.findOne({ 
              $or: [
                { username: githubUser.login },
                { email: userEmail }
              ]
            });
            
            if (existingUser) {
              // Use existing user if found
              dbUser = existingUser;
            } else {
              // Create new user
              dbUser = new User({
                githubId: githubUser.id.toString(),
                username: githubUser.login,
                email: userEmail,
                avatar: githubUser.avatar_url,
                online: false
              });
              await dbUser.save();
              console.log(`✅ Created new user: ${githubUser.login}`);
            }
          } else {
            // Update user info if needed
            if (dbUser.username !== githubUser.login || dbUser.avatar !== githubUser.avatar_url) {
              dbUser.username = githubUser.login;
              dbUser.avatar = githubUser.avatar_url;
              await dbUser.save();
            }
          }
        } catch (userError) {
          console.error(`Error creating/updating user for ${contributor.login}:`, userError.message);
          // Skip this contributor and continue
          continue;
        }
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

// Get or generate group code for a project
router.get('/:projectId/group-code', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user is project member
    const isMember = project.members.some(m => m.user.toString() === req.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }
    
    // Generate code if it doesn't exist
    if (!project.groupCode) {
      project.groupCode = await generateGroupCode(Project);
      await project.save();
    }
    
    res.json({ 
      success: true, 
      groupCode: project.groupCode,
      inviteLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join-code/${project.groupCode}`
    });
  } catch (error) {
    console.error('Error getting group code:', error);
    res.status(500).json({ error: 'Failed to get group code' });
  }
});

// Join project via group code
router.post('/join-code/:groupCode', authenticateToken, async (req, res) => {
  try {
    const { groupCode } = req.params;
    const user = await User.findById(req.userId);
    
    // Find project by group code
    const project = await Project.findOne({ groupCode: groupCode.toUpperCase() })
      .populate('chatRoom');
    
    if (!project) {
      return res.status(404).json({ error: 'Invalid group code. Project not found.' });
    }
    
    // Check if user is already a member
    const isMember = project.members.some(m => m.user.toString() === req.userId);
    
    if (isMember) {
      return res.json({ 
        success: true, 
        message: 'You are already a member of this project',
        project,
        chatRoomId: project.chatRoom._id || project.chatRoom
      });
    }
    
    // Add user to project
    project.members.push({
      user: req.userId,
      role: 'contributor'
    });
    await project.save();
    
    // Add user to chatroom if it exists
    if (project.chatRoom) {
      const chatRoom = await ChatRoom.findById(project.chatRoom._id || project.chatRoom);
      if (chatRoom && !chatRoom.members.some(m => m.toString() === req.userId)) {
        chatRoom.members.push(req.userId);
        await chatRoom.save();
      }
    }
    
    // Add project to user's projects list
    if (!user.projects.some(p => p.toString() === project._id.toString())) {
      user.projects.push(project._id);
      await user.save();
    }
    
    await project.populate('members.user', 'username avatar');
    await project.populate('chatRoom');
    
    res.json({ 
      success: true, 
      message: 'Successfully joined project!',
      project,
      chatRoomId: project.chatRoom._id || project.chatRoom
    });
  } catch (error) {
    console.error('Error joining project via group code:', error);
    res.status(500).json({ error: 'Failed to join project: ' + error.message });
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

// Delete a project (only if user is owner)
router.delete('/:projectId', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user is the owner
    const owner = project.members.find(m => m.role === 'owner');
    if (!owner || owner.user.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Only the project owner can delete the project' });
    }
    
    // Delete associated chatroom
    if (project.chatRoom) {
      await ChatRoom.findByIdAndDelete(project.chatRoom);
    }
    
    // Remove project from all users' projects list
    await User.updateMany(
      { projects: project._id },
      { $pull: { projects: project._id } }
    );
    
    // Delete the project
    await Project.findByIdAndDelete(req.params.projectId);
    
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project: ' + error.message });
  }
});

// Leave a project
router.post('/:projectId/leave', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user is a member
    const isMember = project.members.some(m => m.user.toString() === req.userId.toString());
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this project' });
    }
    
    // Check if user is owner
    const owner = project.members.find(m => m.role === 'owner');
    if (owner && owner.user.toString() === req.userId.toString()) {
      return res.status(400).json({ error: 'Project owner cannot leave. Please delete the project or transfer ownership.' });
    }
    
    // Remove user from project members
    project.members = project.members.filter(
      m => m.user.toString() !== req.userId.toString()
    );
    await project.save();
    
    // Remove user from chatroom if it exists
    if (project.chatRoom) {
      const chatRoom = await ChatRoom.findById(project.chatRoom);
      if (chatRoom) {
        chatRoom.members = chatRoom.members.filter(
          m => m.toString() !== req.userId.toString()
        );
        await chatRoom.save();
      }
    }
    
    // Remove project from user's projects list
    const user = await User.findById(req.userId);
    if (user) {
      user.projects = user.projects.filter(
        p => p.toString() !== project._id.toString()
      );
      await user.save();
    }
    
    res.json({ success: true, message: 'Left project successfully' });
  } catch (error) {
    console.error('Error leaving project:', error);
    res.status(500).json({ error: 'Failed to leave project: ' + error.message });
  }
});

export default router;
