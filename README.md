# Soundboard — Real-time Voice Chat + Synchronized Meme Soundboard

A full-stack real-time web app where users can join shared rooms, talk via WebRTC voice chat, and trigger a synchronized soundboard that plays for everyone in the room — worldwide, not just LAN.

## Features

- **Room System**: Public rooms (browser) + Private rooms (hard-to-guess codes, optional password)
- **Real-time**: WebSockets (Socket.IO) for room presence, sound events, and WebRTC signaling
- **Soundboard**: 20 meme sounds (Vine Boom, Airhorn, Bruh, Metal Pipe, etc.) with synchronized playback, latency compensation, rate limiting
- **Voice Chat**: WebRTC mesh, STUN/TURN support, mute/unmute, push-to-talk, per-user volume, speaking indicators
- **Modern UI**: Dark gaming aesthetic, responsive (mobile drawer, large tap targets), activity feed, Discord-style layout
- **Security**: Server-side validation, password hashing, rate limiting, max room size, input sanitization
- **Guest Auth**: Random funny usernames, temporary IDs, editable display names

## Architecture

```
Frontend (React + TS + Tailwind + Vite)
  ↓ HTTP /api + WSS /socket.io
Backend (Node + Express + Socket.IO)
  ↓ Optional
PostgreSQL (persistent rooms) + Redis (presence)
  ↓
WebRTC P2P (voice) with STUN/TURN
```

### Sound Sync Flow
1. Client sends `play_sound` {roomCode, soundId}
2. Server verifies: room exists, user in room, sound exists, rate limit OK
3. Server broadcasts to room with server timestamp
4. Clients play locally with latency compensation (serverTimestamp vs Date.now)

No audio files are sent over WebSocket — only soundId.

## Project Structure

```
backend/
  src/
    index.ts          # Express + Socket.IO server
    roomManager.ts    # In-memory room store + cleanup
    sounds.ts         # Sound definitions
    config.ts         # Env + ICE servers
    db.ts             # Postgres init (optional)
frontend/
  src/
    pages/ Home, Rooms, RoomPage
    hooks/ useSounds, useWebRTC
    utils/ storage, sounds
    types.ts
  public/sounds/      # 20 meme SFX (WAV/MP3)
```

