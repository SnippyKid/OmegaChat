# Ω Omega Chat - Developer Collaboration Platform

A real-time chat application for developers with AI code generation, GitHub integration, and voice messaging.

## Features

- 🚀 **Real-time Chat**: Instant messaging using Socket.io with real-time updates
- 🤖 **AI Code Generation**: Trigger AI code snippets with `@omega` keyword and commit directly to GitHub
- 🐙 **GitHub Integration**: OAuth authentication, project-based chat rooms, and repository stats
- 🎤 **Voice Messages**: Record and send voice messages
- 👥 **Team Collaboration**: Multiple chatrooms per project, add members, join via code
- 📱 **Modern UI**: Beautiful purple/lavender themed interface built with React and Tailwind CSS
- 🔗 **Join via Code**: Share group codes to invite members to chatrooms
- 👤 **Member Management**: Add members by username/email, real-time member updates
- 📊 **GitHub Stats**: Display user GitHub statistics (followers, repos, stars, languages)
- 💬 **Personal Chatrooms**: Create personal chatrooms separate from projects
- 📎 **File Sharing**: Upload and share images and files
- ✨ **Message Features**: Edit, delete, reply, pin messages, reactions, search
- 🔔 **Real-time Updates**: Automatic member list updates when users join/leave

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

## 🚀 Quick Start - Easiest Way!

### One-Time Setup (Only needed once)
```bash
npm run install-all
```

### Running the Project (After first setup)

**Windows (Easiest):**
```bash
# Double-click start.bat or run:
start.bat

# Or use PowerShell:
.\start.ps1
```

**Mac/Linux:**
```bash
chmod +x start.sh
./start.sh
```

**Or use npm:**
```bash
npm run dev
```

**Smart Auto-Install:**
```bash
npm run quick-start
```

> **Note**: After the first installation, dependencies are cached. The scripts will automatically check and only install if missing - no more annoying reinstalls! 🎉

### Step 1: Basic Setup (First Time Only) ✅
1. Install dependencies: `npm run install-all` (one time only!)
2. Run: `npm run dev` or use `start.bat` / `start.sh`
3. Visit http://localhost:5173

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
- Google Gemini API Key (FREE tier available!)

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
   - **Application name**: Omega Chat (or any name)
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:5000/api/auth/github/callback` ⚠️ **IMPORTANT: Must include `/api`**
3. Copy **Client ID** and **Client Secret**
4. Add them to your `backend/.env` file

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
GITHUB_CALLBACK_URL=http://localhost:5000/api/auth/github/callback
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

**Easiest Method (Recommended):**
```bash
# Windows
start.bat

# Mac/Linux
./start.sh

# Or use npm
npm run dev
```

**Manual Method:**
```bash
# Run both backend and frontend concurrently
npm run dev

# Or run separately:
# Backend: npm run server
# Frontend: npm run client
```

> 💡 **Pro Tip**: After the first `npm run install-all`, you never need to install again! Just run `npm run dev` or use the start scripts.

### 6. Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000

## Usage

1. **Login**: Sign in with your GitHub account
2. **Create Project**: Add a GitHub repository to create a project with chatrooms
3. **Create Chatrooms**: Create multiple chatrooms per project for different topics
4. **Add Members**: Add members to chatrooms by username or email
5. **Share & Join**: Share group codes or invite links to let others join
6. **Chat**: Send messages, voice messages, or use `@omega` to generate code
7. **AI Code Commits**: Review and commit AI-generated code directly to GitHub repositories
8. **Collaborate**: Team members working on the same repo can join automatically

## AI Code Generation

Type `@omega` followed by your code request:
- `@omega create a React component for a button`
- `@omega write a Python function to sort a list`
- `@omega generate a REST API endpoint in Express`

**AI Code Commit Feature**: After AI generates code, you can review it and commit it directly to your GitHub repository with a single click! (Available in project chatrooms only)

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

### Authentication
- `GET /api/health` - Health check
- `GET /api/auth/github` - GitHub OAuth
- `GET /api/auth/me` - Get current user
- `GET /api/auth/github-stats` - Get GitHub user statistics

### Projects
- `GET /api/projects/my-projects` - Get user projects
- `POST /api/projects/create` - Create project from repo
- `POST /api/projects/:projectId/chatrooms/create` - Create additional chatroom
- `POST /api/projects/:projectId/leave` - Leave project
- `GET /api/projects/:projectId/group-code` - Get project group code

### Chatrooms
- `GET /api/chat/room/:roomId` - Get room details
- `GET /api/chat/room/:roomId/messages` - Get messages (with pagination)
- `POST /api/chat/:roomId/members/add` - Add member to chatroom
- `POST /api/chat/room/:roomId/leave` - Leave chatroom
- `GET /api/chat/room/:roomId/group-code` - Get/share group code
- `POST /api/chat/join-code/:groupCode` - Join chatroom via code
- `POST /api/chat/personal/create` - Create personal chatroom
- `GET /api/chat/my-chatrooms` - Get user's chatrooms
- `POST /api/chat/room/:roomId/commit-file` - Commit AI-generated code to GitHub

## Socket Events

### Client → Server
- `join_room` - Join a chat room
- `leave_room` - Leave a chat room
- `send_message` - Send text message
- `ai_generate_code` - Request AI code generation
- `send_voice_message` - Send voice message
- `typing` - Typing indicator

### Server → Client
- `new_message` - New message received
- `ai_code_generated` - AI code response
- `user_typing` - User typing indicator
- `ai_typing` - AI is generating
- `user_joined` - User joined the room
- `user_left` - User left the room
- `member_added` - New member added to chatroom
- `member_left` - Member left the chatroom
- `chaiwala_welcome` - Welcome message from ChaiWala bot
- `room_joined` - Successfully joined room confirmation

## Checking API Health

### Quick Methods:

**1. Browser (Easiest):**
- Open: http://localhost:5000/api/health
- You should see JSON with API and database status

**2. PowerShell (Windows):**
```powershell
# Run from project root:
.\check-health.ps1

