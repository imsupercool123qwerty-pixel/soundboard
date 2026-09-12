import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RoomPublic } from '../types';
import { getOrCreateUserId, getOrCreateUsername, setUsername } from '../utils/storage';

export default function Rooms() {
  const [rooms, setRooms] = useState<RoomPublic[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [username, setUsernameLocal] = useState(getOrCreateUsername());
  const [showJoin, setShowJoin] = useState<RoomPublic | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      setRooms(data);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchRooms();
    const id = setInterval(fetchRooms, 5000);
    return () => clearInterval(id);
  }, []);

  const filtered = rooms.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()));

  const handleJoin = async (room: RoomPublic) => {
    setError('');
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: room.code, password: joinPassword || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join');
      setUsername(username);
      navigate(`/room/${room.code}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-[#1e1e2a]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center font-bold">S</div>
            <span className="font-bold">SOUNDBOARD</span>
          </Link>
          <div className="flex items-center gap-3">
            <input value={username} onChange={e => setUsernameLocal(e.target.value)} className="hidden md:block px-3 py-2 rounded-full bg-[#15151f] border border-[#2a2a3a] text-sm w-36 focus:border-violet-500 outline-none" placeholder="Your name" />
            <Link to="/" className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm transition">Home</Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Public Rooms</h1>
            <p className="text-zinc-400 text-sm">Discover and join live meme soundboard rooms from around the world.</p>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rooms..." className="pl-10 pr-4 py-3 rounded-xl bg-[#15151f] border border-[#2a2a3a] focus:border-violet-500 outline-none w-full md:w-72 text-sm" />
              <span className="absolute left-3.5 top-3.5 text-zinc-500">🔍</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-36 rounded-2xl bg-[#15151f] border border-[#2a2a3a] animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🕸️</div>
            <h3 className="font-semibold mb-2">No rooms found</h3>
            <p className="text-zinc-500 text-sm mb-6">Be the first to create a public room!</p>
            <Link to="/" className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-medium inline-block">Create Room</Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(room => (
              <div key={room.code} className="group rounded-[1.25rem] bg-[#15151f] border border-[#2a2a3a] hover:border-violet-500/50 p-5 transition-all hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(139,92,246,0.15)]">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg leading-tight truncate pr-2">{room.name}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[11px] mono px-2 py-0.5 rounded-full bg-[#0a0a0f] border border-[#2a2a3a] text-zinc-400">{room.code}</span>
                      {room.hasPassword && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">🔒 Locked</span>}
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">PUBLIC</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center font-bold text-sm">
                    {room.name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400 mb-4">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />{room.currentUsers}/{room.maxUsers} users</span>
                  <span>👑 {room.creatorName}</span>
                </div>
                <button onClick={() => setShowJoin(room)} className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition group-hover:bg-violet-600 group-hover:text-white">
                  JOIN ROOM
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-[#15151f] border border-[#2a2a3a] p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold">Join {showJoin.name}</h3>
              <button onClick={() => { setShowJoin(null); setJoinPassword(''); setError(''); }} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">✕</button>
            </div>
            {error && <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="text-xs mono text-zinc-400 mb-2 block">YOUR NAME</label>
                <input value={username} onChange={e => setUsernameLocal(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-[#2a2a3a] focus:border-violet-500 outline-none" />
              </div>
              {showJoin.hasPassword && (
                <div>
                  <label className="text-xs mono text-zinc-400 mb-2 block">PASSWORD</label>
                  <input type="password" value={joinPassword} onChange={e => setJoinPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#0a0a0f] border border-[#2a2a3a] focus:border-violet-500 outline-none" placeholder="Enter password" />
                </div>
              )}
              <button onClick={() => handleJoin(showJoin)} className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold transition">Join Room</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
