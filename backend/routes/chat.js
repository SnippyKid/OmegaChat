import express from 'express';
import ChatRoom from '../models/ChatRoom.js';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|js|jsx|ts|tsx|py|java|cpp|c|go|rs|rb|php|swift|kt|dart|vue|svelte/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype || extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and common file types are allowed.'));
    }
  }
});

const router = express.Router();

// Get messages for a chat room
router.get('/room/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    const room = await ChatRoom.findById(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is member (handle both ObjectId and string comparison)
    const isMember = room.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    // Get User model for population
    const User = (await import('../models/User.js')).default;
    
    // Convert messages to plain objects and sort
    let messages = room.messages.map(msg => {
      const msgObj = msg.toObject ? msg.toObject() : { ...msg };
      // Ensure createdAt exists
      if (!msgObj.createdAt) {
        msgObj.createdAt = new Date();
      }
      return msgObj;
    });
    
    // Sort by createdAt (newest first)
    messages.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    
    // Apply pagination
    messages = messages.slice(skip, skip + limit).reverse();
    
    // Get unique user IDs
    const userIds = [...new Set(messages.map(msg => {
      const userId = msg.user?._id || msg.user;
      return userId?.toString();
    }).filter(Boolean))];
    
    // Fetch all users at once
    const users = await User.find({ _id: { $in: userIds } })
      .select('username avatar')
      .lean();
    
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    
    // Populate user for each message and handle replyTo
    messages = messages.map(msg => {
      const msgObj = { ...msg };
      
      // Handle AI messages specially
      if (msgObj.type === 'ai_code') {
        msgObj.user = {
          _id: 'omega-ai',
          username: 'Omega AI',
          avatar: null
        };
        return msgObj;
      }
      
      // Handle DK bot messages specially
      if (msgObj.type === 'dk_bot') {
        msgObj.user = {
          _id: 'dk-bot',
          username: 'DK',
          avatar: '/avatars/dk-avatar.png'
        };
        return msgObj;
      }
      
      // Handle ChaiWala bot messages specially
      if (msgObj.type === 'chaiwala_bot') {
        msgObj.user = {
          _id: 'chaiwala-bot',
          username: 'ChaiWala',
          avatar: '/avatars/chaiwala-avatar.png'
        };
        return msgObj;
      }
      
      const userId = msgObj.user?._id?.toString() || msgObj.user?.toString() || msgObj.user;
      
      if (userId && userMap.has(userId)) {
        msgObj.user = userMap.get(userId);
      } else {
        msgObj.user = {
          _id: userId,
          username: 'Unknown',
          avatar: null
        };
      }
      
      // Populate replyTo message if exists
      if (msgObj.replyTo) {
        const replyToId = msgObj.replyTo._id?.toString() || msgObj.replyTo.toString() || msgObj.replyTo;
        const repliedMessage = room.messages.find(m => 
          (m._id?.toString() || m._id) === replyToId
        );
        if (repliedMessage) {
          const replyUserId = repliedMessage.user?.toString() || repliedMessage.user;
          msgObj.replyTo = {
            _id: replyToId,
            content: repliedMessage.content,
            user: userMap.get(replyUserId) || { username: 'Unknown', avatar: null }
          };
        }
      }
      
      return msgObj;
    });
    
    res.json({ messages, total: room.messages.length });
  } catch (error) {
    console.error('Error fetching messages:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to fetch messages',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get chat room details
router.get('/room/:roomId', authenticateToken, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId)
      .populate('members', 'username avatar online')
      .populate('project', 'name githubRepo');
    
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is member
    const isMember = room.members.some(member => {
      const memberId = typeof member === 'object' ? member._id.toString() : member.toString();
      return memberId === req.userId.toString();
    });
    
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    // Include pinned messages in response
    const roomData = room.toObject ? room.toObject() : { ...room._doc || room };
    roomData.pinnedMessages = room.pinnedMessages || [];
    
    res.json({ room: roomData });
  } catch (error) {
    console.error('Error fetching chat room:', error);
    res.status(500).json({ error: 'Failed to fetch chat room' });
  }
});

