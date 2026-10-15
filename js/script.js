// Night Shift - escape room in a 1989 security post
// Shaders (ported from Shadertoy to WGSL):
//   https://www.shadertoy.com/view/cl2SR3  (computer screen, CRT)
//   https://www.shadertoy.com/view/ldjGzV  (security monitor + glitch, VCR distortion)
//   https://www.shadertoy.com/view/MlfBWr  (rain on the window)
import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, vec2, texture, mix, colorSpaceToWorking, materialColor, luminance, color } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import crtShader from './shaders/crt/fragment.wgsl?raw'
import vcrShader from './shaders/vcr/fragment.wgsl?raw'
import rainShader from './shaders/rain/fragment.wgsl?raw'
import * as screens from './screens.js'
import * as sound from './sound.js'

const CODE = [7, 2, 5, 9]

const canvas = document.querySelector('canvas.webgl')
const $start = document.querySelector('.start')
const $fade = document.querySelector('.fade')
const $end = document.querySelector('.end')
const $thought = document.querySelector('.thought')
const $inventory = document.querySelector('.inventory')
const $mute = document.querySelector('.mute')

// ---------- renderer, scene, camera ----------
const size = { width: window.innerWidth, height: window.innerHeight }
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
renderer.setSize(size.width, size.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const scene = new THREE.Scene()
scene.background = new THREE.Color('#000000')
const camera = new THREE.PerspectiveCamera(65, size.width / size.height, 0.03, 50)
camera.rotation.order = 'YXZ'
scene.add(camera) // the inspected objects hang in front of the camera

// CAM 04: a second camera in the corner renders this room (live) into a texture
const cam04 = new THREE.PerspectiveCamera(70, 4 / 3, 0.05, 30)
cam04.layers.enable(1) // layer 1 = the figure on the chair, only visible for this camera
const cam04Target = new THREE.RenderTarget(480, 360)

// ---------- uniforms (TSL nodes, we update their .value every frame) ----------
const iTime = uniform(0)
const uGlitch = uniform(0) // 0 = calm, 0.3 = wrong code, 1 = twist
const monitorAmount = uniform(0.5)
const screenRes = uniform(new THREE.Vector2(640, 480))
const windowRes = uniform(new THREE.Vector2(800, 400))
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
const screenMaterial = new THREE.MeshBasicNodeMaterial()
screenMaterial.colorNode = colorSpaceToWorking(mix(
  crt({ fragCoord: shadertoyUv.mul(screenRes), iResolution: screenRes, iTime, iChannel0: terminalTex, iChannel0Sampler: terminalTex }),
  vcr({ fragCoord: shadertoyUv.mul(screenRes), iResolution: screenRes, iTime, amount: uGlitch, iChannel0: terminalTex, iChannel0Sampler: terminalTex }),
  uGlitch
), THREE.SRGBColorSpace)

// security monitor: VCR distortion over the camera feeds
const monitorTex = texture(screens.monitor.texture)
const monitorMaterial = new THREE.MeshBasicNodeMaterial()
monitorMaterial.colorNode = colorSpaceToWorking(vcr({
  fragCoord: shadertoyUv.mul(screenRes), iResolution: screenRes, iTime, amount: monitorAmount,
  iChannel0: monitorTex, iChannel0Sampler: monitorTex,
}), THREE.SRGBColorSpace)

// security monitor, live CAM 04 (render target rows start at the top, so no flip here)
const liveTex = texture(cam04Target.texture)
const liveMaterial = new THREE.MeshBasicNodeMaterial()
liveMaterial.colorNode = vcr({
  fragCoord: uv().mul(screenRes), iResolution: screenRes, iTime, amount: monitorAmount,
  iChannel0: liveTex, iChannel0Sampler: liveTex,
})

// window: rain drops over the city (the glass faces outwards: back side + mirrored uv's)
const cityTex = texture(cityTexture)
const windowMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
windowMaterial.colorNode = colorSpaceToWorking(rain({
  fragCoord: vec2(uv().x.oneMinus(), uv().y.oneMinus()).mul(windowRes), iResolution: windowRes, iTime,
  iChannel0: cityTex, iChannel0Sampler: cityTex,
}), THREE.SRGBColorSpace)

// ---------- game state ----------
const state = {
  mode: 'start', // start | look | inspect | monitor | computer | busy | twist | end
  terminal: 'off', // off | login | story
  digits: [0, 0, 0, 0],
  digitColors: [],
  message: '',
  messageColor: '#7dff9b',
  wrong: 0,
  startTime: 0,
  tint: 1,
  cam: 0,
  lastProgress: 0,
  hintTarget: null,
  hintUntil: 0,
}
// progress flags
const flags = {
  postItRead: false, keyDropped: false, hasKey: false, drawerUnlocked: false, drawerOpen: false,
  notebookRead: false, clockSeen: false, archiveSeen: false, lampTurned: false, scratchSeen: false, codeSolved: false,
}
const look = { yaw: 0, pitch: -0.32, targetYaw: 0, targetPitch: -0.32 }
const objects = {}
const interactive = {}
let hovered = null
let mixer = null
const actions = {}
const eye = new THREE.Vector3()
let camImages = []

// ---------- small tween helper ----------
const tweens = []
const tween = (duration, onUpdate) => new Promise((resolve) => {
  tweens.push({ start: performance.now(), duration: duration * 1000, onUpdate, resolve })
})
const ease = (t) => t * t * (3 - 2 * t)
const wait = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000))

