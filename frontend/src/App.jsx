import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import apiClient from './config/axios';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ChatRoom from './components/ChatRoom';
import { AuthProvider, useAuth } from './context/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/join/:projectId" element={<JoinProject />} />
          <Route path="/join-code/:groupCode" element={<JoinViaCode />} />
          <Route path="/join-chatroom/:groupCode" element={<JoinViaCode />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/chat/:roomId" element={<ProtectedRoute><ChatRoom /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  return children;
}

function AuthCallback() {
  const { setToken } = useAuth();
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('token', token);
      setToken(token);
      window.location.href = '/';
    }
  }, [setToken]);
  
  return <div className="flex items-center justify-center h-screen">Authenticating...</div>;
}

function JoinProject() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, token, loading } = useAuth();
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (loading) return;
    
    if (!projectId) {
      setError('Invalid project ID');
      setTimeout(() => navigate('/'), 2000);
      return;
    }
    
    if (user && token) {
      // User is logged in, get project and redirect to chat
      apiClient.get(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(response => {
        const chatRoomId = response.data.project?.chatRoom?._id || 
                          response.data.project?.chatRoom;
        if (chatRoomId) {
          navigate(`/chat/${chatRoomId}`);
        } else {
          setError('Project has no chat room');
          setTimeout(() => navigate('/'), 2000);
        }
      })
      .catch(err => {
        const errorMsg = err.response?.data?.error || 
                        err.message || 
                        'Project not found or access denied';
        setError(errorMsg);
        console.error('Join project error:', err);
        setTimeout(() => navigate('/'), 3000);
      });
    } else {
      // User not logged in, redirect to login with return URL
      navigate(`/login?redirect=/join/${projectId}`);
    }
  }, [user, token, loading, projectId, navigate]);
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-red-600 text-xl font-semibold mb-2">❌ Error</div>
          <div className="text-gray-700 mb-4">{error}</div>
          <div className="text-gray-500 text-sm">Redirecting to dashboard...</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
        <div className="text-gray-700">Joining project...</div>
      </div>
    </div>
  );
}

function JoinViaCode() {
  const { groupCode } = useParams();
  const navigate = useNavigate();
  const { user, token, loading } = useAuth();
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (loading) return;
    
    if (!groupCode || !groupCode.trim()) {
      setError('Invalid group code');
      setTimeout(() => navigate('/'), 2000);
      return;
    }
    
    if (user && token) {
      const normalizedCode = groupCode.trim().toUpperCase();
      
      // Try joining as project first
      apiClient.post(`/api/projects/join-code/${normalizedCode}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(response => {
        if (response.data.success) {
          const chatRoomId = response.data.chatRoomId || response.data.project?.chatRoom?._id || response.data.project?.chatRoom;
          if (chatRoomId) {
            navigate(`/chat/${chatRoomId}`);
          } else {
            // Joined project but no chat room, go to dashboard
            navigate('/');
          }
        } else {
          throw new Error(response.data.error || 'Failed to join project');
        }
      })
      .catch(projectError => {
        // If project join fails, try chatroom join
        apiClient.post(`/api/chat/join-code/${normalizedCode}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then(response => {
          if (response.data.success) {
            const roomId = response.data.room?._id || response.data.room;
            if (roomId) {
              navigate(`/chat/${roomId}`);
            } else {
              navigate('/');
            }
          } else {
            throw new Error(response.data.error || 'Failed to join chat room');
          }
        })
        .catch(chatError => {
          const errorMsg = chatError.response?.data?.error || 
                          projectError.response?.data?.error || 
                          chatError.message || 
                          'Failed to join. Invalid group code.';
          setError(errorMsg);
          console.error('Join error:', { projectError, chatError });
          setTimeout(() => navigate('/'), 3000);
        });
      });
    } else {
      // User not logged in, redirect to login with return URL
      navigate(`/login?redirect=/join-code/${groupCode}`);
    }
  }, [user, token, loading, groupCode, navigate]);
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-red-600 text-xl font-semibold mb-2">❌ Error</div>
          <div className="text-gray-700 mb-4">{error}</div>
          <div className="text-gray-500 text-sm">Redirecting to dashboard...</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
        <div className="text-gray-700">Joining via code...</div>
      </div>
    </div>
  );
}

export default App;
