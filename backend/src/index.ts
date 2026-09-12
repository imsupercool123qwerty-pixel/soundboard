import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as IOServer } from 'socket.io';
import { config, ICE_SERVERS } from './config.js';
import { roomManager } from './roomManager.js';
import { SOUNDS } from './sounds.js';
import { initDb } from './db.js';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Simple IP rate limiting for API
const apiRateMap = new Map<string, number[]>();
function apiRateLimit(req: any, res: any, next: any) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const arr = apiRateMap.get(ip) || [];
  const recent = arr.filter(t => now - t < 60000);
  if (recent.length > 60) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  recent.push(now);
  apiRateMap.set(ip, recent);
  next();
}
app.use('/api/', apiRateLimit);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now(), rooms: roomManager.getPublicRooms().length, iceServers: ICE_SERVERS });
});

app.get('/api/sounds', (req, res) => {
  res.json(SOUNDS.filter(s => s.enabled));
});

app.get('/api/rooms', (req, res) => {
  const rooms = roomManager.getPublicRooms();
  res.json(rooms);
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { name, type, password, maxUsers, creatorId, creatorName } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Room name required (min 2 chars)' });
    }
    if (!['public', 'private'].includes(type)) {
      return res.status(400).json({ error: 'Invalid room type' });
    }
    const max = parseInt(maxUsers) || 20;
    if (max < 2 || max > 50) return res.status(400).json({ error: 'Max users must be 2-50' });
    const cid = creatorId || uuidv4();
    const cname = (creatorName || 'Host').slice(0, 30);
    const room = await roomManager.createRoom({
      name,
      type,
      password: password?.slice(0, 100),
      maxUsers: max,
      creatorId: cid,
      creatorName: cname,
    });
    res.json({
      code: room.code,
      name: room.name,
      type: room.type,
      maxUsers: room.maxUsers,
      hasPassword: !!room.passwordHash,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.post('/api/rooms/join', async (req, res) => {
  try {
    const { roomCode, password } = req.body;
    if (!roomCode) return res.status(400).json({ error: 'Room code required' });
    const room = roomManager.getRoom(roomCode.toUpperCase().trim());
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const can = roomManager.canJoin(room);
    if (!can.ok) return res.status(400).json({ error: can.reason });
    const ok = await roomManager.verifyPassword(room, password);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });
    res.json(roomManager.toPublic(room));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Join check failed' });
  }
});

app.get('/api/rooms/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = roomManager.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  // Return public info plus users count, but not password
  res.json({
    ...roomManager.toPublic(room),
    users: Array.from(room.users.values()).map(u => ({
      id: u.id,
      username: u.username,
      isMuted: u.isMuted,
      isSpeaking: u.isSpeaking,
      isHost: u.id === room.creatorId,
    })),
  });
});

app.delete('/api/rooms/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = roomManager.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  // Simple auth: only allow if no users or request includes creatorId
  const { creatorId } = req.body || {};
  if (room.users.size > 0 && creatorId !== room.creatorId) {
    // For now allow delete if empty, otherwise require creator
    if (room.users.size !== 0) return res.status(403).json({ error: 'Not authorized' });
  }
  roomManager.deleteRoom(code);
  res.json({ ok: true });
});

app.get('/api/ice-servers', (req, res) => {
  res.json(ICE_SERVERS);
});

