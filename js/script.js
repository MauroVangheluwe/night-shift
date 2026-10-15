// Night Shift - escape room in a 1989 office
// Shaders (ported from Shadertoy to WGSL):
//   https://www.shadertoy.com/view/cl2SR3  (computer screen, CRT)
//   https://www.shadertoy.com/view/ldjGzV  (security monitor + glitch, VCR distortion)
//   https://www.shadertoy.com/view/MlfBWr  (rain on the window)
import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, vec2, texture, mix, colorSpaceToWorking } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import crtShader from './shaders/crt/fragment.wgsl?raw'
import vcrShader from './shaders/vcr/fragment.wgsl?raw'
import rainShader from './shaders/rain/fragment.wgsl?raw'
import * as screens from './screens.js'
import * as sound from './sound.js'

const CODE = [0, 3, 0, 4]

const canvas = document.querySelector('canvas.webgl')
const $start = document.querySelector('.start')
const $fade = document.querySelector('.fade')
const $end = document.querySelector('.end')

// ---------- renderer, scene, camera ----------
const size = { width: window.innerWidth, height: window.innerHeight }
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
renderer.setSize(size.width, size.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const scene = new THREE.Scene()
scene.background = new THREE.Color('#000000')
const camera = new THREE.PerspectiveCamera(65, size.width / size.height, 0.05, 50)
camera.rotation.order = 'YXZ'
scene.add(camera) // needed because the inspected objects are attached to the camera

// ---------- uniforms (TSL nodes, we update their .value every frame) ----------
const iTime = uniform(0)
const uGlitch = uniform(0) // 0 = calm, 0.3 = wrong code, 1 = twist
const monitorAmount = uniform(0.55)
const shadertoyUv = vec2(uv().x, uv().y.oneMinus()) // glTF uv's start at the top, shadertoy at the bottom

// ---------- textures ----------
const textureLoader = new THREE.TextureLoader()
const bakedTexture = textureLoader.load('assets/baked.jpg')
bakedTexture.flipY = false // glTF models expect textures with flipY disabled
bakedTexture.colorSpace = THREE.SRGBColorSpace
const cityTexture = textureLoader.load('assets/city.png')
const loadImage = (src) => new Promise((resolve) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.src = src
})

// ---------- shader materials ----------
const crt = wgslFn(crtShader)
const vcr = wgslFn(vcrShader)
const rain = wgslFn(rainShader)

// computer: calm CRT, mixed with the VCR glitch when uGlitch goes up
const terminalTex = texture(screens.terminal.texture)
const screenRes = uniform(new THREE.Vector2(640, 480))
const screenMaterial = new THREE.MeshBasicNodeMaterial()
screenMaterial.colorNode = colorSpaceToWorking(mix(
  crt({ fragCoord: shadertoyUv.mul(screenRes), iResolution: screenRes, iTime, iChannel0: terminalTex, iChannel0Sampler: terminalTex }),
  vcr({ fragCoord: shadertoyUv.mul(screenRes), iResolution: screenRes, iTime, amount: uGlitch, iChannel0: terminalTex, iChannel0Sampler: terminalTex }),
  uGlitch
), THREE.SRGBColorSpace)

// security monitor: always a bit of VCR distortion
const monitorTex = texture(screens.monitor.texture)
const monitorMaterial = new THREE.MeshBasicNodeMaterial()
monitorMaterial.colorNode = colorSpaceToWorking(vcr({
  fragCoord: shadertoyUv.mul(screenRes), iResolution: screenRes, iTime, amount: monitorAmount,
  iChannel0: monitorTex, iChannel0Sampler: monitorTex,
}), THREE.SRGBColorSpace)

