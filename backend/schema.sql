-- PostgreSQL schema for Soundboard

CREATE TABLE IF NOT EXISTS rooms (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('public','private')),
  password_hash TEXT,
  max_users INT NOT NULL CHECK (max_users >= 2 AND max_users <= 50),
  created_at BIGINT NOT NULL,
  last_activity BIGINT NOT NULL,
  creator_id VARCHAR(100) NOT NULL,
  creator_name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(100) PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sounds (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  file_path TEXT NOT NULL,
  category VARCHAR(100),
  duration FLOAT,
  enabled BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS room_members (
  room_code VARCHAR(20) REFERENCES rooms(code) ON DELETE CASCADE,
  user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (room_code, user_id)
);

-- Index for public room browsing
CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(type);
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity DESC);

-- Seed sounds
INSERT INTO sounds (id, name, file_path, category, duration, enabled) VALUES
('vine_boom','Vine Boom','/sounds/vine_boom.wav','Meme',1.2,true),
('airhorn','Airhorn','/sounds/airhorn.wav','Meme',1.0,true),
('bruh','Bruh','/sounds/bruh.wav','Meme',0.8,true),
('metal_pipe','Metal Pipe','/sounds/metal_pipe.wav','Meme',1.5,true),
('error','Error','/sounds/error.wav','System',0.7,true),
('laugh','Laugh','/sounds/laugh.wav','Reaction',2.0,true),
('applause','Applause','/sounds/applause.wav','Reaction',2.5,true),
('explosion','Explosion','/sounds/explosion.wav','Effect',1.8,true),
('door','Door','/sounds/door.wav','Effect',0.9,true),
('bonk','Bonk','/sounds/bonk.wav','Meme',0.6,true),
('fart','Fart','/sounds/fart.wav','Meme',1.0,true),
('wow','Wow','/sounds/wow.wav','Reaction',1.2,true),
('nope','Nope','/sounds/nope.wav','Meme',0.7,true),
('yeah','Yeah Boi','/sounds/yeah.wav','Meme',1.0,true),
('sad_trombone','Sad Trombone','/sounds/sad_trombone.wav','Reaction',3.0,true),
('oof','Oof','/sounds/oof.wav','Meme',0.6,true),
('discord','Discord Ping','/sounds/discord.wav','System',0.8,true),
('cricket','Crickets','/sounds/cricket.wav','Effect',2.0,true),
('drumroll','Drumroll','/sounds/drumroll.wav','Effect',2.2,true),
('sus','Sus','/sounds/sus.wav','Meme',0.9,true)
ON CONFLICT (id) DO NOTHING;
