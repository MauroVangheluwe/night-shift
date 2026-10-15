// Everything that is drawn on a 2D canvas: the computer terminal, the security monitor,
// and the paper props (post-it, notebook, logbook, badge, corkboard, labels).
// The canvases are used as textures - the screens go through the Shadertoy shaders as iChannel0.
import * as THREE from 'three/webgpu'

const GREEN = '#7dff9b'
const DIM = '#2f7a44'
const RED = '#ff4b4b'
const BG = '#031a0b'
const MONO = '"VT323", "Courier New", monospace'
const HAND = '"Caveat", "Bradley Hand", "Segoe Script", cursive'
const INK = '#1d1a3a'

const makeCanvas = (w, h, srgb = false) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const texture = new THREE.CanvasTexture(canvas)
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace // only for textures shown without a shader
  return { canvas, ctx: canvas.getContext('2d'), texture, w, h }
}

// ---------- small vector icons (same on the notebook and the code screen) ----------
export const drawIcon = (ctx, type, x, y, s, color) => {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(2, s * 0.08)
  ctx.translate(x, y)
  if (type === 'book') {
    ctx.strokeRect(-s * 0.4, -s * 0.3, s * 0.8, s * 0.6)
    ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.lineTo(0, s * 0.3); ctx.stroke()
  } else if (type === 'clock') {
    ctx.beginPath(); ctx.arc(0, 0, s * 0.38, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.26); ctx.moveTo(0, 0); ctx.lineTo(s * 0.18, s * 0.1); ctx.stroke()
  } else if (type === 'camera') {
    ctx.strokeRect(-s * 0.4, -s * 0.22, s * 0.6, s * 0.44)
    ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.08); ctx.lineTo(s * 0.42, -s * 0.22); ctx.lineTo(s * 0.42, s * 0.22); ctx.lineTo(s * 0.2, s * 0.08); ctx.stroke()
  } else if (type === 'lamp') {
    ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.26, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke()
    ctx.strokeRect(-s * 0.12, s * 0.18, s * 0.24, s * 0.14)
  }
  ctx.restore()
}
export const ICONS = ['book', 'clock', 'camera', 'lamp']

// ---------- terminal (computer screen) ----------
export const terminal = makeCanvas(640, 480)
export const DIGIT_BOXES = [0, 1, 2, 3].map((i) => ({ x: 150 + i * 80, y: 262, w: 60, h: 76 }))
export const ENTER_BOX = { x: 482, y: 262, w: 120, h: 76 }

export const drawLogin = (digits, colors, message = '', messageColor = GREEN) => {
  const { ctx, texture } = terminal
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, 640, 480)
  ctx.textBaseline = 'top'
  ctx.font = `34px ${MONO}`
  ctx.fillStyle = GREEN
  ctx.fillText('OMNICORP SECURITY v2.1', 40, 34)
  ctx.fillStyle = DIM
  ctx.fillText('-----------------------------', 40, 66)
  ctx.fillStyle = GREEN
  ctx.fillText('POST 3 - DEUR 1:  VERGRENDELD', 40, 100)
  ctx.fillText('VOER CODE IN:', 40, 150)

  ctx.textAlign = 'center'
  DIGIT_BOXES.forEach((b, i) => {
    const c = colors[i] || GREEN
    drawIcon(ctx, ICONS[i], b.x + b.w / 2, b.y - 26, 34, c)
    ctx.strokeStyle = c
    ctx.lineWidth = 3
    ctx.strokeRect(b.x, b.y, b.w, b.h)
    ctx.fillStyle = c
    ctx.font = `64px ${MONO}`
    ctx.fillText(String(digits[i]), b.x + b.w / 2, b.y + 8)
  })
  ctx.font = `36px ${MONO}`
  ctx.fillStyle = GREEN
  ctx.fillRect(ENTER_BOX.x, ENTER_BOX.y, ENTER_BOX.w, ENTER_BOX.h)
  ctx.fillStyle = BG
  ctx.fillText('ENTER', ENTER_BOX.x + ENTER_BOX.w / 2, ENTER_BOX.y + 22)
  ctx.textAlign = 'left'

  ctx.font = `34px ${MONO}`
  if (message) {
    ctx.fillStyle = messageColor
    ctx.fillText(message, 40, 380)
  }
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = GREEN
    ctx.fillRect(560, 420, 16, 30)
  }
  texture.needsUpdate = true
}

