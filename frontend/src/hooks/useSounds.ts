import { useRef, useCallback, useState, useEffect } from 'react';
import { Sound } from '../types';

export function useSounds(sounds: Sound[]) {
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [masterVolume, setMasterVolume] = useState(() => {
    const v = localStorage.getItem('sb_master_vol');
    return v ? parseFloat(v) : 0.8;
  });
  const [sfxVolume, setSfxVolume] = useState(() => {
    const v = localStorage.getItem('sb_sfx_vol');
    return v ? parseFloat(v) : 0.9;
  });
  const [voiceVolume, setVoiceVolume] = useState(() => {
    const v = localStorage.getItem('sb_voice_vol');
    return v ? parseFloat(v) : 1.0;
  });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    localStorage.setItem('sb_master_vol', masterVolume.toString());
  }, [masterVolume]);
  useEffect(() => {
    localStorage.setItem('sb_sfx_vol', sfxVolume.toString());
  }, [sfxVolume]);
  useEffect(() => {
    localStorage.setItem('sb_voice_vol', voiceVolume.toString());
  }, [voiceVolume]);

  const preload = useCallback(async () => {
    if (audioCache.current.size > 0) return;
    const promises = sounds.map(s => {
      return new Promise<void>((resolve) => {
        const audio = new Audio(s.file);
        audio.preload = 'auto';
        audio.volume = masterVolume * sfxVolume;
        audio.addEventListener('canplaythrough', () => resolve(), { once: true });
        audio.addEventListener('error', () => resolve(), { once: true });
        audioCache.current.set(s.id, audio);
        // Timeout fallback
        setTimeout(() => resolve(), 2000);
      });
    });
    await Promise.all(promises);
    setLoaded(true);
  }, [sounds, masterVolume, sfxVolume]);

  const enableAudio = useCallback(async () => {
    try {
      // Unlock audio context
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }
      await preload();
      setAudioEnabled(true);
      return true;
    } catch (e) {
      console.error('Failed to enable audio', e);
      setAudioEnabled(true); // still allow
      await preload();
      return true;
    }
  }, [preload]);

  const playSound = useCallback((soundId: string, delayMs = 0) => {
    if (!audioEnabled) return;
    const sound = sounds.find(s => s.id === soundId);
    if (!sound) {
      // fallback try cache
      console.warn('Sound not found', soundId);
      return;
    }
    const play = () => {
      let audio = audioCache.current.get(soundId);
      if (!audio) {
        audio = new Audio(sound.file);
        audioCache.current.set(soundId, audio);
      }
      // Clone for overlapping playback
      const clone = audio.cloneNode(true) as HTMLAudioElement;
      clone.volume = Math.min(1, masterVolume * sfxVolume);
      clone.currentTime = 0;
      clone.play().catch(e => console.warn('Play failed', e));
    };
    if (delayMs > 0) {
      setTimeout(play, delayMs);
    } else {
      play();
    }
  }, [audioEnabled, sounds, masterVolume, sfxVolume]);

  // Update volumes on cache
  useEffect(() => {
    audioCache.current.forEach(a => {
      a.volume = masterVolume * sfxVolume;
    });
  }, [masterVolume, sfxVolume]);

  return {
    audioEnabled,
    enableAudio,
    playSound,
    masterVolume,
    setMasterVolume,
    sfxVolume,
    setSfxVolume,
    voiceVolume,
    setVoiceVolume,
    loaded,
    preload,
  };
}
