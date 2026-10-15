// All sounds are made with the Web Audio API (no audio files).
let ctx = null
let master = null
let muted = false

export const initSound = () => {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    master = ctx.createGain()
    master.gain.value = 1.0
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  startAmbience()
}

export const toggleMute = () => {
  muted = !muted
  if (master) master.gain.setTargetAtTime(muted ? 0 : 1.0, ctx.currentTime, 0.05)
  return muted
}

const now = () => ctx.currentTime

// white noise buffer, shared
let noiseBuffer = null
const noise = () => {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = noiseBuffer.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  return src
}

const envelope = (node, volume, attack, decay, start = now()) => {
  volume = Math.min(volume * 2.5, 0.8)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(volume, start + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay)
  node.connect(g).connect(master)
  return g
}

const tone = (freq, duration, { type = 'sine', volume = 0.08, attack = 0.005, start = now(), slideTo = null } = {}) => {
  if (!ctx) return
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, start)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + duration)
  envelope(o, volume, attack, duration, start)
  o.start(start)
  o.stop(start + attack + duration + 0.05)
}

const burst = (duration, { volume = 0.1, freq = 2000, q = 1, type = 'bandpass', start = now(), attack = 0.005, sweepTo = null } = {}) => {
  if (!ctx) return
  const src = noise()
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, start)
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, start + duration)
  f.Q.value = q
  src.connect(f)
  envelope(f, volume, attack, duration, start)
  src.start(start, Math.random())
  src.stop(start + attack + duration + 0.05)
}

// ---------- one-shots, matched to the material ----------
export const paper = () => {
  if (!ctx) return
  for (let i = 0; i < 4; i++) burst(0.06, { volume: 0.05, freq: 3500 + Math.random() * 2000, q: 0.8, start: now() + i * 0.05 })
}
export const mugClink = () => {
  if (!ctx) return
  ;[2300, 3100, 2700].forEach((f, i) => tone(f, 0.25, { volume: 0.05, start: now() + i * 0.07 }))
  burst(0.05, { volume: 0.04, freq: 1200 })
}
export const tink = () => {
  if (!ctx) return
  tone(3400, 0.5, { volume: 0.08 })
  tone(5100, 0.3, { volume: 0.03 })
  burst(0.04, { volume: 0.05, freq: 800, q: 2 })
}
export const keyPick = () => {
  if (!ctx) return
  tone(2600, 0.15, { volume: 0.04 })
  tone(3900, 0.12, { volume: 0.03, start: now() + 0.05 })
}
export const rattle = () => {
  if (!ctx) return
  for (let i = 0; i < 5; i++) {
    burst(0.05, { volume: 0.12, freq: 400 + Math.random() * 300, q: 3, start: now() + i * 0.06 })
    tone(1800 + Math.random() * 400, 0.04, { type: 'square', volume: 0.015, start: now() + i * 0.06 })
  }
}
export const lockTurn = () => {
  if (!ctx) return
  burst(0.03, { volume: 0.15, freq: 2500, q: 4 })
  burst(0.04, { volume: 0.18, freq: 1500, q: 4, start: now() + 0.18 })
}
export const drawer = () => {
  if (!ctx) return
  burst(0.6, { volume: 0.1, freq: 300, sweepTo: 600, q: 0.8, attack: 0.05 })
  burst(0.08, { volume: 0.08, freq: 200, q: 1, start: now() + 0.6 })
}
export const lampClick = () => {
  if (!ctx) return
  burst(0.02, { volume: 0.12, freq: 4000, q: 2 })
  tone(900, 0.03, { type: 'square', volume: 0.02 })
}
export const lampTurn = () => {
  if (!ctx) return
  burst(0.5, { volume: 0.05, freq: 900, q: 6, attack: 0.05 })
}
export const monitorButton = () => {
  if (!ctx) return
  burst(0.03, { volume: 0.14, freq: 1500, q: 3 })
  burst(0.18, { volume: 0.06, freq: 5000, q: 0.5, start: now() + 0.03 })
}
export const beep = () => tone(1200, 0.06, { type: 'square', volume: 0.025 })
export const buzz = () => tone(90, 0.45, { type: 'sawtooth', volume: 0.08 })
export const granted = () => {
  tone(880, 0.12, { type: 'square', volume: 0.04 })
  tone(1320, 0.25, { type: 'square', volume: 0.04, start: now() + 0.13 })
}
export const radio = () => {
  if (!ctx) return
  burst(1.2, { volume: 0.12, freq: 1800, q: 0.7, attack: 0.02 })
  tone(420, 0.25, { type: 'sawtooth', volume: 0.02, start: now() + 0.5, slideTo: 300 }) // one garbled word
}
export const swell = (seconds) => {
  if (!ctx) return
  burst(seconds, { volume: 0.2, freq: 3000, q: 0.4, attack: seconds * 0.9 })
}
export const doorUnlock = () => {
  if (!ctx) return
  burst(0.05, { volume: 0.3, freq: 600, q: 3 })
  tone(70, 0.4, { type: 'triangle', volume: 0.25 })
}
export const creak = () => {
  if (!ctx) return
  tone(160, 2.4, { type: 'sawtooth', volume: 0.03, attack: 0.3, slideTo: 95 })
  burst(2.4, { volume: 0.03, freq: 700, q: 12, attack: 0.3, sweepTo: 450 })
}
export const slam = () => {
  if (!ctx) return
  tone(55, 0.5, { type: 'triangle', volume: 0.25 })
  burst(0.15, { volume: 0.15, freq: 300, q: 1 })
}

// ---------- ambience: only a distant rumble now and then ----------
let tickTimer = null
const startAmbience = () => {
  if (startAmbience.started) return
  startAmbience.started = true
  // distant thunder / passing car every 40 to 90 seconds
  const rumble = () => {
    burst(3.5, { volume: 0.06, freq: 120, q: 0.6, type: 'lowpass', attack: 0.8 })
    setTimeout(rumble, 40000 + Math.random() * 50000)
  }
  setTimeout(rumble, 25000)
}

export const startClockTick = () => {
  if (!ctx || tickTimer) return
  tickTimer = setInterval(() => {
    burst(0.02, { volume: 0.12, freq: 3000, q: 5 })
  }, 1000)
}
