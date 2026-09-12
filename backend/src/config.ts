import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  databaseConnectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10),
  redisUrl: process.env.REDIS_URL || '',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:5173',
  stunServer: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302',
  turnServer: process.env.TURN_SERVER || '',
  turnUsername: process.env.TURN_USERNAME || '',
  turnPassword: process.env.TURN_PASSWORD || '',
  roomInactiveMinutes: parseInt(process.env.ROOM_INACTIVE_MINUTES || '30', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
};

export const ICE_SERVERS = (() => {
  const servers: any[] = [{ urls: config.stunServer }];
  if (config.turnServer) {
    servers.push({
      urls: config.turnServer,
      username: config.turnUsername,
      credential: config.turnPassword,
    });
  }
  // Always add google stun as fallback
  servers.push({ urls: 'stun:stun1.l.google.com:19302' });
  return servers;
})();
