# 🪟 Windows Quick Start Guide

## 🚀 Super Easy Way to Run (No More Annoying Installs!)

### First Time Only (One-Time Setup)
```bash
npm run install-all
```

### Every Other Time - Just Run:

**Option 1: Double-click `start.bat`** in Windows Explorer (Easiest!)

**Option 2: In Command Prompt (CMD):**
```bash
start.bat
```

**Option 3: In PowerShell:**
```powershell
.\start.bat
```

That's it! The script will:
- ✅ Automatically free ports 5000 and 5173 if they're busy
- ✅ Check if dependencies are installed (no reinstall needed!)
- ✅ Start both servers automatically

## 📋 What `start.bat` Does

1. **Kills processes** on ports 5000 and 5173 (fixes "port in use" errors)
2. **Checks dependencies** - only installs if missing
3. **Starts servers** - backend (port 5000) and frontend (port 5173)

## 🔧 Troubleshooting

### Port Already in Use?
Run `kill-ports.bat` first, then `start.bat`

### Need to Reinstall?
```bash
npm run install-all
```

### Still Having Issues?
1. Close all terminal windows
2. Run `kill-ports.bat`
3. Run `start.bat`

## 📍 Server URLs

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:5000

## 💡 Pro Tips

- **After first install**: Just use `start.bat` - no more installs needed!
- **Port conflicts**: `start.bat` auto-fixes them
- **Dependencies**: Cached in `node_modules` - only install once!
