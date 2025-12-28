import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ChatRoom from '../models/ChatRoom.js';
import Project from '../models/Project.js';
import { generateCodeSnippet } from '../services/aiService.js';
import { getRepositoryContext } from '../services/githubService.js';
import { getRepositoryStats, formatRepositoryStats, formatActivityNotification } from '../services/dkBotService.js';
import { generateWelcomeMessage } from '../services/chaiwalaBotService.js';

export function setupSocketIO(io) {
  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }
      
      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    try {
      console.log(`✅ User connected: ${socket.user?.username || 'Unknown'} (${socket.userId})`);
      
      // Update user online status
      try {
        await User.findByIdAndUpdate(socket.userId, { online: true, lastSeen: new Date() });
      } catch (updateError) {
        console.error('Error updating user online status:', updateError);
      }
      
      // Join user's project rooms
      try {
        const user = await User.findById(socket.userId).populate('projects');
        if (user && user.projects) {
          user.projects.forEach(project => {
            if (project && project.chatRoom) {
              socket.join(`room:${project.chatRoom}`);
              console.log(`📦 User joined room: ${project.chatRoom}`);
            }
          });
        }
      } catch (projectError) {
        console.error('Error joining user project rooms:', projectError);
      }
    } catch (connectionError) {
      console.error('Error in socket connection handler:', connectionError);
      socket.emit('error', { message: 'Connection error occurred' });
    }
    
    // Handle joining a room
    socket.on('join_room', async (roomId) => {
      try {
        if (!roomId) {
          return socket.emit('error', { message: 'Room ID is required' });
        }
        
        const room = await ChatRoom.findById(roomId);
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
      
      // Check if user is a member (handle both ObjectId and string comparison)
      let isMember = room.members.some(memberId => {
        const memberIdStr = typeof memberId === 'object' && memberId._id 
          ? memberId._id.toString() 
          : (memberId?.toString() || memberId);
        return memberIdStr === socket.userId.toString();
      });
      
      // Safety fix: If user is not a member but room has no project (personal room),
      // and room was just created, add them automatically
      if (!isMember && !room.project && room.members.length === 0) {
        console.warn('Auto-adding user to empty personal room via socket:', {
          userId: socket.userId,
          roomId: roomId
        });
        const mongoose = (await import('mongoose')).default;
        const userIdObjectId = typeof socket.userId === 'string' 
          ? new mongoose.Types.ObjectId(socket.userId)
          : socket.userId;
        room.members.push(userIdObjectId);
        await room.save();
        isMember = true;
      }
      
      if (isMember) {
        const roomName = `room:${roomId}`;
        socket.join(roomName);
        
        // Get all sockets in room for logging
        const roomSockets = await io.in(roomName).fetchSockets();
        console.log(`✅ User ${socket.user.username} (${socket.userId}) joined room ${roomId} - Total clients in room: ${roomSockets.length}`);
        
        socket.emit('room_joined', { roomId });
        socket.to(roomName).emit('user_joined', {
          userId: socket.userId,
          username: socket.user.username
        });
        
        // Send ChaiWala welcome message only to the new user (not everyone)
        // Check if user was already welcomed recently to avoid spam
        try {
          // Check for any recent ChaiWala messages (within last 10 minutes)
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          const recentChaiWalaMessages = room.messages
            .filter(msg => {
              if (msg.type !== 'chaiwala_bot') return false;
              const msgDate = msg.createdAt ? new Date(msg.createdAt) : null;
              return msgDate && msgDate > tenMinutesAgo;
            });
          
          // Only send welcome if there are no recent ChaiWala messages (to avoid spam)
          // This prevents multiple welcomes when users reconnect or rejoin
          const shouldWelcome = recentChaiWalaMessages.length === 0;
          
          if (shouldWelcome) {
            const welcomeContent = generateWelcomeMessage(socket.user.username, room.name);
            
            // Create message object for immediate emission (don't wait for DB save)
            const messageForClient = {
              _id: `temp-${Date.now()}`,
              content: welcomeContent,
              type: 'chaiwala_bot',
              user: {
                _id: 'chaiwala-bot',
                username: 'ChaiWala',
                avatar: '/avatars/chaiwala-avatar.png'
              },
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            // Emit immediately to the new user only
            socket.emit('chaiwala_welcome', {
              message: messageForClient,
              roomId,
              newMember: socket.user.username
            });
            
            // Save to database in background (don't block)
            const welcomeMessage = {
              content: welcomeContent,
              type: 'chaiwala_bot',
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            room.messages.push(welcomeMessage);
            room.lastMessage = new Date();
            room.save().catch(err => {
              console.error('Error saving ChaiWala welcome message:', err);
            });
            
            console.log(`☕ ChaiWala welcomed ${socket.user.username} in room ${roomId}`);
          }
        } catch (error) {
          console.error('Error sending ChaiWala welcome:', error);
          // Don't block the join process if welcome fails
        }
        
        console.log(`✅ User ${socket.user.username} joined room ${roomId}`);
      } else {
        socket.emit('error', { message: 'Not a member of this room' });
      }
      } catch (joinError) {
        console.error('Error in join_room handler:', joinError);
        socket.emit('error', { message: 'Failed to join room: ' + (joinError.message || 'Unknown error') });
      }
    });
    
    // Handle leaving a room
    socket.on('leave_room', (roomId) => {
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('user_left', {
        userId: socket.userId,
        username: socket.user.username
      });
    });
    
    // Handle text messages
    socket.on('send_message', async (data) => {
      try {
        const { roomId, content, replyTo } = data;
        
        // Validate input
        if (!roomId) {
          return socket.emit('error', { message: 'Room ID is required' });
        }
        
        if (!content || !content.trim()) {
          return socket.emit('error', { message: 'Message content cannot be empty' });
        }
        
        // Limit message length
        if (content.length > 10000) {
          return socket.emit('error', { message: 'Message is too long (max 10,000 characters)' });
        }
        
        // Use select to only fetch what we need for membership check
        const room = await ChatRoom.findById(roomId).select('members messages');
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
        
        const isMember = room.members.some(memberId => 
          memberId.toString() === socket.userId.toString()
        );
        
        if (!isMember) {
          return socket.emit('error', { message: 'Not a member of this room' });
        }
        
        const message = {
          user: socket.userId,
          content,
          type: 'text',
          replyTo: replyTo || null,
          reactions: [],
          starredBy: [],
          readBy: []
        };
        
        room.messages.push(message);
        room.lastMessage = new Date();
        await room.save();
        
        // Get the last message directly - more efficient than loading all messages
        const savedMessage = room.messages[room.messages.length - 1];
        if (!savedMessage) {
          return socket.emit('error', { message: 'Failed to save message' });
        }
        
        // Populate user and reactions manually
        const User = (await import('../models/User.js')).default;
        const messageObj = savedMessage.toObject();
        
        // Populate message user
        if (messageObj.user) {
          const user = await User.findById(messageObj.user).select('username avatar').lean();
          messageObj.user = user || { _id: messageObj.user, username: 'User', avatar: null };
        }
        
        // Populate reaction users
        if (messageObj.reactions && messageObj.reactions.length > 0) {
          const reactionUserIds = messageObj.reactions.flatMap(r => r.users || []);
          if (reactionUserIds.length > 0) {
            const reactionUsers = await User.find({ _id: { $in: reactionUserIds } })
              .select('username avatar')
              .lean();
            const userMap = new Map(reactionUsers.map(u => [u._id.toString(), u]));
            messageObj.reactions = messageObj.reactions.map(reaction => ({
              ...reaction,
              users: (reaction.users || []).map(userId => {
                const userIdStr = userId.toString();
                return userMap.get(userIdStr) || { _id: userId, username: 'User', avatar: null };
              })
            }));
          }
        }
        
        // Populate starredBy
        if (messageObj.starredBy && messageObj.starredBy.length > 0) {
          const starredUsers = await User.find({ _id: { $in: messageObj.starredBy } })
            .select('username avatar')
            .lean();
          const userMap = new Map(starredUsers.map(u => [u._id.toString(), u]));
          messageObj.starredBy = messageObj.starredBy.map(userId => {
            const userIdStr = userId.toString();
            return userMap.get(userIdStr) || { _id: userId, username: 'User', avatar: null };
          });
        }
        
        const savedMessagePopulated = messageObj;
        
        // Ensure arrays are initialized
        if (!savedMessagePopulated.reactions) savedMessagePopulated.reactions = [];
        if (!savedMessagePopulated.readBy) savedMessagePopulated.readBy = [];
        if (!savedMessagePopulated.starredBy) savedMessagePopulated.starredBy = [];
        
        // Emit to all users in the room (including sender)
        // Optimize: Use direct emit instead of fetchSockets for better performance
        const roomName = `room:${roomId}`;
        
        // Emit without await to avoid blocking
        io.to(roomName).emit('new_message', {
          message: savedMessagePopulated,
          roomId
        });
        
        // Log asynchronously to avoid blocking
        setImmediate(() => {
          io.in(roomName).fetchSockets().then(roomSockets => {
            console.log(`✅ Message sent in room ${roomId} by ${socket.user.username} to ${roomSockets.length} clients`);
          }).catch(err => {
            console.log(`✅ Message sent in room ${roomId} by ${socket.user.username}`);
          });
        });
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });
    
    // Handle AI code generation (@omega trigger)
    socket.on('ai_generate_code', async (data) => {
      try {
        const { roomId, prompt, context } = data;
        
        // Validate input
        if (!roomId) {
          console.error('❌ AI generation: Missing roomId');
          return socket.emit('error', { message: 'Room ID is required' });
        }
        
        if (!prompt || !prompt.trim()) {
          console.error('❌ AI generation: Missing or empty prompt');
          return socket.emit('error', { message: 'Prompt is required' });
        }
        
        console.log(`🤖 AI generation request received: roomId=${roomId}, prompt="${prompt.substring(0, 50)}..."`);
        
        // Emit typing indicator IMMEDIATELY before any async operations
        // This ensures users see "Omega is thinking" right away
        io.to(`room:${roomId}`).emit('ai_typing', { roomId, userId: socket.userId });
        
        // Use select to only fetch needed fields for better performance
        const room = await ChatRoom.findById(roomId)
          .select('members project repository messages');
        if (!room) {
          io.to(`room:${roomId}`).emit('ai_typing_stopped', { roomId });
          return socket.emit('error', { message: 'Room not found' });
        }
        
        const isMember = room.members.some(memberId => 
          memberId.toString() === socket.userId.toString()
        );
        
        if (!isMember) {
          io.to(`room:${roomId}`).emit('ai_typing_stopped', { roomId });
          return socket.emit('error', { message: 'Not a member of this room' });
        }
        
        // Generate AI response - optimized with timeout
        const cleanPrompt = prompt?.trim() || '';
        if (!cleanPrompt) {
          console.error('❌ AI generation: Empty prompt after trimming');
          io.to(`room:${roomId}`).emit('ai_typing_stopped', { roomId });
          return socket.emit('error', { message: 'Prompt cannot be empty' });
        }
        console.log(`🤖 Generating AI code for: ${cleanPrompt.substring(0, 50)}...`);
        
        // Get repository context if available (with timeout to prevent delays)
        let repoContext = '';
        try {
          if (room.project) {
            const project = await Project.findById(room.project);
            if (project && project.githubRepo && project.githubRepo.fullName) {
              const user = await User.findById(socket.userId);
              if (user && user.githubToken) {
                console.log('📂 Fetching repository context...');
                // Add timeout to prevent long delays (2 seconds max - reduced for faster response)
                const contextPromise = getRepositoryContext(
                  project.githubRepo.fullName,
                  user.githubToken
                );
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Context fetch timeout')), 2000)
                );
                
                const repoInfo = await Promise.race([contextPromise, timeoutPromise]);
                
                // Format repository context for AI (limit size to avoid token limits)
                const fileContents = repoInfo.files
                  .map(f => {
                    // Limit each file to 1500 chars to stay within token limits
                    const content = f.content.length > 1500 
                      ? f.content.substring(0, 1500) + '... (truncated)'
                      : f.content;
                    return `\n--- ${f.path} ---\n${content}`;
                  })
                  .join('\n\n');
                
                // Limit total context size (approximately 8000 chars max)
                const maxContextLength = 8000;
                const contextHeader = `Repository Context:
- Repository: ${repoInfo.name}
- Description: ${repoInfo.description || 'N/A'}
- Primary Language: ${repoInfo.language || 'N/A'}
- Branch: ${repoInfo.branch}
- Key Files: ${repoInfo.structure.slice(0, 10).join(', ')}

Key File Contents:`;

                const fullContext = contextHeader + fileContents;
                repoContext = fullContext.length > maxContextLength
                  ? fullContext.substring(0, maxContextLength) + '\n\n... (context truncated)'
                  : fullContext;
                console.log('✅ Repository context fetched');
              }
            }
          } else if (room.repository) {
            // Direct repository chatroom
            const user = await User.findById(socket.userId);
            if (user && user.githubToken) {
              console.log('📂 Fetching repository context from room repository...');
              // Add timeout to prevent long delays (2 seconds max - reduced for faster response)
              const contextPromise = getRepositoryContext(
                room.repository,
                user.githubToken
              );
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Context fetch timeout')), 2000)
              );
              
              const repoInfo = await Promise.race([contextPromise, timeoutPromise]);
              
              // Format repository context for AI (limit size to avoid token limits)
              const fileContents = repoInfo.files
                .map(f => {
                  // Limit each file to 1500 chars to stay within token limits
                  const content = f.content.length > 1500 
                    ? f.content.substring(0, 1500) + '... (truncated)'
                    : f.content;
                  return `\n--- ${f.path} ---\n${content}`;
                })
                .join('\n\n');
              
              // Limit total context size (approximately 8000 chars max)
              const maxContextLength = 8000;
              const contextHeader = `Repository Context:
- Repository: ${repoInfo.name}
- Description: ${repoInfo.description || 'N/A'}
- Primary Language: ${repoInfo.language || 'N/A'}
- Branch: ${repoInfo.branch}
- Key Files: ${repoInfo.structure.slice(0, 10).join(', ')}

Key File Contents:`;

              const fullContext = contextHeader + fileContents;
              repoContext = fullContext.length > maxContextLength
                ? fullContext.substring(0, maxContextLength) + '\n\n... (context truncated)'
                : fullContext;
              console.log('✅ Repository context fetched');
            }
          }
        } catch (repoError) {
          console.log('⚠️ Could not fetch repository context:', repoError.message);
          // Continue without repo context - not critical
        }
        
        // Combine user context with repository context
        const fullContext = repoContext ? `${repoContext}\n\n${context || ''}`.trim() : context;
        
        // Generate code using AI with timeout to prevent hanging
        let aiResponse;
        try {
          console.log('🚀 Starting AI generation...');
          console.log('📝 Prompt:', cleanPrompt);
          console.log('📝 Context length:', fullContext?.length || 0);
          const startTime = Date.now();
          
          // Add timeout wrapper for AI generation (25 seconds max)
          const aiGenerationPromise = generateCodeSnippet(cleanPrompt, fullContext || '');
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('AI generation timeout after 25 seconds')), 25000)
          );
          
          aiResponse = await Promise.race([aiGenerationPromise, timeoutPromise]);
          const generationTime = Date.now() - startTime;
          console.log(`✅ AI code generated successfully in ${generationTime}ms`);
          console.log('📊 Response summary:', {
            codeLength: aiResponse?.code?.length || 0,
            language: aiResponse?.language || 'none',
            explanationLength: aiResponse?.explanation?.length || 0,
            hasCode: !!aiResponse?.code,
            hasExplanation: !!aiResponse?.explanation
          });
          
          // Validate AI response
          if (!aiResponse) {
            throw new Error('AI returned empty response');
          }
        } catch (error) {
          console.error('❌ AI generation failed:', error);
          console.error('Error stack:', error.stack);
          
          // Send error message to user
          const errorMessage = {
            user: socket.userId,
            content: `@omega: ${cleanPrompt || 'request'}`,
            type: 'text',
            error: `AI generation failed: ${error.message || 'Unknown error'}`
          };
          
          room.messages.push(errorMessage);
          room.lastMessage = new Date();
          await room.save();
          
          // Optimize: Get the last message directly instead of loading all messages
          const savedError = room.messages[room.messages.length - 1];
          if (!savedError) {
            io.to(`room:${roomId}`).emit('ai_typing_stopped', { roomId });
            return socket.emit('error', { message: 'Failed to save error message' });
          }
          
          // Populate user manually
          const User = (await import('../models/User.js')).default;
          const messageObj = savedError.toObject();
          if (messageObj.user) {
            const user = await User.findById(messageObj.user).select('username avatar').lean();
            messageObj.user = user || { _id: messageObj.user, username: 'User', avatar: null };
          }
          
          io.to(`room:${roomId}`).emit('new_message', {
            message: messageObj,
            roomId
          });
          
          // Emit stop typing indicator on error
          io.to(`room:${roomId}`).emit('ai_typing_stopped', { roomId });
          
          // Also emit error to sender
          socket.emit('error', { 
            message: `AI generation failed: ${error.message}`,
            details: error.stack 
          });
          
          return;
        }
        
        // Save the AI response message
        const aiMessage = {
          user: socket.userId, // Will be overridden to Omega AI
          content: `@omega ${cleanPrompt}`,
          type: 'ai_code',
          aiPrompt: cleanPrompt,
          aiResponse: {
            code: aiResponse.code,
            explanation: aiResponse.explanation,
            language: aiResponse.language
          }
        };
        
        room.messages.push(aiMessage);
        room.lastMessage = new Date();
        await room.save();
        
        // Get only the last message - more efficient than loading all messages
        // The message was just added, so it's the last one in the array
        const User = (await import('../models/User.js')).default;
        const lastMessage = room.messages[room.messages.length - 1];
        
        // Properly convert subdocument to plain object with all nested properties
        let savedMessage;
        if (lastMessage && typeof lastMessage.toObject === 'function') {
          savedMessage = lastMessage.toObject();
        } else if (lastMessage) {
          // Fallback: use JSON serialization to ensure all nested properties are included
          savedMessage = JSON.parse(JSON.stringify(lastMessage));
        } else {
          throw new Error('Failed to get saved message');
        }
        
        // Ensure aiResponse is properly included (it should be, but double-check)
        if (savedMessage.type === 'ai_code' && !savedMessage.aiResponse) {
          // Reconstruct from the original aiMessage if missing
          savedMessage.aiResponse = {
            code: aiResponse.code || null,
            explanation: aiResponse.explanation || null,
            language: aiResponse.language || null
          };
        }
        
        // Populate user manually for better performance
        if (savedMessage.user && typeof savedMessage.user.toString === 'function') {
          const userId = savedMessage.user.toString();
          const user = await User.findById(userId).select('username avatar').lean();
          savedMessage.user = user || { _id: userId, username: 'User', avatar: null };
        }
        
        // Override user info for AI messages to show as Omega AI
        if (savedMessage.type === 'ai_code') {
          savedMessage.user = {
            _id: 'omega-ai',
            username: 'Omega AI',
            avatar: null
          };
        }
        
        // Validate message structure before emitting
        if (!savedMessage || !savedMessage._id) {
          console.error('❌ Invalid message structure:', savedMessage);
          io.to(`room:${roomId}`).emit('ai_typing_stopped', { roomId });
          return socket.emit('error', { message: 'Failed to create AI message' });
        }
        
        // Ensure aiResponse exists for ai_code messages
        if (savedMessage.type === 'ai_code' && !savedMessage.aiResponse) {
          console.error('❌ AI message missing aiResponse:', savedMessage);
          // Try to reconstruct from aiResponse variable
          if (aiResponse) {
            savedMessage.aiResponse = {
              code: aiResponse.code || null,
              explanation: aiResponse.explanation || null,
              language: aiResponse.language || null
            };
          } else {
            io.to(`room:${roomId}`).emit('ai_typing_stopped', { roomId });
            return socket.emit('error', { message: 'AI response data missing' });
          }
        }
        
        // Emit AI response to all users in the room (including requester)
        console.log('📤 Emitting AI response to room:', roomId);
        console.log('📦 Message data:', {
          type: savedMessage.type,
          hasAiResponse: !!savedMessage.aiResponse,
          codeLength: savedMessage.aiResponse?.code?.length || 0,
          explanationLength: savedMessage.aiResponse?.explanation?.length || 0,
          language: savedMessage.aiResponse?.language || 'none'
        });
        
        // Emit stop typing indicator first
        io.to(`room:${roomId}`).emit('ai_typing_stopped', { roomId });
        
        // Then emit the AI response
        io.to(`room:${roomId}`).emit('ai_code_generated', {
          message: savedMessage,
          roomId
        });
        
        console.log(`🤖 AI code generated and sent in room ${roomId} for ${socket.user?.username || 'unknown user'}`);
      } catch (error) {
        console.error('❌ Error generating AI code:', error);
        console.error('Error stack:', error.stack);
        
        // Ensure typing indicator is stopped on any error
        io.to(`room:${data?.roomId || 'unknown'}`).emit('ai_typing_stopped', { roomId: data?.roomId });
        
        // Send detailed error to client
        socket.emit('error', { 
          message: `Failed to generate code: ${error.message || 'Unknown error'}`,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });
    
    // Handle voice messages
    socket.on('send_voice_message', async (data) => {
      try {
        const { roomId, voiceUrl, duration } = data;
        
        const room = await ChatRoom.findById(roomId);
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
        
        const isMember = room.members.some(memberId => 
          memberId.toString() === socket.userId.toString()
        );
        
        if (!isMember) {
          return socket.emit('error', { message: 'Not a member of this room' });
        }
        
        const message = {
          user: socket.userId,
          content: 'Voice message',
          type: 'voice',
          voiceUrl,
          duration
        };
        
        room.messages.push(message);
        room.lastMessage = new Date();
        await room.save();
        
        // Optimize: Get the last message directly instead of loading all messages
        const savedMessage = room.messages[room.messages.length - 1];
        if (!savedMessage) {
          return socket.emit('error', { message: 'Failed to save voice message' });
        }
        
        // Populate user manually
        const User = (await import('../models/User.js')).default;
        const messageObj = savedMessage.toObject();
        if (messageObj.user) {
          const user = await User.findById(messageObj.user).select('username avatar').lean();
          messageObj.user = user || { _id: messageObj.user, username: 'User', avatar: null };
        }
        
        // Emit voice message to all users in the room
        io.to(`room:${roomId}`).emit('new_message', {
          message: messageObj,
          roomId
        });
        
        console.log(`🎤 Voice message sent in room ${roomId} by ${socket.user.username}`);
      } catch (error) {
        console.error('Error sending voice message:', error);
        socket.emit('error', { message: 'Failed to send voice message' });
      }
    });
    
    // Handle DK bot command
    socket.on('dk_bot_command', async (data) => {
      try {
        const { roomId } = data;
        
        const room = await ChatRoom.findById(roomId);
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
        
        // Check if room has a linked repository
        let repoFullName = null;
        let githubToken = null;
        
        if (room.project) {
          const project = await Project.findById(room.project).populate('members.user');
          if (project && project.githubRepo && project.githubRepo.fullName) {
            repoFullName = project.githubRepo.fullName;
            // Get token from project owner or first member
            const owner = project.members.find(m => m.role === 'owner');
            if (owner) {
              const ownerUser = await User.findById(owner.user);
              if (ownerUser && ownerUser.githubToken) {
                githubToken = ownerUser.githubToken;
              }
            }
            // Fallback to any member with token
            if (!githubToken) {
              for (const member of project.members) {
                const memberUser = await User.findById(member.user);
                if (memberUser && memberUser.githubToken) {
                  githubToken = memberUser.githubToken;
                  break;
                }
              }
            }
          }
        } else if (room.repository) {
          repoFullName = room.repository;
          // Get token from room members
          for (const memberId of room.members) {
            const memberUser = await User.findById(memberId);
            if (memberUser && memberUser.githubToken) {
              githubToken = memberUser.githubToken;
              break;
            }
          }
        }
        
        if (!repoFullName || !githubToken) {
          const errorMessage = {
            user: socket.userId,
            content: '@dk: Repository not linked or GitHub token not available. Please link a GitHub repository to this chatroom.',
            type: 'dk_bot',
            dkBotData: {
              type: 'notification',
              githubData: { error: 'No repository linked' }
            }
          };
          
          room.messages.push(errorMessage);
          await room.save();
          
          const updatedRoom = await ChatRoom.findById(roomId)
            .populate('messages.user', 'username avatar');
          
          const savedMessage = updatedRoom.messages[updatedRoom.messages.length - 1];
          savedMessage.user = {
            _id: 'dk-bot',
            username: 'DK',
            avatar: '/avatars/dk-avatar.png'
          };
          
          const roomName = `room:${roomId}`;
          const roomSockets = await io.in(roomName).fetchSockets();
          console.log(`📊 Broadcasting DK bot response to ${roomSockets.length} client(s) in room ${roomId}`);
          
          io.to(roomName).emit('dk_bot_response', {
            message: savedMessage,
            roomId
          });
          return;
        }
        
        // Fetch repository stats
        console.log(`📊 DK Bot: Fetching stats for ${repoFullName}`);
        const stats = await getRepositoryStats(repoFullName, githubToken);
        const formattedStats = formatRepositoryStats(stats);
        
        const dkMessage = {
          user: socket.userId,
          content: formattedStats,
          type: 'dk_bot',
          dkBotData: {
            type: 'stats',
            githubData: stats
          }
        };
        
        room.messages.push(dkMessage);
        room.lastMessage = new Date();
        await room.save();
        
        const updatedRoom = await ChatRoom.findById(roomId)
          .populate('messages.user', 'username avatar');
        
        const savedMessage = updatedRoom.messages[updatedRoom.messages.length - 1];
        
        // Override user info for DK bot messages
        savedMessage.user = {
          _id: 'dk-bot',
          username: 'DK',
          avatar: '/avatars/dk-avatar.png'
        };
        
        io.to(`room:${roomId}`).emit('dk_bot_response', {
          message: savedMessage,
          roomId
        });
        
        console.log(`📊 DK Bot stats sent in room ${roomId}`);
      } catch (error) {
        console.error('Error in DK bot command:', error);
        socket.emit('error', { message: 'Failed to fetch repository stats: ' + error.message });
      }
    });
    
    // Handle typing indicator
    socket.on('typing', (data) => {
      const { roomId, isTyping } = data;
      socket.to(`room:${roomId}`).emit('user_typing', {
        userId: socket.userId,
        username: socket.user.username,
        isTyping,
        roomId
      });
    });
    
    // Handle message edit
    socket.on('edit_message', async (data) => {
      try {
        const { roomId, messageId, content } = data;
        const room = await ChatRoom.findById(roomId);
        
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
        
        const message = room.messages.id(messageId);
        if (!message || message.user.toString() !== socket.userId.toString()) {
          return socket.emit('error', { message: 'Message not found or not authorized' });
        }
        
        // Save to edit history
        if (!message.editHistory) {
          message.editHistory = [];
        }
        message.editHistory.push({
          content: message.content,
          editedAt: new Date()
        });
        
        message.content = content;
        message.edited = true;
        await room.save();
        
        const updatedRoom = await ChatRoom.findById(roomId)
          .populate('messages.user', 'username avatar');
        
        const updatedMessage = updatedRoom.messages.id(messageId);
        
        io.to(`room:${roomId}`).emit('message_edited', {
          message: updatedMessagePopulated,
          roomId
        });
      } catch (error) {
        console.error('Error editing message:', error);
        socket.emit('error', { message: 'Failed to edit message' });
      }
    });

    // Handle message delete
    socket.on('delete_message', async (data) => {
      try {
        const { roomId, messageId } = data;
        const room = await ChatRoom.findById(roomId);
        
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
        
        const message = room.messages.id(messageId);
        if (!message || message.user.toString() !== socket.userId.toString()) {
          return socket.emit('error', { message: 'Message not found or not authorized' });
        }
        
        message.deleted = true;
        message.deletedAt = new Date();
        message.content = '[Message deleted]';
        
        // Remove from pinned
        if (room.pinnedMessages) {
          room.pinnedMessages = room.pinnedMessages.filter(
            id => id.toString() !== messageId
          );
        }
        
        await room.save();
        
        io.to(`room:${roomId}`).emit('message_deleted', {
          messageId,
          roomId
        });
      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle reaction
    socket.on('toggle_reaction', async (data) => {
      try {
        const { roomId, messageId, emoji } = data;
        const room = await ChatRoom.findById(roomId);
        
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
        
        const message = room.messages.id(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }
        
        if (!message.reactions) {
          message.reactions = [];
        }
        
        let reaction = message.reactions.find(r => r.emoji === emoji);
        if (!reaction) {
          reaction = { emoji, users: [] };
          message.reactions.push(reaction);
        }
        
        const userIndex = reaction.users.findIndex(
          userId => userId.toString() === socket.userId.toString()
        );
        
        if (userIndex === -1) {
          reaction.users.push(socket.userId);
        } else {
          reaction.users.splice(userIndex, 1);
          if (reaction.users.length === 0) {
            message.reactions = message.reactions.filter(r => r.emoji !== emoji);
          }
        }
        
        await room.save();
        
        const updatedRoom = await ChatRoom.findById(roomId)
          .populate('messages.user', 'username avatar')
          .populate('messages.reactions.users', 'username avatar');
        
        const updatedMessage = updatedRoom.messages.id(messageId);
        
        io.to(`room:${roomId}`).emit('reaction_updated', {
          message: updatedMessagePopulated,
          roomId
        });
      } catch (error) {
        console.error('Error toggling reaction:', error);
        socket.emit('error', { message: 'Failed to toggle reaction' });
      }
    });

    // Handle pin/unpin
    socket.on('toggle_pin', async (data) => {
      try {
        const { roomId, messageId } = data;
        const room = await ChatRoom.findById(roomId);
        
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
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
        
        io.to(`room:${roomId}`).emit('pin_updated', {
          roomId,
          messageId,
          pinned: !isPinned,
          pinnedMessages: room.pinnedMessages
        });
      } catch (error) {
        console.error('Error toggling pin:', error);
        socket.emit('error', { message: 'Failed to toggle pin' });
      }
    });

    // Handle star/unstar
    socket.on('toggle_star', async (data) => {
      try {
        const { roomId, messageId } = data;
        const room = await ChatRoom.findById(roomId);
        
        if (!room) {
          return socket.emit('error', { message: 'Room not found' });
        }
        
        const message = room.messages.id(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }
        
        if (!message.starredBy) {
          message.starredBy = [];
        }
        
        const isStarred = message.starredBy.some(
          userId => userId.toString() === socket.userId.toString()
        );
        
        if (isStarred) {
          message.starredBy = message.starredBy.filter(
            userId => userId.toString() !== socket.userId.toString()
          );
        } else {
          message.starredBy.push(socket.userId);
        }
        
        await room.save();
        
        io.to(`room:${roomId}`).emit('star_updated', {
          roomId,
          messageId,
          starred: !isStarred
        });
      } catch (error) {
        console.error('Error toggling star:', error);
        socket.emit('error', { message: 'Failed to toggle star' });
      }
    });

    // Handle mark as read
    socket.on('mark_read', async (data) => {
      try {
        const { roomId, messageId } = data;
        const room = await ChatRoom.findById(roomId);
        
        if (!room) {
          return;
        }
        
        const message = room.messages.id(messageId);
        if (!message) {
          return;
        }
        
        if (!message.readBy) {
          message.readBy = [];
        }
        
        message.readBy = message.readBy.filter(
          read => read.user.toString() !== socket.userId.toString()
        );
        
        message.readBy.push({
          user: socket.userId,
          readAt: new Date()
        });
        
        await room.save();
        
        // Emit to room
        io.to(`room:${roomId}`).emit('message_read', {
          roomId,
          messageId,
          userId: socket.userId
        });
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.user.username}`);
      await User.findByIdAndUpdate(socket.userId, { 
        online: false, 
        lastSeen: new Date() 
      });
    });
  });
}
