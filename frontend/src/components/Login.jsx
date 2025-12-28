import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check for error in URL params
    const errorParam = searchParams.get('error');
    const errorDetails = searchParams.get('details');
    
    if (errorParam === 'auth_failed') {
      setError('Authentication failed. Please try again.');
    } else if (errorParam === 'oauth_not_configured') {
      setError('GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the backend .env file.');
    } else if (errorParam === 'oauth_strategy_failed') {
      setError('GitHub OAuth strategy failed to initialize. Please check your backend configuration.');
    } else if (errorParam === 'oauth_failed') {
      let errorMsg = 'GitHub OAuth authentication failed. ';
      if (errorDetails) {
        if (errorDetails === 'no_user') {
          errorMsg += 'No user was returned from GitHub.';
        } else if (errorDetails.includes('Database not connected') || errorDetails.includes('buffering timed out')) {
          errorMsg += 'MongoDB is not connected. Please ensure MongoDB is running and check your MONGODB_URI in backend/.env file.';
        } else {
          errorMsg += decodeURIComponent(errorDetails);
        }
      } else {
        errorMsg += 'Please check that your GitHub OAuth app callback URL matches: http://localhost:5000/api/auth/github/callback';
      }
      setError(errorMsg);
    }
    
    // Check if API URL is configured on mount
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl && !errorParam) {
      setError('Backend API URL is not configured. Please set VITE_API_URL environment variable in Vercel settings.');
      // VITE_API_URL check - only log in development
      if (import.meta.env.DEV) {
        console.error('VITE_API_URL is not set in environment variables.');
      }
    }
  }, [searchParams]);

  const handleGitHubLogin = () => {
    setError(null);
    // Get API URL from environment
    const apiUrl = import.meta.env.VITE_API_URL;
    
    // Check if API URL is configured
    if (!apiUrl) {
      setError('Backend API URL is not configured. Please set VITE_API_URL environment variable in Vercel.');
      // VITE_API_URL check - only log in development
      if (import.meta.env.DEV) {
        console.error('VITE_API_URL is not set. Cannot redirect to GitHub OAuth.');
      }
      return;
    }
    
    // Ensure API URL doesn't end with a slash to avoid double slashes
    const cleanApiUrl = apiUrl.replace(/\/$/, '');
    // Redirect to GitHub OAuth
    window.location.href = `${cleanApiUrl}/api/auth/github`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-900 mb-2">Ω Omega Chat</h1>
          <p className="text-gray-600">Developer collaboration with AI</p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          <button
            onClick={handleGitHubLogin}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Sign in with GitHub
          </button>
        </div>
        
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Connect your GitHub account to join project chats</p>
        </div>
      </div>
    </div>
  );
}
