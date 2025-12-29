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
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Populate projects with members and all chatrooms
    try {
      await user.populate({
        path: 'projects',
        populate: [
          { path: 'members.user', select: 'username avatar' },
          { 
            path: 'chatRoom',
            populate: { path: 'members', select: 'username avatar' }
          },
          {
            path: 'chatRooms',
            populate: { path: 'members', select: 'username avatar' }
          }
        ]
      });
    } catch (populateError) {
      console.error('Error populating projects:', populateError);
      // Try without chatRooms if it fails
      try {
        await user.populate({
          path: 'projects',
          populate: [
            { path: 'members.user', select: 'username avatar' },
            { 
              path: 'chatRoom',
              populate: { path: 'members', select: 'username avatar' }
            }
          ]
        });
        // Manually populate chatRooms for each project
        for (const project of user.projects) {
          if (project.chatRooms && project.chatRooms.length > 0) {
            try {
              await project.populate({
                path: 'chatRooms',
                populate: { path: 'members', select: 'username avatar' }
              });
            } catch (err) {
              console.warn('Error populating chatRooms for project:', project._id, err);
            }
          }
        }
      } catch (fallbackError) {
        console.error('Error in fallback populate:', fallbackError);
        // Continue without full population
      }
    }
    
    res.json({ 
      success: true,
      projects: user.projects || [] 
    });
  } catch (error) {
    console.error('Error fetching user projects:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch projects: ' + (error.message || 'Unknown error') 
    });
  }
});

// Create project from GitHub repo and auto-invite contributors
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { repoFullName } = req.body;
    
    if (!repoFullName || !repoFullName.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Repository full name is required (e.g., owner/repo)' 
      });
    }
    
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
    
    // Fetch repo details from GitHub
    let repo;
    try {
      const repoResponse = await axios.get(
        `https://api.github.com/repos/${repoFullName.trim()}`,
        {
          headers: { Authorization: `token ${user.githubToken}` },
          timeout: 10000
        }
      );
      repo = repoResponse.data;
    } catch (githubError) {
      console.error('GitHub API error:', githubError);
      if (githubError.response?.status === 404) {
        return res.status(404).json({ 
          success: false,
          error: 'Repository not found. Please check the repository name and ensure you have access.' 
        });
      } else if (githubError.response?.status === 403) {
        return res.status(403).json({ 
          success: false,
          error: 'GitHub API rate limit exceeded or access denied. Please try again later.' 
        });
      }
      throw new Error('Failed to fetch repository from GitHub: ' + (githubError.message || 'Unknown error'));
    }
    
    // Fetch contributors from GitHub (optional, don't fail if this fails)
    let contributors = [];
    try {
      const contributorsResponse = await axios.get(
        `https://api.github.com/repos/${repoFullName.trim()}/contributors`,
        {
          headers: { Authorization: `token ${user.githubToken}` },
          timeout: 10000
        }
      );
      contributors = contributorsResponse.data || [];
    } catch (contribError) {
      console.warn('Failed to fetch contributors (non-critical):', contribError.message);
      // Continue without contributors - not critical
    }
    
    // Check if project already exists
    let project = await Project.findOne({ 'githubRepo.fullName': repo.full_name });
    
    if (project) {
      // Initialize chatRooms array if it doesn't exist (for backward compatibility)
      if (!project.chatRooms || project.chatRooms.length === 0) {
        if (project.chatRoom) {
          project.chatRooms = [project.chatRoom];
        } else {
          project.chatRooms = [];
        }
        await project.save();
      }
      
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
      // Add to both chatRoom (backward compat) and chatRooms array (for multiple chatrooms)
      project.chatRoom = chatRoom._id;
      project.chatRooms = [chatRoom._id]; // Initialize array with first chatroom
      project.groupCode = projectGroupCode;
      await project.save();
      
      // Invite all contributors to both project and chatroom
      await inviteContributorsToProjectAndChatroom(contributors, project, chatRoom, user.githubToken);
      
      user.projects.push(project._id);
      await user.save();
    }
    
    // Populate project data for response
    await project.populate('members.user', 'username avatar');
    await project.populate('chatRoom');
    await project.populate('chatRooms', 'name members lastMessage');
    if (project.chatRoom) {
      await project.populate('chatRoom.members', 'username avatar');
    }
    // Populate members for all chatrooms in array
    if (project.chatRooms && project.chatRooms.length > 0) {
      await project.populate({
        path: 'chatRooms',
        populate: { path: 'members', select: 'username avatar online' }
      });
    }
    
    res.json({ 
      success: true,
      project 
    });
  } catch (error) {
    console.error('Error creating project:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create project: ' + (error.message || 'Unknown error') 
    });
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
    
    if (!groupCode || !groupCode.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Group code is required' 
      });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Find project by group code (case-insensitive search)
    const project = await Project.findOne({ 
      groupCode: groupCode.trim().toUpperCase() 
    }).populate('chatRoom');
    
    if (!project) {
      return res.status(404).json({ 
        success: false,
        error: 'Invalid group code. Project not found.' 
      });
    }
    
    // Check if user is already a member (handle both ObjectId and populated objects)
    const isMember = project.members.some(m => {
      const memberUserId = typeof m.user === 'object' && m.user?._id 
        ? m.user._id.toString() 
        : (m.user?.toString() || m.user);
      return memberUserId === req.userId.toString();
    });
    
    if (isMember) {
      // User is already a member, return success with existing data
      await project.populate('members.user', 'username avatar');
      await project.populate('chatRoom');
      
      return res.json({ 
        success: true, 
        message: 'You are already a member of this project',
        project,
        chatRoomId: project.chatRoom?._id || project.chatRoom || null
      });
    }
    
    // Add user to project
    project.members.push({
      user: req.userId,
      role: 'contributor'
    });
    await project.save();
    
    // Add user to chatroom if it exists
    let chatRoomId = null;
    if (project.chatRoom) {
      const chatRoom = await ChatRoom.findById(
        project.chatRoom._id || project.chatRoom
      );
      if (chatRoom) {
        // Check if user is already in chatroom
        const isChatMember = chatRoom.members.some(m => {
          const memberId = typeof m === 'object' && m._id 
            ? m._id.toString() 
            : m.toString();
          return memberId === req.userId.toString();
        });
        
        if (!isChatMember) {
          chatRoom.members.push(req.userId);
          await chatRoom.save();
        }
        chatRoomId = chatRoom._id;
      }
    }
    
    // Add project to user's projects list
    const userProjectIds = user.projects.map(p => 
      typeof p === 'object' ? p._id.toString() : p.toString()
    );
    if (!userProjectIds.includes(project._id.toString())) {
      user.projects.push(project._id);
      await user.save();
    }
    
    // Populate project data for response
    await project.populate('members.user', 'username avatar');
    await project.populate('chatRoom');
    
    res.json({ 
      success: true, 
      message: 'Successfully joined project!',
      project,
      chatRoomId: chatRoomId || project.chatRoom?._id || project.chatRoom || null
    });
  } catch (error) {
    console.error('Error joining project via group code:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to join project: ' + (error.message || 'Unknown error') 
    });
  }
});

