// https://www.shadertoy.com/view/Ms2SD1
import * as THREE from 'three/webgpu'
import { wgslFn, uniform, uv, colorSpaceToWorking } from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import seascapeShader from './shaders/seascape/fragment.wgsl?raw'

const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()

const size = {
  width: window.innerWidth,
  height: window.innerHeight
}

const camera = new THREE.PerspectiveCamera(45, size.width / size.height, 0.1, 100)
camera.position.z = 5
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.05

const renderer = new THREE.WebGPURenderer({
  canvas: canvas,
  antialias: true,
  alpha: false
})
renderer.setSize(size.width, size.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// uniforms are TSL nodes, we update their .value every frame
const iTime = uniform(0)
const iMouse = uniform(new THREE.Vector2(0, 0))
const iResolution = uniform(new THREE.Vector2(16, 9))

const seascape = wgslFn(seascapeShader)
const seaMaterial = new THREE.MeshBasicNodeMaterial()
// the shadertoy shader outputs display-ready (sRGB) colors, tell three to treat them as such
seaMaterial.colorNode = colorSpaceToWorking(seascape({
  fragCoord: uv().mul(iResolution),
  iTime,
  iMouse,
  iResolution,
}), THREE.SRGBColorSpace)

// temporary plane, will become the porthole glass of the Blender cabin
const seaPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), seaMaterial)
scene.add(seaPlane)

const mouse = new THREE.Vector2()
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX
  mouse.y = e.clientY
})

const clock = new THREE.Clock()
const draw = () => {
  const elapsedTime = clock.getElapsedTime()

  iTime.value = elapsedTime
  iMouse.value.set(mouse.x, mouse.y)

  controls.update()
  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  // Update size
  size.width = window.innerWidth
  size.height = window.innerHeight

  // Update camera
  camera.aspect = size.width / size.height
  camera.updateProjectionMatrix()

  // Update renderer
  renderer.setSize(size.width, size.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

renderer.setAnimationLoop(draw)
