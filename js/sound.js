// Tiny sound effects made with the Web Audio API (no audio files needed).
let ctx = null

export const initSound = () => {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  startRain()
}

const beep = (freq, duration, type = 'square', volume = 0.06) => {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

export const click = () => beep(1800, 0.04, 'square', 0.04)
export const buzz = () => beep(90, 0.45, 'sawtooth', 0.08)
export const granted = () => {
  beep(880, 0.12, 'square', 0.05)
  setTimeout(() => beep(1320, 0.25, 'square', 0.05), 120)
}
export const clunk = () => beep(60, 0.6, 'triangle', 0.3)

// soft rain: filtered noise loop
const startRain = () => {
  if (!ctx || startRain.started) return
  startRain.started = true
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1200
  const gain = ctx.createGain()
  gain.gain.value = 0.035
  src.connect(filter).connect(gain).connect(ctx.destination)
  src.start()
}