// ---------- thought line + inventory ----------
let thoughtTimer = null
const think = (text, seconds = 3) => {
  $thought.textContent = text
  $thought.classList.add('visible')
  clearTimeout(thoughtTimer)
  thoughtTimer = setTimeout(() => $thought.classList.remove('visible'), seconds * 1000)
}
const progress = () => { state.lastProgress = performance.now() }

// ---------- load the baked room ----------
const bakedMaterial = new THREE.MeshBasicMaterial({ map: bakedTexture })
const loader = new GLTFLoader()

const NAMES = ['Room', 'Desk', 'Drawer', 'Drawer_Lock', 'Key', 'Notebook', 'Badge', 'CRT_Body', 'Screen', 'PostIt', 'Keyboard',
  'Monitor_Body', 'Monitor_Screen', 'Btn_Prev', 'Btn_Next', 'Mug', 'Logbook', 'Logbook_Face', 'Walkie', 'Lamp', 'Lamp_Head',
  'Lamp_Switch', 'Door', 'Door_Light', 'Door_LED', 'Door_Sign', 'Badge_Reader', 'Coat', 'Wall_Scratch', 'Corkboard',
  'Corkboard_Face', 'KeyCabinet', 'KeyCabinet_Face', 'Clock', 'Hand_Hour', 'Hand_Min', 'Window_Glass', 'Figure',
  'Figure_Head', 'Eye', 'CAM04_Pos', 'CAM04_Target', 'Corner_Target']

