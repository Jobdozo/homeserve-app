// Synthesizes a classic two-tone phone-ring pattern with the Web Audio API
// instead of shipping an audio file — no asset to host, and it loops cleanly.
// Browsers require a prior user gesture before audio can play; since this
// only ever starts after the provider has already interacted with the page
// (logged in, navigated around), that requirement is already satisfied in
// practice, but failures are swallowed so the visual ringing still works
// even if a browser blocks it.
let audioCtx = null;

function getContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

function beep(ctx, startTime, duration, freq, peakGain) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

// volume: 0-1, from the provider's Ring Volume preference — scales the peak
// gain of each beep so "silent" (0) is a real option, not just quieter.
export function startRingtone(volume = 0.8) {
  const ctx = getContext();
  if (!ctx) return () => {};
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const peakGain = Math.max(0, Math.min(1, volume)) * 0.25;
  const CYCLE = 2.2; // seconds between ring bursts, like a phone ringtone
  let stopped = false;
  let timeoutId;

  function ringOnce() {
    if (stopped) return;
    try {
      const now = ctx.currentTime;
      beep(ctx, now, 0.4, 880, peakGain);
      beep(ctx, now + 0.5, 0.4, 880, peakGain);
    } catch {
      // ignore — visual ringing still works without sound
    }
    timeoutId = setTimeout(ringOnce, CYCLE * 1000);
  }
  ringOnce();

  return () => {
    stopped = true;
    clearTimeout(timeoutId);
  };
}
