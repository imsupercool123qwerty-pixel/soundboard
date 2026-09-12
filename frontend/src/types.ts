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

export interface User {
  id: string;
  username: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isHost?: boolean;
}

export interface PlaySoundEvent {
  soundId: string;
  userId: string;
  username: string;
  timestamp: number;
  serverTimestamp: number;
}

export interface ActivityItem {
  id: string;
  type: 'sound' | 'join' | 'leave' | 'speak';
  message: string;
  timestamp: number;
  icon?: string;
}
