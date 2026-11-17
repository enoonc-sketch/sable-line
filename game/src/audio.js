// Procedural sound: every effect is synthesised with WebAudio, so the game ships
// no audio files and makes no network request. The context is created on the first
// user gesture; every call is guarded, so a browser without audio still plays.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(duration, filterFreq, gainValue, type = 'lowpass') {
    const c = ensure();
    if (!c) return;
    const source = c.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
    source.stop(c.currentTime + duration);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0) {
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(c.currentTime + duration);
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    shot(kind) {
      if (kind === 'sniper') {
        noise(0.28, 900, 0.5);
        tone(140, 0.22, 0.4, 'sawtooth', 45);
      } else if (kind === 'smg') {
        noise(0.09, 2400, 0.32);
        tone(190, 0.07, 0.22, 'square', 90);
      } else if (kind === 'pistol') {
        noise(0.12, 1800, 0.4);
        tone(160, 0.1, 0.3, 'square', 70);
      } else {
        noise(0.14, 1500, 0.45);
        tone(150, 0.12, 0.32, 'sawtooth', 55);
      }
    },
    distantShot() {
      noise(0.16, 700, 0.1);
    },
    dryFire() {
      tone(1400, 0.04, 0.12, 'square');
    },
    reload() {
      tone(900, 0.05, 0.14, 'square');
      setTimeout(() => tone(620, 0.05, 0.14, 'square'), 260);
      setTimeout(() => tone(1100, 0.05, 0.16, 'square'), 520);
    },
    hit() {
      tone(2100, 0.05, 0.16, 'sine');
    },
    kill() {
      tone(880, 0.09, 0.18, 'sine');
      setTimeout(() => tone(1318, 0.12, 0.18, 'sine'), 90);
    },
    hurt() {
      noise(0.12, 500, 0.3);
      tone(110, 0.14, 0.25, 'sawtooth', 60);
    },
    explosion() {
      noise(0.9, 320, 0.8);
      tone(90, 0.7, 0.5, 'sine', 30);
    },
    throwPin() {
      tone(1500, 0.03, 0.1, 'square');
    },
    beep(final = false) {
      tone(final ? 1567 : 1046, final ? 0.3 : 0.12, 0.16, 'sine');
    },
    plantDone() {
      tone(784, 0.15, 0.18, 'sine');
      setTimeout(() => tone(1046, 0.25, 0.18, 'sine'), 140);
    },
    roundWin() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.18, 'sine'), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.28, 0.16, 'sine'), i * 160));
    },
    buy() {
      tone(1200, 0.06, 0.14, 'sine');
      setTimeout(() => tone(1600, 0.08, 0.14, 'sine'), 70);
    },
    denied() {
      tone(220, 0.12, 0.16, 'square');
    },
  };
}