const setup = async () => {
  const [gltf, ...images] = await Promise.all([
    loader.loadAsync('assets/NightShift.glb'),
    loadImage('assets/cam01.png'), loadImage('assets/cam02.png'), loadImage('assets/cam03.png'),
    document.fonts.load('34px "VT323"'), document.fonts.load('34px "Caveat"'),
  ])
  camImages = images.slice(0, 3)
  // textures on glTF meshes use flipY = false (like the baked texture)
  ;[screens.postIt, screens.logbook, screens.corkboard, screens.keyCabinet, screens.doorSign].forEach((c) => { c.texture.flipY = false })
  screens.drawProps()
  screens.drawLightSpot()

  const room = gltf.scene
  room.traverse((child) => { if (child.isMesh) child.material = bakedMaterial })
  NAMES.forEach((name) => { objects[name] = room.getObjectByName(name) })

  const basic = (options) => new THREE.MeshBasicMaterial(options)
  setMaterial(objects.Screen, screenMaterial)
  setMaterial(objects.Monitor_Screen, monitorMaterial)
  setMaterial(objects.Window_Glass, windowMaterial)
  setMaterial(objects.Door_Light, basic({ color: '#ffffff' }))
  setMaterial(objects.Door_LED, basic({ color: '#ff2a1a' }))
  setMaterial(objects.Key, basic({ color: '#d8b25a' }))
  setMaterial(objects.Wall_Scratch, basic({ color: '#cfc6a8' }))
  setMaterial(objects.PostIt, basic({ map: screens.postIt.texture, side: THREE.DoubleSide }))
  setMaterial(objects.Logbook_Face, basic({ map: screens.logbook.texture }))
  setMaterial(objects.Corkboard_Face, basic({ map: screens.corkboard.texture }))
  setMaterial(objects.KeyCabinet_Face, basic({ map: screens.keyCabinet.texture, color: '#777' }))
  setMaterial(objects.Door_Sign, basic({ map: screens.doorSign.texture, color: '#888' }))
  setMaterial(objects.Notebook, basic({ color: '#7a1c1c' }))
  setMaterial(objects.Badge, basic({ color: '#e8eef2' }))
  setMaterial(objects.Figure, basic({ color: '#141c33' }))
  setMaterial(objects.Figure_Head, basic({ color: '#7d5d4c' }))
  objects.Door_Light.visible = false
  objects.Wall_Scratch.visible = false
  objects.Figure.traverse((c) => c.layers.set(1))
  objects.Figure_Head.traverse((c) => c.layers.set(1))

  // paper faces that move together with their object
  objects.Logbook.attach(objects.Logbook_Face)
  objects.Corkboard.attach(objects.Corkboard_Face)
  addPaper(objects.Notebook, screens.notebookPage.texture, screens.notebookBack.texture, 0.15, 0.2, 0.0115)
  addPaper(objects.Badge, screens.badge.texture, null, 0.08, 0.11, 0.0025)
  objects.KeyCabinet_Face.position.x -= 0.006 // in front of the panel, not inside it
  // the cabinet's back sat exactly on the wall (z-fighting): pull it a bit off the wall
  ;[objects.KeyCabinet, objects.KeyCabinet_Face].forEach((o) => { if (o.parent !== objects.KeyCabinet) o.position.x -= 0.012 })
  objects.Clock.attach(objects.Hand_Hour)
  objects.Clock.attach(objects.Hand_Min)

  scene.add(room)
  room.updateMatrixWorld(true)

  // the drawer carries its contents (and later the key)
  objects.Drawer.attach(objects.Notebook)
  objects.Drawer.attach(objects.Badge)
  objects.Drawer.attach(objects.Drawer_Lock)

  // the key starts inside the mug (hidden), we remember where the lock is
  state.keyLock = { position: objects.Key.position.clone(), quaternion: objects.Key.quaternion.clone(), parent: objects.Key.parent }
  objects.Key.visible = false

  // warm light spot for the turned lamp, on the wall in the dark corner
  const spot = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({
    map: screens.lightSpot.texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  }))
  objects.Corner_Target.getWorldPosition(spot.position)
  spot.position.z += 0.02
  objects.Spot = spot
  scene.add(spot)

  // clickable things: [name, roots, action]
  ;[
    ['PostIt', objects.PostIt, 'inspect'], ['Mug', objects.Mug, 'inspect'], ['Notebook', objects.Notebook, 'inspect'],
    ['Logbook', objects.Logbook, 'inspect'], ['Badge', objects.Badge, 'inspect'], ['Clock', objects.Clock, 'inspect'],
    ['Corkboard', objects.Corkboard, 'inspect'], ['Key', objects.Key, 'key'],
    ['Drawer', [objects.Drawer, objects.Drawer_Lock], 'drawer'],
    ['Monitor', [objects.Monitor_Body, objects.Monitor_Screen], 'monitor'],
    ['Computer', [objects.CRT_Body, objects.Screen, objects.Keyboard], 'computer'],
    ['Lamp', [objects.Lamp, objects.Lamp_Head], 'lamp'],
    ['Walkie', objects.Walkie, 'walkie'], ['Door', [objects.Door, objects.Badge_Reader], 'door'],
    ['Coat', objects.Coat, 'coat'], ['KeyCabinet', objects.KeyCabinet, 'keycabinet'],
  ].forEach(([name, roots, action]) => addInteractive(name, roots, action))

  // animations made in Blender
  mixer = new THREE.AnimationMixer(room)
  gltf.animations.forEach((clip) => {
    actions[clip.name] = mixer.clipAction(clip)
    if (clip.name !== 'ClockTick') actions[clip.name].setLoop(THREE.LoopOnce)
    // these stay in their end pose; the rattle and the flicker let go, so they don't fight with the others
    if (['DrawerOpen', 'KeyTurn', 'LampTurn', 'DoorOpen'].includes(clip.name)) actions[clip.name].clampWhenFinished = true
  })

  objects.Eye.getWorldPosition(eye)
  camera.position.copy(eye)
  objects.CAM04_Pos.getWorldPosition(cam04.position)
  cam04.lookAt(objects.CAM04_Target.getWorldPosition(new THREE.Vector3()))
  applyLook()
  drawMonitorFeed()
  $start.querySelector('.hint').textContent = 'Klik om te beginnen'
  $start.classList.add('ready')
}

const setMaterial = (object, material) => {
  object.traverse((child) => { if (child.isMesh) child.material = material })
}

// a paper plane with a canvas texture on top (and optionally below) a flat prop
const addPaper = (object, frontTex, backTex, w, h, top) => {
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: frontTex }))
  front.rotation.x = -Math.PI / 2
  front.position.y = top
  object.add(front)
  if (backTex) {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: backTex }))
    back.rotation.x = Math.PI / 2
    back.rotation.z = Math.PI
    back.position.y = -top - 0.002 // just below the cover, not inside it
    object.add(back)
  }
}