// window: rain drops over the city
const cityTex = texture(cityTexture)
const windowRes = uniform(new THREE.Vector2(800, 400))
const windowMaterial = new THREE.MeshBasicNodeMaterial()
// the glass plane faces outwards: render its back side and mirror the uv's
windowMaterial.side = THREE.DoubleSide
windowMaterial.colorNode = colorSpaceToWorking(rain({
  fragCoord: vec2(uv().x.oneMinus(), uv().y.oneMinus()).mul(windowRes), iResolution: windowRes, iTime,
  iChannel0: cityTex, iChannel0Sampler: cityTex,
}), THREE.SRGBColorSpace)

// ---------- game state ----------
const state = {
  mode: 'start', // start | look | inspect | monitor | computer | twist | end
  digits: [0, 0, 0, 0],
  message: '',
  messageColor: '#7dff9b',
  wrong: 0,
  startTime: 0,
  lampOn: true,
  tint: 1,
}
const look = { yaw: 0, pitch: -0.12, targetYaw: 0, targetPitch: -0.12 }
const objects = {} // named objects from the glb
const interactive = {} // name -> { root, materials[], action }
let hovered = null
let mixer = null
const actions = {}
const eye = new THREE.Vector3()

// ---------- small tween helper ----------
const tweens = []
const tween = (duration, onUpdate) => new Promise((resolve) => {
  tweens.push({ start: performance.now(), duration: duration * 1000, onUpdate, resolve })
})
const ease = (t) => t * t * (3 - 2 * t)
const wait = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000))

// ---------- load the baked room ----------
const bakedMaterial = new THREE.MeshBasicMaterial({ map: bakedTexture })
const loader = new GLTFLoader()

const setup = async () => {
  const [gltf, ...cams] = await Promise.all([
    loader.loadAsync('assets/NightShift.glb'),
    loadImage('assets/cam01.png'), loadImage('assets/cam02.png'),
    loadImage('assets/cam03.png'), loadImage('assets/cam04.png'),
    document.fonts.load('34px "VT323"'), document.fonts.load('34px "Caveat"'),
  ])
  screens.drawMonitor(cams.slice(0, 4))
  screens.drawLetter()
  state.cam04 = cams[3]

  const room = gltf.scene
  room.traverse((child) => {
    if (child.isMesh) child.material = bakedMaterial
  })
  ;['Screen', 'Monitor_Screen', 'Window_Glass', 'Door', 'Door_Light', 'Figure', 'Letter', 'Clock',
    'Hand_Hour', 'Hand_Min', 'Mug', 'Lamp', 'Lamp_Switch', 'CRT_Body', 'Keyboard', 'Monitor_Body', 'Eye',
  ].forEach((name) => { objects[name] = room.getObjectByName(name) })

  setMaterial(objects.Screen, screenMaterial)
  setMaterial(objects.Monitor_Screen, monitorMaterial)
  setMaterial(objects.Window_Glass, windowMaterial)
  setMaterial(objects.Door_Light, new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  objects.Door_Light.visible = false
  objects.Figure.visible = false // only exists for the CAM 04 render

  // the clock hands move together with the clock when it is inspected
  objects.Clock.attach(objects.Hand_Hour)
  objects.Clock.attach(objects.Hand_Min)

  scene.add(room)
  room.updateMatrixWorld(true)

  // the letter: two planes with the canvas textures, in place of the baked letter
  const letter = new THREE.Group()
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), new THREE.MeshBasicMaterial({ map: screens.letterFront.texture }))
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), new THREE.MeshBasicMaterial({ map: screens.letterBack.texture }))
  screens.letterFront.texture.colorSpace = THREE.SRGBColorSpace
  screens.letterBack.texture.colorSpace = THREE.SRGBColorSpace
  back.rotation.y = Math.PI
  letter.add(front, back)
  objects.Letter.getWorldPosition(letter.position)
  letter.position.y += 0.002
  objects.Letter.getWorldQuaternion(letter.quaternion)
  letter.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))
  letter.name = 'Letter'
  objects.Letter.visible = false
  objects.Letter = letter
  scene.add(letter)

  // clickable things
  addInteractive('Letter', objects.Letter, 'inspect')
  addInteractive('Clock', objects.Clock, 'inspect')
  addInteractive('Mug', objects.Mug, 'inspect')
  addInteractive('Monitor', [objects.Monitor_Body, objects.Monitor_Screen], 'monitor')
  addInteractive('Computer', [objects.CRT_Body, objects.Screen, objects.Keyboard], 'computer')
  addInteractive('Lamp', [objects.Lamp, objects.Lamp_Switch], 'lamp')

  // animations made in Blender
  mixer = new THREE.AnimationMixer(room)
  gltf.animations.forEach((clip) => { actions[clip.name] = mixer.clipAction(clip) })
  ;['DoorOpen', 'LampFlicker'].forEach((name) => {
    actions[name].setLoop(THREE.LoopOnce)
    actions[name].clampWhenFinished = true
  })

  objects.Eye.getWorldPosition(eye)
  camera.position.copy(eye)
  applyLook()
  $start.querySelector('.hint').textContent = 'Klik om je shift te beginnen'
  $start.classList.add('ready')
}

