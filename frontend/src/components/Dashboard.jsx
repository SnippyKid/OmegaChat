import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { MessageSquare, Plus, LogOut, Github, Mail, Users, Linkedin, MessageCircle, X } from 'lucide-react';

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
    }
  };

  const fetchRepositories = async () => {
    try {
      const response = await axios.get('/api/auth/repositories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRepositories(response.data.repositories || []);
    } catch (error) {
      console.error('Error fetching repositories:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await axios.get('/api/projects/my-projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(response.data.projects);
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    const repoFullName = selectedRepo?.fullName || repoInput;
    if (!repoFullName) {
      alert('Please select or enter a repository');
      return;
    }
    
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
    } catch (error) {
      alert('Failed to create project: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleInviteViaEmail = async () => {
    if (!inviteEmail.trim()) {
      alert('Please enter an email address');
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
      
      alert(`Invitation link copied! Email client opened for ${inviteEmail}`);
      setInviteEmail('');
    } catch (error) {
      alert('Failed to send invitation: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleInviteViaWhatsApp = () => {
    if (!inviteWhatsApp.trim()) {
      alert('Please enter a phone number');
      return;
    }
    const inviteLink = `${window.location.origin}/join/${selectedProject._id}`;
    const message = encodeURIComponent(`Join me on Omega Chat for ${selectedProject.name}! ${inviteLink}`);
    const whatsappUrl = `https://wa.me/${inviteWhatsApp.replace(/[^0-9]/g, '')}?text=${message}`;
    window.open(whatsappUrl, '_blank');
    setInviteWhatsApp('');
  };

  const handleInviteViaLinkedIn = () => {
    if (!inviteLinkedIn.trim()) {
      alert('Please enter a LinkedIn profile URL or username');
      return;
    }
    const inviteLink = `${window.location.origin}/join/${selectedProject._id}`;
    const message = encodeURIComponent(`Join me on Omega Chat for ${selectedProject.name}! ${inviteLink}`);
    // LinkedIn sharing URL
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(inviteLink)}`;
    window.open(linkedInUrl, '_blank');
    setInviteLinkedIn('');
  };

  const handleSkipToChat = () => {
    setShowInviteModal(false);
    setSelectedProject(null);
    navigate(`/chat/${selectedProject.chatRoom}`);
  };

  const openChat = (project) => {
    navigate(`/chat/${project.chatRoom}`);
  };

  const openPersonalRoom = (room) => {
    navigate(`/chat/${room._id}`);
  };

  const handleCreatePersonalRoom = async (e) => {
    e.preventDefault();
    if (!personalRoomName.trim()) {
      alert('Please enter a chat room name');
      return;
    }
    
    try {
      const response = await axios.post('/api/chat/personal/create', 
        { name: personalRoomName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setShowPersonalRoomModal(false);
      setPersonalRoomName('');
      await fetchPersonalRooms();
      
      // Optionally open the new room
      if (response.data.room) {
        openPersonalRoom(response.data.room);
      }
    } catch (error) {
      alert('Failed to create personal chatroom: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Personal Chatrooms Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Personal Chatrooms</h2>
            <button
              onClick={() => setShowPersonalRoomModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
            >
              <Plus size={16} />
              New Chat
            </button>
          </div>
          
          {personalRooms.length === 0 ? (
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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {personalRooms.map((room) => (
                <div
                  key={room._id}
                  onClick={() => openPersonalRoom(room)}
                  className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg shadow hover:shadow-lg transition-all p-6 cursor-pointer border border-purple-200 hover:border-purple-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{room.name}</h3>
                      <p className="text-sm text-purple-600 mt-1 font-medium">Personal Chatroom</p>
                    </div>
                    <MessageSquare size={20} className="text-purple-600 flex-shrink-0" />
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
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between mb-6 mt-8">
          <h2 className="text-2xl font-bold text-gray-900">Your Projects</h2>
        </div>
        
        {projects.length === 0 ? (
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project._id}
                onClick={() => openChat(project)}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-all p-6 cursor-pointer border border-gray-200 hover:border-primary-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{project.githubRepo?.fullName}</p>
                  </div>
                  <Github size={20} className="text-gray-400" />
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
                </div>
              </div>
            ))}
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
            
            {repositories.length > 0 ? (
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
                  disabled={!repoInput.trim()}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Select Project
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
                    placeholder="email@example.com"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleInviteViaEmail}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Send
                  </button>
                </div>
              </div>

              {/* GitHub Invitation */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Github className="text-gray-900" size={20} />
                  <h4 className="font-semibold text-gray-900">GitHub Contributors</h4>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  All GitHub contributors have been automatically invited!
                </p>
                <button
                  onClick={() => navigate(`/chat/${selectedProject.chatRoom}`)}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                >
                  View Contributors
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
                  Create Chatroom
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
    </div>
  );
}
