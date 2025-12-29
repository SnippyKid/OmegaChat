import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../config/axios';
import { logger } from '../utils/logger';
import { MessageSquare, Plus, LogOut, Github, Mail, Users, Linkedin, MessageCircle, X, Copy, Key, RefreshCw, Search, CheckCircle2, AlertCircle, Loader2, Trash2, Edit2, MoreVertical, LogOut as LeaveIcon, Eye } from 'lucide-react';

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [personalRooms, setPersonalRooms] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPersonalRoomModal, setShowPersonalRoomModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [repoInput, setRepoInput] = useState('');
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteWhatsApp, setInviteWhatsApp] = useState('');
  const [inviteLinkedIn, setInviteLinkedIn] = useState('');
  const [personalRoomName, setPersonalRoomName] = useState('');
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);
  const [projectGroupCode, setProjectGroupCode] = useState(null);
  // UI state for creating a project
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingPersonalRoom, setCreatingPersonalRoom] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);
  const [fetchingRepos, setFetchingRepos] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(null);
  const [leavingRoom, setLeavingRoom] = useState(null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [editRoomName, setEditRoomName] = useState('');
  const [showRoomMenu, setShowRoomMenu] = useState(null);
  const [deletingProject, setDeletingProject] = useState(null);
  const [leavingProject, setLeavingProject] = useState(null);
  const [showProjectMenu, setShowProjectMenu] = useState(null);
  const [showCreateChatroomModal, setShowCreateChatroomModal] = useState(null); // projectId
  const [newChatroomName, setNewChatroomName] = useState('');
  const [creatingChatroom, setCreatingChatroom] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState(new Set()); // Track expanded projects
  const [showAddMemberModal, setShowAddMemberModal] = useState(null); // roomId
  const [memberUsername, setMemberUsername] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberBy, setAddMemberBy] = useState('username'); // 'username' or 'email'
  const [githubStats, setGithubStats] = useState(null);
  const [loadingGithubStats, setLoadingGithubStats] = useState(false);

  // Show notification helper
  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Debug: log projects when they change (can be removed later)
  useEffect(() => {
    if (import.meta.env.MODE === 'development') {
      console.debug('Projects loaded:', projects);
    }
  }, [projects]);

  const fetchGithubStats = useCallback(async () => {
    if (!token) return;
    
    setLoadingGithubStats(true);
    try {
      const response = await apiClient.get('/api/auth/github-stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data && response.data.success) {
        setGithubStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching GitHub stats:', error);
      // Don't show error - stats are optional
    } finally {
      setLoadingGithubStats(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProjects();
    fetchRepositories();
    fetchPersonalRooms();
    fetchGithubStats();
  }, [token, fetchGithubStats]);

  const fetchPersonalRooms = async () => {
    try {
      const response = await apiClient.get('/api/chat/my-chatrooms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPersonalRooms(response.data.personalRooms || []);
    } catch (error) {
      console.error('Error fetching personal chatrooms:', error);
      showNotification('Failed to load personal chatrooms', 'error');
    }
  };

  const fetchRepositories = async () => {
    setFetchingRepos(true);
    try {
      const response = await apiClient.get('/api/auth/repositories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRepositories(response.data.repositories || []);
    } catch (error) {
      logger.error('Error fetching repositories:', error);
      showNotification('Failed to load repositories', 'error');
    } finally {
      setFetchingRepos(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await apiClient.get('/api/projects/my-projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(response.data.projects || []);
    } catch (error) {
      logger.error('Error fetching projects:', error);
      showNotification('Failed to load projects', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchProjects(),
        fetchRepositories(),
        fetchPersonalRooms()
      ]);
      showNotification('Refreshed successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    const repoFullName = selectedRepo?.fullName || repoInput;
    if (!repoFullName) {
      alert('Please select or enter a repository');
      return;
    }
    
    setCreatingProject(true);
    try {
      const response = await apiClient.post('/api/projects/create', 
        { repoFullName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const newProject = response.data.project;
      
      // Refresh projects list to get updated member counts
      await fetchProjects();
      
      setShowCreateModal(false);
      setRepoInput('');
      setSelectedRepo(null);
      
      // Show invite modal after project creation (user can skip or invite)
      setSelectedProject(newProject);
      setShowInviteModal(true);
      showNotification('Project created successfully!', 'success');
    } catch (error) {
      console.error('Failed to create project:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to create project';
      showNotification(errorMsg, 'error');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleInviteViaEmail = async () => {
    if (!inviteEmail.trim()) {
      showNotification('Please enter an email address', 'error');
      return;
    }
    try {
      const response = await apiClient.post(`/api/projects/${selectedProject._id}/invite/email`, 
        { email: inviteEmail },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Copy invitation link to clipboard
      const inviteLink = response.data.inviteLink;
      navigator.clipboard.writeText(inviteLink);
      
      // Create mailto link
      const subject = encodeURIComponent(`Join ${selectedProject.name} on Omega Chat`);
      const body = encodeURIComponent(`I'd like to invite you to collaborate on ${selectedProject.name}!\n\nJoin here: ${inviteLink}`);
      const mailtoLink = `mailto:${inviteEmail}?subject=${subject}&body=${body}`;
      
      // Open email client
      window.location.href = mailtoLink;
      
      showNotification(`Invitation link copied! Email client opened for ${inviteEmail}`, 'success');
      setInviteEmail('');
    } catch (error) {
      showNotification('Failed to send invitation: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleInviteViaWhatsApp = () => {
    if (!inviteWhatsApp.trim()) {
      showNotification('Please enter a phone number', 'error');
      return;
    }
    const inviteLink = `${window.location.origin}/join/${selectedProject._id}`;
    const message = encodeURIComponent(`Join me on Omega Chat for ${selectedProject.name}! ${inviteLink}`);
    const whatsappUrl = `https://wa.me/${inviteWhatsApp.replace(/[^0-9]/g, '')}?text=${message}`;
    window.open(whatsappUrl, '_blank');
    showNotification('WhatsApp opened with invitation link', 'success');
    setInviteWhatsApp('');
  };

  const handleInviteViaLinkedIn = () => {
    if (!inviteLinkedIn.trim()) {
      showNotification('Please enter a LinkedIn profile URL or username', 'error');
      return;
    }
    const inviteLink = `${window.location.origin}/join/${selectedProject._id}`;
    const message = encodeURIComponent(`Join me on Omega Chat for ${selectedProject.name}! ${inviteLink}`);
    // LinkedIn sharing URL
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(inviteLink)}`;
    window.open(linkedInUrl, '_blank');
    showNotification('LinkedIn share dialog opened', 'success');
    setInviteLinkedIn('');
  };

  const handleSkipToChat = () => {
    if (selectedProject?.chatRoom) {
      // Handle both populated object and ID string
      const chatRoomId = selectedProject.chatRoom._id || selectedProject.chatRoom;
      if (chatRoomId) {
        setShowInviteModal(false);
        setSelectedProject(null);
        navigate(`/chat/${chatRoomId}`);
      } else {
        alert('Chat room not available. Please try again.');
      }
    } else {
      alert('Chat room not available. Please try again.');
    }
  };

  const openChat = (project, chatRoomId = null) => {
    // If specific chatroom ID provided, use it
    if (chatRoomId) {
      navigate(`/chat/${chatRoomId}`);
      return;
    }
    
    // Check if project has multiple chatrooms
    const allChatRooms = project.chatRooms || [];
    const defaultChatRoom = project.chatRoom?._id || project.chatRoom;
    
    // If multiple chatrooms exist, show selection (for now, use default/main one)
    if (allChatRooms.length > 0) {
      // Use the first/main chatroom, or default chatRoom
      const roomToOpen = defaultChatRoom || (allChatRooms[0]?._id || allChatRooms[0]);
      if (roomToOpen) {
        navigate(`/chat/${roomToOpen}`);
      } else {
        showNotification('No chat room available for this project.', 'error');
      }
    } else if (defaultChatRoom) {
      // Fallback to default chatRoom
      navigate(`/chat/${defaultChatRoom}`);
    } else {
      showNotification('Chat room not available for this project. Please create one.', 'error');
    }
  };
  
  const handleCreateProjectChatroom = async (projectId, roomName) => {
    if (!roomName || !roomName.trim()) {
      showNotification('Please enter a chat room name', 'error');
      return;
    }
    
    try {
      const response = await apiClient.post(`/api/projects/${projectId}/chatrooms/create`, 
        { name: roomName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success && response.data.room) {
        showNotification('Chatroom created successfully!', 'success');
        await fetchProjects(); // Refresh projects to show new chatroom
        
        // Open the new chatroom
        const roomId = response.data.room._id?.toString() || response.data.room._id;
        if (roomId) {
          setTimeout(() => navigate(`/chat/${roomId}`), 300);
        }
        return true;
      } else {
        throw new Error(response.data.error || 'Failed to create chatroom');
      }
    } catch (error) {
      showNotification('Failed to create chatroom: ' + (error.response?.data?.error || error.message), 'error');
      return false;
    }
  };

  const handleAddMemberToChatroom = async (roomId) => {
    logger.debug('handleAddMemberToChatroom called with roomId:', roomId);
    logger.debug('addMemberBy:', addMemberBy);
    logger.debug('memberUsername:', memberUsername);
    logger.debug('memberEmail:', memberEmail);
    
    if (!roomId) {
      logger.error('No roomId provided');
      showNotification('Invalid room ID', 'error');
      return;
    }
    
    if (addMemberBy === 'username' && !memberUsername.trim()) {
      showNotification('Please enter a username', 'error');
      return;
    }
    if (addMemberBy === 'email' && !memberEmail.trim()) {
      showNotification('Please enter an email', 'error');
      return;
    }
    
    setAddingMember(true);
    try {
      const payload = addMemberBy === 'username' 
        ? { username: memberUsername.trim() }
        : { email: memberEmail.trim() };
      
      logger.debug('Sending request to:', `/api/chat/${roomId}/members/add`);
      logger.debug('Payload:', payload);
      
      const response = await apiClient.post(`/api/chat/${roomId}/members/add`, 
        payload,
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000
        }
      );
      
      logger.debug('Response received:', response.data);
      
      if (response.data && response.data.success) {
        showNotification(response.data.message || 'Member added successfully!', 'success');
        
        // Refresh data
        try {
          await Promise.all([
            fetchProjects(),
            fetchPersonalRooms()
          ]);
        } catch (refreshError) {
          logger.warn('Error refreshing data:', refreshError);
        }
        
        // Close modal and reset state
        setShowAddMemberModal(null);
        setMemberUsername('');
        setMemberEmail('');
        setAddMemberBy('username');
      } else {
        throw new Error(response.data?.error || 'Failed to add member');
      }
    } catch (error) {
      logger.error('Error adding member:', error);
      logger.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to add member';
      showNotification(errorMessage, 'error');
    } finally {
      setAddingMember(false);
    }
  };

  const openPersonalRoom = (room) => {
    if (!room || !room._id) {
      showNotification('Invalid room data', 'error');
      return;
    }
    const roomId = room._id?.toString() || room._id;
    navigate(`/chat/${roomId}`);
  };

  const handleDeletePersonalRoom = async (roomId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this chatroom? This action cannot be undone.')) {
      return;
    }
    
    setDeletingRoom(roomId);
    try {
      await apiClient.delete(`/api/chat/room/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showNotification('Chatroom deleted successfully', 'success');
      await fetchPersonalRooms();
    } catch (error) {
      showNotification('Failed to delete chatroom: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setDeletingRoom(null);
      setShowRoomMenu(null);
    }
  };

  const handleLeaveRoom = async (roomId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to leave this chatroom?')) {
      return;
    }
    
    setLeavingRoom(roomId);
    try {
      await apiClient.post(`/api/chat/room/${roomId}/leave`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showNotification('Left chatroom successfully', 'success');
      await fetchPersonalRooms();
      await fetchProjects();
    } catch (error) {
      showNotification('Failed to leave chatroom: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLeavingRoom(null);
      setShowRoomMenu(null);
    }
  };

  const handleEditRoomName = async (roomId, e) => {
    e.stopPropagation();
    if (!editRoomName.trim()) {
      showNotification('Please enter a chatroom name', 'error');
      return;
    }
    
    try {
      await apiClient.patch(`/api/chat/room/${roomId}`, 
        { name: editRoomName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showNotification('Chatroom name updated successfully', 'success');
      await fetchPersonalRooms();
      setEditingRoom(null);
      setEditRoomName('');
    } catch (error) {
      showNotification('Failed to update chatroom name: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setShowRoomMenu(null);
    }
  };

  const handleDeleteProject = async (projectId, e) => {
    console.log('🗑️ ========== DELETE PROJECT CALLED ==========');
    console.log('🗑️ Project ID:', projectId);
    console.log('🗑️ Event:', e);
    console.log('🗑️ Token available:', !!token);
    
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    // Double confirmation for destructive action
    const confirmMessage = '⚠️ WARNING: This will permanently delete the project and ALL associated chatrooms. This action CANNOT be undone.\n\nAre you absolutely sure you want to delete this project?';
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    // Second confirmation
    if (!window.confirm('Last chance! Click OK to confirm deletion, or Cancel to abort.')) {
      console.log('❌ User cancelled second confirmation');
      return;
    }
    
    console.log('✅ User confirmed deletion, proceeding with delete...');
    setDeletingProject(projectId);
    setShowProjectMenu(null); // Close menu immediately
    
    try {
      console.log('🗑️ Attempting to delete project:', projectId);
      console.log('🗑️ Using token:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN');
      
      // Ensure token is available
      if (!token) {
        throw new Error('Authentication token is missing. Please log in again.');
      }
      
      const response = await apiClient.delete(`/api/projects/${projectId}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000, // 20 second timeout
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });
      
      console.log('✅ Delete response status:', response.status);
      console.log('✅ Delete response data:', response.data);
      
      // Check if deletion was successful - accept both success: true and success: undefined
      if (response.data?.success !== false && response.status >= 200 && response.status < 300) {
        showNotification(response.data?.message || '✅ Project and all chatrooms deleted successfully', 'success');
        
        // Force refresh projects list immediately
        await fetchProjects();
        
        // Also refresh personal rooms in case any were linked
        await fetchPersonalRooms();
        
        // Small delay to ensure UI updates
        setTimeout(() => {
          setDeletingProject(null);
        }, 500);
      } else {
        throw new Error(response.data?.error || 'Failed to delete project');
      }
    } catch (error) {
      console.error('❌ Error deleting project:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMessage = 'Failed to delete project';
      
      if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to delete this project. Only the project owner can delete it.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Project not found. It may have already been deleted.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showNotification(errorMessage, 'error');
      setDeletingProject(null);
    }
  };

  const handleLeaveProject = async (projectId, e) => {
    console.log('🚪 handleLeaveProject called with projectId:', projectId);
    
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    if (!window.confirm('Are you sure you want to leave this project? You will lose access to all project chatrooms.')) {
      console.log('❌ User cancelled leave confirmation');
      return;
    }
    
    console.log('✅ User confirmed leave, proceeding...');
    
    setLeavingProject(projectId);
    setShowProjectMenu(null); // Close menu immediately
    
    try {
      console.log('🚪 Attempting to leave project:', projectId);
      console.log('🚪 Using token:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN');
      
      // Ensure token is available
      if (!token) {
        throw new Error('Authentication token is missing. Please log in again.');
      }
      
      const response = await apiClient.post(`/api/projects/${projectId}/leave`, {}, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000, // 20 second timeout
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });
      
      console.log('✅ Leave response status:', response.status);
      console.log('✅ Leave response data:', response.data);
      
      // Check if leaving was successful - accept both success: true and success: undefined
      if (response.data?.success !== false && response.status >= 200 && response.status < 300) {
        showNotification(response.data?.message || 'Left project successfully', 'success');
        
        // Force refresh projects list immediately
        await fetchProjects();
        
        // Also refresh personal rooms in case any were linked
        await fetchPersonalRooms();
        
        // Small delay to ensure UI updates
        setTimeout(() => {
          setLeavingProject(null);
        }, 500);
      } else {
        throw new Error(response.data?.error || 'Failed to leave project');
      }
    } catch (error) {
      console.error('❌ Error leaving project:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMessage = 'Failed to leave project';
      
      if (error.response?.status === 400) {
        errorMessage = error.response.data?.error || 'You cannot leave this project. Project owners must delete the project instead.';
      } else if (error.response?.status === 403) {
        errorMessage = 'You are not a member of this project.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Project not found. It may have already been deleted.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showNotification(errorMessage, 'error');
      setLeavingProject(null);
    }
  };

  const handleCreatePersonalRoom = async (e) => {
    e.preventDefault();
    if (!personalRoomName.trim()) {
      showNotification('Please enter a chat room name', 'error');
      return;
    }
    
    setCreatingPersonalRoom(true);
    try {
      const response = await apiClient.post('/api/chat/personal/create', 
        { name: personalRoomName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success && response.data.room) {
        setShowPersonalRoomModal(false);
        setPersonalRoomName('');
        showNotification('Personal chatroom created successfully!', 'success');
        
        // Refresh rooms list first
        await fetchPersonalRooms();
        
        // Open the new room immediately
        const roomId = response.data.room._id?.toString() || response.data.room._id;
        if (roomId) {
          setTimeout(() => navigate(`/chat/${roomId}`), 300);
        }
      } else {
        throw new Error(response.data.error || 'Failed to create room');
      }
    } catch (error) {
      showNotification('Failed to create personal chatroom: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setCreatingPersonalRoom(false);
    }
  };

  const fetchProjectGroupCode = async () => {
    if (!selectedProject?._id) return;
    try {
      const response = await apiClient.get(`/api/projects/${selectedProject._id}/group-code`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjectGroupCode(response.data.groupCode);
    } catch (error) {
      console.error('Error fetching group code:', error);
      alert('Failed to fetch group code: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleCopyGroupCode = (code) => {
    navigator.clipboard.writeText(code);
    showNotification('Group code copied to clipboard!', 'success');
  };

  const handleJoinViaCode = async () => {
    if (!joinCode.trim()) {
      showNotification('Please enter a group code', 'error');
      return;
    }
    
    setJoiningCode(true);
    const normalizedCode = joinCode.trim().toUpperCase();
    
    try {
      // Try joining as project first
      try {
        const response = await apiClient.post(`/api/projects/join-code/${normalizedCode}`, {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.data.success) {
          const chatRoomId = response.data.chatRoomId || 
                           response.data.project?.chatRoom?._id || 
                           response.data.project?.chatRoom;
          
          showNotification(response.data.message || 'Successfully joined project!', 'success');
          setShowJoinCodeModal(false);
          setJoinCode('');
          
          // Refresh project list
          await fetchProjects();
          
          // Navigate to chat room if available
          if (chatRoomId) {
            setTimeout(() => navigate(`/chat/${chatRoomId}`), 500);
          } else {
            // Refresh to show updated project list
            window.location.reload();
          }
          return;
        } else {
          throw new Error(response.data.error || 'Failed to join project');
        }
      } catch (projectError) {
        // If project join fails (404 or other error), try chatroom join
        if (projectError.response?.status === 404) {
          // Project not found, try chatroom
          const response = await apiClient.post(`/api/chat/join-code/${normalizedCode}`, {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          if (response.data.success) {
            const roomId = response.data.room?._id || response.data.room;
            
            showNotification(response.data.message || 'Successfully joined chat room!', 'success');
            setShowJoinCodeModal(false);
            setJoinCode('');
            
            // Refresh personal rooms list
            await fetchPersonalRooms();
            
            // Navigate to chat room if available
            if (roomId) {
              setTimeout(() => navigate(`/chat/${roomId}`), 500);
            } else {
              window.location.reload();
            }
            return;
          } else {
            throw new Error(response.data.error || 'Failed to join chat room');
          }
        } else {
          // Other error from project join, throw it
          throw projectError;
        }
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message ||
                          error.message || 
                          'Failed to join. Please check the group code and try again.';
      showNotification(errorMessage, 'error');
      logger.error('Join error:', error);
    } finally {
      setJoiningCode(false);
    }
  };

  useEffect(() => {
    if (showInviteModal && selectedProject?._id && !projectGroupCode) {
      fetchProjectGroupCode();
    }
  }, [showInviteModal, selectedProject?._id]);

  // Memoize filtered projects and rooms to avoid recalculating on every render
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(project => 
      project.name?.toLowerCase().includes(query) ||
      project.githubRepo?.fullName?.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);

  const filteredPersonalRooms = useMemo(() => {
    if (!searchQuery.trim()) return personalRooms;
    const query = searchQuery.toLowerCase();
    return personalRooms.filter(room =>
      room.name?.toLowerCase().includes(query)
    );
  }, [personalRooms, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-green-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-green-700 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-green-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-600 to-emerald-600 shadow-lg border-b border-green-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl flex items-center justify-center shadow-xl border-2 border-white/40 transform hover:scale-105 transition-transform">
                  <span className="logo-font text-white text-3xl font-black tracking-wider">Ω</span>
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white animate-pulse"></div>
              </div>
              <div>
                <h1 className="logo-font text-3xl font-black text-white tracking-wide drop-shadow-lg">OMEGA</h1>
                <p className="text-sm text-emerald-100 font-medium tracking-wide">@{user?.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 rounded-lg transition-all disabled:opacity-50 shadow-sm border border-white/30 font-medium"
                title="Refresh"
              >
                <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={() => setShowJoinCodeModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-medium"
              >
                <Key size={20} />
                Join via Code
              </button>
              <button
                onClick={() => setShowPersonalRoomModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-medium"
              >
                <MessageSquare size={20} />
                Personal Chat
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-medium"
              >
                <Plus size={20} />
                New Project
              </button>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 rounded-lg transition-all shadow-sm border border-white/30 font-medium"
              >
                <LogOut size={20} />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl ${
          notification.type === 'success' 
            ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white' 
            : 'bg-gradient-to-r from-red-500 to-rose-500 text-white'
        } animate-slide-in border-2 ${notification.type === 'success' ? 'border-emerald-300' : 'border-red-300'}`}>
          {notification.type === 'success' ? (
            <CheckCircle2 size={20} />
          ) : (
            <AlertCircle size={20} />
          )}
          <span className="font-medium">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 hover:opacity-80 transition-opacity"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* GitHub Stats Section */}
        {githubStats && (
          <div className="mb-8 bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-xl border border-green-200 overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Github size={24} className="text-white" />
                  <h2 className="text-xl font-bold text-white">GitHub Profile</h2>
                </div>
                <a
                  href={githubStats.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/90 hover:text-white text-sm font-medium flex items-center gap-1"
                >
                  View Profile
                  <Eye size={16} />
                </a>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-6 mb-6">
                <img
                  src={githubStats.avatar}
                  alt={githubStats.username}
                  className="w-20 h-20 rounded-full border-4 border-green-200 shadow-lg"
                />
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900">{githubStats.name}</h3>
                  <p className="text-green-600 font-medium">@{githubStats.username}</p>
                  {githubStats.bio && (
                    <p className="text-gray-600 mt-2">{githubStats.bio}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                    {githubStats.location && (
                      <span className="flex items-center gap-1">
                        📍 {githubStats.location}
                      </span>
                    )}
                    {githubStats.company && (
                      <span className="flex items-center gap-1">
                        🏢 {githubStats.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl p-4 border border-green-200">
                  <div className="text-2xl font-bold text-green-700">{githubStats.followers}</div>
                  <div className="text-sm text-green-600 font-medium">Followers</div>
                </div>
                <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl p-4 border border-green-200">
                  <div className="text-2xl font-bold text-green-700">{githubStats.following}</div>
                  <div className="text-sm text-green-600 font-medium">Following</div>
                </div>
                <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl p-4 border border-green-200">
                  <div className="text-2xl font-bold text-green-700">{githubStats.publicRepos}</div>
                  <div className="text-sm text-green-600 font-medium">Public Repos</div>
                </div>
                <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl p-4 border border-green-200">
                  <div className="text-2xl font-bold text-green-700">{githubStats.totalStars}</div>
                  <div className="text-sm text-green-600 font-medium">Total Stars</div>
                </div>
              </div>
              
              {/* Top Languages */}
              {githubStats.topLanguages && githubStats.topLanguages.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Top Languages</h4>
                  <div className="flex flex-wrap gap-2">
                    {githubStats.topLanguages.map((lang, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-sm font-medium shadow-sm"
                      >
                        {lang.language} ({lang.count})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-green-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects and chatrooms..."
              className="w-full pl-10 pr-4 py-3 border-2 border-green-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white/80 backdrop-blur-sm shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-6 mt-8">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            Your Projects
            {searchQuery && <span className="text-sm font-normal text-green-500 ml-2">({filteredProjects.length})</span>}
          </h2>
        </div>
        
        {filteredProjects.length === 0 && !searchQuery ? (
          <div className="text-center py-12 bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-lg border-2 border-green-200">
            <Github className="mx-auto h-12 w-12 text-green-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No projects yet</h3>
            <p className="mt-2 text-gray-600">Create a project from your GitHub repository to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-md hover:shadow-lg font-medium"
            >
              Create Project
            </button>
          </div>
        ) : filteredProjects.length === 0 && searchQuery ? (
          <div className="text-center py-12 bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-lg border-2 border-green-200">
            <Search className="mx-auto h-12 w-12 text-green-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No projects found</h3>
            <p className="mt-2 text-gray-600">Try adjusting your search query</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => {
              // Improved owner detection - handle all possible user ID formats
              const isOwner = project.members?.some(m => {
                const memberUserId = typeof m.user === 'object' && m.user?._id 
                  ? m.user._id.toString() 
                  : (m.user?.toString() || m.user);
                const currentUserId = user?._id?.toString() || user?._id;
                return memberUserId === currentUserId && m.role === 'owner';
              }) || false;
              return (
                <div
                  key={project._id}
                  className={`bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 p-6 border-2 border-gray-100 hover:border-emerald-400 relative group ${
                    (project?.chatRoom?._id || project?.chatRoom) ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'
                  }`}
                >
                  <div
                    onClick={() => {
                      const chatRoomId = project?.chatRoom?._id || project?.chatRoom;
                      if (chatRoomId) {
                        openChat(project);
                      } else {
                        showNotification('Chat room not available for this project. Please try again or recreate the project.', 'error');
                      }
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">{project.githubRepo?.fullName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Github size={20} className="text-green-500" />
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              console.log('📋 Menu button clicked for project:', project._id);
                              setShowProjectMenu(showProjectMenu === project._id ? null : project._id);
                            }}
                            className="p-1.5 hover:bg-green-100 rounded-lg transition-colors opacity-100 cursor-pointer"
                            title="Project options"
                          >
                            <MoreVertical size={18} className="text-green-600" />
                          </button>
                          {showProjectMenu === project._id && (
                            <div 
                              className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[180px]"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const chatRoomId = project?.chatRoom?._id || project?.chatRoom;
                                  if (chatRoomId) {
                                    openChat(project);
                                  }
                                  setShowProjectMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <Eye size={16} />
                                Open Chat
                              </button>
                              {!isOwner && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    console.log('🚪 Leave button clicked for project:', project._id);
                                    handleLeaveProject(project._id, e);
                                  }}
                                  disabled={leavingProject === project._id}
                                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                  style={{ cursor: leavingProject === project._id ? 'not-allowed' : 'pointer' }}
                                >
                                  {leavingProject === project._id ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <LeaveIcon size={16} />
                                  )}
                                  Leave Project
                                </button>
                              )}
                              {isOwner && (
                                <>
                                  <div className="border-t border-gray-200 my-1"></div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      console.log('🗑️ Delete button clicked for project:', project._id);
                                      handleDeleteProject(project._id, e);
                                    }}
                                    disabled={deletingProject === project._id}
                                    className="w-full px-4 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    style={{ cursor: deletingProject === project._id ? 'not-allowed' : 'pointer' }}
                                  >
                                    {deletingProject === project._id ? (
                                      <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Deleting...
                                      </>
                                    ) : (
                                      <>
                                        <Trash2 size={16} />
                                        Delete Project Permanently
                                      </>
                                    )}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {project.description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-green-600 mb-3 font-medium">
                      <MessageSquare size={16} />
                      <span>
                        {project.members && project.members.length > 0 
                          ? `${project.members.length} member${project.members.length !== 1 ? 's' : ''}` 
                          : '0 members'}
                      </span>
                      {isOwner && (
                        <span className="ml-2 px-2.5 py-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs rounded-full font-semibold shadow-sm">Owner</span>
                      )}
                    </div>
                    
                    {/* Chatrooms Section */}
                    <div className="border-t-2 border-green-200 pt-3 mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">Chatrooms</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCreateChatroomModal(project._id);
                            setNewChatroomName('');
                          }}
                          className="text-xs px-2.5 py-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all shadow-sm flex items-center gap-1 font-medium"
                          title="Create new chatroom"
                        >
                          <Plus size={12} />
                          New
                        </button>
                      </div>
                      
                      {/* Get all chatrooms for this project */}
                      {(() => {
                        const allChatRooms = project.chatRooms || [];
                        const defaultChatRoom = project.chatRoom?._id || project.chatRoom;
                        const chatRoomsList = [];
                        
                        // Add default/main chatroom if exists
                        if (defaultChatRoom) {
                          const defaultRoom = typeof defaultChatRoom === 'object' 
                            ? defaultChatRoom 
                            : allChatRooms.find(r => (r._id || r).toString() === defaultChatRoom.toString());
                          if (defaultRoom && !chatRoomsList.some(r => (r._id || r).toString() === (defaultRoom._id || defaultRoom).toString())) {
                            chatRoomsList.push(defaultRoom);
                          }
                        }
                        
                        // Add other chatrooms
                        allChatRooms.forEach(room => {
                          const roomId = room._id || room;
                          if (!chatRoomsList.some(r => (r._id || r).toString() === roomId.toString())) {
                            chatRoomsList.push(room);
                          }
                        });
                        
                        const isExpanded = expandedProjects.has(project._id.toString());
                        const displayRooms = isExpanded ? chatRoomsList : chatRoomsList.slice(0, 2);
                        
                        return (
                          <div className="space-y-1">
                            {displayRooms.length > 0 ? (
                              <>
                                {displayRooms.map((room) => {
                                  const roomId = room._id || room;
                                  const roomName = room.name || 'Unnamed Room';
                                  return (
                                    <div
                                      key={roomId.toString()}
                                      className="flex items-center justify-between p-2.5 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 rounded-xl transition-all group border border-green-200"
                                    >
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openChat(project, roomId);
                                        }}
                                        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                                      >
                                        <MessageSquare size={14} className="text-green-500 flex-shrink-0" />
                                        <span className="text-sm text-gray-700 truncate font-medium">{roomName}</span>
                                        {defaultChatRoom && (roomId.toString() === (defaultChatRoom._id || defaultChatRoom).toString()) && (
                                          <span className="text-xs px-2 py-0.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-full flex-shrink-0 font-semibold shadow-sm">Main</span>
                                        )}
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const roomIdStr = typeof roomId === 'object' && roomId._id 
                                            ? roomId._id.toString() 
                                            : roomId.toString();
                                          logger.debug('Opening add member modal for room:', roomIdStr);
                                          setShowAddMemberModal(roomIdStr);
                                          setMemberUsername('');
                                          setMemberEmail('');
                                          setAddMemberBy('username');
                                        }}
                                        className="p-1.5 hover:bg-green-200 rounded-lg transition-all hover:scale-110 active:scale-95"
                                        title="Add member to chatroom"
                                      >
                                        <Users size={14} className="text-green-600" />
                                      </button>
                                    </div>
                                  );
                                })}
                                {chatRoomsList.length > 2 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const projectId = project._id.toString();
                                      const newExpanded = new Set(expandedProjects);
                                      if (isExpanded) {
                                        newExpanded.delete(projectId);
                                      } else {
                                        newExpanded.add(projectId);
                                      }
                                      setExpandedProjects(newExpanded);
                                    }}
                                    className="w-full text-xs text-green-600 hover:text-green-700 py-1 text-center font-medium"
                                  >
                                    {isExpanded ? 'Show Less' : `+${chatRoomsList.length - 2} more`}
                                  </button>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-gray-400 italic">No chatrooms yet</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Personal Chatrooms Section */}
        <div className="mt-12 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              Personal Chatrooms
              {searchQuery && <span className="text-sm font-normal text-green-500 ml-2">({filteredPersonalRooms.length})</span>}
            </h2>
            <button
              onClick={() => setShowPersonalRoomModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-md hover:shadow-lg font-medium"
            >
              <Plus size={16} />
              New Chat
            </button>
          </div>
          
          {filteredPersonalRooms.length === 0 && !searchQuery ? (
            <div className="text-center py-12 bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 rounded-2xl shadow-lg border-2 border-green-200">
              <MessageSquare className="mx-auto h-12 w-12 text-green-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No personal chatrooms yet</h3>
              <p className="mt-2 text-gray-600">Create a personal chatroom for general discussions</p>
              <button
                onClick={() => setShowPersonalRoomModal(true)}
                className="mt-4 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-md hover:shadow-lg font-medium"
              >
                Create Personal Chatroom
              </button>
            </div>
          ) : filteredPersonalRooms.length === 0 && searchQuery ? (
            <div className="text-center py-12 bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-lg border-2 border-green-200">
              <Search className="mx-auto h-12 w-12 text-green-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No chatrooms found</h3>
              <p className="mt-2 text-gray-600">Try adjusting your search query</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPersonalRooms.map((room) => (
                <div
                  key={room._id}
                  className="bg-gradient-to-br from-green-50 via-emerald-50 to-green-100 rounded-2xl shadow-lg hover:shadow-xl transition-all p-6 border-2 border-green-200 hover:border-green-400 relative group"
                >
                  <div
                    onClick={() => openPersonalRoom(room)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        {editingRoom === room._id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editRoomName}
                              onChange={(e) => setEditRoomName(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  handleEditRoomName(room._id, e);
                                } else if (e.key === 'Escape') {
                                  setEditingRoom(null);
                                  setEditRoomName('');
                                }
                              }}
                              className="flex-1 px-2 py-1 border border-green-300 rounded text-sm font-semibold"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={(e) => handleEditRoomName(room._id, e)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Save"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingRoom(null);
                                setEditRoomName('');
                              }}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <h3 className="text-lg font-semibold text-gray-900">{room.name}</h3>
                        )}
                        <p className="text-sm text-green-600 mt-1 font-semibold">Personal Chatroom</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <MessageSquare size={20} className="text-green-500 flex-shrink-0" />
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowRoomMenu(showRoomMenu === room._id ? null : room._id);
                            }}
                            className="p-1.5 hover:bg-green-200 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <MoreVertical size={18} className="text-green-600" />
                          </button>
                          {showRoomMenu === room._id && (
                            <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[160px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowAddMemberModal(room._id.toString());
                                  setMemberUsername('');
                                  setMemberEmail('');
                                  setAddMemberBy('username');
                                  setShowRoomMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Users size={16} />
                                Add Member
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    // Get or generate group code for the chatroom
                                    const response = await apiClient.get(`/api/chat/room/${room._id}/group-code`, {
                                      headers: { Authorization: `Bearer ${token}` }
                                    });
                                    const groupCode = response.data.groupCode;
                                    const inviteLink = `${window.location.origin}/join-chatroom/${groupCode}`;
                                    
                                    // Copy to clipboard
                                    await navigator.clipboard.writeText(inviteLink);
                                    showNotification('Invite link copied to clipboard!', 'success');
                                  } catch (error) {
                                    logger.error('Error getting group code:', error);
                                    showNotification('Failed to get invite link: ' + (error.response?.data?.error || error.message), 'error');
                                  }
                                  setShowRoomMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Key size={16} />
                                Copy Invite Link
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingRoom(room._id);
                                  setEditRoomName(room.name);
                                  setShowRoomMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Edit2 size={16} />
                                Edit Name
                              </button>
                              <button
                                onClick={(e) => handleLeaveRoom(room._id, e)}
                                disabled={leavingRoom === room._id}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                              >
                                {leavingRoom === room._id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <LeaveIcon size={16} />
                                )}
                                Leave Room
                              </button>
                              <button
                                onClick={(e) => handleDeletePersonalRoom(room._id, e)}
                                disabled={deletingRoom === room._id}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                              >
                                {deletingRoom === room._id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                                Delete Room
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-green-700 mb-2 font-medium">
                      <Users size={16} />
                      <span>
                        {room.members && room.members.length > 0 
                          ? `${room.members.length} member${room.members.length !== 1 ? 's' : ''}` 
                          : '0 members'}
                      </span>
                    </div>
                    {room.lastMessage && (
                      <p className="text-xs text-gray-600 font-medium">
                        Last active: {new Date(room.lastMessage).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl border-2 border-green-200">
            <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Select a Project You Want to Work On</h3>
            <p className="text-sm text-gray-600 mb-6">
              Choose a GitHub repository. All contributors will be automatically invited to the chatroom.
            </p>
            
            {fetchingRepos ? (
              <div className="mb-4 flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-green-600" />
                <span className="ml-2 text-gray-600">Loading repositories...</span>
              </div>
            ) : repositories.length > 0 ? (
              <div className="mb-4 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {repositories.map((repo) => (
                  <div
                    key={repo.fullName}
                    onClick={() => {
                      setSelectedRepo(repo);
                      setRepoInput(repo.fullName);
                    }}
                    className={`p-3 border-b border-green-100 cursor-pointer hover:bg-green-50 transition-colors ${
                      selectedRepo?.fullName === repo.fullName ? 'bg-gradient-to-r from-green-100 to-emerald-100 border-green-300' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{repo.name}</p>
                        <p className="text-sm text-gray-500">{repo.fullName}</p>
                      </div>
                      {selectedRepo?.fullName === repo.fullName && (
                        <span className="text-green-600 font-bold">✓</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">No repositories found. You can enter manually:</p>
            )}
            
            <form onSubmit={handleCreateProject}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Or enter repository manually (owner/repo)
                </label>
                <input
                  type="text"
                  value={repoInput}
                  onChange={(e) => {
                    setRepoInput(e.target.value);
                    setSelectedRepo(null);
                  }}
                  placeholder="e.g., facebook/react"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setSelectedRepo(null);
                    setRepoInput('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!repoInput.trim() || creatingProject}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-medium"
                >
                  {creatingProject ? 'Creating...' : 'Select Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Members Modal */}
      {showInviteModal && selectedProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border-2 border-green-200">
            <div className="p-6 pb-4 flex-shrink-0">
              <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Add Team Members</h3>
              <p className="text-sm text-gray-600">
                Invite collaborators to join <span className="font-semibold text-green-700">{selectedProject.name}</span>
              </p>
            </div>

            <div className="px-6 pb-6 overflow-y-auto flex-1">
              <div className="space-y-4">
              {/* Current Contributors */}
              {selectedProject?.members && selectedProject.members.length > 0 && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center gap-3 mb-3">
                    <Users className="text-green-600" size={20} />
                    <h4 className="font-semibold text-gray-900">Current Contributors ({selectedProject.members.length})</h4>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {selectedProject.members.map((member) => {
                      const memberData = typeof member.user === 'object' ? member.user : { username: 'User', avatar: null };
                      return (
                        <div key={member.user?._id || member.user} className="flex items-center gap-2 text-sm">
                          <img
                            src={memberData.avatar || `https://ui-avatars.com/api/?name=${memberData.username}`}
                            alt={memberData.username}
                            className="w-6 h-6 rounded-full"
                          />
                          <span className="text-gray-700">{memberData.username}</span>
                          <span className="text-xs text-gray-500">({member.role})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Email Invitation */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Mail className="text-blue-600" size={20} />
                  <h4 className="font-semibold text-gray-900">Invite via Email</h4>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleInviteViaEmail()}
                    placeholder="email@example.com"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleInviteViaEmail}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Send
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Enter email and click Send to copy invite link and open email client
                </p>
              </div>

              {/* Group Code Invitation */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gradient-to-br from-primary-50 to-blue-50">
                <div className="flex items-center gap-3 mb-3">
                  <Key className="text-green-600" size={20} />
                  <h4 className="font-semibold text-gray-900">Group Code</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Share this code with anyone to let them join instantly!
                </p>
                {projectGroupCode ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-3 bg-white border-2 border-green-300 rounded-lg text-center font-mono font-semibold text-green-700">
                      <div className="text-2xl font-bold text-primary-700 font-mono tracking-wider">
                        {projectGroupCode}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopyGroupCode(projectGroupCode)}
                      className="px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                      title="Copy code"
                    >
                      <Copy size={20} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={fetchProjectGroupCode}
                    className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Generate Group Code
                  </button>
                )}
                {projectGroupCode && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Share code: {projectGroupCode}
                  </p>
                )}
              </div>

              {/* GitHub Invitation */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Github className="text-gray-900" size={20} />
                  <h4 className="font-semibold text-gray-900">GitHub Contributors</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  All GitHub contributors have been automatically invited! View them in the chat room.
                </p>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (selectedProject?.chatRoom) {
                      // Handle both populated object and ID string
                      const chatRoomId = selectedProject.chatRoom._id || selectedProject.chatRoom;
                      if (chatRoomId) {
                        setShowInviteModal(false);
                        setSelectedProject(null);
                        navigate(`/chat/${chatRoomId}`);
                      } else {
                        alert('Chat room not available. Please try again.');
                      }
                    } else {
                      alert('Chat room not available. Please try again.');
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  View Contributors in Chat
                </button>
              </div>

              {/* WhatsApp Invitation */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <MessageCircle className="text-green-600" size={20} />
                  <h4 className="font-semibold text-gray-900">Invite via WhatsApp</h4>
                </div>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={inviteWhatsApp}
                    onChange={(e) => setInviteWhatsApp(e.target.value)}
                    placeholder="Phone number (e.g., 1234567890)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleInviteViaWhatsApp}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Open WhatsApp
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Opens WhatsApp with invitation link ready to send
                </p>
              </div>

              {/* LinkedIn Invitation */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Linkedin className="text-blue-700" size={20} />
                  <h4 className="font-semibold text-gray-900">Invite via LinkedIn</h4>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteLinkedIn}
                    onChange={(e) => setInviteLinkedIn(e.target.value)}
                    placeholder="LinkedIn profile URL or username"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-700 focus:border-transparent"
                  />
                  <button
                    onClick={handleInviteViaLinkedIn}
                    className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800"
                  >
                    Share
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Opens LinkedIn share dialog with invitation
                </p>
              </div>
              </div>
            </div>

            <div className="p-6 pt-4 border-t border-gray-200 flex-shrink-0 flex gap-3">
              <button
                onClick={handleSkipToChat}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
              >
                Open Chat Room
              </button>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setSelectedProject(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Do it Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join via Code Modal */}
      {showJoinCodeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900">Join via Group Code</h3>
              <button
                onClick={() => {
                  setShowJoinCodeModal(false);
                  setJoinCode('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Enter the 6-character group code to join a project or chat room.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group Code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABCDEF"
                className="w-full px-4 py-3 border-2 border-primary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-center text-2xl font-bold font-mono tracking-wider uppercase"
                autoFocus
                maxLength={6}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinViaCode()}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleJoinViaCode}
                disabled={!joinCode.trim() || joiningCode}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {joiningCode ? 'Joining...' : 'Join'}
              </button>
              <button
                onClick={() => {
                  setShowJoinCodeModal(false);
                  setJoinCode('');
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Personal Chatroom Modal */}
      {showPersonalRoomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900">Create Personal Chatroom</h3>
              <button
                onClick={() => {
                  setShowPersonalRoomModal(false);
                  setPersonalRoomName('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Create a personal chatroom without a GitHub repository. Perfect for general discussions!
            </p>
            <form onSubmit={handleCreatePersonalRoom}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chatroom Name
                </label>
                <input
                  type="text"
                  value={personalRoomName}
                  onChange={(e) => setPersonalRoomName(e.target.value)}
                  placeholder="e.g., Team Discussion, General Chat"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  {creatingPersonalRoom ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create Chatroom'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPersonalRoomModal(false);
                    setPersonalRoomName('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Click outside to close menus */}
      {(showRoomMenu || showProjectMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={(e) => {
            // Only close if clicking directly on the backdrop, not on menu items
            if (e.target === e.currentTarget) {
              setShowRoomMenu(null);
              setShowProjectMenu(null);
            }
          }}
        />
      )}
      
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>

      {/* Create Chatroom Modal */}
      {showCreateChatroomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900">Create New Chatroom</h3>
              <button
                onClick={() => {
                  setShowCreateChatroomModal(null);
                  setNewChatroomName('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Chatroom Name
              </label>
              <input
                type="text"
                value={newChatroomName}
                onChange={(e) => setNewChatroomName(e.target.value)}
                placeholder="Enter chatroom name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newChatroomName.trim()) {
                    handleCreateProjectChatroom(showCreateChatroomModal, newChatroomName);
                  }
                }}
                autoFocus
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateChatroomModal(null);
                  setNewChatroomName('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={creatingChatroom}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newChatroomName.trim()) {
                    showNotification('Please enter a chatroom name', 'error');
                    return;
                  }
                  setCreatingChatroom(true);
                  await handleCreateProjectChatroom(showCreateChatroomModal, newChatroomName);
                  setCreatingChatroom(false);
                  setShowCreateChatroomModal(null);
                  setNewChatroomName('');
                }}
                disabled={creatingChatroom || !newChatroomName.trim()}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creatingChatroom ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Chatroom'
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
              setShowAddMemberModal(null);
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
                {showAddMemberModal && (
                  <p className="text-xs text-gray-500 mt-1">Room ID: {showAddMemberModal}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowAddMemberModal(null);
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
                        handleAddMemberToChatroom(showAddMemberModal);
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
                        handleAddMemberToChatroom(showAddMemberModal);
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
                  setShowAddMemberModal(null);
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
                onClick={() => handleAddMemberToChatroom(showAddMemberModal)}
                disabled={addingMember || (addMemberBy === 'username' ? !memberUsername.trim() : !memberEmail.trim())}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {addingMember ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
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
    </div>
  );
}
