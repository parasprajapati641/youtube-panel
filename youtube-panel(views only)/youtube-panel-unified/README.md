# Unified Panel + YouTube Bot (1 backend)

Ek j folder, ek j port (**5000**). Alag bot server (3000) nathi.

## Start

```bash
cd backend
npm install          # Playwright Chromium pan install thase
node seedLocalServices.js
npm start
# → http://localhost:5000
#    /api/*        = panel
#    /api/bot/*    = register / like / comment / subscribe
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Bot register (same server)

```bash
curl -X POST http://localhost:5000/api/bot/register \
  -H "Content-Type: application/json" \
  -d "{\"botName\":\"bot1\"}"
```

Panel New Order → YouTube Likes/Comments/Subscribers → local Playwright bots use thase.
