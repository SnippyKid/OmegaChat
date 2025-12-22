# Ω Omega Chat - Developer Collaboration Platform

A real-time chat application for developers with AI code generation, GitHub integration, and voice messaging.

## Features

- 🚀 **Real-time Chat**: Instant messaging using Socket.io
- 🤖 **AI Code Generation**: Trigger AI code snippets with `@omega` keyword
- 🐙 **GitHub Integration**: OAuth authentication and project-based chat rooms
- 🎤 **Voice Messages**: Record and send voice messages
- 👥 **Team Collaboration**: Join chat rooms based on GitHub repositories
- 📱 **Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS

## Tech Stack

### Backend
- Node.js + Express
- Socket.io (real-time communication)
- MongoDB + Mongoose
- Passport.js (GitHub OAuth)
- Google Gemini API (AI code generation - FREE tier!)

### Frontend
- React 18
- Vite
- Socket.io Client
- Tailwind CSS
- React Router

## Quick Start - Step by Step

### Step 1: Basic Setup (Current Step) ✅
1. Install dependencies: `npm run install-all`
2. Test backend: `cd backend && npm run dev`
3. Test frontend: `cd frontend && npm run dev`
4. Visit http://localhost:5173 and check the server connection

### Getting Your Gemini API Key (FREE!)
📖 **See detailed guide**: [HOW_TO_GET_GEMINI_KEY.md](./HOW_TO_GET_GEMINI_KEY.md)

Quick steps:
1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "+ Create API Key"
4. Copy the key and add to `backend/.env` as `GEMINI_API_KEY=your-key-here`

**Note**: Gemini has a generous FREE tier - perfect for development! 🎉

## Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (local or MongoDB Atlas)
- GitHub OAuth App
- OpenAI API Key

### 1. Clone and Install

```bash
# Install root dependencies
npm install

# Install all dependencies (root, backend, frontend)
npm run install-all
```

### 2. Configure GitHub OAuth

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create a new OAuth App:
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5000/auth/github/callback`
3. Copy Client ID and Client Secret

### 3. Environment Variables

Copy the example environment file and create `backend/.env`:

```bash
# Copy the example file (rename env.example.txt to .env on Windows/Linux)
cp backend/env.example.txt backend/.env
```

Then edit `backend/.env` and fill in your values:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/omega-chat
JWT_SECRET=your-super-secret-jwt-key-change-this
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:5000/auth/github/callback
GEMINI_API_KEY=your-gemini-api-key
FRONTEND_URL=http://localhost:5173
```

### 4. Start MongoDB

```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas connection string in .env
```

### 5. Run the Application

```bash
# Run both backend and frontend concurrently
npm run dev

# Or run separately:
# Backend: npm run server
# Frontend: npm run client
```

### 6. Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

## Usage

1. **Login**: Sign in with your GitHub account
2. **Create Project**: Add a GitHub repository to create a project chat room
3. **Chat**: Send messages, voice messages, or use `@omega` to generate code
4. **Collaborate**: Team members working on the same repo can join automatically

## AI Code Generation

Type `@omega` followed by your code request:
- `@omega create a React component for a button`
- `@omega write a Python function to sort a list`
- `@omega generate a REST API endpoint in Express`

## Project Structure

```
omega-dev-chat/
├── backend/
│   ├── models/          # MongoDB models
│   ├── routes/          # API routes
│   ├── socket/          # Socket.io handlers
│   ├── services/        # Business logic (AI, etc.)
│   ├── middleware/      # Auth middleware
│   └── server.js        # Main server file
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── context/     # React context (Auth)
│   │   └── App.jsx
│   └── vite.config.js
└── package.json
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/auth/github` - GitHub OAuth
- `GET /api/auth/me` - Get current user
- `GET /api/projects/my-projects` - Get user projects
- `POST /api/projects/create` - Create project from repo
- `GET /api/chat/room/:roomId/messages` - Get messages
- `GET /api/chat/room/:roomId` - Get room details

## Socket Events

### Client → Server
- `join_room` - Join a chat room
- `send_message` - Send text message
- `ai_generate_code` - Request AI code generation
- `send_voice_message` - Send voice message
- `typing` - Typing indicator

### Server → Client
- `new_message` - New message received
- `ai_code_generated` - AI code response
- `user_typing` - User typing indicator
- `ai_typing` - AI is generating

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
