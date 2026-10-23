/**
 * Sound Alert Synthesizer for Kitchen Display System (KDS)
 * Uses Web Audio API to produce crisp, reliable two-tone chimes without external audio assets.
 * Handles browser autoplay restrictions gracefully with explicit user unlock.
 */

export type AudioState = 'unlocked' | 'locked' | 'unsupported';

let audioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

export const isWebAudioSupported = (): boolean => {
  return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
};

export const getAudioState = (): AudioState => {
  if (!isWebAudioSupported()) return 'unsupported';
  if (isAudioUnlocked && audioCtx && audioCtx.state === 'running') return 'unlocked';
  return 'locked';
};

/**
 * Explicit user interaction to create or resume AudioContext
 */
export const unlockAudio = async (): Promise<boolean> => {
  if (!isWebAudioSupported()) return false;

  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    if (audioCtx.state === 'running') {
      isAudioUnlocked = true;

      // Play a quick, subtle 50ms confirmation blip so user knows audio is live
      playConfirmationTone();

      // Request browser notification permission if available
      if ('Notification' in window && Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {
          // ignore notification request errors
        }
      }

      return true;
    }
  } catch (err) {
    console.warn('[KDS Sound] Failed to unlock audio context:', err);
  }

  return false;
};

const playConfirmationTone = () => {
  if (!audioCtx || audioCtx.state !== 'running') return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch {
    // ignore
  }
};

/**
 * Synthesize two-tone new order alert:
 * Tone 1: 587.33 Hz (D5) for 150ms -> Tone 2: 880 Hz (A5) for 350ms
 * Returns true if audio played, false if audio is locked or unsupported.
 */
export const playNewOrderAlert = (): boolean => {
  if (!audioCtx || audioCtx.state !== 'running') {
    return false;
  }

  try {
    const now = audioCtx.currentTime;

    // First tone (D5 - 587.33 Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(587.33, now);

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.3, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.18);

    // Second tone (A5 - 880 Hz)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.18);

    gain2.gain.setValueAtTime(0, now + 0.18);
    gain2.gain.linearRampToValueAtTime(0.35, now + 0.20);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.55);

    return true;
  } catch (err) {
    console.warn('[KDS Sound] Error synthesizing alert tone:', err);
    return false;
  }
};

/**
 * Synthesize cheerful customer order ready alert:
 * Plays an upbeat ascending 4-tone arpeggio (C5 -> E5 -> G5 -> C6)
 * Triggers device vibration if supported.
 */
export const playOrderReadyAlert = (): boolean => {
  if (!audioCtx || audioCtx.state !== 'running') {
    return false;
  }

  try {
    const now = audioCtx.currentTime;
    const notes = [
      { freq: 523.25, time: 0, dur: 0.12 }, // C5
      { freq: 659.25, time: 0.10, dur: 0.12 }, // E5
      { freq: 783.99, time: 0.20, dur: 0.14 }, // G5
      { freq: 1046.50, time: 0.32, dur: 0.40 } // C6
    ];

    notes.forEach(({ freq, time, dur }) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0, now + time);
      gain.gain.linearRampToValueAtTime(0.35, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.start(now + time);
      osc.stop(now + time + dur);
    });

    // Mobile vibration pattern: [buzz, pause, buzz]
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 300]);
      } catch {
        // ignore vibration permission or hardware lack
      }
    }

    return true;
  } catch (err) {
    console.warn('[Sound] Error playing ready alert:', err);
    return false;
  }
};

/**
 * Trigger optional desktop/browser notification if permitted
 */
export const showBrowserNotification = (dailyOrderNumber: string, itemCount: number) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(`New Order ${dailyOrderNumber}`, {
        body: `${itemCount} item(s) awaiting kitchen preparation.`,
        icon: '/favicon.ico',
        tag: `kds-${dailyOrderNumber}`
      });
    } catch {
      // ignore notification errors
    }
  }
};

/**
 * Trigger customer order ready browser notification
 */
export const showCustomerReadyNotification = (dailyOrderNumber: string) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(`Order ${dailyOrderNumber} is Ready! 🎉`, {
        body: `Your delicious meal is ready for pickup at the counter!`,
        icon: '/favicon.ico',
        tag: `ready-${dailyOrderNumber}`
      });
    } catch {
      // ignore notification errors
    }
  }
};