const setMaterial = (object, material) => {
  object.traverse((child) => { if (child.isMesh) child.material = material })
}

const addInteractive = (name, roots, action) => {
  roots = Array.isArray(roots) ? roots : [roots]
  const materials = []
  roots.forEach((root) => root.traverse((child) => {
    child.userData.interactive = name
    if (child.isMesh && child.material === bakedMaterial) {
      child.material = bakedMaterial.clone() // own material, so only this object lights up on hover
      materials.push(child.material)
    } else if (child.isMesh && child.material.color && !child.material.isNodeMaterial) {
      materials.push(child.material)
    }
  }))
  interactive[name] = { name, root: roots[0], materials, action }
}

// ---------- looking around (drag) ----------
const pointer = { x: 0, y: 0, down: false, dragged: false, startX: 0, startY: 0 }
const ndc = new THREE.Vector2()
const raycaster = new THREE.Raycaster()

const applyLook = () => {
  camera.rotation.set(look.pitch, look.yaw, 0)
}

canvas.addEventListener('pointerdown', (e) => {
  pointer.down = true
  pointer.dragged = false
  pointer.startX = pointer.x = e.clientX
  pointer.startY = pointer.y = e.clientY
})
window.addEventListener('pointerup', (e) => {
  pointer.down = false
  if (pointer.dragged) return
  ndc.set((e.clientX / size.width) * 2 - 1, -(e.clientY / size.height) * 2 + 1)
  if (state.mode === 'look' || state.mode === 'computer') updateHover()
  onClick(e)
})
window.addEventListener('pointermove', (e) => {
  const dx = e.clientX - pointer.x
  const dy = e.clientY - pointer.y
  pointer.x = e.clientX
  pointer.y = e.clientY
  ndc.set((e.clientX / size.width) * 2 - 1, -(e.clientY / size.height) * 2 + 1)
  if (pointer.down && Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > 5) pointer.dragged = true
  if (!pointer.down) return
  if (state.mode === 'look') {
    look.targetYaw = THREE.MathUtils.clamp(look.targetYaw + dx * 0.004, -1.75, 1.75)
    look.targetPitch = THREE.MathUtils.clamp(look.targetPitch + dy * 0.004, -0.9, 0.7)
  } else if (state.mode === 'inspect') {
    inspectPivot.rotation.y += dx * 0.01
    inspectPivot.rotation.x += dy * 0.01
  }
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') back()
})

const pick = (targets) => {
  raycaster.setFromCamera(ndc, camera)
  return raycaster.intersectObjects(targets, true)[0]
}

const hoverables = () => Object.values(interactive).map((i) => i.root)
  .concat([objects.Monitor_Screen, objects.Screen, objects.Keyboard, objects.Lamp_Switch])

