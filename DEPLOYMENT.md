# 🚀 Free Hosting Guide - Omega Chat

Complete step-by-step guide to host Omega Chat for FREE!

## 📋 Hosting Architecture

- **Frontend**: Vercel (Free) - Best for React apps
- **Backend**: Render (Free) - Supports Node.js + Socket.io
- **Database**: MongoDB Atlas (Free tier - 512MB)
- **File Storage**: Local (Render) or Cloudinary (Free tier)

---

## 🎯 Step-by-Step Deployment

### Part 1: Prepare Your Code

#### 1.1 Update GitHub OAuth App (IMPORTANT!)

1. Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
2. Edit your existing OAuth App (or create new)
3. Update these URLs:
   - **Homepage URL**: `https://your-app-name.vercel.app` (we'll get this after deployment)
   - **Authorization callback URL**: `https://your-backend.onrender.com/api/auth/github/callback`
4. Save and copy your **Client ID** and **Client Secret**

---

### Part 2: Deploy Backend to Render (FREE)

#### 2.1 Create Render Account
1. Go to [https://render.com](https://render.com)
2. Sign up with GitHub (easiest)
3. Connect your GitHub account

#### 2.2 Create Web Service
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Select the repository containing Omega Chat
4. Configure:
   - **Name**: `omega-chat-backend` (or any name)
   - **Region**: Choose closest to you
   - **Branch**: `main` (or your main branch)
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: **Free** (512MB RAM, spins down after 15min inactivity)

#### 2.3 Set Environment Variables in Render
Click **"Environment"** tab and add:

```env
NODE_ENV=production
PORT=10000
MONGODB_URI=your-mongodb-atlas-connection-string
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=https://your-backend.onrender.com/api/auth/github/callback
GEMINI_API_KEY=your-gemini-api-key
FRONTEND_URL=https://your-app-name.vercel.app
```

**Important Notes:**
- Replace `your-backend.onrender.com` with your actual Render URL
- Replace `your-app-name.vercel.app` with your actual Vercel URL (after frontend deployment)
- Render will give you a URL like: `https://omega-chat-backend-xxxx.onrender.com`

#### 2.4 Deploy
1. Click **"Create Web Service"**
2. Wait for deployment (5-10 minutes first time)
3. Copy your backend URL (e.g., `https://omega-chat-backend-xxxx.onrender.com`)

---

### Part 3: Deploy Frontend to Vercel (FREE)

#### 3.1 Create Vercel Account
1. Go to [https://vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Import your GitHub repository

#### 3.2 Configure Project
1. **Framework Preset**: Vite
2. **Root Directory**: `frontend`
3. **Build Command**: `npm run build`
4. **Output Directory**: `dist`
5. **Install Command**: `npm install`

#### 3.3 Set Environment Variables in Vercel
Go to **Settings → Environment Variables** and add:

```env
VITE_API_URL=https://your-backend.onrender.com
VITE_SOCKET_URL=https://your-backend.onrender.com
```

Replace `your-backend.onrender.com` with your actual Render backend URL.

#### 3.4 Deploy
1. Click **"Deploy"**
2. Wait for build (2-3 minutes)
3. Copy your frontend URL (e.g., `https://omega-chat-xxxx.vercel.app`)

#### 3.5 Update GitHub OAuth App
1. Go back to GitHub OAuth App settings
2. Update **Homepage URL** to your Vercel URL
3. Update **Authorization callback URL** to: `https://your-backend.onrender.com/api/auth/github/callback`

#### 3.6 Update Render Environment Variables
1. Go back to Render dashboard
2. Update `FRONTEND_URL` to your Vercel URL
3. Redeploy backend (Render will auto-redeploy)

---

### Part 4: Setup MongoDB Atlas (FREE)

#### 4.1 Create Account
1. Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for free
3. Create a free cluster (M0 - Free tier)

#### 4.2 Configure Database
1. **Create Database User**:
   - Database Access → Add New Database User
   - Username: `omega-chat-user` (or any)
   - Password: Generate secure password (save it!)
   - Database User Privileges: Read and write to any database

2. **Network Access**:
   - Network Access → Add IP Address
   - Click **"Allow Access from Anywhere"** (0.0.0.0/0)
   - Or add Render's IP ranges (check Render docs)

3. **Get Connection String**:
   - Clusters → Connect → Connect your application
   - Copy connection string
   - Replace `<password>` with your database user password
   - Replace `<dbname>` with `omega-chat`
   - Example: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/omega-chat?retryWrites=true&w=majority`

#### 4.3 Add to Render
Add the connection string to Render environment variables as `MONGODB_URI`

---

### Part 5: Final Configuration

#### 5.1 Update All URLs
1. **GitHub OAuth App**:
   - Homepage: `https://your-app.vercel.app`
   - Callback: `https://your-backend.onrender.com/api/auth/github/callback`

2. **Render Environment Variables**:
   - `FRONTEND_URL`: `https://your-app.vercel.app`
   - `GITHUB_CALLBACK_URL`: `https://your-backend.onrender.com/api/auth/github/callback`

3. **Vercel Environment Variables**:
   - `VITE_API_URL`: `https://your-backend.onrender.com`
   - `VITE_SOCKET_URL`: `https://your-backend.onrender.com`

#### 5.2 Redeploy
1. Trigger redeploy in Vercel (Settings → Deployments → Redeploy)
2. Render should auto-redeploy when env vars change

---

## 🔧 Production Modifications Made

### Backend Changes:
- ✅ CORS configured for production URLs
- ✅ Environment-based configuration
- ✅ Production-ready error handling
- ✅ File uploads directory handling

### Frontend Changes:
- ✅ Environment variables for API URLs
- ✅ Socket.io connection using environment variables
- ✅ Production build configuration

---

## ⚠️ Important Notes

### Render Free Tier Limitations:
- **Spins down after 15 minutes of inactivity** - First request after spin-down takes ~30 seconds
- **512MB RAM** - Should be enough for this app
- **750 hours/month** - More than enough for free tier

### Vercel Free Tier:
- **Unlimited deployments**
- **100GB bandwidth/month**
- **Automatic HTTPS**

### MongoDB Atlas Free Tier:
- **512MB storage** - Enough for development/small teams
- **Shared cluster** - May have occasional slowdowns

---

## 🐛 Troubleshooting

### Backend not connecting?
- Check Render logs: Dashboard → Your Service → Logs
- Verify MongoDB connection string
- Check environment variables are set correctly

### Frontend can't reach backend?
- Verify `VITE_API_URL` in Vercel matches Render URL
- Check CORS settings in backend
- Check browser console for errors

### GitHub OAuth not working?
- Verify callback URL matches exactly
- Check GitHub OAuth app settings
- Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in Render

### Socket.io not working?
- Check `VITE_SOCKET_URL` in Vercel
- Verify backend is running (Render free tier spins down)
- Check browser console for WebSocket errors

---

## 📝 Quick Checklist

- [ ] MongoDB Atlas cluster created and configured
- [ ] Render backend deployed with all environment variables
- [ ] Vercel frontend deployed with environment variables
- [ ] GitHub OAuth app URLs updated
- [ ] All environment variables match actual URLs
- [ ] Test login with GitHub
- [ ] Test creating a project
- [ ] Test sending messages
- [ ] Test Socket.io real-time features

---

## 🎉 You're Live!

Your app should now be accessible at:
- **Frontend**: `https://your-app.vercel.app`
- **Backend API**: `https://your-backend.onrender.com/api/health`

Share your app URL with others! 🚀

