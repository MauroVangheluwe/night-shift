// Everything that is drawn as text/images on a 2D canvas:
// the computer terminal, the 4 security camera feeds and the letter.
// The canvases are used as textures (iChannel0) for the shaders.
import * as THREE from 'three/webgpu'

const GREEN = '#7dff9b'
const DIM = '#2f7a44'
const RED = '#ff4b4b'
const MONO = '"VT323", "Courier New", monospace'
const HAND = '"Caveat", "Bradley Hand", "Segoe Script", cursive'

const makeCanvas = (w, h) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const texture = new THREE.CanvasTexture(canvas)
  return { canvas, ctx: canvas.getContext('2d'), texture }
}

// ---------- terminal (computer screen) ----------
export const terminal = makeCanvas(640, 480)

// clickable areas on the terminal, in canvas pixels
export const DIGIT_BOXES = [0, 1, 2, 3].map((i) => ({ x: 150 + i * 80, y: 250, w: 60, h: 76 }))
export const ENTER_BOX = { x: 482, y: 250, w: 120, h: 76 }

export const drawLogin = (digits, message = '', messageColor = GREEN, hint = '') => {
  const { ctx, texture } = terminal
  ctx.fillStyle = '#031a0b'
  ctx.fillRect(0, 0, 640, 480)
  ctx.fillStyle = GREEN
  ctx.font = `34px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillText('OMNICORP TERMINAL v2.1', 40, 40)
  ctx.fillStyle = DIM
  ctx.fillText('-----------------------------', 40, 78)
  ctx.fillStyle = GREEN
  ctx.fillText('USER:     M.DECLERCQ', 40, 120)
  ctx.fillText('PASSWORD:', 40, 190)

  ctx.font = `64px ${MONO}`
  ctx.textAlign = 'center'
  DIGIT_BOXES.forEach((b, i) => {
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 3
    ctx.strokeRect(b.x, b.y, b.w, b.h)
    ctx.fillText(String(digits[i]), b.x + b.w / 2, b.y + 8)
  })
  ctx.font = `36px ${MONO}`
  ctx.fillStyle = GREEN
  ctx.fillRect(ENTER_BOX.x, ENTER_BOX.y, ENTER_BOX.w, ENTER_BOX.h)
  ctx.fillStyle = '#031a0b'
  ctx.fillText('ENTER', ENTER_BOX.x + ENTER_BOX.w / 2, ENTER_BOX.y + 22)
  ctx.textAlign = 'left'

  ctx.font = `34px ${MONO}`
  if (message) {
    ctx.fillStyle = messageColor
    ctx.fillText(message, 40, 370)
  }
  if (hint) {
    ctx.fillStyle = DIM
    ctx.fillText(hint, 40, 415)
  }
  // blinking cursor
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = GREEN
    ctx.fillRect(560, 415, 16, 30)
  }
  texture.needsUpdate = true
}

export const drawFlash = (color, text) => {
  const { ctx, texture } = terminal
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 640, 480)
  ctx.fillStyle = '#031a0b'
  ctx.font = `70px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 320, 240)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  texture.needsUpdate = true
}

export const drawFolder = (selected) => {
  const { ctx, texture } = terminal
  ctx.fillStyle = '#031a0b'
  ctx.fillRect(0, 0, 640, 480)
  ctx.font = `34px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = GREEN
  ctx.fillText('C:\\SECURITY\\CAMERAS\\', 40, 40)
  ;['CAM_01.VID', 'CAM_02.VID', 'CAM_03.VID', 'CAM_04.VID'].forEach((name, i) => {
    const y = 120 + i * 55
    if (i === selected) {
      ctx.fillStyle = GREEN
      ctx.fillRect(30, y - 6, 420, 46)
      ctx.fillStyle = '#031a0b'
    } else {
      ctx.fillStyle = GREEN
    }
    ctx.fillText(`${name}    14-11-89  03:30`, 40, y)
  })
  texture.needsUpdate = true
}

export const drawCam04 = (image, lines) => {
  const { ctx, texture } = terminal
  ctx.drawImage(image, 0, 0, 640, 480)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillRect(0, 330, 640, 150)
  ctx.font = `30px ${MONO}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = RED
  ctx.fillText('● REC   CAM 04   14-11-1989 03:30', 20, 16)
  ctx.font = `44px ${MONO}`
  ctx.fillStyle = GREEN
  lines.forEach((line, i) => ctx.fillText(line, 40, 350 + i * 52))
  texture.needsUpdate = true
}

// ---------- security monitor: 4 camera feeds ----------
export const monitor = makeCanvas(640, 480)

export const drawMonitor = (images) => {
  const { ctx, texture } = monitor
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 640, 480)
  images.forEach((img, i) => {
    const x = (i % 2) * 320
    const y = Math.floor(i / 2) * 240
    ctx.filter = 'grayscale(0.85) contrast(1.15) brightness(1.2)'
    ctx.drawImage(img, x + 2, y + 2, 316, 236)
    ctx.filter = 'none'
    ctx.font = `26px ${MONO}`
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#f2f2f2'
    ctx.fillText(`CAM 0${i + 1}`, x + 12, y + 10)
    ctx.fillText('03:30', x + 250, y + 208)
  })
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.arc(612, 22, 7, 0, Math.PI * 2)
  ctx.fill()
  texture.needsUpdate = true
}

// ---------- the letter (front + back) ----------
const paper = (ctx, w, h) => {
  ctx.fillStyle = '#e4d6b0'
  ctx.fillRect(0, 0, w, h)
  // a bit of grain
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = `rgba(90, 70, 40, ${Math.random() * 0.06})`
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
  }
}

const wrap = (ctx, text, x, y, maxWidth, lineHeight) => {
  const words = text.split(' ')
  let line = ''
  for (const word of words) {
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
}

export const letterFront = makeCanvas(420, 594)
export const letterBack = makeCanvas(420, 594)

export const drawLetter = () => {
  let { ctx, texture } = letterFront
  paper(ctx, 420, 594)
  ctx.fillStyle = '#1d1a3a'
  ctx.font = `34px ${HAND}`
  ctx.textBaseline = 'top'
  wrap(ctx, 'Als je dit leest, ben ik weg.', 34, 50, 350, 42)
  wrap(ctx, 'Ze kijken mee.', 34, 130, 350, 42)
  wrap(ctx, 'Het wachtwoord: het uur waarop alles stopte, en de camera waarop ik nog te zien ben.', 34, 210, 350, 42)
  ctx.font = `40px ${HAND}`
  ctx.fillText('— M.', 290, 470)
  texture.needsUpdate = true

  ;({ ctx, texture } = letterBack)
  paper(ctx, 420, 594)
  // coffee stain
  ctx.strokeStyle = 'rgba(110, 60, 20, 0.45)'
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.arc(250, 220, 70, 0.3, Math.PI * 1.9)
  ctx.stroke()
  ctx.fillStyle = 'rgba(110, 60, 20, 0.12)'
  ctx.beginPath()
  ctx.arc(250, 220, 66, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1d1a3a'
  ctx.font = `44px ${HAND}`
  ctx.save()
  ctx.translate(80, 430)
  ctx.rotate(-0.12)
  ctx.fillText('cam 04', 0, 0)
  ctx.restore()
  texture.needsUpdate = true
}