const updateHover = () => {
  let name = null
  if (state.mode === 'look') {
    const hit = pick(hoverables())
    name = hit ? hit.object.userData.interactive : null
  } else if (state.mode === 'computer') {
    const hit = pick([objects.Screen])
    name = hit && screenButton(hit.uv) !== null ? 'Screen' : null
  }
  hovered = name
  canvas.style.cursor = name ? 'pointer' : (state.mode === 'look' ? 'grab' : 'default')
  Object.values(interactive).forEach((item) => {
    const glow = item.name === name ? 1.45 : 1
    item.materials.forEach((m) => m.color.setScalar(glow * state.tint))
  })
}

// ---------- clicks ----------
const onClick = () => {
  if (state.mode === 'look' && hovered) {
    const item = interactive[hovered]
    sound.click()
    if (item.action === 'inspect') inspect(item.root)
    if (item.action === 'monitor') zoomTo('monitor', objects.Monitor_Screen, 0.26)
    if (item.action === 'computer') zoomTo('computer', objects.Screen, 0.42)
    if (item.action === 'lamp') toggleLamp()
  } else if (state.mode === 'inspect') {
    if (!pick([inspected])) back()
  } else if (state.mode === 'monitor') {
    if (!pick([objects.Monitor_Screen])) back()
  } else if (state.mode === 'computer') {
    const hit = pick([objects.Screen])
    if (!hit) return back()
    pressScreen(hit.uv)
  }
}

const back = () => {
  if (state.mode === 'inspect') return uninspect()
  if (state.mode === 'monitor' || state.mode === 'computer') return zoomBack()
}

// ---------- inspect mode: object floats to the centre of the screen ----------
const inspectPivot = new THREE.Group()
inspectPivot.position.set(0, 0, -0.42)
camera.add(inspectPivot)
const dim = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthWrite: false })
)
dim.position.z = -0.7
camera.add(dim)

const FACING = {
  Letter: new THREE.Quaternion(),
  Clock: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)),
  Mug: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, -0.6, 0)),
}
const SCALE = { Letter: 0.95, Clock: 1, Mug: 1.6 }
let inspected = null
let saved = null

const inspect = async (object) => {
  state.mode = 'inspect'
  inspected = object
  saved = { parent: object.parent, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }
  inspectPivot.rotation.set(0, 0, 0)
  inspectPivot.attach(object)
  const from = { p: object.position.clone(), q: object.quaternion.clone(), s: object.scale.clone() }
  const toQ = FACING[object.name] || new THREE.Quaternion()
  const toS = from.s.clone().multiplyScalar(SCALE[object.name] || 1)
  await tween(0.5, (t) => {
    object.position.lerpVectors(from.p, new THREE.Vector3(), t)
    object.quaternion.slerpQuaternions(from.q, toQ, t)
    object.scale.lerpVectors(from.s, toS, t)
    dim.material.opacity = t * 0.7
  })
}

const uninspect = async () => {
  const object = inspected
  state.mode = 'busy'
  // fly back in world space, then put it back where it came from
  scene.attach(object)
  const target = new THREE.Object3D()
  saved.parent.add(target)
  target.position.copy(saved.position)
  target.quaternion.copy(saved.quaternion)
  target.scale.copy(saved.scale)
  target.updateWorldMatrix(true, false)
  const toP = new THREE.Vector3(); const toQ = new THREE.Quaternion(); const toS = new THREE.Vector3()
  target.matrixWorld.decompose(toP, toQ, toS)
  saved.parent.remove(target)
  const from = { p: object.position.clone(), q: object.quaternion.clone(), s: object.scale.clone() }
  await tween(0.45, (t) => {
    object.position.lerpVectors(from.p, toP, t)
    object.quaternion.slerpQuaternions(from.q, toQ, t)
    object.scale.lerpVectors(from.s, toS, t)
    dim.material.opacity = (1 - t) * 0.7
  })
  saved.parent.attach(object)
  inspected = null
  state.mode = 'look'
}