const LIFT = { Drawer: [0.55, '#9a6c48', 0.16], Walkie: [0.55, '#8a8a8a', 0.12] } // [gamma, colour, minimum brightness]
const addInteractive = (name, roots, action) => {
  roots = Array.isArray(roots) ? roots : [roots]
  const materials = []
  roots.forEach((root) => root.traverse((child) => {
    child.userData.interactive ??= name // objects inside the drawer keep their own name
    if (!child.isMesh) return
    if (child.material === bakedMaterial && LIFT[name]) {
      // these spots came out of the bake almost black: lift the brightness (gamma) so you can see them.
      // Only the brightness is used, so the JPEG colour noise in the dark parts is not blown up.
      const [gamma, tint, floor] = LIFT[name]
      child.material = new THREE.MeshBasicNodeMaterial()
      child.material.colorNode = luminance(texture(bakedTexture).rgb).pow(gamma).mul(1 - floor).add(floor).mul(color(tint)).mul(materialColor)
      materials.push(child.material)
    } else if (child.material === bakedMaterial) {
      child.material = bakedMaterial.clone() // own material, so only this object lights up
      materials.push(child.material)
    } else if (!child.material.isNodeMaterial && !materials.includes(child.material)) {
      child.material.userData.base = child.material.color.clone()
      materials.push(child.material)
    }
  }))
  interactive[name] = { name, roots, materials, action }
}

const setGlow = (item, glow) => {
  item.materials.forEach((m) => {
    const base = m.userData.base
    if (base) m.color.copy(base).multiplyScalar(glow * state.tint)
    else m.color.setScalar(glow * state.tint)
  })
}

const setTint = (tint) => {
  state.tint = tint
  bakedMaterial.color.setScalar(tint)
  Object.values(interactive).forEach((item) => setGlow(item, 1))
}

// ---------- looking around (drag) ----------
const pointer = { x: 0, y: 0, down: false, dragged: false, startX: 0, startY: 0 }
const ndc = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
const applyLook = () => camera.rotation.set(look.pitch, look.yaw, 0)

canvas.addEventListener('pointerdown', (e) => {
  pointer.down = true
  pointer.dragged = false
  pointer.startX = pointer.x = e.clientX
  pointer.startY = pointer.y = e.clientY
})
window.addEventListener('pointerup', (e) => {
  if (!pointer.down) return
  pointer.down = false
  if (pointer.dragged) return
  ndc.set((e.clientX / size.width) * 2 - 1, -(e.clientY / size.height) * 2 + 1)
  updateHover()
  onClick()
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
    look.targetPitch = THREE.MathUtils.clamp(look.targetPitch + dy * 0.004, -0.9, 0.75)
  } else if (state.mode === 'inspect') {
    inspectPivot.rotation.y += dx * 0.01
    inspectPivot.rotation.x += dy * 0.01
    checkMugFlip()
  }
})
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') back() })

const pick = (targets) => {
  raycaster.setFromCamera(ndc, camera)
  return raycaster.intersectObjects(targets.filter(Boolean), true).find((hit) => hit.object.visible)
}
const allRoots = () => Object.values(interactive).flatMap((i) => i.roots)

const updateHover = () => {
  let name = null
  if (state.mode === 'look') {
    const hit = pick(allRoots())
    name = hit ? hit.object.userData.interactive : null
  } else if (state.mode === 'computer') {
    const hit = pick([objects.Screen])
    name = hit && screenButton(hit.uv) !== null ? 'Screen' : null
  } else if (state.mode === 'monitor') {
    const hit = pick([objects.Btn_Prev, objects.Btn_Next])
    name = hit ? hit.object.name : null
  }
  hovered = name
  canvas.style.cursor = name ? 'pointer' : (state.mode === 'look' ? 'grab' : 'default')
  const pulse = 1.25 + Math.sin(performance.now() * 0.006) * 0.25
  Object.values(interactive).forEach((item) => {
    let glow = item.name === name ? 1.45 : 1
    // the drawer lights up as soon as you have the key, the hint system highlights the next step
    if (item.name === 'Drawer' && flags.hasKey && !flags.drawerUnlocked) glow = Math.max(glow, pulse)
    // the open drawer (and what lies in it) is out of the baked shadow, so light it up
    const inDrawer = item.name === 'Drawer' || ((item.name === 'Notebook' || item.name === 'Badge') && objects[item.name].parent === objects.Drawer)
    if (inDrawer && flags.drawerOpen) glow = Math.max(glow, 1.5)
    if (item.name === 'Key' && objects.Key.visible && !flags.hasKey) glow = Math.max(glow, pulse + 0.3)
    if (item.name === state.hintTarget && performance.now() < state.hintUntil) glow = Math.max(glow, pulse + 0.3)
    setGlow(item, glow)
  })
}

