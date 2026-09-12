import { Room, RoomPublic, User } from './types.js';
import { config } from './config.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private userRateLimit: Map<string, number[]> = new Map(); // userId -> timestamps

  generateRoomCode(isPrivate: boolean): string {
    const charsPublic = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid ambiguous
    const charsPrivate = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const chars = isPrivate ? charsPrivate : charsPublic;
    const length = isPrivate ? 10 : 5;
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (this.rooms.has(code)) return this.generateRoomCode(isPrivate);
    return code;
  }

  async createRoom(params: { name: string; type: 'public' | 'private'; password?: string; maxUsers: number; creatorId: string; creatorName: string }): Promise<Room> {
    const code = this.generateRoomCode(params.type === 'private');
    let passwordHash: string | undefined;
    if (params.password) {
      passwordHash = await bcrypt.hash(params.password, 10);
    }
    const room: Room = {
      code,
      name: params.name.trim().slice(0, 50),
      type: params.type,
      passwordHash,
      maxUsers: Math.min(Math.max(params.maxUsers, 2), 50),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      creatorId: params.creatorId,
      creatorName: params.creatorName,
      users: new Map(),
    };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  getPublicRooms(): RoomPublic[] {
    const now = Date.now();
    const list: RoomPublic[] = [];
    for (const room of this.rooms.values()) {
      if (room.type !== 'public') continue;
      // Skip inactive? handled by cleanup but also filter
      list.push({
        code: room.code,
        name: room.name,
        type: room.type,
        maxUsers: room.maxUsers,
        currentUsers: room.users.size,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        creatorName: room.creatorName,
        hasPassword: !!room.passwordHash,
      });
    }
    return list.sort((a, b) => b.currentUsers - a.currentUsers || b.lastActivity - a.lastActivity);
  }

  async verifyPassword(room: Room, password?: string): Promise<boolean> {
    if (!room.passwordHash) return true;
    if (!password) return false;
    return bcrypt.compare(password, room.passwordHash);
  }

  canJoin(room: Room): { ok: boolean; reason?: string } {
    if (room.users.size >= room.maxUsers) {
      return { ok: false, reason: 'Room is full' };
    }
    return { ok: true };
  }

  joinRoom(code: string, user: User): { ok: boolean; reason?: string; room?: Room } {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, reason: 'Room not found' };
    const can = this.canJoin(room);
    if (!can.ok) return can;
    room.users.set(user.id, user);
    room.lastActivity = Date.now();
    return { ok: true, room };
  }

  leaveRoom(code: string, userId: string): Room | undefined {
    const room = this.rooms.get(code);
    if (!room) return undefined;
    room.users.delete(userId);
    room.lastActivity = Date.now();
    // Don't auto-delete immediately, allow rejoin, cleanup will handle
    return room;
  }

  deleteRoom(code: string) {
    this.rooms.delete(code);
  }

  updateRoomActivity(code: string) {
    const room = this.rooms.get(code);
    if (room) room.lastActivity = Date.now();
  }

  cleanupInactiveRooms() {
    const now = Date.now();
    const threshold = config.roomInactiveMinutes * 60 * 1000;
    for (const [code, room] of this.rooms.entries()) {
      const inactiveTime = now - room.lastActivity;
      const isEmpty = room.users.size === 0;
      // If empty for 5 minutes, or inactive for configured time regardless of users? Requirement: remove rooms that have been inactive for configurable amount.
      // We'll remove if inactive > threshold, or if empty and inactive > 5min
      if (inactiveTime > threshold || (isEmpty && inactiveTime > 5 * 60 * 1000)) {
        console.log(`Cleaning up room ${code} inactive for ${Math.round(inactiveTime / 60000)}m`);
        this.rooms.delete(code);
      }
    }
  }

  // Rate limiting for soundboard: max 8 sounds per 5 seconds per user, and 1 per 300ms
  checkSoundRateLimit(userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const timestamps = this.userRateLimit.get(userId) || [];
    // Keep only last 5 seconds
    const recent = timestamps.filter(t => now - t < 5000);
    if (recent.length >= 8) {
      return { allowed: false, reason: 'Rate limit: too many sounds' };
    }
    const last = recent[recent.length - 1];
    if (last && now - last < 300) {
      return { allowed: false, reason: 'Cooldown: wait a moment' };
    }
    recent.push(now);
    this.userRateLimit.set(userId, recent);
    return { allowed: true };
  }

  getRoomUsers(code: string): User[] {
    const room = this.rooms.get(code);
    if (!room) return [];
    return Array.from(room.users.values());
  }

  toPublic(room: Room): RoomPublic {
    return {
      code: room.code,
      name: room.name,
      type: room.type,
      maxUsers: room.maxUsers,
      currentUsers: room.users.size,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      creatorName: room.creatorName,
      hasPassword: !!room.passwordHash,
    };
  }
}

export const roomManager = new RoomManager();

// Cleanup interval
setInterval(() => {
  roomManager.cleanupInactiveRooms();
}, 60 * 1000);