// Serve frontend in production if built
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import fs from 'fs';
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return res.status(404).end();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);
  let currentRoomCode: string | null = null;
  let currentUserId: string | null = null;

  socket.on('join_room', async (payload: { roomCode: string; userId: string; username: string; password?: string }) => {
    try {
      const { roomCode, userId, username, password } = payload;
      if (!roomCode || !userId || !username) {
        socket.emit('error', { message: 'Missing fields' });
        return;
      }
      const code = roomCode.toUpperCase().trim();
      const room = roomManager.getRoom(code);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      const can = roomManager.canJoin(room);
      if (!can.ok && !room.users.has(userId)) {
        socket.emit('error', { message: can.reason });
        return;
      }
      const passOk = await roomManager.verifyPassword(room, password);
      if (!passOk) {
        socket.emit('error', { message: 'Incorrect password' });
        return;
      }

      // If user already in room with different socket, remove old
      if (room.users.has(userId)) {
        const oldUser = room.users.get(userId);
        if (oldUser) {
          // find old socket and disconnect? Just update
        }
      }

      const user = {
        id: userId,
        username: username.slice(0, 30),
        socketId: socket.id,
        isMuted: false,
        isSpeaking: false,
        joinedAt: Date.now(),
        isHost: userId === room.creatorId,
      };

      const result = roomManager.joinRoom(code, user);
      if (!result.ok) {
        socket.emit('error', { message: result.reason });
        return;
      }

      socket.join(code);
      currentRoomCode = code;
      currentUserId = userId;

      // Notify existing users
      socket.to(code).emit('user_joined', { user: { id: user.id, username: user.username, isMuted: user.isMuted, isSpeaking: user.isSpeaking, isHost: user.isHost } });

      // Send room info to joiner
      const allUsers = roomManager.getRoomUsers(code).map(u => ({
        id: u.id,
        username: u.username,
        isMuted: u.isMuted,
        isSpeaking: u.isSpeaking,
        isHost: u.id === room.creatorId,
      }));

      socket.emit('room_joined', {
        room: roomManager.toPublic(room),
        users: allUsers,
        iceServers: ICE_SERVERS,
        sounds: SOUNDS.filter(s => s.enabled),
      });

      // Broadcast updated room list? For simplicity emit to all
      io.emit('room_list_updated', roomManager.getPublicRooms());

      console.log(`${username} joined ${code}`);
    } catch (e) {
      console.error('join_room error', e);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('leave_room', () => {
    if (currentRoomCode && currentUserId) {
      const room = roomManager.leaveRoom(currentRoomCode, currentUserId);
      socket.to(currentRoomCode).emit('user_left', { userId: currentUserId });
      socket.leave(currentRoomCode);
      io.emit('room_list_updated', roomManager.getPublicRooms());
      console.log(`User ${currentUserId} left ${currentRoomCode}`);
      currentRoomCode = null;
      currentUserId = null;
    }
  });

  socket.on('play_sound', (payload: { roomCode: string; soundId: string }) => {
    try {
      const { roomCode, soundId } = payload;
      if (!roomCode || !soundId) return;
      const code = roomCode.toUpperCase().trim();
      const room = roomManager.getRoom(code);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      if (!currentUserId || !room.users.has(currentUserId)) {
        socket.emit('error', { message: 'Not in room' });
        return;
      }
      const sound = SOUNDS.find(s => s.id === soundId && s.enabled);
      if (!sound) {
        socket.emit('error', { message: 'Invalid sound' });
        return;
      }
      // Rate limit
      const rl = roomManager.checkSoundRateLimit(currentUserId);
      if (!rl.allowed) {
        socket.emit('error', { message: rl.reason });
        return;
      }
      roomManager.updateRoomActivity(code);
      const user = room.users.get(currentUserId);
      const event = {
        soundId,
        userId: currentUserId,
        username: user?.username || 'Unknown',
        timestamp: Date.now(),
        serverTimestamp: Date.now(),
      };
      // Broadcast to everyone in room including sender for sync
      io.to(code).emit('play_sound', event);
      console.log(`Sound ${soundId} played in ${code} by ${user?.username}`);
    } catch (e) {
      console.error('play_sound error', e);
    }
  });

  // WebRTC signaling
  socket.on('voice_offer', (payload: { roomCode: string; to: string; offer: any }) => {
    const { roomCode, to, offer } = payload;
    if (!roomCode || !to || !offer) return;
    const code = roomCode.toUpperCase().trim();
    const room = roomManager.getRoom(code);
    if (!room || !currentUserId || !room.users.has(currentUserId)) return;
    const targetUser = room.users.get(to);
    if (!targetUser) return;
    io.to(targetUser.socketId).emit('voice_offer', { from: currentUserId, fromUsername: room.users.get(currentUserId)?.username, offer, roomCode: code });
  });

  socket.on('voice_answer', (payload: { roomCode: string; to: string; answer: any }) => {
    const { roomCode, to, answer } = payload;
    if (!roomCode || !to || !answer) return;
    const code = roomCode.toUpperCase().trim();
    const room = roomManager.getRoom(code);
    if (!room || !currentUserId || !room.users.has(currentUserId)) return;
    const targetUser = room.users.get(to);
    if (!targetUser) return;
    io.to(targetUser.socketId).emit('voice_answer', { from: currentUserId, answer, roomCode: code });
  });

  socket.on('ice_candidate', (payload: { roomCode: string; to: string; candidate: any }) => {
    const { roomCode, to, candidate } = payload;
    if (!roomCode || !to || !candidate) return;
    const code = roomCode.toUpperCase().trim();
    const room = roomManager.getRoom(code);
    if (!room || !currentUserId || !room.users.has(currentUserId)) return;
    const targetUser = room.users.get(to);
    if (!targetUser) return;
    io.to(targetUser.socketId).emit('ice_candidate', { from: currentUserId, candidate, roomCode: code });
  });

  socket.on('mute_changed', (payload: { roomCode: string; isMuted: boolean }) => {
    const { roomCode, isMuted } = payload;
    if (!roomCode || typeof isMuted !== 'boolean') return;
    const code = roomCode.toUpperCase().trim();
    const room = roomManager.getRoom(code);
    if (!room || !currentUserId) return;
    const user = room.users.get(currentUserId);
    if (!user) return;
    user.isMuted = isMuted;
    io.to(code).emit('user_mute_changed', { userId: currentUserId, isMuted });
  });

  socket.on('speaking_changed', (payload: { roomCode: string; isSpeaking: boolean }) => {
    const { roomCode, isSpeaking } = payload;
    if (!roomCode || typeof isSpeaking !== 'boolean') return;
    const code = roomCode.toUpperCase().trim();
    const room = roomManager.getRoom(code);
    if (!room || !currentUserId) return;
    const user = room.users.get(currentUserId);
    if (!user) return;
    user.isSpeaking = isSpeaking;
    io.to(code).emit('user_speaking_changed', { userId: currentUserId, isSpeaking });
  });

  socket.on('disconnect', () => {
    if (currentRoomCode && currentUserId) {
      roomManager.leaveRoom(currentRoomCode, currentUserId);
      socket.to(currentRoomCode).emit('user_left', { userId: currentUserId });
      io.emit('room_list_updated', roomManager.getPublicRooms());
      console.log(`Socket ${socket.id} disconnected, user ${currentUserId} left ${currentRoomCode}`);
    } else {
      console.log(`Socket ${socket.id} disconnected`);
    }
  });
});

await initDb();

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Backend running on http://0.0.0.0:${config.port}`);
  console.log(`ICE servers:`, ICE_SERVERS);
});