// ---------- clicks ----------
const onClick = () => {
  if (state.mode === 'look' && hovered) {
    const item = interactive[hovered]
    actionsByType[item.action](item)
  } else if (state.mode === 'inspect') {
    if (!pick([inspected])) uninspect()
  } else if (state.mode === 'monitor') {
    const hit = pick([objects.Btn_Prev, objects.Btn_Next, objects.Monitor_Screen, objects.Monitor_Body])
    if (!hit) return back()
    if (hit.object.name.startsWith('Btn_')) switchCam(hit.object.name === 'Btn_Next' ? 1 : -1)
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

const actionsByType = {
  inspect: (item) => {
    sound.paper()
    if (item.name === 'Mug') sound.mugClink()
    inspect(item.roots[0])
  },
  key: () => {
    if (flags.drawerUnlocked) return actionsByType.drawer() // the key sits in the lock now
    if (!objects.Key.visible) return
    sound.keyPick()
    objects.Key.visible = false
    flags.hasKey = true
    progress()
    $inventory.classList.add('visible')
    think('Een klein koperen sleuteltje.')
  },
  drawer: () => {
    if (!flags.drawerUnlocked && !flags.hasKey) {
      sound.rattle()
      actions.DrawerRattle.stop().play()
      think('Op slot.')
      return
    }
    if (!flags.drawerUnlocked) return unlockDrawer()
    toggleDrawer()
  },
  monitor: () => zoomTo('monitor', objects.Monitor_Screen, 0.27),
  computer: () => zoomTo('computer', objects.Screen, 0.42),
  lamp: () => toggleLampHead(),
  walkie: () => {
    // the walkie-talkie is the hint button: the dispatcher gives a tip for the next step
    sound.radio()
    const tips = {
      PostIt: 'Er hangt iets geel op je computer… over.',
      Mug: 'Heb je je koffie al op? Kijk eens in je mok… over.',
      Key: 'Er ligt iets op je bureau… over.',
      Drawer: 'Dat sleuteltje past op je bureaulade… over.',
      Notebook: 'Lees je notities eens na… over.',
      Clock: 'Hoe laat is het eigenlijk daar? Kijk naar de klok… over.',
      Monitor: 'Bekijk de camera\'s eens, vooral het archief… over.',
      Lamp: 'Draai je lamp eens naar de donkere hoek… over.',
      Computer: 'Je hebt alle cijfers. Tik de code in op de computer… over.',
    }
    think('"Centrale hier… kssh… ' + tips[nextHint()] + '"', 5)
  },
  door: () => { sound.rattle(); think(flags.codeSolved ? 'Open.' : 'Op slot. Ik heb een code nodig.') },
  coat: () => { think('Een uniformjas. Op de naambadge staat alleen nog "M."') },
  keycabinet: () => { think('Het haakje BUREAULADE is leeg.') },
}

// ---------- inspect mode: object floats to the centre of the screen ----------
const inspectPivot = new THREE.Group()
inspectPivot.position.set(0, 0, -0.42)
camera.add(inspectPivot)
const dim = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthWrite: false }))
dim.position.z = -0.7
camera.add(dim)

const up = new THREE.Euler(Math.PI / 2, 0, 0)
const FACING = {
  PostIt: up, Mug: new THREE.Euler(0.35, -0.6, 0), Notebook: up, Logbook: up, Badge: up,
  Clock: new THREE.Euler(0, Math.PI / 2, 0), Corkboard: new THREE.Euler(0, Math.PI / 2, 0),
}
const SCALE = { PostIt: 2.6, Mug: 1.6, Notebook: 1.35, Logbook: 1, Badge: 2, Clock: 1, Corkboard: 0.38 }
let inspected = null
let saved = null

const inspect = async (object) => {
  state.mode = 'busy'
  inspected = object
  saved = { parent: object.parent, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }
  inspectPivot.rotation.set(0, 0, 0)
  inspectPivot.attach(object)
  const from = { p: object.position.clone(), q: object.quaternion.clone(), s: object.scale.clone() }
  const toQ = new THREE.Quaternion().setFromEuler(FACING[object.name] || new THREE.Euler())
  const toS = from.s.clone().multiplyScalar(SCALE[object.name] || 1)
  await tween(0.5, (t) => {
    object.position.lerpVectors(from.p, new THREE.Vector3(), t)
    object.quaternion.slerpQuaternions(from.q, toQ, t)
    object.scale.lerpVectors(from.s, toS, t)
    dim.material.opacity = t * 0.7
  })
  state.mode = 'inspect'
  onInspected(object.name)
}

