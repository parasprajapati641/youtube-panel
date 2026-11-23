# YouTube SMM Panel + Bot – Full Stack Run Guide

## Requirements
- Node.js 18+ (LTS recommended)
- MongoDB (Atlas URI already in backend/.env, or local MongoDB)
- Chrome/Chromium (Playwright auto-installs on npm install)

---

## 1. Backend start

```bash
cd youtube-panel-unified/backend
npm install
# Playwright Chromium install thase (postinstall)

# Optional: seed local services
node seedLocalServices.js

npm start
# → http://localhost:5000
#   /api/*     = panel API
#   /api/bot/* = bot (register / like / comment / subscribe)
```

### Backend .env (already present)
```
PORT=5000
MONGO_URI=...          # MongoDB connection
JWT_SECRET=...
USE_LOCAL_BOT=true
HEADLESS=true
WATCH_TIME_MIN=55
WATCH_TIME_MAX=60
VMWARE=true            # low RAM / VMware mate
LOW_MEMORY=true
```

Watch time change: `WATCH_TIME_MIN` / `WATCH_TIME_MAX` edit karo.

---

## 2. Frontend start (biji terminal)

```bash
cd youtube-panel-unified/frontend
npm install
npm run dev
# → http://localhost:5173 (Vite default)
```

Frontend `.env`:
```
VITE_API_BASE_URL=http://localhost:5000/api
```

Browser ma open: **http://localhost:5173**

---

## 3. First use

1. Register / Login (frontend)
2. Admin thi services set karo (or seed already)
3. Bot register:
```bash
curl -X POST http://localhost:5000/api/bot/register \
  -H "Content-Type: application/json" \
  -d "{\"botName\":\"bot-1\"}"
```
   Browser open thase → YouTube login karo → profile save thase

4. New Order → YouTube Likes / Comments → local bots use thase

---

## Ports
| Service  | Port |
|----------|------|
| Backend  | 5000 |
| Frontend | 5173 |

---

## Notes
- Bot profiles: `backend/bot/.profiles/` folder auto create thase
- HEADLESS=false rakho to browser visible rahe (debug mate)
- Watch duration: 55–60 sec random (default)