export const drawFlash = (color, text) => {
  const { ctx, texture } = terminal
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 640, 480)
  ctx.fillStyle = BG
  ctx.font = `62px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 320, 240)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  texture.needsUpdate = true
}

export const drawMessage = (lines) => {
  const { ctx, texture } = terminal
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, 640, 480)
  ctx.font = `48px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = GREEN
  lines.forEach((line, i) => ctx.fillText(line, 50, 150 + i * 64))
  texture.needsUpdate = true
}

// ---------- security monitor: one camera at a time ----------
export const monitor = makeCanvas(640, 480)
export const CAM_NAMES = ['CAM 01 - INKOM', 'CAM 02 - GANG', 'CAM 03 - ARCHIEF', 'CAM 04 - POST 3']

export const drawMonitor = (index, image, { flicker = 1, face = false, restored = false } = {}) => {
  const { ctx, texture } = monitor
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 640, 480)
  if (image) {
    ctx.filter = `grayscale(0.8) contrast(1.15) brightness(${1.15 * flicker})`
    ctx.drawImage(image, 0, 0, 640, 480)
    ctx.filter = 'none'
  } else {
    // no signal: grey noise blocks
    for (let i = 0; i < 1400; i++) {
      const v = Math.floor(Math.random() * 160)
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.fillRect(Math.random() * 640, Math.random() * 480, 8, 4)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(150, 200, 340, 80)
    ctx.font = `52px ${MONO}`
    ctx.fillStyle = '#f2f2f2'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('GEEN SIGNAAL', 320, 240)
    ctx.textAlign = 'left'
  }
  if (face) {
    // a pale face, for a split second
    ctx.fillStyle = 'rgba(230,230,230,0.85)'
    ctx.beginPath(); ctx.ellipse(330, 230, 70, 95, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#000'
    ctx.beginPath(); ctx.ellipse(305, 215, 13, 9, 0, 0, Math.PI * 2); ctx.ellipse(355, 215, 13, 9, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillRect(312, 280, 36, 6)
  }
  ctx.textBaseline = 'top'
  ctx.font = `34px ${MONO}`
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(10, 10, 300, 40)
  ctx.fillStyle = '#f2f2f2'
  ctx.fillText(CAM_NAMES[index], 20, 14)
  ctx.fillText('02:00', 548, 438)
  ctx.fillStyle = RED
  ctx.beginPath(); ctx.arc(612, 26, 8, 0, Math.PI * 2); ctx.fill()
  if (restored) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(10, 430, 330, 40)
    ctx.fillStyle = GREEN
    ctx.fillText('SIGNAAL HERSTELD', 20, 434)
  }
  texture.needsUpdate = true
}

// labels drawn on top of the live CAM 04 view
export const overlay = makeCanvas(640, 480)

// ---------- paper ----------
const paper = (ctx, w, h, color = '#e4d6b0') => {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < (w * h) / 150; i++) {
    ctx.fillStyle = `rgba(90, 70, 40, ${Math.random() * 0.06})`
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
  }
}

const wrap = (ctx, text, x, y, maxWidth, lineHeight) => {
  let line = ''
  for (const word of text.split(' ')) {
    const test = line + word + ' '
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y)
      line = word + ' '
      y += lineHeight
    } else {
      line = test
    }
  }
  ctx.fillText(line, x, y)
  return y + lineHeight
}

const strike = (ctx, x, y, w) => {
  ctx.save()
  ctx.strokeStyle = INK
  ctx.lineWidth = 4
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(x - 4, y + 18 + i * 3 + Math.random() * 3)
    ctx.lineTo(x + w + 4, y + 14 + i * 3 + Math.random() * 3)
    ctx.stroke()
  }
  ctx.restore()
}

export const postIt = makeCanvas(256, 256, true)
export const notebookPage = makeCanvas(420, 560, true)
export const notebookBack = makeCanvas(420, 560, true)
export const logbook = makeCanvas(420, 560, true)
export const badge = makeCanvas(256, 352, true)
export const corkboard = makeCanvas(960, 660, true)
export const keyCabinet = makeCanvas(360, 420, true)
export const doorSign = makeCanvas(500, 140, true)