// Create additional chatroom for a project
router.post('/:projectId/chatrooms/create', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Chat room name is required' 
      });
    }
    
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({ 
        success: false,
        error: 'Project not found' 
      });
    }
    
    // Check if user is a project member
    const isMember = project.members.some(m => {
      const memberUserId = typeof m.user === 'object' && m.user?._id 
        ? m.user._id.toString() 
        : (m.user?.toString() || m.user);
      return memberUserId === req.userId.toString();
    });
    
    if (!isMember) {
      return res.status(403).json({ 
        success: false,
        error: 'Not a member of this project' 
      });
    }
    
    // Generate group code for the new chatroom
    const chatRoomGroupCode = await generateGroupCode(ChatRoom);
    
    // Get project's repository info
    const repository = project.githubRepo?.fullName || null;
    
    // Create new chatroom for this project
    const mongoose = (await import('mongoose')).default;
    const userIdObjectId = typeof req.userId === 'string' 
      ? new mongoose.Types.ObjectId(req.userId)
      : req.userId;
    
    const chatRoom = new ChatRoom({
      name: name.trim(),
      project: project._id,
      repository: repository,
      members: [userIdObjectId],
      groupCode: chatRoomGroupCode
    });
    
    await chatRoom.save();
    
    // Add chatroom to project's chatRooms array
    if (!project.chatRooms) {
      project.chatRooms = [];
    }
    project.chatRooms.push(chatRoom._id);
    await project.save();
    
    // Add all project members to the new chatroom
    const projectMemberIds = project.members.map(m => {
      const memberUserId = typeof m.user === 'object' && m.user?._id 
        ? m.user._id 
        : (m.user || m);
      return typeof memberUserId === 'string' 
        ? new mongoose.Types.ObjectId(memberUserId)
        : memberUserId;
    });
    
    // Add all project members (avoid duplicates)
    const existingMemberIds = chatRoom.members.map(m => m.toString());
    projectMemberIds.forEach(memberId => {
      if (!existingMemberIds.includes(memberId.toString())) {
        chatRoom.members.push(memberId);
      }
    });
    await chatRoom.save();
    
    // Populate before sending
    const populatedRoom = await ChatRoom.findById(chatRoom._id)
      .populate('members', 'username avatar online')
      .populate('project', 'name githubRepo');
    
    res.json({ 
      success: true, 
      room: populatedRoom,
      message: 'Chatroom created successfully for project'
    });
  } catch (error) {
    console.error('Error creating project chatroom:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create chatroom: ' + (error.message || 'Unknown error') 
    });
  }
});

