export interface User {
  id: string;
  username: string;
  socketId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  joinedAt: number;
  isHost?: boolean;
}

export interface Room {
  code: string;
  name: string;
  type: 'public' | 'private';
  passwordHash?: string;
  maxUsers: number;
  createdAt: number;
  lastActivity: number;
  creatorId: string;
  creatorName: string;
  users: Map<string, User>;
  soundCount?: number;
}

export interface RoomPublic {
  code: string;
  name: string;
  type: 'public' | 'private';
  maxUsers: number;
  currentUsers: number;
  createdAt: number;
  lastActivity: number;
  creatorName: string;
  hasPassword: boolean;
}

export interface Sound {
  id: string;
  name: string;
  file: string;
  icon: string;
  category: string;
  duration: number;
  enabled: boolean;
  color: string;
}

export interface PlaySoundPayload {
  roomCode: string;
  soundId: string;
  userId: string;
  username: string;
  timestamp: number;
}

export interface JoinRoomPayload {
  roomCode: string;
  userId: string;
  username: string;
  password?: string;
}