// ---------- monitor + computer mode: the camera zooms in on a screen ----------
const camFrom = { p: new THREE.Vector3(), q: new THREE.Quaternion() }

const zoomTo = async (mode, screen, distance) => {
  state.mode = 'busy'
  const center = new THREE.Vector3()
  screen.getWorldPosition(center)
  const box = new THREE.Box3().setFromObject(screen)
  box.getCenter(center)
  const toP = center.clone().add(new THREE.Vector3(0, 0, distance))
  const m = new THREE.Matrix4().lookAt(toP, center, new THREE.Vector3(0, 1, 0))
  const toQ = new THREE.Quaternion().setFromRotationMatrix(m)
  camFrom.p.copy(camera.position)
  camFrom.q.copy(camera.quaternion)
  await tween(0.7, (t) => {
    camera.position.lerpVectors(camFrom.p, toP, t)
    camera.quaternion.slerpQuaternions(camFrom.q, toQ, t)
  })
  state.mode = mode
}

const zoomBack = async () => {
  state.mode = 'busy'
  const p = camera.position.clone()
  const q = camera.quaternion.clone()
  const toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'))
  await tween(0.6, (t) => {
    camera.position.lerpVectors(p, eye, t)
    camera.quaternion.slerpQuaternions(q, toQ, t)
  })
  state.mode = 'look'
}

// ---------- lamp ----------
const setTint = (tint) => {
  state.tint = tint
  bakedMaterial.color.setScalar(tint)
  Object.values(interactive).forEach((item) => item.materials.forEach((m) => m.color.setScalar(tint)))
}

const toggleLamp = () => {
  state.lampOn = !state.lampOn
  actions.LampFlicker.stop().play()
  setTint(state.lampOn ? 1 : 0.55)
}

// ---------- the code lock on the computer screen ----------
// uv on the screen plane -> pixel on the terminal canvas (same barrel distortion as the crt shader)
const screenToCanvas = (hitUv) => {
  let x = hitUv.x * 2 - 1
  let y = (1 - hitUv.y) * 2 - 1
  const l2 = x * x + y * y
  x += x * l2 * 0.05
  y += y * l2 * 0.05
  return { x: (x * 0.5 + 0.5) * 640, y: (1 - (y * 0.5 + 0.5)) * 480 }
}
const inside = (p, b) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h

const screenButton = (hitUv) => {
  if (!hitUv || state.terminal !== 'login') return null
  const p = screenToCanvas(hitUv)
  const digit = screens.DIGIT_BOXES.findIndex((b) => inside(p, b))
  if (digit >= 0) return digit
  if (inside(p, screens.ENTER_BOX)) return 'enter'
  return null
}

const pressScreen = (hitUv) => {
  const button = screenButton(hitUv)
  if (button === null) return
  sound.click()
  state.message = ''
  if (button === 'enter') return submitCode()
  state.digits[button] = (state.digits[button] + 1) % 10
}

const submitCode = () => {
  if (state.digits.every((d, i) => d === CODE[i])) return twist()
  state.wrong++
  state.message = 'ACCESS DENIED'
  state.messageColor = '#ff4b4b'
  sound.buzz()
  glitchPulse(0.3)
}

const glitchPulse = async (amount) => {
  await tween(0.6, (t) => { uGlitch.value = amount * Math.sin(t * Math.PI) })
  uGlitch.value = 0
}

