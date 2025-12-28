import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';
import apiClient from '../config/axios';
import { logger } from '../utils/logger';
import { Send, Mic, ArrowLeft, Users, Bot, Trash2, Edit2, X, Reply, Pin, Copy, Smile, Search, Image as ImageIcon, Paperclip, Check, CheckCheck, GitBranch, AlertCircle, Loader2, CheckCircle2, UserPlus } from 'lucide-react';

export default function ChatRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Map()); // Map of userId -> username
  const [room, setRoom] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [socket, setSocket] = useState(null);
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const aiTypingTimeoutRef = useRef(null);
  const [showMicInstructions, setShowMicInstructions] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(null); // messageId
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [showMessageMenu, setShowMessageMenu] = useState(null); // messageId
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [imageCaption, setImageCaption] = useState('');
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [searchFilters, setSearchFilters] = useState({
    userId: '',
    messageType: '',
    dateFrom: '',
    dateTo: ''
  });
  const [searchHistory, setSearchHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [messagePage, setMessagePage] = useState(0);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const roomCheckIntervalRef = useRef(null);
  const fetchingMessagesRef = useRef(false);
  const fetchingRoomRef = useRef(false);
  const fetchRoomTimeoutRef = useRef(null);
  const shouldScrollToBottomRef = useRef(true);
  const fetchRoomRef = useRef(null);
  const scrollThrottleRef = useRef(null);
  const readDetectionThrottleRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const intersectionObserverRef = useRef(null);
  const messageUpdateTimeoutRef = useRef(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberBy, setAddMemberBy] = useState('username');
  const [showCommitModal, setShowCommitModal] = useState(null); // messageId
  const [commitFilePath, setCommitFilePath] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [fileExists, setFileExists] = useState(false);
  const [checkingFile, setCheckingFile] = useState(false);
  const [commitError, setCommitError] = useState(null);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [showShareCodeModal, setShowShareCodeModal] = useState(false);
  const [roomGroupCode, setRoomGroupCode] = useState(null);
  const [roomInviteLink, setRoomInviteLink] = useState(null);
  const [loadingGroupCode, setLoadingGroupCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Close mentions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMentions && textareaRef.current && !textareaRef.current.contains(e.target)) {
        // Check if click is not on the dropdown itself
        if (!e.target.closest('.mention-dropdown')) {
          setShowMentions(false);
          setSelectedMentionIndex(0);
        }
      }
      // Close emoji picker if clicking outside
      if (showEmojiPicker && !e.target.closest('.emoji-picker-container') && !e.target.closest('button[title="Add reaction"]')) {
        setShowEmojiPicker(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMentions, showEmojiPicker]);

  const scrollToBottom = useCallback((force = false) => {
    if (force || shouldScrollToBottomRef.current) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, []);

  // Ensure we honor pending scroll requests as soon as messages render (e.g., after refresh)
  useEffect(() => {
    if (shouldScrollToBottomRef.current) {
      scrollToBottom(true);
      shouldScrollToBottomRef.current = false;
    }
  }, [messages.length, scrollToBottom]);

  const fetchMessages = useCallback(async (skip = 0, append = false, shouldScroll = false) => {
    if (!roomId || !token) return;
    
    // Prevent concurrent fetches
    if (fetchingMessagesRef.current) {
      logger.debug('⏸️ Already fetching messages, skipping...');
      return;
    }
    
    fetchingMessagesRef.current = true;
    
    try {
      const limit = 50;
      const response = await apiClient.get(`/api/chat/room/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit, skip }
      });
      
      const newMessages = response.data.messages || [];
      
      if (append) {
        setMessages(prev => {
          // Merge and deduplicate
          const existingIds = new Set(prev.map(m => m._id?.toString() || m._id));
          const uniqueNew = newMessages.filter(m => !existingIds.has(m._id?.toString() || m._id));
          return [...uniqueNew, ...prev];
        });
      } else {
        setMessages(newMessages);
        // Only scroll on initial load or when explicitly requested
        if (shouldScroll || skip === 0) {
          shouldScrollToBottomRef.current = true;
          setTimeout(() => {
            scrollToBottom();
            shouldScrollToBottomRef.current = false;
          }, 100);
        }
      }
      
      // Check if there are more messages
      setHasMoreMessages(newMessages.length === limit);
      setMessagePage(Math.floor(skip / limit));
    } catch (error) {
      logger.error('Error fetching messages:', error);
    } finally {
      fetchingMessagesRef.current = false;
    }
  }, [roomId, token, scrollToBottom]);

  // Format relative time
  const formatRelativeTime = useCallback((date) => {
    const now = new Date();
    const messageDate = new Date(date);
    const diffInSeconds = Math.floor((now - messageDate) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    // For older messages, show date
    const isSameYear = now.getFullYear() === messageDate.getFullYear();
    if (isSameYear) {
      return messageDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return messageDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  useEffect(() => {
    // Initialize socket connection - use window location for proper proxy handling
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin.replace('5173', '5000');
    logger.debug('🔌 Connecting to socket:', socketUrl);
    
    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['polling', 'websocket'], // Try polling first, then websocket (better for Render.com)
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      forceNew: false,
      upgrade: true,
      rememberUpgrade: true
    });

    // Debounced fetchRoom function for socket events
    const debouncedFetchRoomForSocket = () => {
      if (fetchRoomTimeoutRef.current) {
        clearTimeout(fetchRoomTimeoutRef.current);
      }
      fetchRoomTimeoutRef.current = setTimeout(() => {
        if (fetchRoomRef.current) {
          fetchRoomRef.current();
        }
      }, 500);
    };

    const joinRoom = () => {
      if (roomId && newSocket.connected) {
        logger.debug('Joining room:', roomId);
        newSocket.emit('join_room', roomId);
      }
    };

    newSocket.on('connect', () => {
      logger.log('✅ Socket connected to server, socket ID:', newSocket.id);
      joinRoom();
      // Only refresh messages if we don't have any yet (initial connection)
      if (roomId && messages.length === 0) {
        fetchMessages(0, false, true);
      }
    });

    // Periodically verify we're still in the room (every 30 seconds)
    roomCheckIntervalRef.current = setInterval(() => {
      if (roomId && newSocket.connected) {
        logger.debug('🔄 Periodic room check - ensuring we are still in room:', roomId);
        joinRoom();
      }
    }, 30000);

    newSocket.on('disconnect', (reason) => {
      logger.warn('⚠️ Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected the socket, reconnect manually
        newSocket.connect();
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      logger.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
      joinRoom();
      // Don't refresh messages on reconnect - socket events will handle new messages
    });

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      logger.debug('🔄 Reconnection attempt', attemptNumber);
    });

    newSocket.on('reconnect_error', (error) => {
      logger.error('❌ Reconnection error:', error);
    });

    newSocket.on('reconnect_failed', () => {
      logger.error('❌ Reconnection failed');
    });

    newSocket.on('room_joined', (data) => {
      logger.debug('✅ Successfully joined room:', data.roomId);
    });

    // Removed duplicate error handler - using the one below with better error handling

    // Listen for new members being added
    newSocket.on('member_added', (data) => {
      logger.debug('👤 New member added:', data);
      if (data.roomId === roomId) {
        // Use debounced fetch to prevent excessive calls
        debouncedFetchRoomForSocket();
      }
    });

    // Listen for users joining the room
    newSocket.on('user_joined', (data) => {
      logger.debug('👤 User joined room:', data);
      // Use debounced fetch to prevent excessive calls
      if (roomId) {
        debouncedFetchRoomForSocket();
      }
    });

    // Listen for users leaving the room
    newSocket.on('member_left', (data) => {
      logger.debug('👤 Member left room:', data);
      if (data.roomId === roomId) {
        // Use debounced fetch to prevent excessive calls
        debouncedFetchRoomForSocket();
      }
    });

    // Listen for user_left event (from socket handler)
    newSocket.on('user_left', (data) => {
      logger.debug('👤 User left room:', data);
      if (roomId) {
        // Use debounced fetch to prevent excessive calls
        debouncedFetchRoomForSocket();
      }
    });

    // Batch message updates to reduce re-renders
    const messageUpdateQueue = [];
    
    const flushMessageUpdates = () => {
      if (messageUpdateQueue.length === 0) return;
      
      // Track new message IDs outside the setState callback
      const newMessageIds = new Set();
      
      // Check if any new message is from current user - always scroll for own messages
      const hasOwnMessage = messageUpdateQueue.some(data => {
        const msgUserId = data.message.user?._id || data.message.user;
        return user && (msgUserId?.toString() === user._id?.toString());
      });
      
      setMessages(prev => {
        let updated = [...prev];
        
        messageUpdateQueue.forEach(data => {
          const exists = updated.some(msg => msg._id === data.message._id);
          if (!exists) {
            // Remove optimistic message if exists
            updated = updated.filter(msg => 
              !(msg.pending && msg.content === data.message.content && 
                (msg.user?._id === data.message.user?._id || msg.user === data.message.user))
            );
            updated.push(data.message);
            newMessageIds.add(data.message._id);
          }
        });
        
        return updated;
      });
      
      // Scroll after state update if we had new messages
      if (newMessageIds.size > 0) {
        const container = messagesContainerRef.current;
        if (hasOwnMessage) {
          // Always scroll for own messages
          shouldScrollToBottomRef.current = true;
        } else if (container) {
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 300;
          shouldScrollToBottomRef.current = isNearBottom;
        } else {
          shouldScrollToBottomRef.current = true;
        }
        
        setTimeout(() => {
          scrollToBottom();
          shouldScrollToBottomRef.current = false;
        }, 50); // Reduced delay for faster response
      }
      
      // Clear the queue after processing
      messageUpdateQueue.length = 0;
    };
    
    newSocket.on('new_message', (data) => {
      messageUpdateQueue.push(data);
      
      // Batch updates - flush every 100ms or immediately if queue is getting large (increased for better performance)
      if (messageUpdateTimeoutRef.current) {
        clearTimeout(messageUpdateTimeoutRef.current);
      }
      
      if (messageUpdateQueue.length >= 10) {
        // Flush immediately if queue is large
        flushMessageUpdates();
      } else {
        // Otherwise batch for 100ms (increased from 50ms to reduce re-renders)
        messageUpdateTimeoutRef.current = setTimeout(() => {
          flushMessageUpdates();
        }, 100);
      }
    });

    newSocket.on('ai_code_generated', (data) => {
      logger.debug('🤖 Received AI code generated event:', data);
      // Turn off typing indicator when AI response is received
      setIsTyping(false);
      if (aiTypingTimeoutRef.current) {
        clearTimeout(aiTypingTimeoutRef.current);
        aiTypingTimeoutRef.current = null;
      }
      
      if (data.message) {
        setMessages(prev => {
          const exists = prev.some(msg => msg._id === data.message._id);
          if (!exists) {
            // Always scroll for AI responses (user requested it)
            shouldScrollToBottomRef.current = true;
            return [...prev, data.message];
          }
          return prev;
        });
        // Use requestAnimationFrame for smoother scroll
        requestAnimationFrame(() => {
          setTimeout(() => {
            scrollToBottom(true);
            shouldScrollToBottomRef.current = false;
          }, 50);
        });
      } else {
        logger.error('❌ AI code generated event missing message:', data);
      }
    });

    // DK Bot events
    newSocket.on('dk_bot_response', (data) => {
      logger.debug('📊 Received DK bot response:', data);
      if (data.message) {
        setMessages(prev => {
          const exists = prev.some(msg => msg._id === data.message._id);
          if (!exists) {
            // Always scroll for bot responses (user requested it)
            shouldScrollToBottomRef.current = true;
            return [...prev, data.message];
          }
          return prev;
        });
        requestAnimationFrame(() => {
          setTimeout(() => {
            scrollToBottom(true);
            shouldScrollToBottomRef.current = false;
          }, 50);
        });
      }
    });


    // New feature event listeners
    newSocket.on('message_edited', (data) => {
      setMessages(prev => prev.map(msg => {
        if (msg._id === data.message._id) {
          return { ...msg, ...data.message, edited: true };
        }
        return msg;
      }));
    });

    newSocket.on('message_deleted', (data) => {
      setMessages(prev => prev.map(msg => 
        msg._id === data.messageId ? { ...msg, deleted: true, content: '[Message deleted]' } : msg
      ));
    });

    newSocket.on('reaction_updated', (data) => {
      setMessages(prev => prev.map(msg => 
        msg._id === data.message._id ? data.message : msg
      ));
    });

    newSocket.on('pin_updated', (data) => {
      setPinnedMessages(data.pinnedMessages || []);
      // Use debounced fetch to prevent excessive calls
      debouncedFetchRoomForSocket();
    });


    newSocket.on('message_read', (data) => {
      setMessages(prev => prev.map(msg => {
        if (msg._id === data.messageId) {
          const readBy = msg.readBy || [];
          const userIdStr = data.userId?.toString();
          if (!readBy.find(r => (r.user?._id || r.user).toString() === userIdStr)) {
            readBy.push({ user: data.userId, readAt: new Date() });
          }
          return { ...msg, readBy };
        }
        return msg;
      }));
    });

    newSocket.on('user_typing', (data) => {
      if (user && data.userId !== user._id) {
        setTypingUsers(prev => {
          const newMap = new Map(prev);
          if (data.isTyping) {
            newMap.set(data.userId, data.username);
          } else {
            newMap.delete(data.userId);
          }
          return newMap;
        });
      }
    });

    newSocket.on('ai_typing', () => {
      logger.debug('🤖 AI is typing...');
      setIsTyping(true);
      // Clear any existing timeout
      if (aiTypingTimeoutRef.current) {
        clearTimeout(aiTypingTimeoutRef.current);
      }
      // Set a timeout to turn off typing indicator if no response
      aiTypingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        logger.warn('⏱️ AI typing timeout - no response after 30 seconds');
        // Add timeout message to chat
        setMessages(prev => [...prev, {
          _id: `timeout-${Date.now()}`,
          user: { _id: 'system', username: 'System', avatar: null },
          content: '⏱️ AI response timed out after 30 seconds. Please check backend logs.',
          type: 'system',
          createdAt: new Date().toISOString()
        }]);
        aiTypingTimeoutRef.current = null;
      }, 30000); // 30 seconds timeout
    });

    newSocket.on('ai_typing_stopped', () => {
      logger.debug('🤖 AI stopped typing');
      setIsTyping(false);
      if (aiTypingTimeoutRef.current) {
        clearTimeout(aiTypingTimeoutRef.current);
        aiTypingTimeoutRef.current = null;
      }
    });

    newSocket.on('error', (error) => {
      // Extract error message properly - handle both object and string errors
      let errorMsg = 'Unknown socket error';
      let errorDetails = null;
      
      if (typeof error === 'string') {
        errorMsg = error;
      } else if (error && typeof error === 'object') {
        errorMsg = error.message || error.msg || error.error || JSON.stringify(error);
        errorDetails = error.details || error.stack;
      } else if (error) {
        errorMsg = String(error);
      }
      
      logger.error('❌ Socket error:', errorMsg, errorDetails ? { details: errorDetails } : '');
      
      // Turn off typing indicator on error
      setIsTyping(false);
      if (aiTypingTimeoutRef.current) {
        clearTimeout(aiTypingTimeoutRef.current);
        aiTypingTimeoutRef.current = null;
      }
      
      // Only show alert for critical errors, not all errors
      if (errorMsg && !errorMsg.includes('Authentication') && !errorMsg.includes('token')) {
        // Add error message to chat for visibility instead of alert
        setMessages(prev => [...prev, {
          _id: `error-${Date.now()}`,
          user: { _id: 'system', username: 'System', avatar: null },
          content: `❌ Socket Error: ${errorMsg}${errorDetails ? `\n\nDetails: ${errorDetails}` : ''}`,
          type: 'system',
          createdAt: new Date().toISOString()
        }]);
      }
    });
    
    newSocket.on('connect_error', (error) => {
      logger.error('Socket connection error:', error);
      alert('Failed to connect to chat server. Please refresh the page.');
    });

    // Ensure room is joined whenever roomId changes or socket reconnects
    const handleRoomJoin = () => {
      if (roomId && newSocket.connected) {
        logger.debug('🔄 Ensuring room is joined:', roomId);
        newSocket.emit('join_room', roomId);
      }
    };

    // Rejoin room if socket reconnects (handled above, removing duplicate)
    
    // Also rejoin when roomId changes
    if (roomId && newSocket.connected) {
      handleRoomJoin();
    }

    setSocket(newSocket);

    return () => {
      logger.debug('🧹 Cleaning up socket connection');
      // Remove all event listeners to prevent memory leaks
      newSocket.removeAllListeners();
      // Leave room before disconnecting
      if (roomId && newSocket.connected) {
        newSocket.emit('leave_room', roomId);
      }
      newSocket.disconnect();
      // Cleanup speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      // Cleanup AI typing timeout
      if (aiTypingTimeoutRef.current) {
        clearTimeout(aiTypingTimeoutRef.current);
        aiTypingTimeoutRef.current = null;
      }
      // Cleanup typing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      // Cleanup room check interval
      if (roomCheckIntervalRef.current) {
        clearInterval(roomCheckIntervalRef.current);
        roomCheckIntervalRef.current = null;
      }
      // Cleanup fetchRoom timeout
      if (fetchRoomTimeoutRef.current) {
        clearTimeout(fetchRoomTimeoutRef.current);
        fetchRoomTimeoutRef.current = null;
      }
      // Cleanup message update timeout
      if (messageUpdateTimeoutRef.current) {
        clearTimeout(messageUpdateTimeoutRef.current);
        messageUpdateTimeoutRef.current = null;
      }
      setIsTyping(false);
    };
  }, [roomId, token]); // Removed messages.length to prevent unnecessary reconnections

  // Removed duplicate useEffect - messages are fetched in the main useEffect below

  // Load more messages (for infinite scroll)
  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMoreMessages) return;
    
    setLoadingMore(true);
    const nextSkip = (messagePage + 1) * 50;
    await fetchMessages(nextSkip, true);
    setLoadingMore(false);
  }, [loadingMore, hasMoreMessages, messagePage, fetchMessages]);

  const fetchRoom = useCallback(async (force = false) => {
    if (!roomId) {
      setError('Invalid room ID');
      setLoading(false);
      return;
    }

    if (!token) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches unless forced
    if (fetchingRoomRef.current && !force) {
        logger.debug('⏸️ Already fetching room, skipping...');
      return;
    }

    fetchingRoomRef.current = true;

    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(`/api/chat/room/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      
      if (response.data && response.data.room) {
        setRoom(response.data.room);
        setPinnedMessages(response.data.room.pinnedMessages || []);
      } else {
        setError('Room not found');
      }
    } catch (error) {
      logger.error('Error fetching room:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to load chat room';
      setError(errorMessage);
      
      // If it's a 403, show a helpful message and redirect
      if (error.response?.status === 403) {
        setError('You are not a member of this room. Please ask a member to add you, or return to the dashboard.');
        setTimeout(() => {
          navigate('/');
        }, 5000);
      } else if (error.response?.status === 404) {
        setError('Room not found');
        setTimeout(() => {
          navigate('/');
        }, 3000);
      }
    } finally {
      setLoading(false);
      fetchingRoomRef.current = false;
    }
  }, [roomId, token, navigate]);

  // Store fetchRoom in ref for socket events
  useEffect(() => {
    fetchRoomRef.current = fetchRoom;
  }, [fetchRoom]);

  // Debounced fetchRoom for socket events (used outside socket useEffect)
  const debouncedFetchRoom = useCallback(() => {
    if (fetchRoomTimeoutRef.current) {
      clearTimeout(fetchRoomTimeoutRef.current);
    }
    fetchRoomTimeoutRef.current = setTimeout(() => {
      fetchRoom();
    }, 500); // Debounce by 500ms
  }, [fetchRoom]);

  // Debounced typing indicator
  const handleTyping = useCallback(() => {
    if (!socket || !roomId) return;
    
    // Emit typing event
    socket.emit('typing', { roomId, isTyping: true });
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to stop typing after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      if (socket && roomId) {
        socket.emit('typing', { roomId, isTyping: false });
      }
    }, 3000);
  }, [socket, roomId]);

  // Memoize message metadata to avoid recalculating on every render
  const messagesWithMetadata = useMemo(() => {
    return messages.map(message => {
      const messageUserId = message.user?._id || message.user;
      const isAIMessage = message.type === 'ai_code' || message.user?.username === 'Omega AI' || message.user?.username === 'omega';
      const isDKMessage = message.type === 'dk_bot' || message.user?.username === 'DK' || message.user?.username === 'dk' || message.user?._id === 'dk-bot';
      const isOwnMessage = !isAIMessage && !isDKMessage && user && (messageUserId === user._id || messageUserId?.toString() === user._id?.toString());
      
      const userObj = typeof message.user === 'object' ? message.user : { username: 'User', avatar: null };
      let messageUser = userObj;
      if (isDKMessage && !userObj.avatar) {
        messageUser = { ...userObj, avatar: '/avatars/dk-avatar.png' };
      }
      
      return {
        ...message,
        _metadata: {
          messageUserId,
          isAIMessage,
          isDKMessage,
          isOwnMessage,
          messageUser
        }
      };
    });
  }, [messages, user]);

  // Fetch room and messages immediately when component mounts or roomId changes
  useEffect(() => {
    if (roomId && token) {
      // Reset scroll behavior for new room
      shouldScrollToBottomRef.current = true;
      fetchRoom(true); // Force fetch on room change
      fetchMessages(0, false, true); // Initial load, should scroll
    }
  }, [roomId, token]); // Removed fetchRoom and fetchMessages from dependencies to prevent loops

  // Cleanup intersection observer on unmount
  useEffect(() => {
    return () => {
      if (intersectionObserverRef.current) {
        intersectionObserverRef.current.disconnect();
        intersectionObserverRef.current = null;
      }
      if (scrollThrottleRef.current) {
        clearTimeout(scrollThrottleRef.current);
      }
      if (readDetectionThrottleRef.current) {
        clearTimeout(readDetectionThrottleRef.current);
      }
    };
  }, []);

  // Message action handlers
  const handleEditMessage = async (messageId, newContent) => {
    try {
      if (socket) {
        socket.emit('edit_message', { roomId, messageId, content: newContent });
        setEditingMessage(null);
      }
    } catch (error) {
      logger.error('Error editing message:', error);
      alert('Failed to edit message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) {
      return;
    }
    try {
      if (socket) {
        socket.emit('delete_message', { roomId, messageId });
      }
    } catch (error) {
      logger.error('Error deleting message:', error);
      alert('Failed to delete message');
    }
  };

  const handleToggleReaction = (messageId, emoji) => {
    if (socket) {
      socket.emit('toggle_reaction', { roomId, messageId, emoji });
      setShowEmojiPicker(null);
    }
  };

  const handleTogglePin = (messageId) => {
    if (socket) {
      socket.emit('toggle_pin', { roomId, messageId });
    }
  };

  const handleCopyMessageLink = (messageId) => {
    const link = `${window.location.origin}/chat/${roomId}#${messageId}`;
    navigator.clipboard.writeText(link);
    alert('Message link copied to clipboard!');
  };

  const handleMarkAsRead = (messageId) => {
    if (socket) {
      socket.emit('mark_read', { roomId, messageId });
    }
  };

  // Search handlers
  const handleSearch = async () => {
    if (!searchQuery.trim() && !searchFilters.userId && !searchFilters.messageType) {
      return;
    }
    
    try {
      const params = { q: searchQuery };
      if (searchFilters.userId) params.userId = searchFilters.userId;
      if (searchFilters.messageType) params.messageType = searchFilters.messageType;
      if (searchFilters.dateFrom) params.dateFrom = searchFilters.dateFrom;
      if (searchFilters.dateTo) params.dateTo = searchFilters.dateTo;
      
      const response = await apiClient.get(`/api/chat/room/${roomId}/search`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setSearchResults(response.data.messages || []);
      
      // Save to search history
      if (searchQuery.trim()) {
        setSearchHistory(prev => {
          const newHistory = [searchQuery.trim(), ...prev.filter(s => s !== searchQuery.trim())].slice(0, 10);
          return newHistory;
        });
      }
    } catch (error) {
      logger.error('Error searching:', error);
    }
  };

  // File upload handlers
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Don't reset file input value here - keep it until upload/cancel
    
    // If it's an image, show caption modal first
    if (file.type && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setImageCaption('');
      setShowCaptionModal(true);
      // Prevent any default behavior
      e.preventDefault();
      e.stopPropagation();
    } else {
      // For non-images, upload directly
      uploadFile(file, '');
    }
  };

  const uploadFile = async (file, caption) => {
    setUploadingFile(true);
    setShowCaptionModal(false);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', file.type.startsWith('image/') ? 'image' : 'file');
    formData.append('content', caption.trim()); // Send caption as content
    
    try {
      const response = await apiClient.post(`/api/chat/room/${roomId}/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      if (socket && response.data.message) {
        // The message will be added via socket event
        setMessages(prev => [...prev, response.data.message]);
        scrollToBottom();
      }
    } catch (error) {
      logger.error('Error uploading file:', error);
      alert('Failed to upload file: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploadingFile(false);
      setSelectedFile(null);
      setImageCaption('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmImageUpload = () => {
    if (selectedFile) {
      uploadFile(selectedFile, imageCaption);
    }
  };

  const handleCancelImageUpload = () => {
    // Cleanup object URL if it was created for preview
    if (selectedFile) {
      try {
        const url = URL.createObjectURL(selectedFile);
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignore errors
      }
    }
    setShowCaptionModal(false);
    setSelectedFile(null);
    setImageCaption('');
    // Reset file input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGetGroupCode = async () => {
    if (!roomId) {
      alert('Invalid room ID');
      return;
    }
    
    setLoadingGroupCode(true);
    try {
      const response = await apiClient.get(`/api/chat/room/${roomId}/group-code`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setRoomGroupCode(response.data.groupCode);
        setRoomInviteLink(response.data.inviteLink);
        setShowShareCodeModal(true);
      } else {
        throw new Error(response.data?.error || 'Failed to get group code');
      }
    } catch (error) {
      logger.error('Error getting group code:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to get group code';
      alert(errorMessage);
    } finally {
      setLoadingGroupCode(false);
    }
  };

  const copyGroupCode = () => {
    if (roomGroupCode) {
      navigator.clipboard.writeText(roomGroupCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const copyInviteLink = () => {
    if (roomInviteLink) {
      navigator.clipboard.writeText(roomInviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) {
      alert('Please enter a group code');
      return;
    }
    
    setJoiningByCode(true);
    try {
      const normalizedCode = joinCode.trim().toUpperCase();
      const response = await apiClient.post(`/api/chat/join-code/${normalizedCode}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        const joinedRoomId = response.data.room?._id || response.data.room;
        
        // If joined a different room, navigate to it
        if (joinedRoomId && joinedRoomId.toString() !== roomId) {
          navigate(`/chat/${joinedRoomId}`);
        } else {
          // If joined the current room, refresh room data
          await fetchRoom();
          setShowJoinCodeModal(false);
          setJoinCode('');
          alert('Successfully joined the chatroom!');
        }
      } else {
        throw new Error(response.data?.error || 'Failed to join chatroom');
      }
    } catch (error) {
      logger.error('Error joining by code:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to join chatroom';
      alert(errorMessage);
    } finally {
      setJoiningByCode(false);
    }
  };

  const handleAddMemberToChatroom = async () => {
    if (!roomId) {
      alert('Invalid room ID');
      return;
    }
    
    if (addMemberBy === 'username' && !memberUsername.trim()) {
      alert('Please enter a username');
      return;
    }
    if (addMemberBy === 'email' && !memberEmail.trim()) {
      alert('Please enter an email');
      return;
    }
    
    setAddingMember(true);
    try {
      const payload = addMemberBy === 'username' 
        ? { username: memberUsername.trim() }
        : { email: memberEmail.trim() };
      
      const response = await apiClient.post(`/api/chat/${roomId}/members/add`, 
        payload,
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );
      
      if (response.data && response.data.success) {
        // Room will be refreshed automatically via socket 'member_added' event
        setShowAddMemberModal(false);
        setMemberUsername('');
        setMemberEmail('');
        setAddMemberBy('username');
      } else {
        throw new Error(response.data?.error || 'Failed to add member');
      }
    } catch (error) {
      logger.error('Error adding member:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to add member';
      alert(errorMessage);
    } finally {
      setAddingMember(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // If it's an image, show caption modal
      if (file.type.startsWith('image/')) {
        setSelectedFile(file);
        setImageCaption('');
        setShowCaptionModal(true);
      } else {
        uploadFile(file, '');
      }
    }
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !socket) return;
    
    // If editing a message, don't send a new message
    if (editingMessage) {
      return;
    }

    // Normalize "Hey Omega" to "@omega" if user types it
    let messageContent = inputMessage.trim();
    const normalizedContent = messageContent.toLowerCase().trim();
    
    // Check if message contains @omega, @dk, or "hey omega" trigger
    let isAIMessage = false;
    let isDKMessage = false;
    let aiPrompt = '';
    
    if (normalizedContent.startsWith('@omega')) {
      isAIMessage = true;
      aiPrompt = messageContent.substring(7).trim();
      // Show typing indicator IMMEDIATELY when @omega is detected
      setIsTyping(true);
    } else if (normalizedContent.startsWith('hey omega')) {
      isAIMessage = true;
      // Replace "Hey Omega" with "@omega" for display, extract prompt
      const promptPart = messageContent.substring(9).trim(); // Remove "hey omega"
      messageContent = '@omega ' + promptPart;
      aiPrompt = promptPart;
      // Show typing indicator IMMEDIATELY when "hey omega" is detected
      setIsTyping(true);
    } else if (normalizedContent.startsWith('@dk') || normalizedContent.startsWith('/dk')) {
      // Only allow @dk command if room has GitHub repository
      const hasGitHubRepo = room?.project?.githubRepo || room?.repository;
      if (!hasGitHubRepo) {
        // Don't process @dk if no repository
        return;
      }
      isDKMessage = true;
      // Trigger DK bot stats
      if (socket) {
        socket.emit('dk_bot_command', { roomId });
        setInputMessage('');
        return;
      }
    }
    
    if (isAIMessage) {
      if (aiPrompt) {
        logger.debug('🚀 Sending AI generation request:', aiPrompt);
        
        // Add optimistic message immediately for better UX
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const optimisticMessage = {
          _id: tempId,
          user: user,
          content: messageContent,
          createdAt: new Date().toISOString(),
          replyTo: replyToMessage || null,
          pending: true
        };
        
        setMessages(prev => [...prev, optimisticMessage]);
        
        // Force scroll for own message
        shouldScrollToBottomRef.current = true;
        setTimeout(() => {
          scrollToBottom(true);
          shouldScrollToBottomRef.current = false;
        }, 50);
        
        // Clear input immediately
        const replyToId = replyToMessage?._id || null;
        setInputMessage('');
        if (replyToMessage) {
          setReplyToMessage(null);
        }
        
        // Send message and trigger AI in parallel (don't wait)
        socket.emit('send_message', {
          roomId,
          content: messageContent,
          replyTo: replyToId
        });
        
        // Trigger AI immediately without waiting
        logger.debug('🚀 Emitting ai_generate_code event:', { roomId, prompt: aiPrompt });
        
        if (!socket || !socket.connected) {
          logger.error('❌ Socket not connected!');
          alert('Not connected to server. Please refresh the page.');
          return;
        }
        
        socket.emit('ai_generate_code', {
          roomId,
          prompt: aiPrompt,
          context: ''
        });
        
        logger.debug('✅ ai_generate_code event emitted');
        
        return;
      } else {
        alert('Please provide a prompt after @omega or "Hey Omega"');
        return;
      }
    }

    // Optimistic UI update - add message immediately
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage = {
      _id: tempId,
      user: user,
      content: messageContent,
      createdAt: new Date().toISOString(),
      replyTo: replyToMessage || null,
      pending: true
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    
    // Force scroll for own messages - always scroll when user sends
    shouldScrollToBottomRef.current = true;
    setTimeout(() => {
      scrollToBottom(true);
      shouldScrollToBottomRef.current = false;
    }, 50);
    
    // Clear input and reply immediately
    const messageToSend = messageContent;
    const replyToId = replyToMessage?._id || null;
    setInputMessage('');
    if (replyToMessage) {
      setReplyToMessage(null);
    }
    
    // Send via socket
    socket.emit('send_message', {
      roomId,
      content: messageToSend,
      replyTo: replyToId
    });
    
    // Remove optimistic message when real message arrives (handled in socket event)
    
    if (replyToMessage) {
      setReplyToMessage(null);
    }

    setInputMessage('');
    socket.emit('typing', { roomId, isTyping: false });
  };

  const handleKeyPress = (e) => {
    // Handle mention dropdown navigation
    if (showMentions) {
      const mentionableUsers = getMentionableUsers();
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < mentionableUsers.length - 1 ? prev + 1 : prev
        );
        return;
      }
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0);
        return;
      }
      
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (mentionableUsers.length > 0 && mentionableUsers[selectedMentionIndex]) {
          handleMentionSelect(mentionableUsers[selectedMentionIndex].username);
        }
        return;
      }
      
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentions(false);
        setSelectedMentionIndex(0);
        return;
      }
    }
    
    // Normal message sending or editing
    if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
      e.preventDefault();
      // If editing a message, save the edit instead of sending new message
      if (editingMessage) {
        if (inputMessage.trim() && inputMessage.trim() !== editingMessage.content) {
          handleEditMessage(editingMessage._id, inputMessage.trim());
          setInputMessage('');
          setEditingMessage(null);
        }
      } else {
        handleSendMessage();
      }
    } else if (socket && !showMentions) {
      socket.emit('typing', { roomId, isTyping: true });
      setTimeout(() => {
        socket.emit('typing', { roomId, isTyping: false });
      }, 2000);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputMessage(value);
    
    // Debounced typing indicator
    if (value.trim() && socket && roomId) {
      handleTyping();
    }
    
    // Check for @ mention trigger
    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if there's a space or newline after @ (if so, don't show mentions)
      if (!textAfterAt.match(/[\s\n]/)) {
        setMentionQuery(textAfterAt);
        setMentionPosition(lastAtIndex);
        setShowMentions(true);
        setSelectedMentionIndex(0); // Reset selection when query changes
      } else {
        setShowMentions(false);
        setSelectedMentionIndex(0);
      }
    } else {
      setShowMentions(false);
      setSelectedMentionIndex(0);
    }
  };

  const handleMentionSelect = (username) => {
    const textBeforeMention = inputMessage.substring(0, mentionPosition);
    const textAfterMention = inputMessage.substring(mentionPosition + 1 + mentionQuery.length);
    const newMessage = `${textBeforeMention}@${username} ${textAfterMention}`;
    setInputMessage(newMessage);
    setShowMentions(false);
    setMentionQuery('');
    setSelectedMentionIndex(0);
    
    // Focus back on textarea
    if (textareaRef.current) {
      setTimeout(() => {
        textareaRef.current.focus();
        const newCursorPos = mentionPosition + username.length + 2; // @ + username + space
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  };

  // Get mentionable users (members + AI + DK Bot)
  const getMentionableUsers = () => {
    const mentionables = [];
    
    // Add Omega AI
    mentionables.push({
      _id: 'omega-ai',
      username: 'omega',
      displayName: 'Omega AI',
      avatar: null,
      isAI: true
    });
    
    // Add DK Bot only if room has a GitHub repository
    const hasGitHubRepo = (room?.project && room.project.githubRepo) || room?.repository;
    if (hasGitHubRepo) {
      mentionables.push({
        _id: 'dk-bot',
        username: 'dk',
        displayName: 'DK',
        avatar: '/avatars/dk-avatar.png',
        isBot: true
      });
    }
    
    // Add room members
    if (room?.members && room.members.length > 0) {
      room.members.forEach(member => {
        const memberData = typeof member === 'object' ? member : { username: 'User', avatar: null };
        const memberId = member._id || member;
        
        // Don't add current user and don't duplicate
        if (memberId !== user?._id && !mentionables.find(m => m._id === memberId)) {
          mentionables.push({
            _id: memberId,
            username: memberData.username || 'User',
            displayName: memberData.username || 'User',
            avatar: memberData.avatar,
            isAI: false
          });
        }
      });
    }
    
    // Filter by query
    if (mentionQuery.trim()) {
      return mentionables.filter(m => 
        m.username.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        m.displayName.toLowerCase().includes(mentionQuery.toLowerCase())
      );
    }
    
    return mentionables;
  };

  const startRecording = async () => {
    try {
      // Check if browser supports Web Speech API
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        alert('Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.');
        return;
      }

      // Show instructions
      setShowMicInstructions(true);
      setTranscribedText('');

      // Initialize speech recognition
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        const fullText = finalTranscript + interimTranscript;
        setTranscribedText(fullText.trim());

        // Check if user said "Hey Omega" or similar
        const textLower = fullText.toLowerCase().trim();
        if (textLower.includes('hey omega') || textLower.includes('hey omega ai') || textLower.startsWith('omega')) {
          // Replace "Hey Omega" with "@omega" and set as input
          const cleanedText = fullText.replace(/hey omega/gi, '@omega').replace(/hey omega ai/gi, '@omega').trim();
          setInputMessage(cleanedText);
          recognition.stop();
          setIsRecording(false);
          setShowMicInstructions(false);
          setTranscribedText('');
          
          // Auto-trigger AI if it's just "@omega" or starts with it
          if (cleanedText.startsWith('@omega')) {
            setTimeout(() => {
              handleSendMessage();
            }, 100);
          }
          return;
        }
      };

      recognition.onerror = (event) => {
        logger.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          // User didn't speak, that's okay
        } else {
          alert(`Speech recognition error: ${event.error}`);
        }
        setIsRecording(false);
        setShowMicInstructions(false);
        setTranscribedText('');
      };

      recognition.onend = () => {
        setIsRecording(false);
        if (transcribedText && !transcribedText.toLowerCase().includes('hey omega')) {
          // If we have transcribed text and it's not "Hey Omega", use it
          setInputMessage(prev => prev + (prev ? ' ' : '') + transcribedText);
        }
        setShowMicInstructions(false);
        setTranscribedText('');
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } catch (error) {
      logger.error('Error starting speech recognition:', error);
      alert('Failed to access microphone. Please check your permissions.');
      setIsRecording(false);
      setShowMicInstructions(false);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      setShowMicInstructions(false);
      
      // Use transcribed text if available
      if (transcribedText && !transcribedText.toLowerCase().includes('hey omega')) {
        setInputMessage(prev => prev + (prev ? ' ' : '') + transcribedText);
      }
      setTranscribedText('');
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm('Are you sure you want to clear all messages in this chat? This action cannot be undone.')) {
      return;
    }
    
    try {
      await apiClient.delete(`/api/chat/room/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Clear messages from state
      setMessages([]);
      scrollToBottom();
    } catch (error) {
      logger.error('Error clearing chat:', error);
      alert('Failed to clear chat: ' + (error.response?.data?.error || error.message));
    }
  };

  // Render markdown text (bold, italic, code, links)
  // Memoize markdown rendering to avoid re-creating on every render
  const renderMarkdown = useCallback((text) => {
    if (!text || typeof text !== 'string') return text || null;
    
    const result = [];
    let keyCounter = 0;
    let remaining = text;
    
    // Process markdown patterns in order of precedence
    while (remaining.length > 0) {
      let matched = false;
      let earliestMatch = null;
      let earliestIndex = Infinity;
      
      // Check for bold **text** (highest priority)
      const boldMatch = remaining.match(/\*\*([^*\n]+?)\*\*/);
      if (boldMatch && boldMatch.index < earliestIndex) {
        earliestMatch = { type: 'bold', content: boldMatch[1], index: boldMatch.index, length: boldMatch[0].length };
        earliestIndex = boldMatch.index;
        matched = true;
      }
      
      // Check for inline code `code`
      const codeMatch = remaining.match(/`([^`\n]+?)`/);
      if (codeMatch && codeMatch.index < earliestIndex) {
        earliestMatch = { type: 'code', content: codeMatch[1], index: codeMatch.index, length: codeMatch[0].length };
        earliestIndex = codeMatch.index;
        matched = true;
      }
      
      // Check for links [text](url)
      const linkMatch = remaining.match(/\[([^\]]+?)\]\(([^)]+?)\)/);
      if (linkMatch && linkMatch.index < earliestIndex) {
        earliestMatch = { type: 'link', text: linkMatch[1], url: linkMatch[2], index: linkMatch.index, length: linkMatch[0].length };
        earliestIndex = linkMatch.index;
        matched = true;
      }
      
      // Check for italic *text* (lowest priority, must not be part of **)
      const italicMatch = remaining.match(/(?<!\*)\*([^*\n]+?)\*(?!\*)/);
      if (italicMatch && italicMatch.index < earliestIndex) {
        earliestMatch = { type: 'italic', content: italicMatch[1], index: italicMatch.index, length: italicMatch[0].length };
        earliestIndex = italicMatch.index;
        matched = true;
      }
      
      if (matched && earliestMatch) {
        // Add text before match
        if (earliestMatch.index > 0) {
          result.push(remaining.substring(0, earliestMatch.index));
        }
        
        // Add formatted element
        const key = `md-${keyCounter++}`;
        switch (earliestMatch.type) {
          case 'bold':
            result.push(<strong key={key} className="font-bold text-gray-900">{earliestMatch.content}</strong>);
            break;
          case 'italic':
            result.push(<em key={key} className="italic">{earliestMatch.content}</em>);
            break;
          case 'code':
            result.push(
              <code key={key} className="bg-gray-200 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800">
                {earliestMatch.content}
              </code>
            );
            break;
          case 'link':
            result.push(
              <a 
                key={key}
                href={earliestMatch.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium"
              >
                {earliestMatch.text}
              </a>
            );
            break;
        }
        
        // Update remaining text
        remaining = remaining.substring(earliestMatch.index + earliestMatch.length);
      } else {
        // No more matches, add remaining text
        result.push(remaining);
        break;
      }
    }
    
    return result.length > 0 ? result : text;
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading chat room...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to Load Chat Room</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                fetchRoom();
                fetchMessages(0, false, true);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show error if roomId is missing
  if (!roomId) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <div className="text-red-600 text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Room</h2>
          <p className="text-gray-600 mb-4">No room ID provided. Please select a chat room from the dashboard.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-green-100">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </button>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">
                {room?.name || 'Chat Room'}
              </h2>
              {room?.project && (
                <p className="text-sm text-gray-500 mt-1">{room.project.name}</p>
              )}
              {!room?.project && !room?.repository && (
                <p className="text-sm text-gray-500 mt-1">Personal chatroom - no repository linked</p>
              )}
              {room?.project && !room.project.githubRepo && !room?.repository && (
                <p className="text-sm text-yellow-600 mt-1">⚠️ Project has no GitHub repository linked</p>
              )}
              {((room?.project && room.project.githubRepo) || room?.repository) && (
                <p className="text-sm text-green-600 mt-1">
                  ✓ Repository: {room.project?.githubRepo?.fullName || room.repository}
                </p>
              )}
            </div>
            <button
              onClick={handleClearChat}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Clear chat"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Users size={16} />
              Members ({room?.members && room.members.length > 0 ? room.members.length : 0})
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleGetGroupCode}
                disabled={loadingGroupCode}
                className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                title="Share group code"
              >
                {loadingGroupCode ? (
                  <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Copy size={16} />
                )}
              </button>
              <button
                onClick={() => {
                  setShowJoinCodeModal(true);
                  setJoinCode('');
                }}
                className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                title="Join another chatroom via code"
              >
                <UserPlus size={16} />
              </button>
              <button
                onClick={() => {
                  setShowAddMemberModal(true);
                  setMemberUsername('');
                  setMemberEmail('');
                  setAddMemberBy('username');
                }}
                className="p-1.5 text-primary-600 hover:bg-primary-50 rounded transition-colors"
                title="Add member"
              >
                <Users size={16} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {room?.members && room.members.length > 0 ? (
              room.members.map((member) => {
                const memberId = member._id || member;
                const memberData = typeof member === 'object' ? member : { username: 'User', avatar: null };
                return (
                  <div key={memberId} className="flex items-center gap-2">
                    <img
                      src={memberData.avatar || `https://ui-avatars.com/api/?name=${memberData.username}`}
                      alt={memberData.username}
                      className="w-8 h-8 rounded-full"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900">{memberData.username}</div>
                        <div className={`w-2 h-2 rounded-full ${memberData.online ? 'bg-green-500' : 'bg-gray-400'}`} title={memberData.online ? 'Online' : 'Offline'} />
                      </div>
                      {memberData.online ? (
                        <div className="text-xs text-green-500">Online</div>
                      ) : memberData.lastSeen ? (
                        <div className="text-xs text-gray-400">
                          Last seen {new Date(memberData.lastSeen).toLocaleTimeString()}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">Offline</div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-gray-500">No members found</div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white shadow-lg">
        {/* Pinned Messages Bar */}
        {pinnedMessages.length > 0 && (
          <div className="bg-yellow-50 border-b border-yellow-200 p-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-yellow-800">
                <Pin size={16} className="fill-yellow-600" />
                <span className="font-medium">{pinnedMessages.length} Pinned Message{pinnedMessages.length !== 1 ? 's' : ''}</span>
              </div>
              <button
                onClick={() => {
                  // Scroll to first pinned message
                  const firstPinned = messages.find(m => pinnedMessages.includes(m._id));
                  if (firstPinned) {
                    document.getElementById(`message-${firstPinned._id}`)?.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="text-xs text-yellow-700 hover:text-yellow-900"
              >
                Jump to pinned
              </button>
            </div>
          </div>
        )}

        {/* Search Bar */}
        {showSearch && (
          <div className="bg-white border-b border-gray-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Search size={18} className="text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search messages..."
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                list="search-history"
              />
              <datalist id="search-history">
                {searchHistory.map((term, idx) => (
                  <option key={idx} value={term} />
                ))}
              </datalist>
              <button
                onClick={handleSearch}
                className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Search
              </button>
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchFilters({ userId: '', messageType: '', dateFrom: '', dateTo: '' });
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Search Filters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <select
                value={searchFilters.messageType}
                onChange={(e) => setSearchFilters({ ...searchFilters, messageType: e.target.value })}
                className="px-2 py-1 border border-gray-300 rounded"
              >
                <option value="">All Types</option>
                <option value="text">Text</option>
                <option value="ai_code">AI Code</option>
                <option value="image">Image</option>
                <option value="file">File</option>
                <option value="voice">Voice</option>
              </select>
              
              <select
                value={searchFilters.userId}
                onChange={(e) => setSearchFilters({ ...searchFilters, userId: e.target.value })}
                className="px-2 py-1 border border-gray-300 rounded"
              >
                <option value="">All Users</option>
                {room?.members?.map(member => (
                  <option key={member._id || member} value={member._id || member}>
                    {typeof member === 'object' ? member.username : 'User'}
                  </option>
                ))}
              </select>
              
              <input
                type="date"
                value={searchFilters.dateFrom}
                onChange={(e) => setSearchFilters({ ...searchFilters, dateFrom: e.target.value })}
                placeholder="From"
                className="px-2 py-1 border border-gray-300 rounded"
              />
              
              <input
                type="date"
                value={searchFilters.dateTo}
                onChange={(e) => setSearchFilters({ ...searchFilters, dateTo: e.target.value })}
                placeholder="To"
                className="px-2 py-1 border border-gray-300 rounded"
              />
            </div>
            
            {searchResults.length > 0 && (
              <div className="mt-2 text-sm text-gray-600">
                Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-white"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onScroll={(e) => {
            const container = e.target;
            const currentScrollTop = container.scrollTop;
            
            // Throttle scroll handler - only run every 150ms (reduced frequency for better performance)
            if (scrollThrottleRef.current) {
              clearTimeout(scrollThrottleRef.current);
            }
            
            scrollThrottleRef.current = setTimeout(() => {
              // Infinite scroll - load more when near top
              if (currentScrollTop < 100 && hasMoreMessages && !loadingMore) {
                loadMoreMessages();
              }
              
              // Only check read status if scroll position changed significantly (more than 100px)
              const scrollDelta = Math.abs(currentScrollTop - lastScrollTopRef.current);
              if (scrollDelta > 100) {
                lastScrollTopRef.current = currentScrollTop;
                
                // Throttle read detection - only check every 1000ms (less frequent for better performance)
                if (readDetectionThrottleRef.current) {
                  clearTimeout(readDetectionThrottleRef.current);
                }
                
                readDetectionThrottleRef.current = setTimeout(() => {
                  // Use Intersection Observer for better performance
                  if (!intersectionObserverRef.current && user) {
                    intersectionObserverRef.current = new IntersectionObserver(
                      (entries) => {
                        entries.forEach(entry => {
                          if (entry.isIntersecting) {
                            const messageId = entry.target.getAttribute('data-message-id');
                            if (messageId) {
                              const message = messages.find(m => m._id === messageId);
                              if (message) {
                                const msgUserId = message.user?._id || message.user;
                                const isMsgOwn = user && (msgUserId?.toString() === user._id?.toString());
                                if (!isMsgOwn && !message.readBy?.some(r => (r.user?._id || r.user).toString() === user?._id?.toString())) {
                                  handleMarkAsRead(messageId);
                                }
                              }
                            }
                          }
                        });
                      },
                      { root: container, rootMargin: '0px', threshold: 0.3 }
                    );
                  }
                  
                  // Observe all message elements (only if observer exists)
                  if (intersectionObserverRef.current) {
                    messages.forEach(msg => {
                      const element = document.getElementById(`message-${msg._id}`);
                      if (element) {
                        element.setAttribute('data-message-id', msg._id);
                        intersectionObserverRef.current.observe(element);
                      }
                    });
                  }
                }, 1000);
              }
            }, 200); // Increased throttle from 150ms to 200ms for better performance
          }}
        >
          {/* Search Results */}
          {showSearch && searchResults.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">Search Results</span>
                <button
                  onClick={() => {
                    setShowSearch(false);
                    setSearchResults([]);
                    setSearchQuery('');
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map((result) => (
                  <div
                    key={result._id}
                    onClick={() => {
                      // Scroll to message
                      document.getElementById(`message-${result._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setShowSearch(false);
                    }}
                    className="p-2 bg-white rounded cursor-pointer hover:bg-blue-100 transition-colors"
                  >
                    <div className="text-xs text-gray-500">{result.user?.username || 'Unknown'} • {new Date(result.createdAt).toLocaleString()}</div>
                    <div className="text-sm text-gray-900 mt-1 line-clamp-2">{result.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingMore && (
            <div className="flex justify-center py-4">
              <div className="text-sm text-gray-500 animate-pulse">Loading older messages...</div>
            </div>
          )}
          {messagesWithMetadata.map((message) => {
            // Use pre-computed metadata
            const { messageUserId, isAIMessage, isDKMessage, isOwnMessage, messageUser } = message._metadata;
            
            return (
            <div
              key={message._id || message.createdAt}
              id={`message-${message._id}`}
              className={`flex gap-3 ${
                isOwnMessage
                  ? 'justify-end'
                  : 'justify-start'
              }`}
            >
              {!isOwnMessage && (
                <div className="flex-shrink-0">
                  {isAIMessage ? (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                      <Bot size={20} className="text-white" />
                    </div>
                  ) : isDKMessage ? (
                    <img
                      src={messageUser.avatar || '/avatars/dk-avatar.png'}
                      alt="DK Bot"
                      className="w-10 h-10 rounded-full object-cover border-2 border-green-200"
                    />
                  ) : (
                    <img
                      src={
                        messageUser.avatar ||
                        `https://ui-avatars.com/api/?name=${messageUser.username || 'User'}`
                      }
                      alt={messageUser.username}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                </div>
              )}
              <div
                className={`max-w-2xl rounded-lg p-4 group relative ${
                  isAIMessage
                    ? 'bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 text-gray-900'
                    : isDKMessage
                    ? 'bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 text-gray-900'
                    : isOwnMessage
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-900 border border-gray-200'
                } ${message.deleted ? 'opacity-60' : ''} ${message.reactions && message.reactions.length > 0 ? 'pb-3' : ''}`}
                onMouseEnter={() => {
                  if (!showEmojiPicker) {
                    setShowMessageMenu(message._id);
                  }
                }}
                onMouseLeave={() => {
                  // Keep menu visible if emoji picker is open
                  if (!showEmojiPicker || showEmojiPicker !== message._id) {
                    setShowMessageMenu(null);
                  }
                }}
              >
                {/* Message Action Menu */}
                {showMessageMenu === message._id && !message.deleted && showEmojiPicker !== message._id && (
                  <div className={`absolute ${isOwnMessage ? 'left-0 -translate-x-full mr-2' : 'right-0 translate-x-full ml-2'} top-0 flex gap-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 z-20`}>
                    {isOwnMessage && (
                      <>
                    <button
                      onClick={() => {
                        setEditingMessage(message);
                        setInputMessage(message.content);
                        setReplyToMessage(null);
                        textareaRef.current?.focus();
                      }}
                      className="p-2 hover:bg-gray-100 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={16} className="text-gray-600" />
                    </button>
                        <button
                          onClick={() => handleDeleteMessage(message._id)}
                          className="p-2 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <X size={16} className="text-red-600" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setReplyToMessage(message)}
                      className="p-2 hover:bg-gray-100 rounded transition-colors"
                      title="Reply"
                    >
                      <Reply size={16} className="text-gray-600" />
                    </button>
                    <button
                      onClick={() => handleTogglePin(message._id)}
                      className={`p-2 hover:bg-gray-100 rounded transition-colors ${pinnedMessages.includes(message._id) ? 'bg-yellow-50' : ''}`}
                      title="Pin"
                    >
                      <Pin size={16} className={pinnedMessages.includes(message._id) ? 'text-yellow-600 fill-yellow-600' : 'text-gray-600'} />
                    </button>
                    <button
                      onClick={() => handleCopyMessageLink(message._id)}
                      className="p-2 hover:bg-gray-100 rounded transition-colors"
                      title="Copy link"
                    >
                      <Copy size={16} className="text-gray-600" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowEmojiPicker(showEmojiPicker === message._id ? null : message._id);
                        // Keep menu open when opening emoji picker
                        if (showEmojiPicker !== message._id) {
                          setShowMessageMenu(message._id);
                        }
                      }}
                      className="p-2 hover:bg-gray-100 rounded transition-colors"
                      title="Add reaction"
                    >
                      <Smile size={16} className="text-gray-600" />
                    </button>
                  </div>
                )}
                
                {/* Emoji Picker */}
                {showEmojiPicker === message._id && (
                  <div className={`emoji-picker-container absolute ${isOwnMessage ? 'right-full mr-2' : 'left-full ml-2'} top-0 bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-30 min-w-[220px]`}>
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Reaction</span>
                      <button
                        onClick={() => setShowEmojiPicker(null)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        <X size={14} className="text-gray-500" />
                      </button>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      {[
                        { emoji: '👍', label: 'Like' },
                        { emoji: '❤️', label: 'Love' },
                        { emoji: '😄', label: 'Happy' },
                        { emoji: '✅', label: 'Agree' },
                        { emoji: '👏', label: 'Clap' }
                      ].map(({ emoji, label }) => (
                        <button
                          key={emoji}
                          onClick={() => handleToggleReaction(message._id, emoji)}
                          className="flex flex-col items-center justify-center p-2.5 hover:bg-gray-50 rounded-lg transition-all hover:scale-110 active:scale-95 group min-w-[60px]"
                          title={label}
                        >
                          <span className="text-2xl mb-0.5 leading-none">{emoji}</span>
                          <span className="text-[10px] text-gray-500 group-hover:text-gray-700 font-medium">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Reply indicator */}
                {message.replyTo && (
                  <div 
                    className="mb-2 pb-2 border-l-2 border-primary-400 pl-2 text-xs cursor-pointer hover:bg-gray-100 rounded pr-2"
                    onClick={() => {
                      // Scroll to original message
                      const originalMsg = messages.find(m => m._id === message.replyTo._id);
                      if (originalMsg) {
                        document.getElementById(`message-${originalMsg._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                  >
                    <div className="flex items-center gap-1 text-primary-600 font-medium">
                      <Reply size={12} />
                      <span>Replying to {message.replyTo.user?.username || 'message'}</span>
                    </div>
                    <div className="text-gray-600 mt-0.5 line-clamp-1">{message.replyTo.content}</div>
                  </div>
                )}
                
                {/* Pinned indicator */}
                {pinnedMessages.includes(message._id) && (
                  <div className="mb-2 flex items-center gap-1 text-xs text-yellow-600">
                    <Pin size={12} className="fill-yellow-600" />
                    <span>Pinned</span>
                  </div>
                )}
                {!isOwnMessage && (
                  <div className={`text-xs font-semibold mb-2 flex items-center gap-2 ${
                    isAIMessage ? 'text-green-700' : isDKMessage ? 'text-green-700' : 'text-gray-700'
                  }`}>
                    {isAIMessage && <Bot size={14} />}
                    {isDKMessage && <span className="font-bold">DK</span>}
                    {isAIMessage ? 'Omega AI' : isDKMessage ? 'DK' : messageUser.username}
                  </div>
                )}
                
                {message.error ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium mb-2 text-red-500">❌ Error</div>
                    <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      {message.error}
                    </div>
                  </div>
                ) : message.type === 'dk_bot' ? (
                  <div className="space-y-3">
                    <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      <div className="prose prose-sm max-w-none">
                        {renderMarkdown(message.content)}
                      </div>
                    </div>
                  </div>
                ) : message.type === 'ai_code' && message.aiResponse ? (
                  <div className="space-y-3">
                    {/* Show explanation first if it exists */}
                    {message.aiResponse.explanation && (
                      <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                        <div className="prose prose-sm max-w-none">
                          {renderMarkdown(message.aiResponse.explanation)}
                        </div>
                      </div>
                    )}
                    {/* Only show code block if there's actual code (more than just whitespace/newlines) */}
                    {message.aiResponse.code && message.aiResponse.code.trim().length > 0 && (
                      <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto border border-gray-700 shadow-lg">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                          <span className="text-xs text-gray-400 font-mono uppercase tracking-wide font-bold">
                            {message.aiResponse.language || 'code'}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                navigator.clipboard.writeText(message.aiResponse.code);
                                // Better feedback
                                const btn = e.target;
                                const originalText = btn.textContent;
                                btn.textContent = '✓ Copied!';
                                btn.classList.add('text-green-400');
                                setTimeout(() => {
                                  btn.textContent = originalText;
                                  btn.classList.remove('text-green-400');
                                }, 2000);
                              }}
                              className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800 font-medium"
                            >
                              Copy
                            </button>
                            {((room?.project && room.project.githubRepo) || room?.repository) && (
                              <button
                                onClick={() => {
                                  setShowCommitModal(message._id);
                                  setCommitFilePath('');
                                  setCommitMessage(`Add ${message.aiResponse.language || 'code'} generated by Omega AI`);
                                  setFileExists(false);
                                  setCommitError(null);
                                  setCommitSuccess(false);
                                }}
                                className="text-xs text-green-400 hover:text-green-300 transition-colors px-2 py-1 rounded hover:bg-gray-800 font-medium flex items-center gap-1"
                                title="Add to Repository"
                              >
                                <GitBranch size={12} />
                                Add to Repo
                              </button>
                            )}
                          </div>
                        </div>
                        <pre className="text-sm text-gray-100 font-mono leading-relaxed">
                          <code className="whitespace-pre font-mono block" style={{ fontWeight: 400, fontFamily: "'Courier New', Courier, monospace" }}>{message.aiResponse.code}</code>
                        </pre>
                      </div>
                    )}
                    {/* If no code and no explanation, show the content */}
                    {!message.aiResponse.code && !message.aiResponse.explanation && message.content && (
                      <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                        <div className="prose prose-sm max-w-none">
                          {renderMarkdown(message.content.split(/(@\w+)/g).map((part, idx) => {
                            if (part.startsWith('@')) {
                              return <span key={idx} className="font-bold text-green-600 bg-green-50 px-1 rounded">{part}</span>;
                            }
                            return part;
                          }).join(''))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : message.type === 'image' && message.attachments && message.attachments.length > 0 ? (
                  <div className="space-y-2">
                    {message.attachments.map((attachment, idx) => (
                      <div key={idx} className="space-y-2">
                        <img
                          src={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${attachment.url}`}
                          alt={attachment.filename || 'Image'}
                          className="max-w-xs md:max-w-sm rounded-lg cursor-pointer hover:opacity-90 transition-opacity object-contain shadow-sm"
                          style={{ maxHeight: '300px' }}
                          onClick={() => window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${attachment.url}`, '_blank')}
                        />
                        {/* Show caption if it exists and is not the default message */}
                        {message.content && 
                         message.content.trim() && 
                         message.content !== `Sent an image: ${attachment.filename}` && 
                         !message.content.startsWith('Sent an image:') && (
                          <div className={`text-sm leading-relaxed ${isOwnMessage ? 'text-white' : 'text-gray-900'}`}>
                            {renderMarkdown(message.content)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : message.type === 'file' && message.attachments && message.attachments.length > 0 ? (
                  <div className="space-y-2">
                    {message.attachments.map((attachment, idx) => (
                      <a
                        key={idx}
                        href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${attachment.url}`}
                        download={attachment.filename}
                        className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <Paperclip size={20} className="text-gray-600" />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{attachment.filename}</div>
                          <div className="text-xs text-gray-500">
                            {attachment.size ? `${(attachment.size / 1024).toFixed(1)} KB` : 'Unknown size'}
                          </div>
                        </div>
                      </a>
                    ))}
                    {message.content && (
                      <div className={`text-sm ${isOwnMessage ? 'text-white' : 'text-gray-900'}`}>
                        {renderMarkdown(message.content)}
                      </div>
                    )}
                  </div>
                ) : message.type === 'voice' ? (
                  <div className="flex items-center gap-2">
                    <audio controls src={message.voiceUrl} className="w-full">
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                ) : (
                  <div className={`whitespace-pre-wrap text-sm leading-relaxed font-medium ${isAIMessage ? 'text-gray-800' : isOwnMessage ? 'text-white' : 'text-gray-900'}`}>
                    {message.content.split(/(@\w+)/g).map((part, idx) => {
                      if (part.startsWith('@')) {
                        return (
                          <span key={idx} className={`font-bold px-1 rounded ${isOwnMessage ? 'text-primary-200 bg-primary-800' : 'text-primary-600 bg-primary-50'}`}>
                            {part}
                          </span>
                        );
                      }
                      return <span key={idx}>{renderMarkdown(part)}</span>;
                    })}
                  </div>
                )}
                
                {/* Reactions */}
                {message.reactions && message.reactions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-gray-200">
                    {message.reactions.map((reaction, idx) => {
                      const hasReacted = reaction.users?.some(u => (u._id || u).toString() === user?._id?.toString());
                      const userCount = reaction.users?.length || 0;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleToggleReaction(message._id, reaction.emoji)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border-2 transition-all hover:scale-105 active:scale-95 ${
                            hasReacted
                              ? 'bg-primary-50 border-primary-300 text-primary-700 shadow-sm'
                              : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-base leading-none">{reaction.emoji}</span>
                          <span className={`font-medium ${hasReacted ? 'text-primary-700' : 'text-gray-600'}`}>
                            {userCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Message footer */}
                <div className="flex items-center justify-between mt-2">
                  <div className={`text-xs ${
                    isAIMessage 
                      ? 'text-green-600 opacity-70' 
                      : isOwnMessage 
                      ? 'opacity-70' 
                      : 'text-gray-500'
                  }`}>
                    {message.edited && (
                      <span className="mr-2">(edited)</span>
                    )}
                    {formatRelativeTime(message.createdAt)}
                  </div>
                  
                  {/* Read receipts */}
                  {isOwnMessage && message.readBy && message.readBy.length > 0 && (
                    <div className="flex items-center gap-1 text-xs opacity-70" title={`Read by ${message.readBy.length} member${message.readBy.length !== 1 ? 's' : ''}`}>
                      {message.readBy.length >= room?.members?.length ? (
                        <CheckCheck size={12} className="text-blue-500" />
                      ) : (
                        <Check size={12} />
                      )}
                      <span>{message.readBy.length}</span>
                    </div>
                  )}
                </div>
              </div>
              {isOwnMessage && user && (
                <img
                  src={user.avatar || `https://ui-avatars.com/api/?name=${user.username}`}
                  alt={user.username}
                  className="w-10 h-10 rounded-full flex-shrink-0"
                />
              )}
            </div>
            );
          })}
          
          {isTyping && (
            <div className="flex gap-3 justify-start">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                <Bot size={20} className="text-white" />
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot size={14} className="text-green-700" />
                  <span className="text-xs font-semibold text-green-700">Omega AI</span>
                </div>
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <div className="text-xs text-green-600 mt-2">Thinking...</div>
              </div>
            </div>
          )}
          
          {typingUsers.size > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-500 italic">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span>
                {Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
              </span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white p-4 shadow-sm">
          {/* Reply Preview */}
          {replyToMessage && (
            <div className="mb-2 p-2 bg-gray-50 border-l-2 border-primary-600 rounded flex items-start justify-between">
              <div className="flex-1">
                <div className="text-xs text-gray-500 mb-1">Replying to {replyToMessage.user?.username || 'message'}</div>
                <div className="text-sm text-gray-700 line-clamp-1">{replyToMessage.content?.substring(0, 50)}...</div>
              </div>
              <button
                onClick={() => setReplyToMessage(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Edit Preview */}
          {editingMessage && (
            <div className="mb-2 p-2 bg-blue-50 border-l-2 border-blue-600 rounded flex items-start justify-between">
              <div className="flex-1">
                <div className="text-xs text-blue-600 mb-1 font-medium">Editing message</div>
                <div className="text-sm text-gray-700 line-clamp-1">{editingMessage.content?.substring(0, 50)}...</div>
              </div>
              <button
                onClick={() => setEditingMessage(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Image Caption Modal */}
          {showCaptionModal && selectedFile && (
            <div className="mb-2 p-4 bg-gradient-to-br from-primary-50 to-blue-50 border-2 border-primary-500 rounded-lg shadow-lg">
              <div className="flex items-start gap-3 mb-3">
                <img
                  src={URL.createObjectURL(selectedFile)}
                  alt="Preview"
                  className="w-24 h-24 object-cover rounded-lg border-2 border-primary-200 shadow-sm"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <ImageIcon size={16} className="text-primary-600" />
                    <div className="text-sm font-semibold text-gray-900">Add a caption</div>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{selectedFile.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  onClick={handleCancelImageUpload}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <textarea
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
                placeholder="Add a caption to your image (optional)..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none text-sm"
                rows={2}
                autoFocus
                maxLength={500}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !uploadingFile) {
                    e.preventDefault();
                    handleConfirmImageUpload();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelImageUpload();
                  }
                }}
              />
              {imageCaption.length > 450 && (
                <div className="text-xs text-gray-400 mt-1 text-right">
                  {imageCaption.length}/500
                </div>
              )}
              <div className="flex items-center justify-end gap-2 mt-3">
                <button
                  onClick={handleCancelImageUpload}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImageUpload}
                  disabled={uploadingFile}
                  className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {uploadingFile ? 'Uploading...' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {/* Mic Instructions */}
          {showMicInstructions && (
            <div className="mb-2 p-3 bg-gradient-to-r from-green-50 to-emerald-50 border-l-2 border-green-500 rounded-lg flex items-start justify-between animate-pulse">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Mic size={16} className="text-green-600" />
                  <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Listening...</span>
                </div>
                <div className="text-sm text-gray-700 mb-1">
                  💡 Say <strong>"Hey Omega"</strong> for AI assistance, or speak your message normally
                </div>
                {transcribedText && (
                  <div className="text-xs text-gray-600 italic mt-1">
                    "{transcribedText}"
                  </div>
                )}
              </div>
              <button
                onClick={stopRecording}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent relative">
              {/* File Upload Input */}
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => {
                  handleFileSelect(e);
                }}
                onClick={(e) => {
                  // Reset value on click so same file can be selected again
                  e.target.value = '';
                }}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt,.zip,.js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.go,.rs,.rb,.php,.swift,.kt,.dart,.vue,.svelte"
              />
              
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyPress}
                placeholder={editingMessage ? "Edit your message..." : replyToMessage ? "Reply to message..." : "Type a message... Use @ to mention, @omega for AI, or @dk for GitHub stats"}
                className="w-full px-4 py-2 rounded-lg resize-none focus:outline-none"
                rows={1}
                style={{ maxHeight: '120px' }}
              />
              
              {/* Mention Dropdown */}
              {showMentions && (
                <div className="mention-dropdown absolute bottom-full left-0 mb-2 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto z-50">
                  {getMentionableUsers().length > 0 ? (
                    getMentionableUsers().map((mentionable, idx) => (
                      <button
                        key={mentionable._id}
                        onClick={() => handleMentionSelect(mentionable.username)}
                        className={`w-full flex items-center gap-2 px-3 py-2 transition-colors text-left ${
                          idx === selectedMentionIndex 
                            ? 'bg-primary-100 border-l-2 border-primary-600' 
                            : 'hover:bg-gray-100'
                        }`}
                        ref={(el) => {
                          // Auto-scroll to selected item
                          if (el && idx === selectedMentionIndex) {
                            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                      >
                        {mentionable.isAI ? (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                            <Bot size={16} className="text-white" />
                          </div>
                        ) : mentionable.isBot ? (
                          <img
                            src={mentionable.avatar || '/avatars/dk-avatar.png'}
                            alt="DK Bot"
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0 border-2 border-green-200"
                          />
                        ) : (
                          <img
                            src={mentionable.avatar || `https://ui-avatars.com/api/?name=${mentionable.username}`}
                            alt={mentionable.username}
                            className="w-8 h-8 rounded-full flex-shrink-0"
                          />
                        )}
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900">
                            {mentionable.displayName}
                            {mentionable.isAI && <span className="ml-2 text-xs text-green-600">(AI)</span>}
                            {mentionable.isBot && <span className="ml-2 text-xs text-green-600">(Bot)</span>}
                          </div>
                          <div className="text-xs text-gray-500">@{mentionable.username}</div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">No matches found</div>
                  )}
                </div>
              )}
              <div className="px-2 pb-2 text-xs text-gray-500 space-y-1">
                <div className="flex items-center gap-1">
                  <Bot size={12} className="text-green-600" />
                  <span>Tip: Type <code className="bg-gray-100 px-1 rounded font-mono">@omega</code> for AI code generation</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users size={12} className="text-blue-600" />
                  <span>Type <code className="bg-gray-100 px-1 rounded font-mono">@</code> to mention members</span>
                </div>
                {(room?.project?.githubRepo || room?.repository) && (
                  <div className="text-green-600 font-medium flex items-center gap-1 mt-1">
                  <Bot size={12} />
                  <span>Omega AI has access to your repository and can answer questions about your codebase!</span>
                </div>
              )}
              {(room?.project?.githubRepo || room?.repository) ? (
                <div className="flex items-center gap-2 text-xs text-gray-600 bg-green-50 p-2 rounded border border-green-200">
                  <span className="font-bold text-green-700">DK</span>
                  <span>Type <code className="bg-green-100 px-1 rounded font-mono">@dk</code> or <code className="bg-green-100 px-1 rounded font-mono">/DK</code> to get GitHub repository stats and notifications!</span>
                </div>
              ) : null}
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className={`p-3 rounded-lg transition-colors ${
                  showSearch 
                    ? 'bg-primary-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title="Search"
              >
                <Search size={20} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="p-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                title="Upload file"
              >
                {uploadingFile ? (
                  <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Paperclip size={20} />
                )}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                className="p-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
                title="Upload image"
              >
                <ImageIcon size={20} />
              </button>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`p-3 rounded-lg transition-colors relative ${
                  isRecording
                    ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                title={isRecording ? "Stop recording" : "Voice message (Say 'Hey Omega' for AI)"}
              >
                <Mic size={20} />
                {isRecording && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                )}
              </button>
              {editingMessage ? (
                <>
                  <button
                    onClick={() => {
                      setEditingMessage(null);
                      setInputMessage('');
                    }}
                    className="p-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    title="Cancel"
                  >
                    <X size={20} />
                  </button>
                  <button
                    onClick={() => {
                      if (inputMessage.trim() && inputMessage.trim() !== editingMessage.content) {
                        handleEditMessage(editingMessage._id, inputMessage.trim());
                        setInputMessage('');
                        setEditingMessage(null);
                      }
                    }}
                    disabled={!inputMessage.trim() || inputMessage.trim() === editingMessage.content}
                    className="p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    title="Save edit"
                  >
                    <Check size={20} />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim()}
                  className="p-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Share Group Code Modal */}
      {showShareCodeModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowShareCodeModal(false);
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Share Chatroom</h3>
                <p className="text-sm text-gray-500 mt-1">Share this code or link to invite others</p>
              </div>
              <button
                onClick={() => setShowShareCodeModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Group Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Group Code
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={roomGroupCode || ''}
                    readOnly
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-lg font-bold text-center"
                  />
                  <button
                    onClick={copyGroupCode}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                    title="Copy code"
                  >
                    {codeCopied ? (
                      <>
                        <Check size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Invite Link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Invite Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={roomInviteLink || ''}
                    readOnly
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                  />
                  <button
                    onClick={copyInviteLink}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                    title="Copy link"
                  >
                    {linkCopied ? (
                      <>
                        <Check size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>How to use:</strong> Share the group code or invite link with others. They can use it to join this chatroom.
                </p>
              </div>
            </div>
            
            <div className="mt-6">
              <button
                onClick={() => setShowShareCodeModal(false)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join via Code Modal */}
      {showJoinCodeModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowJoinCodeModal(false);
              setJoinCode('');
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Join via Code</h3>
                <p className="text-sm text-gray-500 mt-1">Enter a group code to join a chatroom</p>
              </div>
              <button
                onClick={() => {
                  setShowJoinCodeModal(false);
                  setJoinCode('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={joiningByCode}
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Group Code
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-character code..."
                  maxLength={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && joinCode.trim() && !joiningByCode) {
                      handleJoinByCode();
                    }
                  }}
                  autoFocus
                  disabled={joiningByCode}
                />
                <p className="text-xs text-gray-500 mt-1">Enter the 6-character group code shared by the chatroom</p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowJoinCodeModal(false);
                  setJoinCode('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={joiningByCode}
              >
                Cancel
              </button>
              <button
                onClick={handleJoinByCode}
                disabled={joiningByCode || !joinCode.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {joiningByCode ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join Chatroom'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddMemberModal(false);
              setMemberUsername('');
              setMemberEmail('');
              setAddMemberBy('username');
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Add Member to Chatroom</h3>
                {roomId && (
                  <p className="text-xs text-gray-500 mt-1">Room ID: {roomId}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowAddMemberModal(false);
                  setMemberUsername('');
                  setMemberEmail('');
                  setAddMemberBy('username');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={addingMember}
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="mb-4">
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => {
                    setAddMemberBy('username');
                    setMemberEmail('');
                  }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    addMemberBy === 'username'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  By Username
                </button>
                <button
                  onClick={() => {
                    setAddMemberBy('email');
                    setMemberUsername('');
                  }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    addMemberBy === 'email'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  By Email
                </button>
              </div>
              
              {addMemberBy === 'username' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={memberUsername}
                    onChange={(e) => setMemberUsername(e.target.value)}
                    placeholder="Enter username..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && memberUsername.trim()) {
                        handleAddMemberToChatroom();
                      }
                    }}
                    autoFocus
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="Enter email..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && memberEmail.trim()) {
                        handleAddMemberToChatroom();
                      }
                    }}
                    autoFocus
                  />
                </div>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddMemberModal(false);
                  setMemberUsername('');
                  setMemberEmail('');
                  setAddMemberBy('username');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={addingMember}
              >
                Cancel
              </button>
              <button
                onClick={handleAddMemberToChatroom}
                disabled={addingMember || (addMemberBy === 'username' ? !memberUsername.trim() : !memberEmail.trim())}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {addingMember ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Member'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commit to Repository Modal */}
      {showCommitModal && (() => {
        const message = messages.find(m => m._id === showCommitModal);
        if (!message || !message.aiResponse) return null;
        
        const handleCheckFile = async () => {
          if (!commitFilePath.trim()) {
            setCommitError('Please enter a file path');
            return;
          }
          
          setCheckingFile(true);
          setCommitError(null);
          try {
            const response = await apiClient.get(`/api/chat/room/${roomId}/check-file`, {
              headers: { Authorization: `Bearer ${token}` },
              params: { filePath: commitFilePath.trim() }
            });
            
            setFileExists(response.data.exists);
            if (response.data.exists) {
              setCommitError('⚠️ This file already exists. Committing will overwrite it.');
            } else {
              setCommitError(null);
            }
          } catch (error) {
            logger.error('Error checking file:', error);
            if (error.response?.status === 404) {
              setFileExists(false);
              setCommitError(null);
            } else {
              setCommitError(error.response?.data?.error || 'Failed to check file existence');
            }
          } finally {
            setCheckingFile(false);
          }
        };
        
        const handleCommit = async () => {
          if (!commitFilePath.trim()) {
            setCommitError('Please enter a file path');
            return;
          }
          
          if (!commitMessage.trim()) {
            setCommitError('Please enter a commit message');
            return;
          }
          
          // Show confirmation if file exists
          if (fileExists) {
            const confirmed = window.confirm(
              `⚠️ Warning: The file "${commitFilePath}" already exists. This will overwrite it. Continue?`
            );
            if (!confirmed) return;
          }
          
          setCommitting(true);
          setCommitError(null);
          setCommitSuccess(false);
          
          try {
            const content = message.aiResponse.code || message.aiResponse.explanation || message.content;
            
            if (!content || !content.trim()) {
              setCommitError('No content to commit. The AI response is empty.');
              setCommitting(false);
              return;
            }
            
            const response = await apiClient.post(`/api/chat/room/${roomId}/commit-file`, {
              filePath: commitFilePath.trim(),
              content: content,
              commitMessage: commitMessage.trim()
            }, {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data.success) {
              setCommitSuccess(true);
              setCommitError(null);
              
              // Show success notification
              if (response.data.fileUrl) {
                logger.log('✅ File committed successfully:', response.data.fileUrl);
              }
              
              // Close modal after 3 seconds
              setTimeout(() => {
                setShowCommitModal(null);
                setCommitFilePath('');
                setCommitMessage('');
                setFileExists(false);
                setCommitError(null);
                setCommitSuccess(false);
              }, 3000);
            }
          } catch (error) {
            logger.error('Error committing file:', error);
            let errorMessage = error.response?.data?.error || error.message || 'Failed to commit file to repository';
            
            // Provide helpful error messages
            if (error.response?.status === 400) {
              if (errorMessage.includes('GitHub token')) {
                errorMessage = 'GitHub token not available. Please reconnect your GitHub account in settings.';
              } else if (errorMessage.includes('not associated with a GitHub repository')) {
                errorMessage = 'This chatroom is not linked to a GitHub repository. Only project chatrooms with linked repositories can commit files.';
              }
            } else if (error.response?.status === 403) {
              errorMessage = 'You do not have permission to commit to this repository.';
            } else if (error.response?.status === 404) {
              errorMessage = 'Repository not found. Please check if the repository exists and you have access.';
            }
            
            setCommitError(errorMessage);
          } finally {
            setCommitting(false);
          }
        };
        
        return (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !committing) {
                setShowCommitModal(null);
                setCommitFilePath('');
                setCommitMessage('');
                setFileExists(false);
                setCommitError(null);
                setCommitSuccess(false);
              }
            }}
          >
            <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl p-6 w-full max-w-lg shadow-2xl border-2 border-green-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Add to Repository
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">Commit AI-generated content to GitHub</p>
                </div>
                <button
                  onClick={() => {
                    setShowCommitModal(null);
                    setCommitFilePath('');
                    setCommitMessage('');
                    setFileExists(false);
                    setCommitError(null);
                    setCommitSuccess(false);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={committing}
                >
                  <X size={24} />
                </button>
              </div>
              
              {commitSuccess ? (
                <div className="text-center py-8">
                  <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">File Committed Successfully!</h4>
                  <p className="text-sm text-gray-600">The file has been added to the repository.</p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      File Path <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commitFilePath}
                        onChange={(e) => {
                          setCommitFilePath(e.target.value);
                          setFileExists(false);
                          setCommitError(null);
                        }}
                        placeholder="e.g., src/components/Button.jsx or README.md"
                        className="flex-1 px-4 py-2 border-2 border-green-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                        disabled={committing}
                      />
                      <button
                        onClick={handleCheckFile}
                        disabled={committing || checkingFile || !commitFilePath.trim()}
                        className="px-4 py-2 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {checkingFile ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          'Check'
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Enter the path where the file should be created (e.g., src/utils/helper.js)
                    </p>
                  </div>
                  
                  {fileExists && (
                    <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-200 rounded-xl">
                      <div className="flex items-center gap-2 text-yellow-800">
                        <AlertCircle size={16} />
                        <span className="text-sm font-medium">File already exists</span>
                      </div>
                      <p className="text-xs text-yellow-700 mt-1">
                        This will overwrite the existing file. Make sure this is what you want.
                      </p>
                    </div>
                  )}
                  
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Commit Message <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="e.g., Add new component generated by Omega AI"
                      className="w-full px-4 py-2 border-2 border-green-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                      disabled={committing}
                    />
                  </div>
                  
                  {commitError && (
                    <div className={`mb-4 p-3 rounded-xl ${
                      commitError.includes('⚠️') 
                        ? 'bg-yellow-50 border-2 border-yellow-200 text-yellow-800'
                        : 'bg-red-50 border-2 border-red-200 text-red-800'
                    }`}>
                      <div className="flex items-center gap-2">
                        <AlertCircle size={16} />
                        <span className="text-sm font-medium">{commitError}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowCommitModal(null);
                        setCommitFilePath('');
                        setCommitMessage('');
                        setFileExists(false);
                        setCommitError(null);
                        setCommitSuccess(false);
                      }}
                      className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                      disabled={committing}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCommit}
                      disabled={committing || !commitFilePath.trim() || !commitMessage.trim()}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                    >
                      {committing ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Committing...
                        </>
                      ) : (
                        <>
                          <GitBranch size={16} />
                          Commit to Repo
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
