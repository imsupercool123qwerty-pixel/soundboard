import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface Peer {
  userId: string;
  connection: RTCPeerConnection;
  audioElement?: HTMLAudioElement;
  stream?: MediaStream;
}

function getMicrophoneSupportError(): string | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Microphone access is only available in a browser.';
  }

  // Browsers intentionally hide navigator.mediaDevices on insecure origins.
  // localhost is treated as secure, but a LAN IP such as 192.168.x.x needs
  // HTTPS before getUserMedia can be used.
  if (window.isSecureContext === false) {
    return 'Microphone access requires HTTPS. Open this app on localhost or use an HTTPS URL.';
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser does not provide microphone access. Try a recent browser over HTTPS.';
  }

  return null;
}

export function useWebRTC(socket: Socket | null, roomCode: string, userId: string, users: { id: string }[], iceServers: RTCIceServer[], voiceVolume: number, isMuted: boolean) {
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(() => getMicrophoneSupportError());
  // Permission errors should be retryable after the user changes browser
  // settings, while an insecure origin should keep the control disabled.
  const voiceSupported = getMicrophoneSupportError() === null;
  const [speaking, setSpeaking] = useState(false);
  const [remoteVolumes, setRemoteVolumes] = useState<Map<string, number>>(new Map());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingTimeout = useRef<number | null>(null);

  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const supportError = getMicrophoneSupportError();
    if (supportError) {
      setMicError(supportError);
      throw new Error(supportError);
    }

    try {
      // The support check above narrows this for runtime purposes. Keep the
      // optional call here as well so an unusual browser cannot throw the
      // opaque "mediaDevices is undefined" TypeError.
      const stream = await navigator.mediaDevices!.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      localStreamRef.current = stream;
      setMicError(null);

      // Setup analyser for speaking detection when Web Audio is available.
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
      }

      return stream;
    } catch (e: any) {
      const message = e?.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow microphone access in your browser and try again.'
        : e?.name === 'NotFoundError'
          ? 'No microphone was found. Connect a microphone and try again.'
          : 'Unable to access the microphone. Check your browser permissions and try again.';
      setMicError(message);
      console.warn('Microphone unavailable:', message);
      throw e;
    }
  }, []);

  const createPeerConnection = useCallback((targetUserId: string, isInitiator: boolean) => {
    const pc = new RTCPeerConnection({ iceServers });
    
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice_candidate', { roomCode, to: targetUserId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote track from', targetUserId);
      let peer = peersRef.current.get(targetUserId);
      if (!peer) return;
      const remoteStream = event.streams[0];
      peer.stream = remoteStream;
      
      // Create audio element
      const audio = document.createElement('audio');
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      (audio as any).playsInline = true;
      audio.volume = (remoteVolumes.get(targetUserId) ?? 1) * voiceVolume;
      document.body.appendChild(audio);
      audio.play().catch(console.warn);
      peer.audioElement = audio;
      
      // Speaking detection for remote
      try {
        const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(remoteStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const checkSpeaking = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a,b)=>a+b,0)/data.length;
          // threshold for remote speaking
          if (avg > 20) {
            socket?.emit('speaking_changed', { roomCode, isSpeaking: true });
            // Also we can emit locally via callback? We'll use socket event to broadcast.
            // For UI we rely on user_speaking_changed events
          }
          if (peer && peer.audioElement) {
            requestAnimationFrame(checkSpeaking);
          }
        };
        checkSpeaking();
      } catch {}
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    return pc;
  }, [iceServers, roomCode, socket, voiceVolume, remoteVolumes]);

  const connectToUser = useCallback(async (targetUserId: string) => {
    if (targetUserId === userId) return;
    if (peersRef.current.has(targetUserId)) return;
    
    try {
      const localStream = await getLocalStream();
      const pc = createPeerConnection(targetUserId, true);
      peersRef.current.set(targetUserId, { userId: targetUserId, connection: pc });
      
      localStream.getTracks().forEach(track => {
        // Ensure track added
        const senders = pc.getSenders();
        if (!senders.find(s => s.track === track)) {
          pc.addTrack(track, localStream);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket?.emit('voice_offer', { roomCode, to: targetUserId, offer });
    } catch (e) {
      console.error('Failed to connect to user', targetUserId, e);
    }
  }, [userId, getLocalStream, createPeerConnection, socket, roomCode]);

  const handleOffer = useCallback(async (from: string, offer: RTCSessionDescriptionInit) => {
    try {
      const localStream = await getLocalStream();
      let peer = peersRef.current.get(from);
      if (!peer) {
        const pc = createPeerConnection(from, false);
        peer = { userId: from, connection: pc };
        peersRef.current.set(from, peer);
      }
      await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
      // Ensure local tracks
      localStream.getTracks().forEach(track => {
        const senders = peer!.connection.getSenders();
        if (!senders.find(s => s.track === track)) {
          peer!.connection.addTrack(track, localStream);
        }
      });
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      socket?.emit('voice_answer', { roomCode, to: from, answer });
    } catch (e) {
      console.error('Handle offer error', e);
    }
  }, [getLocalStream, createPeerConnection, socket, roomCode]);

  const handleAnswer = useCallback(async (from: string, answer: RTCSessionDescriptionInit) => {
    const peer = peersRef.current.get(from);
    if (!peer) return;
    try {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (e) {
      console.error('Handle answer error', e);
    }
  }, []);

  const handleIceCandidate = useCallback(async (from: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(from);
    if (!peer) return;
    try {
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('ICE candidate error', e);
    }
  }, []);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;
    const onOffer = (data: any) => handleOffer(data.from, data.offer);
    const onAnswer = (data: any) => handleAnswer(data.from, data.answer);
    const onIce = (data: any) => handleIceCandidate(data.from, data.candidate);
    
    socket.on('voice_offer', onOffer);
    socket.on('voice_answer', onAnswer);
    socket.on('ice_candidate', onIce);
    
    return () => {
      socket.off('voice_offer', onOffer);
      socket.off('voice_answer', onAnswer);
      socket.off('ice_candidate', onIce);
    };
  }, [socket, handleOffer, handleAnswer, handleIceCandidate]);

  // Connect to new users
  useEffect(() => {
    if (!micEnabled) return;
    users.forEach(u => {
      if (u.id !== userId && !peersRef.current.has(u.id)) {
        connectToUser(u.id);
      }
    });
    // Cleanup removed users
    peersRef.current.forEach((peer, uid) => {
      if (!users.find(u => u.id === uid)) {
        peer.audioElement?.remove();
        peer.connection.close();
        peersRef.current.delete(uid);
      }
    });
  }, [users, userId, micEnabled, connectToUser]);

  // Speaking detection for local
  useEffect(() => {
    if (!micEnabled || !analyserRef.current) return;
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let lastSpeaking = false;
    const check = () => {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a,b)=>a+b,0)/data.length;
      const isSpeakingNow = avg > 15 && !isMuted;
      if (isSpeakingNow !== lastSpeaking) {
        lastSpeaking = isSpeakingNow;
        setSpeaking(isSpeakingNow);
        socket?.emit('speaking_changed', { roomCode, isSpeaking: isSpeakingNow });
      }
      requestAnimationFrame(check);
    };
    check();
  }, [micEnabled, isMuted, socket, roomCode]);

  // Mute handling
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }, [isMuted]);

  // Voice volume update for remote audios
  useEffect(() => {
    peersRef.current.forEach((peer, uid) => {
      if (peer.audioElement) {
        const vol = (remoteVolumes.get(uid) ?? 1) * voiceVolume;
        peer.audioElement.volume = vol;
      }
    });
  }, [voiceVolume, remoteVolumes]);

  const enableMic = useCallback(async () => {
    try {
      await getLocalStream();
      setMicEnabled(true);
      return true;
    } catch {
      return false;
    }
  }, [getLocalStream]);

  const disableMic = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    peersRef.current.forEach(p => {
      p.audioElement?.remove();
      p.connection.close();
    });
    peersRef.current.clear();
    setMicEnabled(false);
    setSpeaking(false);
    socket?.emit('speaking_changed', { roomCode, isSpeaking: false });
  }, [socket, roomCode]);

  const setUserVolume = useCallback((uid: string, vol: number) => {
    setRemoteVolumes(prev => {
      const m = new Map(prev);
      m.set(uid, vol);
      return m;
    });
    const peer = peersRef.current.get(uid);
    if (peer?.audioElement) {
      peer.audioElement.volume = vol * voiceVolume;
    }
  }, [voiceVolume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disableMic();
    };
  }, []);

  return {
    micEnabled,
    enableMic,
    disableMic,
    speaking,
    micError,
    voiceSupported,
    setUserVolume,
    remoteVolumes,
    peersCount: peersRef.current.size,
  };
}