const onInspected = (name) => {
  if (name === 'PostIt' && !flags.postItRead) { flags.postItRead = true; progress() }
  if (name === 'Mug' && !flags.keyDropped) think('Er rammelt iets in… (sleep om te draaien)', 4)
  if (name === 'Notebook') {
    if (!flags.notebookRead) { flags.notebookRead = true; progress() }
    think('Sleep om de pagina om te draaien.')
  }
  if (name === 'Clock' && !flags.clockSeen) { flags.clockSeen = true; progress(); think('Stilgevallen. Om 2 uur.') }
  if (name === 'Badge') think('De foto is weggekrast.')
}

const uninspect = async () => {
  const object = inspected
  state.mode = 'busy'
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

// turn the mug upside down: the key falls out
const checkMugFlip = () => {
  if (!inspected || inspected.name !== 'Mug' || flags.keyDropped) return
  const mugUp = new THREE.Vector3(0, 1, 0).applyQuaternion(inspected.getWorldQuaternion(new THREE.Quaternion()))
  if (mugUp.y < -0.2) dropKey()
}

const dropKey = async () => {
  flags.keyDropped = true
  progress()
  sound.mugClink()
  // the key slides out of the mug (still in front of you) and falls on the desk
  const key = objects.Key
  const mug = inspected
  scene.attach(key)
  const start = mug.getWorldPosition(new THREE.Vector3())
  key.position.copy(start)
  key.visible = true
  await uninspect()
  const mugPos = objects.Mug.getWorldPosition(new THREE.Vector3())
  const land = new THREE.Vector3(mugPos.x + 0.11, mugPos.y - 0.045, mugPos.z + 0.06)
  const fromQ = key.quaternion.clone()
  const toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0.6))
  const from = start.clone()
  // the camera glances at the desk while the key drops
  const camQ = camera.quaternion.clone()
  const lookQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, land, new THREE.Vector3(0, 1, 0)))
  state.mode = 'busy'
  tween(0.5, (t) => camera.quaternion.slerpQuaternions(camQ, lookQ, t))
  await tween(0.55, (t) => {
    key.position.lerpVectors(from, land, t)
    key.position.y += Math.sin(t * Math.PI) * 0.12 // a small arc
    key.quaternion.slerpQuaternions(fromQ, toQ, t)
  })
  sound.tink()
  // a tiny bounce
  await tween(0.18, (t) => { key.position.y = land.y + Math.sin(t * Math.PI) * 0.012 })
  sound.tink()
  think('Er viel een sleuteltje uit!', 3)
  await wait(0.6)
  await tween(0.5, (t) => camera.quaternion.slerpQuaternions(lookQ, camQ, t))
  state.mode = 'look'
}

const unlockDrawer = async () => {
  state.mode = 'busy'
  $inventory.classList.remove('visible')
  // put the key back in the lock, turn it, open the drawer
  const key = objects.Key
  state.keyLock.parent.add(key)
  key.position.copy(state.keyLock.position)
  key.quaternion.copy(state.keyLock.quaternion)
  key.visible = true
  objects.Drawer.attach(key)
  sound.lockTurn()
  actions.KeyTurn.reset().play()
  await wait(0.6)
  flags.drawerUnlocked = true
  progress()
  state.mode = 'look'
  toggleDrawer()
  // the emergency power hiccups
  setTint(0.45)
  await wait(0.12)
  setTint(1)
}

const toggleDrawer = () => {
  flags.drawerOpen = !flags.drawerOpen
  sound.drawer()
  playToggle(actions.DrawerOpen, flags.drawerOpen)
  if (flags.drawerOpen && !flags.notebookRead) think('Een notitieboekje en een badge.')
}

// play a "once" animation forwards (open) or backwards (close)
const playToggle = (action, forward) => {
  action.paused = false
  action.timeScale = forward ? 1 : -1
  if (!action.isRunning()) {
    if (forward && action.time >= action.getClip().duration) action.time = 0
    action.play()
  }
}

// ---------- lamp: turn the head towards the dark corner ----------
const toggleLampHead = async () => {
  flags.lampTurned = !flags.lampTurned
  sound.lampTurn()
  playToggle(actions.LampTurn, flags.lampTurned)
  const from = objects.Spot.material.opacity
  const to = flags.lampTurned ? 1 : 0
  if (flags.lampTurned) objects.Wall_Scratch.visible = true
  await tween(1, (t) => { objects.Spot.material.opacity = from + (to - from) * t })
  if (!flags.lampTurned) objects.Wall_Scratch.visible = false
  if (flags.lampTurned && !flags.scratchSeen) {
    flags.scratchSeen = true
    progress()
    think('Daar, in de hoek… iets gekrast in de muur.', 4)
    // spooky: a door slams on CAM 02
    state.slamUntil = performance.now() + 400
    if (state.cam === 1) sound.slam()
  }
}

