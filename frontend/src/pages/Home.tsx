import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getOrCreateUserId, getOrCreateUsername, setUsername } from '../utils/storage';

export default function Home() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [username, setUsernameLocal] = useState(getOrCreateUsername());
  const [roomName, setRoomName] = useState('');
  const [roomType, setRoomType] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [maxUsers, setMaxUsers] = useState(20);
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getOrCreateUserId();
  }, []);

  const handleCreate = async () => {
    if (!roomName.trim()) { setError('Room name required'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName,
          type: roomType,
          password: password || undefined,
          maxUsers,
          creatorId: getOrCreateUserId(),
          creatorName: username,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setUsername(username);
      navigate(`/room/${data.code}`);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) { setError('Room code required'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: joinCode, password: joinPassword || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join');
      setUsername(username);
      navigate(`/room/${data.code}`);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[70%] bg-pink-600/15 rounded-full blur-[130px]" />
        <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] bg-blue-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="flex justify-between items-center p-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold text-lg">S</div>
            <span className="font-bold text-xl tracking-tight">SOUNDBOARD</span>
          </div>
          <Link to="/rooms" className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 transition text-sm font-medium">Browse Rooms</Link>
        </header>

        {/* Hero */}
        <div className="max-w-7xl mx-auto px-6 pt-12 pb-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-medium mb-6">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> LIVE • Real-time voice + soundboard
              </div>
              <h1 className="text-5xl md:text-7xl font-bold leading-[0.9] tracking-tight mb-6">
                VOICE CHAT<br />
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">MEETS</span><br />
                MEME CHAOS
              </h1>
              <p className="text-zinc-400 text-lg max-w-lg mb-8 leading-relaxed">
                Create rooms, talk with friends worldwide, and trigger synchronized meme sounds. No same Wi-Fi needed — works across the internet.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <button onClick={() => setShowCreate(true)} className="px-8 py-4 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 font-semibold text-white shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-all hover:shadow-[0_0_40px_rgba(139,92,246,0.6)] hover:-translate-y-0.5">
                  Create Room
                </button>
                <button onClick={() => setShowJoin(true)} className="px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 font-semibold transition">
                  Join Room
                </button>
                <Link to="/rooms" className="px-8 py-4 rounded-2xl bg-transparent hover:bg-white/5 border border-white/10 font-semibold text-center transition">
                  Public Rooms
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm text-zinc-500">
                <span className="flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">🌐</span> Works worldwide</span>
                <span className="flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">🔒</span> Private codes</span>
                <span className="flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">🎙️</span> WebRTC voice</span>
              </div>
            </div>

            <div className="relative">
              {/* Mock soundboard preview */}
              <div className="rounded-[2rem] bg-[#15151f] border border-[#2a2a3a] p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <div className="text-xs mono text-zinc-500">Meme Central • X7K2P • 7 users</div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { n: 'VINE BOOM', i: '🔊', c: 'from-purple-500 to-pink-500' },
                    { n: 'BRUH', i: '💀', c: 'from-gray-600 to-gray-800' },
                    { n: 'AIRHORN', i: '📢', c: 'from-red-500 to-orange-500' },
                    { n: 'METAL PIPE', i: '🔨', c: 'from-slate-500 to-slate-700' },
                    { n: 'ERROR', i: '❌', c: 'from-red-600 to-red-800' },
                    { n: 'LAUGH', i: '😂', c: 'from-yellow-400 to-orange-400' },
                  ].map(s => (
                    <div key={s.n} className={`aspect-square rounded-2xl bg-gradient-to-br ${s.c} p-4 flex flex-col items-center justify-center text-center font-bold shadow-lg`}>
                      <div className="text-2xl mb-1">{s.i}</div>
                      <div className="text-[10px] tracking-wider">{s.n}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 space-y-2">
                  <div className="text-[11px] mono text-zinc-500">ACTIVITY</div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex gap-2"><span className="text-violet-400">Alex</span><span className="text-zinc-500">played</span><span>Vine Boom</span></div>
                    <div className="flex gap-2"><span className="text-emerald-400">Sam</span><span className="text-zinc-500">joined the room</span></div>
                    <div className="flex gap-2"><span className="text-pink-400">Mike</span><span className="text-zinc-500">played</span><span>Airhorn</span></div>
                  </div>
                </div>
              </div>
              {/* Floating users */}
              <div className="absolute -right-4 top-20 rounded-2xl bg-[#1c1c28] border border-[#2a2a3a] p-4 shadow-xl hidden lg:block">
                <div className="text-[11px] mono text-zinc-500 mb-3">IN ROOM — 6</div>
                <div className="space-y-2.5 text-sm">
                  {['🟢 Alex','🟢 Sam','🎙️ User123','🟢 John','🟢 Guest','🟢 Mike'].map(u => <div key={u}>{u}</div>)}
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 mt-20">
            {[
              { title: 'Real-time Sync', desc: 'Sounds play simultaneously for everyone with server timestamps & latency compensation.', icon: '⚡' },
              { title: 'Global Voice', desc: 'WebRTC with STUN/TURN — works across NATs, mobile data, different countries.', icon: '🌍' },
              { title: 'Private & Public', desc: 'Public browser for discovery, private codes that are hard to guess + optional passwords.', icon: '🔐' },
            ].map(f => (
              <div key={f.title} className="rounded-2xl bg-[#15151f] border border-[#2a2a3a] p-6">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center mb-4 text-xl">{f.icon}</div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.5rem] bg-[#15151f] border border-[#2a2a3a] p-7 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Create Room</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">✕</button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="text-xs mono text-zinc-400 mb-2 block">YOUR NAME</label>
                <input value={username} onChange={e => setUsernameLocal(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-[#2a2a3a] focus:border-violet-500 outline-none transition" placeholder="FunnyPotato42" />
              </div>
              <div>
                <label className="text-xs mono text-zinc-400 mb-2 block">ROOM NAME</label>
                <input value={roomName} onChange={e => setRoomName(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-[#2a2a3a] focus:border-violet-500 outline-none transition" placeholder="Meme Central" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setRoomType('public')} className={`p-3 rounded-xl border text-sm font-medium transition ${roomType==='public' ? 'bg-violet-600 border-violet-500 text-white' : 'bg-[#0a0a0f] border-[#2a2a3a] text-zinc-400'}`}>🌐 Public</button>
                <button onClick={() => setRoomType('private')} className={`p-3 rounded-xl border text-sm font-medium transition ${roomType==='private' ? 'bg-violet-600 border-violet-500 text-white' : 'bg-[#0a0a0f] border-[#2a2a3a] text-zinc-400'}`}>🔒 Private</button>
              </div>
              <div>
                <label className="text-xs mono text-zinc-400 mb-2 block">PASSWORD (optional)</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-[#2a2a3a] focus:border-violet-500 outline-none transition" placeholder="Leave empty for no password" />
              </div>
              <div>
                <label className="text-xs mono text-zinc-400 mb-2 block">MAX USERS: {maxUsers}</label>
                <input type="range" min={2} max={50} value={maxUsers} onChange={e => setMaxUsers(parseInt(e.target.value))} className="w-full accent-violet-500" />
              </div>
              <button onClick={handleCreate} disabled={loading} className="w-full py-3.5 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 font-semibold shadow-lg shadow-violet-600/20 transition disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Room'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Modal */}
      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.5rem] bg-[#15151f] border border-[#2a2a3a] p-7 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Join Room</h2>
              <button onClick={() => setShowJoin(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">✕</button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="text-xs mono text-zinc-400 mb-2 block">YOUR NAME</label>
                <input value={username} onChange={e => setUsernameLocal(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-[#2a2a3a] focus:border-violet-500 outline-none transition" placeholder="FunnyPotato42" />
              </div>
              <div>
                <label className="text-xs mono text-zinc-400 mb-2 block">ROOM CODE</label>
                <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-[#2a2a3a] focus:border-violet-500 outline-none transition mono tracking-widest text-center text-lg font-bold" placeholder="X7K2P" />
              </div>
              <div>
                <label className="text-xs mono text-zinc-400 mb-2 block">PASSWORD (if required)</label>
                <input type="password" value={joinPassword} onChange={e => setJoinPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-[#2a2a3a] focus:border-violet-500 outline-none transition" placeholder="••••••" />
              </div>
              <button onClick={handleJoin} disabled={loading} className="w-full py-3.5 rounded-xl bg-white text-black font-semibold hover:bg-zinc-200 transition disabled:opacity-50">
                {loading ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