// Get all chatrooms for a project
router.get('/:projectId/chatrooms', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({ 
        success: false,
        error: 'Project not found' 
      });
    }
    
    // Check if user is a project member
    const isMember = project.members.some(m => {
      const memberUserId = typeof m.user === 'object' && m.user?._id 
        ? m.user._id.toString() 
        : (m.user?.toString() || m.user);
      return memberUserId === req.userId.toString();
    });
    
    if (!isMember) {
      return res.status(403).json({ 
        success: false,
        error: 'Not a member of this project' 
      });
    }
    
    // Get all chatrooms for this project
    const chatRooms = await ChatRoom.find({ project: projectId })
      .populate('members', 'username avatar online')
      .sort({ lastMessage: -1, createdAt: -1 });
    
    res.json({ 
      success: true,
      chatRooms: chatRooms 
    });
  } catch (error) {
    console.error('Error fetching project chatrooms:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch chatrooms: ' + (error.message || 'Unknown error') 
    });
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
      return res.status(404).json({ 
        success: false,
        error: 'Project not found' 
      });
    }
    
    // Check if user is the owner (handle both ObjectId and populated objects)
    const owner = project.members.find(m => m.role === 'owner');
    if (!owner) {
      return res.status(403).json({ 
        success: false,
        error: 'Project has no owner. Cannot delete.' 
      });
    }
    
    const ownerUserId = typeof owner.user === 'object' && owner.user?._id 
      ? owner.user._id.toString() 
      : (owner.user?.toString() || owner.user);
    
    if (ownerUserId !== req.userId.toString()) {
      return res.status(403).json({ 
        success: false,
        error: 'Only the project owner can delete the project' 
      });
    }
    
    // Delete all associated chatrooms (both main chatRoom and all in chatRooms array)
    const chatRoomIdsToDelete = [];
    
    // Add main chatroom if exists
    if (project.chatRoom) {
      const mainChatRoomId = project.chatRoom._id || project.chatRoom;
      if (mainChatRoomId) {
        chatRoomIdsToDelete.push(mainChatRoomId);
      }
    }
    
    // Add all chatrooms from chatRooms array
    if (project.chatRooms && project.chatRooms.length > 0) {
      project.chatRooms.forEach(room => {
        const roomId = room._id || room;
        if (roomId && !chatRoomIdsToDelete.some(id => id.toString() === roomId.toString())) {
          chatRoomIdsToDelete.push(roomId);
        }
      });
    }
    
    // Delete all chatrooms
    if (chatRoomIdsToDelete.length > 0) {
      const deleteResult = await ChatRoom.deleteMany({ _id: { $in: chatRoomIdsToDelete } });
      console.log(`✅ Deleted ${deleteResult.deletedCount} chatroom(s) for project ${project._id}`);
    }
    
    // Remove project from all users' projects list
    const userUpdateResult = await User.updateMany(
      { projects: project._id },
      { $pull: { projects: project._id } }
    );
    console.log(`✅ Removed project from ${userUpdateResult.modifiedCount} user(s)`);
    
    // Delete the project
    const deletedProject = await Project.findByIdAndDelete(req.params.projectId);
    
    if (!deletedProject) {
      return res.status(404).json({ 
        success: false,
        error: 'Project not found or already deleted' 
      });
    }
    
    console.log(`✅ Project ${req.params.projectId} (${project.name}) deleted successfully`);
    
    res.json({ 
      success: true, 
      message: `Project "${project.name}" and all associated chatrooms have been permanently deleted` 
    });
  } catch (error) {
    console.error('❌ Error deleting project:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete project: ' + (error.message || 'Unknown error') 
    });
  }
});

