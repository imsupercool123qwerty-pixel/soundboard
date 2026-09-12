# Deployment Guide — Internet-Ready Soundboard

This app MUST be deployed on a public server, not LAN-only. Here's how.

## Architecture for Internet Deployment

- **Frontend**: React SPA, served via Nginx or backend static
- **Backend**: Node + Express + Socket.IO, central signaling + room store
- **Database**: PostgreSQL optional (fallback in-memory)
- **WebRTC**: STUN (Google) + TURN (coturn) for NAT traversal
- **HTTPS/WSS**: Required for getUserMedia + secure WebSockets

All users (Wi-Fi 1, Wi-Fi 2, mobile data, different countries) connect to same public backend via domain, join by room code.

## Environment

```env
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/soundboard
REDIS_URL=
PUBLIC_URL=https://yourdomain.com
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:yourdomain.com:3478
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpass
ROOM_INACTIVE_MINUTES=30
NODE_ENV=production
```

## Option 1: VPS (Ubuntu 22.04)

### 1. Install deps
```bash
sudo apt update
sudo apt install -y nodejs npm postgresql coturn nginx certbot python3-certbot-nginx git
sudo npm i -g pm2
```

### 2. Setup Postgres
```bash
sudo -u postgres psql -c "CREATE USER soundboard WITH PASSWORD 'strongpass';"
sudo -u postgres psql -c "CREATE DATABASE soundboard OWNER soundboard;"
psql postgresql://soundboard:strongpass@localhost:5432/soundboard -f backend/schema.sql
```

### 3. Setup TURN (coturn)
`/etc/turnserver.conf`:
```
listening-port=3478
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=your-secret-or-user-pass
realm=yourdomain.com
# If using user/pass:
user=turnuser:turnpass
```
```bash
sudo systemctl enable coturn
sudo systemctl restart coturn
# Open firewall
sudo ufw allow 3478
sudo ufw allow 5349
sudo ufw allow 49152:65535/udp
```

### 4. Clone & Build
```bash
git clone https://github.com/your/repo.git soundboard
cd soundboard/frontend
npm ci
npm run build
cd ../backend
npm ci
npm run build
```

### 5. PM2
```bash
cat > .env <<EOF
PORT=3001
DATABASE_URL=postgresql://soundboard:strongpass@localhost:5432/soundboard
PUBLIC_URL=https://yourdomain.com
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:yourdomain.com:3478
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpass
ROOM_INACTIVE_MINUTES=30
NODE_ENV=production
EOF
pm2 start dist/index.js --name soundboard
pm2 save
pm2 startup
```

### 6. Nginx + HTTPS
`/etc/nginx/sites-available/soundboard`:
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
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/soundboard /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com
```

Backend serves frontend/dist, so only one proxy needed.

### 7. Test
- https://yourdomain.com/health -> ok
- Create room, copy code, join from phone on mobile data

## Option 2: Docker Compose

```bash
docker-compose up --build -d
# Frontend on :80, backend on :3001
```

For production, put Nginx in front with TLS.

## Option 3: Cloud (Railway/Render/Fly)

- Deploy backend as Node service
- Set env vars
- Deploy frontend as static site (Vite) pointing to backend URL
- Ensure backend CORS allows frontend origin
- Add TURN server (e.g., metered.ca or self-hosted)

## TURN Importance

Without TURN, ~15% of users behind symmetric NAT cannot establish P2P. TURN relays media via server. Always configure.

Test TURN with: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

## Security Checklist

- HTTPS/WSS enforced
- Rate limiting enabled (already in code)
- Passwords hashed with bcrypt
- Sound whitelist (no arbitrary files)
- Room cleanup for inactive rooms
- Input sanitization

## Scaling

- Use Redis adapter for Socket.IO to scale across multiple backend instances
- Use PostgreSQL for persistent room list
- Sticky sessions for WebSocket if load balancer

## Monitoring

- `GET /api/health` returns room count
- PM2 logs: `pm2 logs soundboard`
- Nginx logs: `/var/log/nginx/`