export const drawProps = () => {
  // post-it on the computer screen
  let { ctx, texture } = postIt
  paper(ctx, 256, 256, '#f4dc58')
  ctx.fillStyle = INK
  ctx.font = `38px ${HAND}`
  ctx.textBaseline = 'top'
  let y = wrap(ctx, 'Code kwijt? → bureaulade.', 16, 16, 230, 40)
  y = wrap(ctx, 'Sleutel zit bij mijn koffie.', 16, y + 6, 230, 40)
  ctx.fillText('– M.', 170, 206)
  texture.needsUpdate = true

  // notebook page: the first digit + three hints
  ;({ ctx, texture } = notebookPage)
  paper(ctx, 420, 560, '#efe8d2')
  ctx.strokeStyle = 'rgba(80, 110, 170, 0.35)'
  ctx.lineWidth = 2
  for (let ly = 70; ly < 560; ly += 42) { ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(420, ly); ctx.stroke() }
  ctx.fillStyle = INK
  ctx.font = `40px ${HAND}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('De code van de deur:', 22, 58)
  const rows = [
    ['book', '7', ''],
    ['clock', '?', 'het uur waarop alles stilviel'],
    ['camera', '?', 'op de muur in het archief'],
    ['lamp', '?', 'waar het licht nooit komt'],
  ]
  rows.forEach(([icon, digit, hint], i) => {
    const ry = 130 + i * 84
    drawIcon(ctx, icon, 46, ry - 12, 40, INK)
    if (digit === '?') {
      ctx.fillRect(84, ry - 2, 26, 4) // an empty slot to fill in
    } else {
      ctx.font = `bold 34px ${MONO}`
      ctx.fillText(digit, 88, ry)
      ctx.font = `30px ${HAND}`
      ctx.fillText('(eerste cijfer)', 124, ry - 4)
    }
    ctx.font = `32px ${HAND}`
    if (hint) ctx.fillText(hint, 124, ry - 4)
  })
  ctx.font = `34px ${HAND}`
  ctx.fillText('Niet vergeten:', 22, 490)
  ctx.fillText('ik ben', 200, 490)
  strike(ctx, 200, 462, 74)
  ctx.fillText('Marc', 290, 490)
  strike(ctx, 290, 462, 60)
  texture.needsUpdate = true

  ;({ ctx, texture } = notebookBack)
  paper(ctx, 420, 560, '#efe8d2')
  ctx.fillStyle = INK
  ctx.font = `44px ${HAND}`
  ctx.save()
  ctx.translate(60, 300)
  ctx.rotate(-0.08)
  ctx.fillText('Ik ben hier al eens', 0, 0)
  ctx.fillText('geweest.', 0, 50)
  ctx.restore()
  texture.needsUpdate = true

  // logbook on a clipboard
  ;({ ctx, texture } = logbook)
  paper(ctx, 420, 560, '#ece7da')
  ctx.fillStyle = '#222'
  ctx.font = `30px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillText('LOGBOEK POST 3 - 14/11/89', 20, 20)
  ctx.fillRect(20, 54, 380, 2)
  ctx.fillStyle = INK
  ctx.font = `32px ${HAND}`
  ;['22:00  Dienst begonnen. M.', '23:15  Ronde gedaan, alles ok.', '01:30  Beweging in het archief?',
    '          Camera 3 nakijken.', '02:00  STROOMPANNE. Klok staat stil.', '02:00  Iemand zit op mijn stoel.',
  ].forEach((line, i) => ctx.fillText(line, 20, 76 + i * 62))
  texture.needsUpdate = true

  // Marc's badge, photo scratched out
  ;({ ctx, texture } = badge)
  ctx.fillStyle = '#e8eef2'
  ctx.fillRect(0, 0, 256, 352)
  ctx.fillStyle = '#1d3a6b'
  ctx.fillRect(0, 0, 256, 60)
  ctx.fillStyle = '#fff'
  ctx.font = `30px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillText('OMNICORP', 70, 16)
  ctx.fillStyle = '#9aa4ad'
  ctx.fillRect(58, 80, 140, 160)
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 3
  for (let i = 0; i < 40; i++) {
    ctx.beginPath()
    ctx.moveTo(60 + Math.random() * 136, 82 + Math.random() * 156)
    ctx.lineTo(60 + Math.random() * 136, 82 + Math.random() * 156)
    ctx.stroke()
  }
  ctx.fillStyle = '#111'
  ctx.font = `30px ${MONO}`
  ctx.fillText('M. DECLERCQ', 40, 256)
  ctx.fillText('NACHTPLOEG', 50, 292)
  texture.needsUpdate = true

  // corkboard: floor plan with cameras, roster, newspaper clipping
  ;({ ctx, texture } = corkboard)
  ctx.fillStyle = '#8a6440'
  ctx.fillRect(0, 0, 960, 660)
  // floor plan
  ctx.save(); ctx.translate(40, 40); ctx.rotate(-0.02)
  ctx.fillStyle = '#e9edf2'; ctx.fillRect(0, 0, 480, 360)
  ctx.strokeStyle = '#1d3a6b'; ctx.lineWidth = 4
  ctx.font = `26px ${MONO}`; ctx.fillStyle = '#1d3a6b'; ctx.textBaseline = 'top'
  ctx.fillText('PLATTEGROND - GELIJKVLOERS', 20, 12)
  const roomsPlan = [['INKOM', 30, 60, 200, 120, 'CAM 01'], ['GANG', 240, 60, 210, 60, 'CAM 02'],
    ['ARCHIEF', 30, 200, 200, 130, 'CAM 03'], ['POST 3', 240, 140, 210, 190, 'CAM 04']]
  roomsPlan.forEach(([name, x, ry, w, h, cam]) => {
    ctx.strokeRect(x, ry, w, h)
    ctx.fillText(name, x + 10, ry + 8)
    drawIcon(ctx, 'camera', x + w - 40, ry + h - 26, 30, '#c0392b')
    ctx.fillStyle = '#c0392b'; ctx.fillText(cam, x + 10, ry + h - 36); ctx.fillStyle = '#1d3a6b'
  })
  ctx.restore()
  // roster
  ctx.save(); ctx.translate(560, 50); ctx.rotate(0.03)
  ctx.fillStyle = '#f4f1e6'; ctx.fillRect(0, 0, 360, 300)
  ctx.fillStyle = '#222'; ctx.font = `28px ${MONO}`; ctx.textBaseline = 'top'
  ctx.fillText('DIENSTROOSTER NACHT', 16, 12)
  ;['MA  M. DECLERCQ', 'DI  M. DECLERCQ', 'WO  M. DECLERCQ', 'DO  M. DECLERCQ', 'VR  ???'].forEach((l, i) => ctx.fillText(l, 16, 60 + i * 44))
  ctx.strokeStyle = '#b01010'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(60, 206); ctx.lineTo(240, 196); ctx.stroke()
  ctx.restore()
  // clipping
  ctx.save(); ctx.translate(560, 390); ctx.rotate(-0.05)
  ctx.fillStyle = '#d9d2bf'; ctx.fillRect(0, 0, 360, 230)
  ctx.fillStyle = '#111'; ctx.font = `34px ${MONO}`; ctx.textBaseline = 'top'
  ctx.fillText('NACHTWAKER VERMIST', 14, 14)
  ctx.fillText('NA STROOMPANNE', 14, 50)
  ctx.fillStyle = '#555'
  for (let i = 0; i < 6; i++) ctx.fillRect(14, 100 + i * 20, 300 - (i % 3) * 40, 8)
  ctx.fillStyle = '#d9d2bf'; ctx.fillRect(220, 196, 120, 26)
  ctx.restore()
  // pins
  ;[[60, 50], [740, 60], [740, 400]].forEach(([px, py]) => {
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill()
  })
  texture.needsUpdate = true

  // key cabinet labels (BUREAULADE hook is empty)
  ;({ ctx, texture } = keyCabinet)
  ctx.fillStyle = '#ddd8c8'
  ctx.fillRect(0, 0, 360, 420)
  ctx.fillStyle = '#222'
  ctx.font = `24px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ;['INKOM', 'ARCHIEF', 'KELDER', 'DAK', 'BUREAULADE', 'GARAGE'].forEach((label, i) => {
    const lx = 60 + (i % 3) * 120
    const ly = i < 3 ? 40 : 250
    ctx.fillText(label, lx, ly)
  })
  ctx.textAlign = 'left'
  texture.needsUpdate = true

  // door sign
  ;({ ctx, texture } = doorSign)
  ctx.fillStyle = '#0f3d2a'
  ctx.fillRect(0, 0, 500, 140)
  ctx.fillStyle = '#e6efe9'
  ctx.font = `46px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('BEWAKINGSPOST 3', 250, 48)
  ctx.font = `30px ${MONO}`
  ctx.fillText('ENKEL PERSONEEL', 250, 100)
  ctx.textAlign = 'left'
  texture.needsUpdate = true
}

// the warm light spot of the turned lamp, on the wall in the dark corner
export const lightSpot = makeCanvas(256, 256, true)
export const drawLightSpot = () => {
  const { ctx, texture } = lightSpot
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128)
  g.addColorStop(0, 'rgba(255, 210, 140, 0.75)')
  g.addColorStop(0.55, 'rgba(255, 190, 110, 0.35)')
  g.addColorStop(1, 'rgba(255, 180, 100, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  texture.needsUpdate = true
}