// Leave a project
router.post('/:projectId/leave', authenticateToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    
    if (!project) {
      return res.status(404).json({ 
        success: false,
        error: 'Project not found' 
      });
    }
    
    // Check if user is a member (handle both ObjectId and populated objects)
    const isMember = project.members.some(m => {
      const memberUserId = typeof m.user === 'object' && m.user?._id 
        ? m.user._id.toString() 
        : (m.user?.toString() || m.user);
      return memberUserId === req.userId.toString();
    });
    
    if (!isMember) {
      return res.status(403).json({ 
        success: false,
        error: 'Not a member of this project' 
      });
    }
    
    // Check if user is owner (handle both ObjectId and populated objects)
    const owner = project.members.find(m => m.role === 'owner');
    if (owner) {
      const ownerUserId = typeof owner.user === 'object' && owner.user?._id 
        ? owner.user._id.toString() 
        : (owner.user?.toString() || owner.user);
      if (ownerUserId === req.userId.toString()) {
        return res.status(400).json({ 
          success: false,
          error: 'Project owner cannot leave. Please delete the project or transfer ownership.' 
        });
      }
    }
    
    // Remove user from project members (handle both ObjectId and populated objects)
    project.members = project.members.filter(m => {
      const memberUserId = typeof m.user === 'object' && m.user?._id 
        ? m.user._id.toString() 
        : (m.user?.toString() || m.user);
      return memberUserId !== req.userId.toString();
    });
    await project.save();
    
    // Get user info before removing
    const leavingUser = await User.findById(req.userId);
    
    // Collect all chatroom IDs to remove user from (main chatRoom + all in chatRooms array)
    const chatRoomIdsToUpdate = [];
    
    // Add main chatroom if exists
    if (project.chatRoom) {
      const mainChatRoomId = project.chatRoom._id || project.chatRoom;
      if (mainChatRoomId) {
        chatRoomIdsToUpdate.push(mainChatRoomId);
      }
    }
    
    // Add all chatrooms from chatRooms array
    if (project.chatRooms && project.chatRooms.length > 0) {
      project.chatRooms.forEach(room => {
        const roomId = room._id || room;
        if (roomId && !chatRoomIdsToUpdate.some(id => id.toString() === roomId.toString())) {
          chatRoomIdsToUpdate.push(roomId);
        }
      });
    }
    
    // Remove user from all chatrooms
    if (chatRoomIdsToUpdate.length > 0) {
      const chatRooms = await ChatRoom.find({ _id: { $in: chatRoomIdsToUpdate } });
      
      for (const chatRoom of chatRooms) {
        const beforeCount = chatRoom.members.length;
        chatRoom.members = chatRoom.members.filter(
          m => m.toString() !== req.userId.toString()
        );
        
        // Only save if membership changed
        if (chatRoom.members.length !== beforeCount) {
          await chatRoom.save();
          
          // Emit socket event to notify all room members about the member leaving
          try {
            const io = req.app.get('io');
            if (io) {
              const roomName = `room:${chatRoom._id}`;
              io.to(roomName).emit('member_left', {
                roomId: chatRoom._id,
                userId: req.userId,
                username: leavingUser?.username || 'Unknown'
              });
            }
          } catch (socketError) {
            console.error('Error emitting member_left event:', socketError);
            // Don't fail the request if socket emission fails
          }
        }
      }
      
      console.log(`✅ Removed user ${req.userId} from ${chatRoomIdsToUpdate.length} chatroom(s) for project ${project._id}`);
    }
    
    // Remove project from user's projects list
    const user = await User.findById(req.userId);
    if (user) {
      user.projects = user.projects.filter(
        p => p.toString() !== project._id.toString()
      );
      await user.save();
    }
    
    console.log(`✅ User ${req.userId} left project ${project._id} (${project.name})`);
    
    res.json({ 
      success: true, 
      message: `Successfully left project "${project.name}"` 
    });
  } catch (error) {
    console.error('❌ Error leaving project:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to leave project: ' + (error.message || 'Unknown error') 
    });
  }
});

export default router;
