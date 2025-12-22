# 🚀 Quick Start Guide (Windows)

## One-Time Setup (Only needed once)

```bash
npm run install-all
```

This installs all dependencies for root, backend, and frontend.

## Running the Project

### Option 1: Simple Start (Easiest - Recommended)

**Easiest:** Double-click `start.bat` in Windows Explorer

**Or run in terminal:**
- **Command Prompt (CMD):** `start.bat`
- **PowerShell:** `.\start.bat`

This script will:
- ✅ Automatically kill any processes using ports 5000 and 5173
- ✅ Check if dependencies are installed
- ✅ Install missing dependencies automatically
- ✅ Start both backend and frontend servers

### Option 2: Using npm
```bash
npm run dev
```

The script will automatically check if dependencies are installed and only install them if missing.

### Option 3: If Ports Are Busy
If you get "port already in use" errors, run:
```bash
kill-ports.bat
```

Then run `start.bat` again.

## What Happens?

1. ✅ Checks if dependencies are installed
2. ✅ Only installs if missing (saves time!)
3. ✅ Starts both backend and frontend servers
4. ✅ Backend runs on: http://localhost:5000
5. ✅ Frontend runs on: http://localhost:5173

## Notes

- **First time**: Will install all dependencies (takes a few minutes)
- **After that**: Starts immediately (no installation needed!)
- Dependencies are cached in `node_modules` folders
- Only reinstall if you delete `node_modules` or update `package.json`

## Troubleshooting

### Port Already in Use Error
If you see "EADDRINUSE: address already in use :::5000":
1. Run `kill-ports.bat` to free the ports
2. Or double-click `start.bat` (it auto-kills processes)

### Other Errors
1. Delete `node_modules` folders (root, backend, frontend)
2. Run `npm run install-all` again
3. Try `start.bat` or `npm run dev`

### Still Having Issues?
- Make sure MongoDB is running (if using local MongoDB)
- Check that ports 5000 and 5173 are not blocked by firewall
- Try running `kill-ports.bat` before starting
