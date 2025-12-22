import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
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
  
  useEffect(() => {
    if (loading) return;
    
    if (user && token) {
      // User is logged in, redirect to project chat
      axios.get(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(response => {
        navigate(`/chat/${response.data.project.chatRoom}`);
      })
      .catch(() => {
        navigate('/');
      });
    } else {
      // User not logged in, redirect to login with return URL
      navigate(`/login?redirect=/join/${projectId}`);
    }
  }, [user, token, loading, projectId, navigate]);
  
  return <div className="flex items-center justify-center h-screen">Joining project...</div>;
}

export default App;
