import { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../config/axios';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setTokenState(storedToken);
      fetchUser(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async (authToken) => {
    try {
      const response = await apiClient.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 2000 // 2 second timeout - fail fast
      });
      
      if (response.data && response.data.user) {
        setUser(response.data.user);
        setTokenState(authToken);
      } else {
        throw new Error('Invalid user data received');
      }
    } catch (error) {
      // Clear invalid token on any error
      localStorage.removeItem('token');
      setTokenState(null);
      setUser(null);
    } finally {
      // Always stop loading - no retries, no waiting
      setLoading(false);
    }
  };

  const setToken = (newToken) => {
    setTokenState(newToken);
    if (newToken) {
      localStorage.setItem('token', newToken);
      fetchUser(newToken);
    } else {
      localStorage.removeItem('token');
      setUser(null);
    }
  };

  const logout = () => {
    setToken(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, setToken, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
