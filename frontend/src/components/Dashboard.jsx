import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
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

  // Show notification helper
  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Debug: log projects when they change (can be removed later)
  useEffect(() => {
    console.debug('Projects loaded:', projects);
  }, [projects]);

  useEffect(() => {
    fetchProjects();
    fetchRepositories();
    fetchPersonalRooms();
  }, [token]);

  const fetchPersonalRooms = async () => {
    try {
      const response = await axios.get('/api/chat/my-chatrooms', {
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
      const response = await axios.get('/api/auth/repositories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRepositories(response.data.repositories || []);
    } catch (error) {
      console.error('Error fetching repositories:', error);
      showNotification('Failed to load repositories', 'error');
    } finally {
      setFetchingRepos(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await axios.get('/api/projects/my-projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
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
      const response = await axios.post('/api/projects/create', 
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
      const response = await axios.post(`/api/projects/${selectedProject._id}/invite/email`, 
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

  const openChat = (project) => {
    // Handle both populated object and ID string
    const chatRoomId = project.chatRoom?._id || project.chatRoom;
    if (chatRoomId) {
      navigate(`/chat/${chatRoomId}`);
    } else {
      showNotification('Chat room not available for this project. Please try again or recreate the project.', 'error');
    }
  };

  const openPersonalRoom = (room) => {
    navigate(`/chat/${room._id}`);
  };

  const handleDeletePersonalRoom = async (roomId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this chatroom? This action cannot be undone.')) {
      return;
    }
    
    setDeletingRoom(roomId);
    try {
      await axios.delete(`/api/chat/room/${roomId}`, {
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
      await axios.post(`/api/chat/room/${roomId}/leave`, {}, {
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
      await axios.patch(`/api/chat/room/${roomId}`, 
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
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this project? This will also delete the associated chatroom. This action cannot be undone.')) {
      return;
    }
    
    setDeletingProject(projectId);
    try {
      await axios.delete(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showNotification('Project deleted successfully', 'success');
      await fetchProjects();
    } catch (error) {
      showNotification('Failed to delete project: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setDeletingProject(null);
      setShowProjectMenu(null);
    }
  };

  const handleLeaveProject = async (projectId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to leave this project?')) {
      return;
    }
    
    setLeavingProject(projectId);
    try {
      await axios.post(`/api/projects/${projectId}/leave`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      showNotification('Left project successfully', 'success');
      await fetchProjects();
    } catch (error) {
      showNotification('Failed to leave project: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLeavingProject(null);
      setShowProjectMenu(null);
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
      const response = await axios.post('/api/chat/personal/create', 
        { name: personalRoomName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setShowPersonalRoomModal(false);
      setPersonalRoomName('');
      await fetchPersonalRooms();
      showNotification('Personal chatroom created successfully!', 'success');
      
      // Optionally open the new room
      if (response.data.room) {
        setTimeout(() => openPersonalRoom(response.data.room), 500);
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
      const response = await axios.get(`/api/projects/${selectedProject._id}/group-code`, {
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
    try {
      // Try joining as project first
      try {
        const response = await axios.post(`/api/projects/join-code/${joinCode.trim().toUpperCase()}`, {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.data.success) {
          showNotification('Successfully joined project!', 'success');
          setShowJoinCodeModal(false);
          setJoinCode('');
          await fetchProjects();
          if (response.data.chatRoomId) {
            setTimeout(() => navigate(`/chat/${response.data.chatRoomId}`), 500);
          }
          return;
        }
      } catch (projectError) {
        // If project join fails, try chatroom join
        const response = await axios.post(`/api/chat/join-code/${joinCode.trim().toUpperCase()}`, {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (response.data.success) {
          showNotification('Successfully joined chat room!', 'success');
          setShowJoinCodeModal(false);
          setJoinCode('');
          await fetchPersonalRooms();
          if (response.data.room?._id) {
            setTimeout(() => navigate(`/chat/${response.data.room._id}`), 500);
          }
          return;
        }
      }
      // If both fail
      throw new Error('Invalid group code');
    } catch (error) {
      showNotification('Failed to join: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setJoiningCode(false);
    }
  };

  useEffect(() => {
    if (showInviteModal && selectedProject?._id && !projectGroupCode) {
      fetchProjectGroupCode();
    }
  }, [showInviteModal, selectedProject?._id]);

  // Filter projects and rooms based on search query
  const filteredProjects = projects.filter(project => 
    project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.githubRepo?.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPersonalRooms = personalRooms.filter(room =>
    room.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
                Ω
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Omega Chat</h1>
                <p className="text-sm text-gray-500">{user?.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={() => setShowJoinCodeModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Key size={20} />
                Join via Code
              </button>
              <button
                onClick={() => setShowPersonalRoomModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <MessageSquare size={20} />
                Personal Chat
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Plus size={20} />
                New Project
              </button>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
          notification.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        } animate-slide-in`}>
          {notification.type === 'success' ? (
            <CheckCircle2 size={20} />
          ) : (
            <AlertCircle size={20} />
          )}
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 hover:opacity-80"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects and chatrooms..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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

        {/* Personal Chatrooms Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              Personal Chatrooms
              {searchQuery && <span className="text-sm font-normal text-gray-500 ml-2">({filteredPersonalRooms.length})</span>}
            </h2>
            <button
              onClick={() => setShowPersonalRoomModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
            >
              <Plus size={16} />
              New Chat
            </button>
          </div>
          
          {filteredPersonalRooms.length === 0 && !searchQuery ? (
            <div className="text-center py-12 bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg shadow border border-purple-200">
              <MessageSquare className="mx-auto h-12 w-12 text-purple-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No personal chatrooms yet</h3>
              <p className="mt-2 text-gray-600">Create a personal chatroom for general discussions</p>
              <button
                onClick={() => setShowPersonalRoomModal(true)}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Create Personal Chatroom
              </button>
            </div>
          ) : filteredPersonalRooms.length === 0 && searchQuery ? (
            <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200">
              <Search className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No chatrooms found</h3>
              <p className="mt-2 text-gray-500">Try adjusting your search query</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPersonalRooms.map((room) => (
                <div
                  key={room._id}
                  className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg shadow hover:shadow-lg transition-all p-6 border border-purple-200 hover:border-purple-300 relative group"
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
                              className="flex-1 px-2 py-1 border border-purple-300 rounded text-sm font-semibold"
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
                        <p className="text-sm text-purple-600 mt-1 font-medium">Personal Chatroom</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <MessageSquare size={20} className="text-purple-600 flex-shrink-0" />
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowRoomMenu(showRoomMenu === room._id ? null : room._id);
                            }}
                            className="p-1 hover:bg-purple-100 rounded transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <MoreVertical size={18} className="text-gray-600" />
                          </button>
                          {showRoomMenu === room._id && (
                            <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[160px]">
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
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <Users size={16} />
                      <span>
                        {room.members && room.members.length > 0 
                          ? `${room.members.length} member${room.members.length !== 1 ? 's' : ''}` 
                          : '0 members'}
                      </span>
                    </div>
                    {room.lastMessage && (
                      <p className="text-xs text-gray-500">
                        Last active: {new Date(room.lastMessage).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between mb-6 mt-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Your Projects
            {searchQuery && <span className="text-sm font-normal text-gray-500 ml-2">({filteredProjects.length})</span>}
          </h2>
        </div>
        
        {filteredProjects.length === 0 && !searchQuery ? (
          <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200">
            <Github className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No projects yet</h3>
            <p className="mt-2 text-gray-500">Create a project from your GitHub repository to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
            >
              Create Project
            </button>
          </div>
        ) : filteredProjects.length === 0 && searchQuery ? (
          <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200">
            <Search className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No projects found</h3>
            <p className="mt-2 text-gray-500">Try adjusting your search query</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => {
              const isOwner = project.members?.some(m => m.user?._id === user?._id && m.role === 'owner') || 
                             project.members?.some(m => m.user === user?._id && m.role === 'owner');
              return (
                <div
                  key={project._id}
                  className={`bg-white rounded-lg shadow hover:shadow-lg transition-all p-6 border border-gray-200 relative group ${
                    (project?.chatRoom?._id || project?.chatRoom) ? 'cursor-pointer hover:border-primary-300' : 'cursor-not-allowed opacity-80'
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
                        <Github size={20} className="text-gray-400" />
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowProjectMenu(showProjectMenu === project._id ? null : project._id);
                            }}
                            className="p-1 hover:bg-gray-100 rounded transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <MoreVertical size={18} className="text-gray-600" />
                          </button>
                          {showProjectMenu === project._id && (
                            <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[160px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const chatRoomId = project?.chatRoom?._id || project?.chatRoom;
                                  if (chatRoomId) {
                                    openChat(project);
                                  }
                                  setShowProjectMenu(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Eye size={16} />
                                Open Chat
                              </button>
                              {!isOwner && (
                                <button
                                  onClick={(e) => handleLeaveProject(project._id, e)}
                                  disabled={leavingProject === project._id}
                                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
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
                                <button
                                  onClick={(e) => handleDeleteProject(project._id, e)}
                                  disabled={deletingProject === project._id}
                                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                                >
                                  {deletingProject === project._id ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={16} />
                                  )}
                                  Delete Project
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {project.description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <MessageSquare size={16} />
                      <span>
                        {project.members && project.members.length > 0 
                          ? `${project.members.length} member${project.members.length !== 1 ? 's' : ''}` 
                          : '0 members'}
                      </span>
                      {isOwner && (
                        <span className="ml-2 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">Owner</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-2">Select a Project You Want to Work On</h3>
            <p className="text-sm text-gray-600 mb-6">
              Choose a GitHub repository. All contributors will be automatically invited to the chatroom.
            </p>
            
            {fetchingRepos ? (
              <div className="mb-4 flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
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
                    className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                      selectedRepo?.fullName === repo.fullName ? 'bg-primary-50 border-primary-200' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{repo.name}</p>
                        <p className="text-sm text-gray-500">{repo.fullName}</p>
                      </div>
                      {selectedRepo?.fullName === repo.fullName && (
                        <span className="text-primary-600">✓</span>
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
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-6 pb-4 flex-shrink-0">
              <h3 className="text-2xl font-bold mb-2">Add Team Members</h3>
              <p className="text-sm text-gray-600">
                Invite collaborators to join <span className="font-semibold">{selectedProject.name}</span>
              </p>
            </div>

            <div className="px-6 pb-6 overflow-y-auto flex-1">
              <div className="space-y-4">
              {/* Current Contributors */}
              {selectedProject?.members && selectedProject.members.length > 0 && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center gap-3 mb-3">
                    <Users className="text-primary-600" size={20} />
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
                  <Key className="text-primary-600" size={20} />
                  <h4 className="font-semibold text-gray-900">Group Code</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Share this code with anyone to let them join instantly!
                </p>
                {projectGroupCode ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-3 bg-white border-2 border-primary-300 rounded-lg text-center">
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
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
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowRoomMenu(null);
            setShowProjectMenu(null);
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
    </div>
  );
}