# Or manually:
Invoke-RestMethod -Uri "http://localhost:5000/api/health"
```

**3. Command Line (Mac/Linux):**
```bash
# Run from project root:
chmod +x check-health.sh
./check-health.sh

# Or manually:
curl http://localhost:5000/api/health
```

**4. Using curl (Any OS):**
```bash
curl http://localhost:5000/api/health
```

### Expected Response:

**✅ Healthy (MongoDB Connected):**
```json
{
  "status": "ok",
  "message": "Omega Chat API is running!",
  "database": {
    "status": "connected",
    "connected": true,
    "readyState": 1
  }
}
```

**⚠️ Degraded (MongoDB Not Connected):**
```json
{
  "status": "degraded",
  "message": "API is running but MongoDB is not connected",
  "database": {
    "status": "disconnected",
    "connected": false,
    "readyState": 0
  }
}
```

**❌ Error:**
- If you get connection refused, the backend server is not running
- Start it with: `npm run dev` or `start.bat`

## Troubleshooting

### MongoDB Connection Timeout / "buffering timed out" Error

If you see errors like `Operation users.findOne() buffering timed out after 10000ms`:

1. **Check if MongoDB is running**:
   ```bash
   # Windows (if installed as service)
   # Check Services app or run:
   net start MongoDB
   
   # Mac/Linux
   sudo systemctl status mongod
   # Or start with:
   mongod
   ```

2. **Check your MongoDB URI in `backend/.env`**:
   ```env
   # Local MongoDB
   MONGODB_URI=mongodb://localhost:27017/omega-chat
   
   # MongoDB Atlas (cloud)
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/omega-chat
   ```

3. **Verify MongoDB connection**:
   - Visit: http://localhost:5000/api/health
   - Check the `database.connected` field
   - Should be `true` if connected

4. **Common issues**:
   - MongoDB not installed or not running
   - Wrong port (default is 27017)
   - Firewall blocking connection
   - MongoDB Atlas: IP whitelist or credentials incorrect

### GitHub OAuth "Failed to obtain access token" Error

This error usually means the callback URL doesn't match. Check:

1. **GitHub OAuth App Settings**:
   - Go to GitHub Settings > Developer settings > OAuth Apps
   - Check that the **Authorization callback URL** is exactly: `http://localhost:5000/api/auth/github/callback`
   - ⚠️ Must include `/api` in the path!

2. **Backend `.env` file**:
   - Ensure `GITHUB_CALLBACK_URL=http://localhost:5000/api/auth/github/callback`
   - Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are correct
   - No extra spaces or quotes around the values

3. **Restart the backend server** after changing `.env` file

4. **Check backend logs** - they will show the callback URL being used

### Backend Server Not Running

- Make sure MongoDB is running (if using local MongoDB)
- Check that port 5000 is not already in use
- Run `npm run dev` from the root directory

### Frontend Can't Connect to Backend

- Verify backend is running on port 5000
- Check browser console for CORS errors
- Ensure `FRONTEND_URL` in `.env` matches your frontend URL

## 🚀 Deployment & Hosting

For complete step-by-step instructions to host this application for FREE, see [DEPLOYMENT.md](./DEPLOYMENT.md)

### Quick Deployment Options:
- **Frontend**: Vercel (Free) - Best for React/Vite apps
- **Backend**: Render (Free) - Supports Node.js + Socket.io
- **Database**: MongoDB Atlas (Free tier - 512MB)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