// Helper function to generate unique group code
async function generateGroupCode(model, fieldName = 'groupCode') {
  const crypto = (await import('crypto')).default;
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

// Helper function to generate unique group code
async function generateGroupCode(model, fieldName = 'groupCode') {
  const crypto = (await import('crypto')).default;
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

// Create personal chatroom (no project/repository)
router.post('/personal/create', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    const User = (await import('../models/User.js')).default;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Chat room name is required' });
    }
    
    // Generate group code for personal chatroom
    const groupCode = await generateGroupCode(ChatRoom);
    
    // Create personal chatroom
    const chatRoom = new ChatRoom({
      name: name.trim(),
      members: [req.userId],
      project: null,
      repository: null,
      groupCode: groupCode
    });
    
    await chatRoom.save();
    
    // Populate before sending
    const populatedRoom = await ChatRoom.findById(chatRoom._id)
      .populate('members', 'username avatar online');
    
    res.json({ 
      success: true, 
      room: populatedRoom,
      message: 'Personal chatroom created successfully'
    });
  } catch (error) {
    console.error('Error creating personal chatroom:', error);
    res.status(500).json({ error: 'Failed to create personal chatroom' });
  }
});

// Get user's all chatrooms (personal + project-based)
router.get('/my-chatrooms', authenticateToken, async (req, res) => {
  try {
    // Get personal chatrooms (no project)
    const personalRooms = await ChatRoom.find({
      members: req.userId,
      project: null
    })
    .populate('members', 'username avatar online')
    .sort({ lastMessage: -1, createdAt: -1 });
    
    // Get project-based chatrooms
    const Project = (await import('../models/Project.js')).default;
    const userProjects = await Project.find({
      'members.user': req.userId
    }).populate('chatRoom');
    
    const projectRooms = await ChatRoom.find({
      _id: { $in: userProjects.map(p => p.chatRoom).filter(Boolean) }
    })
    .populate('members', 'username avatar online')
    .populate('project', 'name githubRepo')
    .sort({ lastMessage: -1, createdAt: -1 });
    
    res.json({
      personalRooms,
      projectRooms,
      allRooms: [...personalRooms, ...projectRooms]
    });
  } catch (error) {
    console.error('Error fetching chatrooms:', error);
    res.status(500).json({ error: 'Failed to fetch chatrooms' });
  }
});

// Clear chat messages
router.delete('/room/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is member
    const isMember = room.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    // Clear all messages
    room.messages = [];
    room.pinnedMessages = [];
    await room.save();
    
    res.json({ success: true, message: 'Chat cleared successfully' });
  } catch (error) {
    console.error('Error clearing chat:', error);
    res.status(500).json({ error: 'Failed to clear chat' });
  }
});