// ---------- monitor + computer mode: zoom in on a screen ----------
const zoomTo = async (mode, screen, distance) => {
  state.mode = 'busy'
  const center = new THREE.Box3().setFromObject(screen).getCenter(new THREE.Vector3())
  const toP = center.clone().add(new THREE.Vector3(0, 0, distance))
  const toQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(toP, center, new THREE.Vector3(0, 1, 0)))
  const p = camera.position.clone(); const q = camera.quaternion.clone()
  await tween(0.7, (t) => {
    camera.position.lerpVectors(p, toP, t)
    camera.quaternion.slerpQuaternions(q, toQ, t)
  })
  state.mode = mode
  if (mode === 'computer' && state.terminal === 'off') state.terminal = 'login'
}

const zoomBack = async (pitch = look.pitch, yaw = look.yaw) => {
  state.mode = 'busy'
  const p = camera.position.clone(); const q = camera.quaternion.clone()
  const toQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
  await tween(0.6, (t) => {
    camera.position.lerpVectors(p, eye, t)
    camera.quaternion.slerpQuaternions(q, toQ, t)
  })
  look.pitch = look.targetPitch = pitch
  look.yaw = look.targetYaw = yaw
  state.mode = 'look'
}

// ---------- security monitor ----------
let faceShown = false
const switchCam = (dir) => {
  sound.monitorButton()
  state.cam = (state.cam + dir + 4) % 4
  state.staticUntil = performance.now() + 180
  if (state.cam === 2 && !flags.archiveSeen) { flags.archiveSeen = true; progress() }
  // once, a face flashes between two cameras
  if (!faceShown && flags.drawerUnlocked && Math.random() < 0.5) {
    faceShown = true
    state.faceUntil = performance.now() + 120
  }
}

const drawMonitorFeed = () => {
  const t = performance.now()
  if (state.cam === 3 && !flags.codeSolved) {
    screens.drawMonitor(3, null)
    return
  }
  let flicker = 1
  if (state.cam === 1) flicker = Math.random() < 0.06 ? 0.35 : 1 // the corridor tube flickers
  if (state.cam === 1 && t < (state.slamUntil || 0)) flicker = 0.2
  const face = t < (state.faceUntil || 0)
  screens.drawMonitor(state.cam, camImages[state.cam], { flicker, face })
  monitorAmount.value = t < (state.staticUntil || 0) ? 1 : 0.5
}

// ---------- the code lock on the computer screen ----------
const screenToCanvas = (hitUv) => {
  // uv on the screen plane -> pixel on the terminal canvas (same barrel distortion as the crt shader)
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
  sound.beep()
  state.message = ''
  if (button === 'enter') return submitCode()
  state.digitColors = []
  state.digits[button] = (state.digits[button] + 1) % 10
}

const submitCode = () => {
  if (state.digits.every((d, i) => d === CODE[i])) return twist()
  state.wrong++
  // the right digits turn green, the wrong ones red
  state.digitColors = state.digits.map((d, i) => (d === CODE[i] ? '#7dff9b' : '#ff4b4b'))
  state.message = 'TOEGANG GEWEIGERD'
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
  flags.codeSolved = true
  canvas.style.cursor = 'default'
  sound.granted()
  sound.doorUnlock()
  screens.drawFlash('#7dff9b', 'DEUR ONTGRENDELD')
  objects.Door_LED.traverse((c) => { if (c.isMesh) c.material.color.set('#2bff5a') })
  await wait(1.2)

  // step back so the monitor is in view; it switches to CAM 04 by itself
  zoomBack(-0.3, -0.05)
  await wait(0.7)
  state.mode = 'twist' // the mouse now moves the head of the figure on CAM 04
  state.cam = 3
  state.live = true
  setMaterial(objects.Monitor_Screen, liveMaterial)
  sound.monitorButton()
  screens.drawMessage([])
  await wait(2.8)

  const lines = ['', '']
  const write = async (index, text) => {
    for (const char of text) {
      lines[index] += char
      screens.drawMessage(lines)
      sound.beep()
      await wait(0.09)
    }
  }
  await write(0, 'Welkom terug, Marc.')
  await wait(1.2)

  // glitch to the max + the lamp flickers out
  sound.swell(1.4)
  tween(1.4, (t) => { uGlitch.value = t })
  await wait(1.2)
  actions.LampFlicker.stop().play()
  for (const tint of [0.3, 1, 0.2, 0.8, 0.1, 0.5, 0.03]) {
    setTint(tint)
    await wait(0.1)
  }
  await wait(0.9)

  // a dry click: turn towards the door, it swings open, white light
  sound.doorUnlock()
  const doorPos = objects.Door.getWorldPosition(new THREE.Vector3())
  doorPos.y = eye.y
  const toQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, doorPos, new THREE.Vector3(0, 1, 0)))
  const q = camera.quaternion.clone()
  await tween(1.6, (t) => camera.quaternion.slerpQuaternions(q, toQ, t))
  objects.Door_Light.visible = true
  sound.creak()
  actions.DoorOpen.reset().play()
  actions.ClockTick.play() // time moves again
  await wait(1.3)
  $fade.classList.add('white')
  await wait(2.8)
  showEnd()
}