## Quick Start

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env if needed
npm run dev
# Runs on http://localhost:3001
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173, proxies /api and /socket.io to backend
```

Open http://localhost:5173

## Environment Variables

```env
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/soundboard
REDIS_URL=
PUBLIC_URL=http://localhost:5173
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:your.turn.server:3478
TURN_USERNAME=user
TURN_PASSWORD=pass
ROOM_INACTIVE_MINUTES=30
NODE_ENV=development
```

- `DATABASE_URL` optional — if not set, uses in-memory storage
- `TURN_*` optional but recommended for restrictive NATs
- `ROOM_INACTIVE_MINUTES` — auto-remove inactive rooms

## Database Schema (PostgreSQL)

```sql
CREATE TABLE rooms (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  password_hash TEXT,
  max_users INT NOT NULL,
  created_at BIGINT NOT NULL,
  last_activity BIGINT NOT NULL,
  creator_id VARCHAR(100) NOT NULL,
  creator_name VARCHAR(100) NOT NULL
);
CREATE TABLE users (
  id VARCHAR(100) PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE sounds (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  file_path TEXT NOT NULL,
  category VARCHAR(100),
  duration FLOAT,
  enabled BOOLEAN DEFAULT true
);
CREATE TABLE room_members (
  room_code VARCHAR(20) REFERENCES rooms(code) ON DELETE CASCADE,
  user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (room_code, user_id)
);
```

Init is automatic in `db.ts` if `DATABASE_URL` is set.

## API Endpoints

- `GET /api/health`
- `GET /api/sounds`
- `GET /api/rooms` — public rooms
- `POST /api/rooms` — create
- `POST /api/rooms/join` — validate code/password
- `GET /api/rooms/:code`
- `DELETE /api/rooms/:code`
- `GET /api/ice-servers`

### WebSocket Events

Client → Server:
- `join_room` {roomCode, userId, username, password}
- `leave_room`
- `play_sound` {roomCode, soundId}
- `voice_offer` {roomCode, to, offer}
- `voice_answer` {roomCode, to, answer}
- `ice_candidate` {roomCode, to, candidate}
- `mute_changed` {roomCode, isMuted}
- `speaking_changed` {roomCode, isSpeaking}

Server → Client:
- `room_joined` {room, users, iceServers, sounds}
- `user_joined` {user}
- `user_left` {userId}
- `play_sound` {soundId, userId, username, timestamp, serverTimestamp}
- `voice_offer` {from, offer}
- `voice_answer` {from, answer}
- `ice_candidate` {from, candidate}
- `user_mute_changed`, `user_speaking_changed`
- `error`

## Deployment

### Requirements for Internet Deployment

- HTTPS + WSS (required for getUserMedia and secure WebSockets)
- Public domain
- STUN (Google) + TURN (coturn) for NAT traversal
- PostgreSQL optional

### VPS Example (Ubuntu + Nginx + PM2)

1. **Server setup**
```bash
# Install Node, Postgres, coturn
sudo apt update
sudo apt install nodejs npm postgresql coturn nginx certbot python3-certbot-nginx
```

2. **Coturn (TURN)**
```
# /etc/turnserver.conf
listening-port=3478
fingerprint
lt-cred-mech
user=youruser:yourpass
realm=yourdomain.com
```
```bash
sudo systemctl enable coturn && sudo systemctl start coturn
```

3. **Clone & Build**
```bash
git clone yourrepo
cd soundboard/frontend && npm install && npm run build
cd ../backend && npm install && npm run build
```

4. **Env**
```env
PORT=3001
DATABASE_URL=postgresql://...
PUBLIC_URL=https://yourdomain.com
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:yourdomain.com:3478
TURN_USERNAME=youruser
TURN_PASSWORD=yourpass
ROOM_INACTIVE_MINUTES=30
NODE_ENV=production
```

5. **PM2**
```bash
npm i -g pm2
pm2 start dist/index.js --name soundboard
pm2 save
pm2 startup
```

6. **Nginx**
```nginx
server {
  listen 80;
  server_name yourdomain.com;
  location / {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```
```bash
sudo certbot --nginx -d yourdomain.com
```

Frontend is served by backend in production (Express static from `frontend/dist`). So only backend port needs proxy.

### Docker

```yaml
# docker-compose.yml included
docker-compose up --build
```

### Why it works worldwide

- Central backend on public internet, not LAN IP
- Room codes are stored server-side, not mDNS
- WebSocket signaling via public WSS
- WebRTC uses STUN to discover public IP, TURN to relay when P2P fails
- Tested: User A Wi-Fi 1, User B Wi-Fi 2, User C mobile data can join same `X7K2P`

## Mobile Support

- Sound buttons large (aspect 4/3, min 80px)
- Voice controls sticky bottom on mobile
- User list collapsible drawer
- No hover-only interactions
- Audio unlock overlay for autoplay policy

## Security Notes

- Never trust client: server validates room existence, membership, capacity, password (bcrypt), sound whitelist
- Rate limiting: 60 req/min per IP (API), 8 sounds/5s per user + 300ms cooldown
- Input sanitization: room name 50 chars, username 30 chars
- No arbitrary file play — soundId must be in whitelist

## Adding New Sounds

1. Add file to `frontend/public/sounds/`
2. Add entry in `backend/src/sounds.ts` and `frontend/src/utils/sounds.ts`:
```ts
{ id: 'my_sound', name: 'My Sound', file: '/sounds/my_sound.mp3', icon: '🎉', category: 'Meme', duration: 1.0, enabled: true, color: 'from-...' }
```
3. Rebuild frontend

## License

MIT — Sounds are synthetic placeholders generated via Web Audio (no copyrighted material). Replace with royalty-free MP3s for production if desired.