// ---------- the twist + ending ----------
const twist = async () => {
  state.mode = 'twist'
  state.terminal = 'story'
  canvas.style.cursor = 'default'
  sound.granted()
  screens.drawFlash('#7dff9b', 'ACCESS GRANTED')
  await wait(1.4)
  for (let i = 0; i <= 3; i++) {
    screens.drawFolder(i)
    await wait(0.45)
  }
  await wait(0.6)
  const lines = ['', '']
  const write = async (index, text) => {
    for (const char of text) {
      lines[index] += char
      screens.drawCam04(state.cam04, lines)
      sound.click()
      await wait(0.08)
    }
  }
  screens.drawCam04(state.cam04, lines)
  await wait(1.2)
  await write(0, 'Welkom terug, Marc.')
  await wait(0.8)
  await write(1, 'DOOR 1 UNLOCKED.')
  await wait(1)

  // glitch to the max + the lamp flickers out
  tween(1.2, (t) => { uGlitch.value = t })
  actions.LampFlicker.stop().play()
  for (const tint of [0.3, 1, 0.2, 0.8, 0.1, 0.5, 0.06]) {
    setTint(tint)
    await wait(0.12)
  }
  await wait(0.8)

  // loud click: turn towards the door, it opens, white light
  sound.clunk()
  const doorPos = new THREE.Vector3()
  objects.Door.getWorldPosition(doorPos)
  doorPos.y = eye.y
  const m = new THREE.Matrix4().lookAt(eye, doorPos, new THREE.Vector3(0, 1, 0))
  const toQ = new THREE.Quaternion().setFromRotationMatrix(m)
  const p = camera.position.clone()
  const q = camera.quaternion.clone()
  await tween(1.6, (t) => {
    camera.position.lerpVectors(p, eye, t)
    camera.quaternion.slerpQuaternions(q, toQ, t)
  })
  objects.Door_Light.visible = true
  actions.DoorOpen.play()
  actions.ClockTick.play() // time moves again
  await wait(1.2)
  $fade.classList.add('white')
  await wait(2.8)
  showEnd()
}

const showEnd = () => {
  state.mode = 'end'
  const seconds = Math.round((performance.now() - state.startTime) / 1000)
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  $end.querySelector('.time').textContent = `${mm}:${ss}`
  $end.querySelector('.wrong').textContent = state.wrong
  $end.classList.add('visible')
  const shift = new Date(1989, 10, 14, 3, 30, 0)
  const $clock = $end.querySelector('.clock')
  const tick = () => {
    shift.setSeconds(shift.getSeconds() + 1)
    $clock.textContent = shift.toTimeString().slice(0, 8)
  }
  setInterval(tick, 1000)
}

document.querySelector('.restart').addEventListener('click', () => window.location.reload())

$start.addEventListener('click', () => {
  if (!$start.classList.contains('ready')) return
  sound.initSound()
  $start.classList.add('hidden')
  state.mode = 'look'
  state.terminal = 'login'
  state.startTime = performance.now()
})

// ---------- loop ----------
const clock = new THREE.Clock()
const draw = () => {
  const delta = clock.getDelta()
  const elapsed = clock.getElapsedTime()
  iTime.value = elapsed

  const now = performance.now()
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]
    const t = Math.min((now - tw.start) / tw.duration, 1)
    tw.onUpdate(ease(t))
    if (t === 1) { tweens.splice(i, 1); tw.resolve() }
  }

  if (state.mode === 'look') {
    look.yaw += (look.targetYaw - look.yaw) * 0.12
    look.pitch += (look.targetPitch - look.pitch) * 0.12
    applyLook()
  }
  if (state.mode === 'look' || state.mode === 'computer') updateHover()
  if (state.terminal === 'login') {
    const hint = state.wrong >= 3 ? 'HINT: CHECK THE TIME' : ''
    screens.drawLogin(state.digits, state.message, state.messageColor, hint)
  }
  if (mixer) mixer.update(delta)
  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  size.width = window.innerWidth
  size.height = window.innerHeight
  camera.aspect = size.width / size.height
  camera.updateProjectionMatrix()
  renderer.setSize(size.width, size.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

// the WGSL shaders need WebGPU (Chrome / Edge / Safari 26)
if (!navigator.gpu) {
  $start.querySelector('.hint').textContent = 'Deze ervaring heeft WebGPU nodig. Open de pagina in Chrome of Edge.'
} else {
  setup()
  renderer.setAnimationLoop(draw)
}