const showEnd = () => {
  state.mode = 'end'
  const seconds = Math.round((performance.now() - state.startTime) / 1000)
  $end.querySelector('.time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  $end.querySelector('.wrong').textContent = state.wrong
  $end.classList.add('visible')
  sound.startClockTick()
  const shift = new Date(1989, 10, 14, 2, 0, 0)
  const $clock = $end.querySelector('.clock')
  setInterval(() => {
    shift.setSeconds(shift.getSeconds() + 1)
    $clock.textContent = shift.toTimeString().slice(0, 8)
  }, 1000)
}

// ---------- safety net: highlight the next step after 60 s without progress ----------
const nextHint = () => {
  if (!flags.postItRead) return 'PostIt'
  if (!flags.keyDropped) return 'Mug'
  if (!flags.hasKey) return 'Key'
  if (!flags.drawerUnlocked || !flags.drawerOpen && !flags.notebookRead) return 'Drawer'
  if (!flags.notebookRead) return 'Notebook'
  if (!flags.clockSeen) return 'Clock'
  if (!flags.archiveSeen) return 'Monitor'
  if (!flags.scratchSeen) return 'Lamp'
  return 'Computer'
}

const safetyNet = async () => {
  if (flags.codeSolved) return
  state.hintTarget = nextHint()
  state.hintUntil = performance.now() + 3000
  progress()
  actions.LampFlicker.stop().play()
  setTint(0.5); await wait(0.08); setTint(1); await wait(0.1); setTint(0.6); await wait(0.08); setTint(1)
}

// ---------- start / restart / mute ----------
document.querySelector('.restart').addEventListener('click', () => window.location.reload())
$mute.addEventListener('click', (e) => {
  e.stopPropagation()
  $mute.textContent = sound.toggleMute() ? 'GELUID UIT' : 'GELUID AAN'
})
$inventory.addEventListener('click', () => think('Het sleuteltje. Waar past het in?'))

$start.addEventListener('click', async () => {
  if (!$start.classList.contains('ready')) return
  sound.initSound()
  $start.classList.add('hidden')
  // the power flickers back on
  for (const tint of [0, 0.4, 0, 0.8, 0.2, 1]) {
    setTint(tint)
    await wait(0.09)
  }
  state.mode = 'look'
  state.terminal = 'login'
  state.startTime = performance.now()
  progress()
  setTimeout(() => {
    if (flags.codeSolved) return // not during the twist or on the end screen
    sound.radio(); think('…de walkie-talkie kraakt. Misschien heeft de centrale een tip?', 5) }, 30000)
})

// ---------- loop ----------
const timer = new THREE.Timer()
const draw = (timestamp) => {
  timer.update(timestamp)
  const delta = timer.getDelta()
  iTime.value = timer.getElapsed()

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
  if (['look', 'computer', 'monitor'].includes(state.mode)) updateHover()
  if (state.terminal === 'login') screens.drawLogin(state.digits, state.digitColors, state.message, state.messageColor)
  if (!state.live) drawMonitorFeed()
  if (state.mode === 'look' && now - state.lastProgress > 60000) safetyNet()
  if (mixer) mixer.update(delta)

  // live CAM 04: the figure turns its head with your mouse
  if (state.live) {
    objects.Figure_Head.rotation.y = -ndc.x * 0.9
    objects.Figure_Head.rotation.x = ndc.y * 0.3
    objects.Monitor_Screen.visible = false // never render the monitor into its own texture
    renderer.setRenderTarget(cam04Target)
    renderer.render(scene, cam04)
    renderer.setRenderTarget(null)
    objects.Monitor_Screen.visible = true
  }
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

// test helper, only in the local dev server (not in the online build)
if (import.meta.env.DEV) window.__ns = { state, flags, objects, interactive, actionsByType, look, submitCode, zoomTo, switchCam, toggleLampHead, inspect, uninspect }
