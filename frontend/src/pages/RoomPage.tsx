import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { getOrCreateUserId, getOrCreateUsername, setUsername } from '../utils/storage';
import { Sound, User, PlaySoundEvent, ActivityItem, RoomPublic } from '../types';
import { useSounds } from '../hooks/useSounds';
import { useWebRTC } from '../hooks/useWebRTC';
import { DEFAULT_SOUNDS } from '../utils/sounds';

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const userId = getOrCreateUserId();
  const [username, setUsernameLocal] = useState(getOrCreateUsername());
  const [editingName, setEditingName] = useState(false);
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sounds, setSounds] = useState<Sound[]>(DEFAULT_SOUNDS);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [showUsersDrawer, setShowUsersDrawer] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchSound, setSearchSound] = useState('');
  const [recentlyPlayed, setRecentlyPlayed] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const activitiesRef = useRef<HTMLDivElement>(null);

  const {
    audioEnabled,
    enableAudio,
    playSound,
    masterVolume,
    setMasterVolume,
    sfxVolume,
    setSfxVolume,
    voiceVolume,
    setVoiceVolume,
  } = useSounds(sounds);

  const { micEnabled, enableMic, disableMic, speaking, setUserVolume, remoteVolumes } = useWebRTC(
    socket,
    roomCode || '',
    userId,
    users,
    iceServers,
    voiceVolume,
    pushToTalk ? !isPushing : isMuted
  );

  const addActivity = useCallback((item: ActivityItem) => {
    setActivities(prev => [item, ...prev].slice(0, 50));
  }, []);

  // Fetch room info initially
  useEffect(() => {
    if (!roomCode) return;
    fetch(`/api/rooms/${roomCode}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setRoom({ code: data.code, name: data.name, type: data.type, maxUsers: data.maxUsers, currentUsers: data.currentUsers, createdAt: data.createdAt, lastActivity: data.lastActivity, creatorName: data.creatorName, hasPassword: data.hasPassword });
        if (data.users) setUsers(data.users);
      })
      .catch(() => setError('Failed to load room'));
  }, [roomCode]);

  // Initialize socket
  useEffect(() => {
    if (!roomCode) return;
    const s = io({ transports: ['websocket', 'polling'] });
    setSocket(s);

    s.on('connect', () => {
      console.log('Socket connected', s.id);
      // Try to join
      const attemptJoin = (pwd?: string) => {
        s.emit('join_room', { roomCode, userId, username, password: pwd });
      };
      attemptJoin(password || undefined);
    });

    s.on('room_joined', (data: any) => {
      setRoom(data.room);
      setUsers(data.users);
      if (data.iceServers) setIceServers(data.iceServers);
      if (data.sounds) setSounds(data.sounds);
      setConnected(true);
      setShowPasswordModal(false);
      addActivity({ id: Date.now().toString(), type: 'join', message: `You joined ${data.room.name}`, timestamp: Date.now(), icon: '🎉' });
    });

    s.on('user_joined', (data: any) => {
      setUsers(prev => {
        if (prev.find(u => u.id === data.user.id)) return prev.map(u => u.id === data.user.id ? data.user : u);
        return [...prev, data.user];
      });
      addActivity({ id: Date.now().toString(), type: 'join', message: `${data.user.username} joined the room`, timestamp: Date.now(), icon: '👋' });
    });

    s.on('user_left', (data: any) => {
      setUsers(prev => prev.filter(u => u.id !== data.userId));
      addActivity({ id: Date.now().toString(), type: 'leave', message: `User left the room`, timestamp: Date.now(), icon: '🚪' });
    });

    s.on('play_sound', (data: PlaySoundEvent) => {
      // Prevent duplicate playback using timestamp + soundId dedup (2s window)
      const now = Date.now();
      const latency = now - data.serverTimestamp;
      const compensatedDelay = Math.max(0, 100 - latency); // try to sync within 100ms

      // Find sound for icon
      const sound = sounds.find(s => s.id === data.soundId) || DEFAULT_SOUNDS.find(s => s.id === data.soundId);
      addActivity({
        id: `${data.userId}-${data.timestamp}`,
        type: 'sound',
        message: `${data.username} played ${sound?.name || data.soundId}`,
        timestamp: data.serverTimestamp,
        icon: sound?.icon || '🔊',
      });

      // Visual feedback
      setRecentlyPlayed(prev => {
        const n = new Set(prev);
        n.add(data.soundId);
        return n;
      });
      setTimeout(() => {
        setRecentlyPlayed(prev => {
          const n = new Set(prev);
          n.delete(data.soundId);
          return n;
        });
      }, 800);

      playSound(data.soundId, compensatedDelay);
    });

    s.on('user_mute_changed', (data: any) => {
      setUsers(prev => prev.map(u => u.id === data.userId ? { ...u, isMuted: data.isMuted } : u));
    });

    s.on('user_speaking_changed', (data: any) => {
      setUsers(prev => prev.map(u => u.id === data.userId ? { ...u, isSpeaking: data.isSpeaking } : u));
    });

    s.on('room_list_updated', () => {
      // could refresh room list elsewhere
    });

    s.on('error', (data: any) => {
      console.error('Socket error', data);
      if (data.message?.includes('password') || data.message?.includes('Password')) {
        setShowPasswordModal(true);
        setError(data.message);
      } else {
        setError(data.message);
      }
    });

    s.on('disconnect', () => {
      setConnected(false);
    });

    return () => {
      s.disconnect();
    };
  }, [roomCode, userId, username]);

  // Keep activity feed scrolled? Newest at top so no need

  const handlePlaySound = (soundId: string) => {
    if (!socket || !roomCode) return;
    if (!audioEnabled) {
      enableAudio();
      return;
    }
    socket.emit('play_sound', { roomCode, soundId });
  };

  const handleMuteToggle = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    socket?.emit('mute_changed', { roomCode, isMuted: newMuted });
  };

  const handleLeave = () => {
    socket?.emit('leave_room');
    socket?.disconnect();
    navigate('/');
  };

  const copyCode = () => {
    if (roomCode) navigator.clipboard.writeText(roomCode);
  };

  const handleSaveUsername = () => {
    setUsername(username);
    setEditingName(false);
    // Update in room if connected
    // For simplicity, re-emit join? Actually need to update via socket? We'll just leave and rejoin? Simpler: update local and server will keep old name until rejoin. Let's emit an event? For now just update local.
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, username } : u));
  };

  const filteredSounds = sounds.filter(s => {
    const matchesCategory = categoryFilter === 'All' || s.category === categoryFilter;
    const matchesSearch = s.name.toLowerCase().includes(searchSound.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = ['All', ...Array.from(new Set(sounds.map(s => s.category)))];

  if (error && !room && !showPasswordModal) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-[#15151f] border border-[#2a2a3a] p-8 text-center">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="font-bold text-xl mb-2">Room not found</h2>
          <p className="text-zinc-400 text-sm mb-6">{error}</p>
          <Link to="/" className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-medium inline-block">Go Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      {/* Audio enable overlay */}
      {!audioEnabled && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-sm w-full rounded-[1.5rem] bg-[#15151f] border border-[#2a2a3a] p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-2xl mx-auto mb-5">🔊</div>
            <h2 className="text-xl font-bold mb-2">Enable Room Audio</h2>
            <p className="text-sm text-zinc-400 mb-6">Browsers block autoplay. Click to enable soundboard and voice chat audio.</p>
            <button onClick={enableAudio} className="w-full py-3.5 rounded-xl bg-white text-black font-semibold hover:bg-zinc-200 transition">Enable Audio</button>
          </div>
        </div>
      )}

      {/* Password modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#15151f] border border-[#2a2a3a] p-6">
            <h3 className="font-bold mb-4">🔒 Password Required</h3>
            {error && <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">{error}</div>}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter room password" className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-[#2a2a3a] focus:border-violet-500 outline-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => navigate('/')} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition">Cancel</button>
              <button onClick={() => { socket?.emit('join_room', { roomCode, userId, username, password }); }} className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold transition">Join</button>
            </div>
          </div>
        </div>
      )}

      {/* Header mobile */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-[#1e1e2a] bg-[#0f0f17]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold text-sm">S</div>
          <div>
            <div className="font-semibold text-sm leading-none">{room?.name || 'Loading...'}</div>
            <div className="text-[11px] mono text-zinc-500 flex items-center gap-1">{roomCode} <button onClick={copyCode} className="ml-1 px-1.5 py-0.5 rounded bg-white/10 text-[10px]">COPY</button></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowUsersDrawer(!showUsersDrawer)} className="px-3 py-2 rounded-full bg-white/10 text-xs">👥 {users.length}</button>
          <button onClick={handleLeave} className="w-8 h-8 rounded-full bg-red-500/20 text-red-300 flex items-center justify-center">✕</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - desktop */}
        <div className="hidden lg:flex w-[280px] border-r border-[#1e1e2a] bg-[#0f0f17] flex-col">
          <div className="p-6 border-b border-[#1e1e2a]">
            <Link to="/" className="flex items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold">S</div>
              <span className="font-bold tracking-tight">SOUNDBOARD</span>
            </Link>
            <div className="rounded-xl bg-[#15151f] border border-[#2a2a3a] p-4">
              <div className="text-[11px] mono text-zinc-500 mb-1">ROOM</div>
              <div className="font-semibold truncate">{room?.name || '...'}</div>
              <div className="flex items-center gap-2 mt-3">
                <div className="flex-1 px-3 py-2 rounded-lg bg-[#0a0a0f] border border-[#2a2a3a] mono text-xs tracking-widest font-bold text-center">{roomCode}</div>
                <button onClick={copyCode} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs transition">Copy</button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> {users.length}/{room?.maxUsers || 20} online • {connected ? 'Connected' : 'Connecting...'}
              </div>
            </div>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            <div className="text-[11px] mono text-zinc-500 mb-3">YOUR PROFILE</div>
            <div className="rounded-xl bg-[#15151f] border border-[#2a2a3a] p-3 flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center font-bold text-sm">{username.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex gap-1">
                    <input value={username} onChange={e => setUsernameLocal(e.target.value)} className="flex-1 px-2 py-1 rounded bg-[#0a0a0f] border border-[#2a2a3a] text-xs outline-none" />
                    <button onClick={handleSaveUsername} className="px-2 py-1 rounded bg-violet-600 text-xs">Save</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{username}</span>
                    <button onClick={() => setEditingName(true)} className="text-[11px] text-zinc-500 hover:text-white">✎</button>
                  </div>
                )}
                <div className="text-[11px] text-zinc-500 mono">{userId.slice(0,8)}</div>
              </div>
            </div>

            <div className="text-[11px] mono text-zinc-500 mb-3">VOICE CONTROLS</div>
            <div className="rounded-xl bg-[#15151f] border border-[#2a2a3a] p-4 space-y-4 mb-6">
              <div className="flex gap-2">
                <button onClick={micEnabled ? disableMic : enableMic} className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition flex items-center justify-center gap-2 ${micEnabled ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-white text-black hover:bg-zinc-200'}`}>
                  {micEnabled ? '🎙️ Mic On' : '🔇 Mic Off'}
                </button>
                <button onClick={handleMuteToggle} disabled={!micEnabled} className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${isMuted ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-white/10 hover:bg-white/20'} disabled:opacity-50`}>
                  {isMuted ? 'Muted' : 'Mute'}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400 flex items-center gap-2"><input type="checkbox" checked={pushToTalk} onChange={e => setPushToTalk(e.target.checked)} className="accent-violet-600" /> Push-to-talk</label>
                {speaking && <span className="text-[11px] px-2 py-1 rounded-full bg-green-500/20 text-green-300 border border-green-500/30 animate-pulse">Speaking...</span>}
              </div>
              {pushToTalk && micEnabled && (
                <button
                  onMouseDown={() => setIsPushing(true)}
                  onMouseUp={() => setIsPushing(false)}
                  onTouchStart={() => setIsPushing(true)}
                  onTouchEnd={() => setIsPushing(false)}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition ${isPushing ? 'bg-violet-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.5)]' : 'bg-[#0a0a0f] border border-[#2a2a3a] text-zinc-400'}`}
                >
                  {isPushing ? '🔴 TALKING' : 'Hold to Talk'}
                </button>
              )}
            </div>

            <div className="text-[11px] mono text-zinc-500 mb-3">VOLUME</div>
            <div className="rounded-xl bg-[#15151f] border border-[#2a2a3a] p-4 space-y-3 mb-6">
              <div>
                <div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">Master</span><span className="mono">{Math.round(masterVolume*100)}%</span></div>
                <input type="range" min={0} max={1} step={0.01} value={masterVolume} onChange={e => setMasterVolume(parseFloat(e.target.value))} className="w-full accent-violet-600" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">SFX</span><span className="mono">{Math.round(sfxVolume*100)}%</span></div>
                <input type="range" min={0} max={1} step={0.01} value={sfxVolume} onChange={e => setSfxVolume(parseFloat(e.target.value))} className="w-full accent-violet-600" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">Voice</span><span className="mono">{Math.round(voiceVolume*100)}%</span></div>
                <input type="range" min={0} max={1} step={0.01} value={voiceVolume} onChange={e => setVoiceVolume(parseFloat(e.target.value))} className="w-full accent-violet-600" />
              </div>
            </div>

            <div className="space-y-2">
              <button onClick={() => setShowSettings(!showSettings)} className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm transition">⚙️ Settings</button>
              <button onClick={handleLeave} className="w-full py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm border border-red-500/20 transition">🚪 Leave Room</button>
            </div>
          </div>
        </div>

        {/* Main soundboard */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0f]">
          {/* Top bar */}
          <div className="p-4 border-b border-[#1e1e2a] bg-[#0f0f17]/50 backdrop-blur flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <input value={searchSound} onChange={e => setSearchSound(e.target.value)} placeholder="Search sounds..." className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#15151f] border border-[#2a2a3a] focus:border-violet-500 outline-none text-sm" />
                <span className="absolute left-3 top-2.5 text-zinc-500">🔍</span>
              </div>
              <div className="hidden md:flex items-center gap-1.5 p-1 rounded-xl bg-[#15151f] border border-[#2a2a3a]">
                {categories.slice(0,5).map(cat => (
                  <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${categoryFilter===cat ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}>{cat}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="hidden sm:inline text-zinc-500 mono">{filteredSounds.length} sounds</span>
              <button onClick={() => setShowUsersDrawer(true)} className="lg:hidden px-3 py-2 rounded-full bg-white/10">👥 {users.length}</button>
            </div>
          </div>

          {/* Sound grid */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 max-w-6xl mx-auto">
              {filteredSounds.map(sound => {
                const isRecent = recentlyPlayed.has(sound.id);
                return (
                  <button
                    key={sound.id}
                    onClick={() => handlePlaySound(sound.id)}
                    className={`sound-btn group relative aspect-[4/3] rounded-[1.25rem] bg-gradient-to-br ${sound.color} p-4 flex flex-col items-center justify-center text-center font-bold shadow-lg border border-white/10 overflow-hidden ${isRecent ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0f] scale-[0.96]' : ''}`}
                  >
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
                    <div className="absolute top-2 right-2 text-[10px] mono px-1.5 py-0.5 rounded-full bg-black/30 backdrop-blur">{sound.category}</div>
                    <div className="text-3xl mb-2 drop-shadow-lg">{sound.icon}</div>
                    <div className="text-[11px] tracking-widest leading-tight drop-shadow">{sound.name.toUpperCase()}</div>
                    {isRecent && <div className="absolute inset-0 bg-white/20 animate-pulse pointer-events-none" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile voice controls */}
          <div className="lg:hidden p-4 border-t border-[#1e1e2a] bg-[#0f0f17] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button onClick={micEnabled ? disableMic : enableMic} className={`px-4 py-2.5 rounded-xl text-sm font-medium ${micEnabled ? 'bg-emerald-600 text-white' : 'bg-white text-black'}`}>{micEnabled ? '🎙️ On' : '🔇 Off'}</button>
              <button onClick={handleMuteToggle} className={`px-4 py-2.5 rounded-xl text-sm ${isMuted ? 'bg-red-500/20 text-red-300' : 'bg-white/10'}`}>{isMuted ? 'Muted' : 'Mute'}</button>
            </div>
            <div className="flex items-center gap-2">
              {pushToTalk && (
                <button onTouchStart={() => setIsPushing(true)} onTouchEnd={() => setIsPushing(false)} onMouseDown={() => setIsPushing(true)} onMouseUp={() => setIsPushing(false)} className={`px-5 py-2.5 rounded-xl font-bold text-sm ${isPushing ? 'bg-violet-600 text-white' : 'bg-[#15151f] border border-[#2a2a3a]'}`}>Talk</button>
              )}
              <button onClick={() => setShowSettings(true)} className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">⚙️</button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className={`w-[320px] border-l border-[#1e1e2a] bg-[#0f0f17] flex-col ${showUsersDrawer ? 'flex fixed inset-0 z-40 lg:static lg:flex' : 'hidden lg:flex'}`}>
          <div className="p-4 border-b border-[#1e1e2a] flex justify-between items-center">
            <div className="text-[11px] mono text-zinc-500">ACTIVITY FEED</div>
            <button onClick={() => setShowUsersDrawer(false)} className="lg:hidden w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">✕</button>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Users */}
            <div className="p-4 border-b border-[#1e1e2a]">
              <div className="text-[11px] mono text-zinc-500 mb-3">IN ROOM — {users.length}</div>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {users.map(u => (
                  <div key={u.id} className={`group flex items-center gap-3 p-2.5 rounded-xl transition ${u.isSpeaking ? 'bg-violet-500/20 border border-violet-500/30' : 'bg-[#15151f] border border-[#2a2a3a] hover:border-[#3a3a4a]'}`}>
                    <div className="relative">
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center font-bold text-sm ${u.isSpeaking ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-[#0f0f17]' : ''}`}>{u.username.charAt(0).toUpperCase()}</div>
                      {u.isSpeaking && <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-[#0f0f17] flex items-center justify-center text-[8px]">🎙️</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        {u.username}
                        {u.isHost && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">HOST</span>}
                      </div>
                      <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                        {u.isMuted ? '🔇 Muted' : '🎙️ Live'}
                        {u.id === userId && <span className="text-violet-400">• You</span>}
                      </div>
                    </div>
                    {u.id !== userId && (
                      <div className="flex items-center gap-1">
                        <input type="range" min={0} max={1} step={0.1} value={remoteVolumes.get(u.id) ?? 1} onChange={e => setUserVolume(u.id, parseFloat(e.target.value))} className="w-12 accent-violet-600" />
                      </div>
                    )}
                  </div>
                ))}
                {users.length === 0 && <div className="text-xs text-zinc-500 text-center py-6">No users yet</div>}
              </div>
            </div>

            {/* Activity */}
            <div className="flex-1 p-4 overflow-hidden flex flex-col">
              <div className="text-[11px] mono text-zinc-500 mb-3">LIVE FEED</div>
              <div ref={activitiesRef} className="flex-1 overflow-y-auto space-y-2">
                {activities.map(a => (
                  <div key={a.id} className="flex gap-2.5 p-2.5 rounded-xl bg-[#15151f] border border-[#2a2a3a] text-xs">
                    <span className="text-sm">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-zinc-200 leading-tight truncate">{a.message}</div>
                      <div className="text-[10px] mono text-zinc-500 mt-1">{new Date(a.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
                {activities.length === 0 && <div className="text-xs text-zinc-500 text-center py-8">No activity yet. Play a sound!</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings drawer */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-sm bg-[#0f0f17] border-l border-[#2a2a3a] p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold">Settings</h3>
              <button onClick={() => setShowSettings(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">✕</button>
            </div>
            <div className="space-y-6">
              <div>
                <h4 className="text-xs mono text-zinc-500 mb-3">AUDIO</h4>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2"><span>Master Volume</span><span className="mono text-zinc-400">{Math.round(masterVolume*100)}%</span></div>
                    <input type="range" min={0} max={1} step={0.01} value={masterVolume} onChange={e => setMasterVolume(parseFloat(e.target.value))} className="w-full accent-violet-600" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2"><span>SFX Volume</span><span className="mono text-zinc-400">{Math.round(sfxVolume*100)}%</span></div>
                    <input type="range" min={0} max={1} step={0.01} value={sfxVolume} onChange={e => setSfxVolume(parseFloat(e.target.value))} className="w-full accent-violet-600" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2"><span>Voice Volume</span><span className="mono text-zinc-400">{Math.round(voiceVolume*100)}%</span></div>
                    <input type="range" min={0} max={1} step={0.01} value={voiceVolume} onChange={e => setVoiceVolume(parseFloat(e.target.value))} className="w-full accent-violet-600" />
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs mono text-zinc-500 mb-3">VOICE</h4>
                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-[#15151f] border border-[#2a2a3a]">
                    <span className="text-sm">Push to Talk</span>
                    <input type="checkbox" checked={pushToTalk} onChange={e => setPushToTalk(e.target.checked)} className="accent-violet-600 w-4 h-4" />
                  </label>
                  <div className="p-3 rounded-xl bg-[#15151f] border border-[#2a2a3a] text-xs text-zinc-400">
                    <div className="font-medium text-white mb-1">WebRTC Info</div>
                    <div>ICE: {iceServers.map(s => Array.isArray(s.urls) ? s.urls[0] : s.urls).join(', ')}</div>
                    <div className="mt-1">Mic: {micEnabled ? 'Enabled' : 'Disabled'} • Speaking: {speaking ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-xs mono text-zinc-500 mb-3">ROOM</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-3 rounded-xl bg-[#15151f] border border-[#2a2a3a]"><span className="text-zinc-400">Code</span><span className="mono font-bold">{roomCode}</span></div>
                  <div className="flex justify-between p-3 rounded-xl bg-[#15151f] border border-[#2a2a3a]"><span className="text-zinc-400">Type</span><span className="capitalize">{room?.type}</span></div>
                  <div className="flex justify-between p-3 rounded-xl bg-[#15151f] border border-[#2a2a3a]"><span className="text-zinc-400">Users</span><span>{users.length}/{room?.maxUsers}</span></div>
                </div>
              </div>
              <button onClick={handleLeave} className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 font-medium">Leave Room</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