// Edit message
router.patch('/room/:roomId/message/:messageId', authenticateToken, async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    const { content } = req.body;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is member
    const isMember = room.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    // Find message
    const message = room.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user owns the message
    if (message.user.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }
    
    // Save old content to edit history
    if (!message.editHistory) {
      message.editHistory = [];
    }
    message.editHistory.push({
      content: message.content,
      editedAt: new Date()
    });
    
    // Update message
    message.content = content;
    message.edited = true;
    
    await room.save();
    
    const updatedRoom = await ChatRoom.findById(roomId)
      .populate('messages.user', 'username avatar');
    
    const updatedMessage = updatedRoom.messages.id(messageId);
    
    res.json({ success: true, message: updatedMessage });
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Delete message
router.delete('/room/:roomId/message/:messageId', authenticateToken, async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is member
    const isMember = room.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    // Find message
    const message = room.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user owns the message
    if (message.user.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }
    
    // Soft delete
    message.deleted = true;
    message.deletedAt = new Date();
    message.content = '[Message deleted]';
    
    // Remove from pinned if pinned
    room.pinnedMessages = room.pinnedMessages.filter(
      id => id.toString() !== messageId
    );
    
    await room.save();
    
    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Add reaction to message
router.post('/room/:roomId/message/:messageId/reaction', authenticateToken, async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    const isMember = room.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    const message = room.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (!message.reactions) {
      message.reactions = [];
    }
    
    // Find or create reaction
    let reaction = message.reactions.find(r => r.emoji === emoji);
    if (!reaction) {
      reaction = { emoji, users: [] };
      message.reactions.push(reaction);
    }
    
    // Toggle user in reaction
    const userIndex = reaction.users.findIndex(
      userId => userId.toString() === req.userId.toString()
    );
    
    if (userIndex === -1) {
      reaction.users.push(req.userId);
    } else {
      reaction.users.splice(userIndex, 1);
      // Remove reaction if no users
      if (reaction.users.length === 0) {
        message.reactions = message.reactions.filter(r => r.emoji !== emoji);
      }
    }
    
    await room.save();
    
    const updatedRoom = await ChatRoom.findById(roomId)
      .populate('messages.user', 'username avatar')
      .populate('messages.reactions.users', 'username avatar');
    
    const updatedMessage = updatedRoom.messages.id(messageId);
    
    res.json({ success: true, message: updatedMessage });
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// Pin/Unpin message
router.post('/room/:roomId/message/:messageId/pin', authenticateToken, async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    const isMember = room.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    const message = room.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (!room.pinnedMessages) {
      room.pinnedMessages = [];
    }
    
    const isPinned = room.pinnedMessages.some(
      id => id.toString() === messageId
    );
    
    if (isPinned) {
      room.pinnedMessages = room.pinnedMessages.filter(
        id => id.toString() !== messageId
      );
    } else {
      room.pinnedMessages.push(messageId);
    }
    
    await room.save();
    
    res.json({ 
      success: true, 
      pinned: !isPinned,
      pinnedMessages: room.pinnedMessages
    });
  } catch (error) {
    console.error('Error pinning message:', error);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

// Star/Unstar message
router.post('/room/:roomId/message/:messageId/star', authenticateToken, async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    const isMember = room.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    const message = room.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (!message.starredBy) {
      message.starredBy = [];
    }
    
    const isStarred = message.starredBy.some(
      userId => userId.toString() === req.userId.toString()
    );
    
    if (isStarred) {
      message.starredBy = message.starredBy.filter(
        userId => userId.toString() !== req.userId.toString()
      );
    } else {
      message.starredBy.push(req.userId);
    }
    
    await room.save();
    
    res.json({ success: true, starred: !isStarred });
  } catch (error) {
    console.error('Error starring message:', error);
    res.status(500).json({ error: 'Failed to star message' });
  }
});

// Mark message as read
router.post('/room/:roomId/message/:messageId/read', authenticateToken, async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    const message = room.messages.id(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (!message.readBy) {
      message.readBy = [];
    }
    
    // Remove existing read record for this user
    message.readBy = message.readBy.filter(
      read => read.user.toString() !== req.userId.toString()
    );
    
    // Add new read record
    message.readBy.push({
      user: req.userId,
      readAt: new Date()
    });
    
    await room.save();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Search messages
router.get('/room/:roomId/search', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { q, userId, messageType, dateFrom, dateTo } = req.query;
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    const isMember = room.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    let messages = room.messages.filter(msg => !msg.deleted);
    
    // Filter by user
    if (userId) {
      messages = messages.filter(msg => 
        msg.user.toString() === userId
      );
    }
    
    // Filter by type
    if (messageType) {
      messages = messages.filter(msg => msg.type === messageType);
    }
    
    // Filter by date range
    if (dateFrom) {
      messages = messages.filter(msg => 
        new Date(msg.createdAt) >= new Date(dateFrom)
      );
    }
    if (dateTo) {
      messages = messages.filter(msg => 
        new Date(msg.createdAt) <= new Date(dateTo)
      );
    }
    
    // Search in content and code
    if (q) {
      const query = q.toLowerCase();
      messages = messages.filter(msg => {
        const contentMatch = msg.content?.toLowerCase().includes(query);
        const codeMatch = msg.aiResponse?.code?.toLowerCase().includes(query);
        const explanationMatch = msg.aiResponse?.explanation?.toLowerCase().includes(query);
        return contentMatch || codeMatch || explanationMatch;
      });
    }
    
    // Sort by date
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Limit results
    const limit = parseInt(req.query.limit) || 50;
    messages = messages.slice(0, limit);
    
    // Populate users
    const User = (await import('../models/User.js')).default;
    const userIds = [...new Set(messages.map(msg => 
      msg.user?.toString() || msg.user
    ).filter(Boolean))];
    
    const users = await User.find({ _id: { $in: userIds } })
      .select('username avatar')
      .lean();
    
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    
    messages = messages.map(msg => {
      const msgObj = msg.toObject ? msg.toObject() : { ...msg };
      
      if (msgObj.type === 'ai_code') {
        msgObj.user = {
          _id: 'omega-ai',
          username: 'Omega AI',
          avatar: null
        };
      } else if (msgObj.type === 'dk_bot') {
        msgObj.user = {
          _id: 'dk-bot',
          username: 'DK',
          avatar: '/avatars/dk-avatar.png'
        };
      } else if (msgObj.type === 'chaiwala_bot') {
        msgObj.user = {
          _id: 'chaiwala-bot',
          username: 'ChaiWala',
          avatar: '/avatars/chaiwala-avatar.png'
        };
      } else {
        const userId = msgObj.user?.toString() || msgObj.user;
        msgObj.user = userMap.get(userId) || {
          _id: userId,
          username: 'Unknown',
          avatar: null
        };
      }
      
      return msgObj;
    });
    
    res.json({ messages, count: messages.length });
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

// Forward message
router.post('/room/:roomId/message/:messageId/forward', authenticateToken, async (req, res) => {
  try {
    const { roomId, messageId } = req.params;
    const { targetRoomId } = req.body;
    
    if (!targetRoomId) {
      return res.status(400).json({ error: 'Target room ID is required' });
    }
    
    const sourceRoom = await ChatRoom.findById(roomId);
    const targetRoom = await ChatRoom.findById(targetRoomId);
    
    if (!sourceRoom || !targetRoom) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if user is member of both rooms
    const isSourceMember = sourceRoom.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    const isTargetMember = targetRoom.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    
    if (!isSourceMember || !isTargetMember) {
      return res.status(403).json({ error: 'Not a member of one or both rooms' });
    }
    
    const sourceMessage = sourceRoom.messages.id(messageId);
    if (!sourceMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Create forwarded message
    const forwardedMessage = {
      user: req.userId,
      content: sourceMessage.content,
      type: sourceMessage.type,
      aiResponse: sourceMessage.aiResponse,
      attachments: sourceMessage.attachments,
      forwardedFrom: {
        roomId: roomId,
        roomName: sourceRoom.name,
        messageId: messageId,
        originalSender: sourceMessage.user
      }
    };
    
    targetRoom.messages.push(forwardedMessage);
    targetRoom.lastMessage = new Date();
    await targetRoom.save();
    
    const updatedTargetRoom = await ChatRoom.findById(targetRoomId)
      .populate('messages.user', 'username avatar');
    
    const newMessage = updatedTargetRoom.messages[updatedTargetRoom.messages.length - 1];
    
    res.json({ success: true, message: newMessage });
  } catch (error) {
    console.error('Error forwarding message:', error);
    res.status(500).json({ error: 'Failed to forward message' });
  }
});

// Upload file/image
router.post('/room/:roomId/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { roomId } = req.params;
    const { type } = req.body; // 'image' or 'file'
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      // Delete uploaded file if room not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    const isMember = room.members.some(memberId => 
      memberId.toString() === req.userId.toString()
    );
    if (!isMember) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    // Determine file type
    const fileType = type || (req.file.mimetype.startsWith('image/') ? 'image' : 'file');
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    // Create file URL (in production, this should be a CDN/storage service URL)
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Use provided content (caption) if exists, otherwise use default message
    const messageContent = req.body.content && req.body.content.trim() 
      ? req.body.content.trim()
      : `Sent ${fileType === 'image' ? 'an image' : 'a file'}: ${req.file.originalname}`;
    
    const message = {
      user: req.userId,
      content: messageContent,
      type: fileType,
      attachments: [{
        type: fileType,
        url: fileUrl,
        filename: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      }]
    };
    
    room.messages.push(message);
    room.lastMessage = new Date();
    await room.save();
    
    const updatedRoom = await ChatRoom.findById(roomId)
      .populate('messages.user', 'username avatar');
    
    const savedMessage = updatedRoom.messages[updatedRoom.messages.length - 1];
    
    res.json({ success: true, message: savedMessage });
  } catch (error) {
    console.error('Error uploading file:', error);
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GitHub webhook endpoint for automatic notifications
router.post('/github/webhook', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const payload = req.body;
    
    if (!event || !payload) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }
    
    console.log(`📢 GitHub webhook received: ${event}`);
    
    // Extract repository information
    const repoFullName = payload.repository?.full_name;
    if (!repoFullName) {
      return res.status(400).json({ error: 'Repository information not found' });
    }
    
    // Find chatrooms linked to this repository
    const Project = (await import('../models/Project.js')).default;
    const projects = await Project.find({
      'githubRepo.fullName': repoFullName
    }).populate('chatRoom');
    
    // Also check for direct repository chatrooms
    const directRooms = await ChatRoom.find({
      repository: repoFullName
    });
    
    const allRooms = [
      ...projects.map(p => p.chatRoom).filter(Boolean),
      ...directRooms
    ];
    
    if (allRooms.length === 0) {
      console.log(`⚠️ No chatrooms found for repository: ${repoFullName}`);
      return res.status(200).json({ message: 'No linked chatrooms found' });
    }
    
    // Format activity notification
    const { formatActivityNotification } = await import('../services/dkBotService.js');
    const activity = {
      type: event,
      action: payload.action || 'unknown',
      payload: payload
    };
    
    const notificationContent = formatActivityNotification(activity);
    
    // Send notification to all linked chatrooms
    const io = req.app.get('io'); // Get io instance from app
    if (!io) {
      console.error('Socket.io instance not available');
      return res.status(500).json({ error: 'Socket.io not initialized' });
    }
    
    for (const room of allRooms) {
      if (!room) continue;
      
      const dkMessage = {
        user: null, // Bot message, no user
        content: notificationContent,
        type: 'dk_bot',
        dkBotData: {
          type: 'notification',
          githubData: activity
        }
      };
      
      room.messages.push(dkMessage);
      room.lastMessage = new Date();
      await room.save();
      
      const updatedRoom = await ChatRoom.findById(room._id)
        .populate('messages.user', 'username avatar');
      
      const savedMessage = updatedRoom.messages[updatedRoom.messages.length - 1];
      savedMessage.user = {
        _id: 'dk-bot',
        username: 'DK',
        avatar: '/avatars/dk-avatar.png'
      };
      
      io.to(`room:${room._id}`).emit('dk_bot_response', {
        message: savedMessage,
        roomId: room._id
      });
      
      console.log(`📢 DK Bot notification sent to room: ${room._id}`);
    }
    
    res.status(200).json({ 
      success: true, 
      message: `Notification sent to ${allRooms.length} chatroom(s)` 
    });
  } catch (error) {
    console.error('Error processing GitHub webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Get or generate group code for a chatroom
router.get('/room/:roomId/group-code', authenticateToken, async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }
    
    // Check if user is member
    const isMember = room.members.some(member => {
      const memberId = typeof member === 'object' ? member._id.toString() : member.toString();
      return memberId === req.userId.toString();
    });
    
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this room' });
    }
    
    // Generate code if it doesn't exist
    if (!room.groupCode) {
      room.groupCode = await generateGroupCode(ChatRoom);
      await room.save();
    }
    
    res.json({ 
      success: true, 
      groupCode: room.groupCode,
      inviteLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join-code/${room.groupCode}`
    });
  } catch (error) {
    console.error('Error getting group code:', error);
    res.status(500).json({ error: 'Failed to get group code' });
  }
});

// Join chatroom via group code
router.post('/join-code/:groupCode', authenticateToken, async (req, res) => {
  try {
    const { groupCode } = req.params;
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.userId);
    
    // Find chatroom by group code
    const chatRoom = await ChatRoom.findOne({ groupCode: groupCode.toUpperCase() })
      .populate('project', 'name githubRepo');
    
    if (!chatRoom) {
      return res.status(404).json({ error: 'Invalid group code. Chat room not found.' });
    }
    
    // Check if user is already a member
    const isMember = chatRoom.members.some(member => {
      const memberId = typeof member === 'object' ? member._id.toString() : member.toString();
      return memberId === req.userId.toString();
    });
    
    if (isMember) {
      return res.json({ 
        success: true, 
        message: 'You are already a member of this chat room',
        room: chatRoom
      });
    }
    
    // Add user to chatroom
    chatRoom.members.push(req.userId);
    await chatRoom.save();
    
    // If chatroom has a project, add user to project as well
    if (chatRoom.project) {
      const Project = (await import('../models/Project.js')).default;
      const project = await Project.findById(chatRoom.project._id || chatRoom.project);
      
      if (project && !project.members.some(m => m.user.toString() === req.userId)) {
        project.members.push({
          user: req.userId,
          role: 'contributor'
        });
        await project.save();
        
        // Add project to user's projects list
        if (!user.projects.some(p => p.toString() === project._id.toString())) {
          user.projects.push(project._id);
          await user.save();
        }
      }
    }
    
    const populatedRoom = await ChatRoom.findById(chatRoom._id)
      .populate('members', 'username avatar online')
      .populate('project', 'name githubRepo');
    
    res.json({ 
      success: true, 
      message: 'Successfully joined chat room!',
      room: populatedRoom
    });
  } catch (error) {
    console.error('Error joining chatroom via group code:', error);
    res.status(500).json({ error: 'Failed to join chatroom: ' + error.message });
  }
});

export default router;
