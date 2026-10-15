# Night Shift

Creative Development – WebGPU + Three.js

**Live:** https://night-shiftt.netlify.app/

An escape room in a 1989 office. You sit at the desk of Marc, a night guard who disappeared during his shift. Crack his computer to find out what happened to him.

Use **Chrome or Edge** (WebGPU).

## How to play

- Drag to look around (180°), click on objects to interact, `Esc` to go back.
- Read the letter (drag to turn it over), check the clock and the security monitor.
- Click the digits on the computer screen to change them, then click ENTER.

## Original shaders (Shadertoy → WGSL)

| Where | Shader | License |
|---|---|---|
| Computer screen (CRT) | "Simple VHS effect" – https://www.shadertoy.com/view/cl2SR3 | – |
| Security monitor + glitch on the computer | "VCR distortion" – https://www.shadertoy.com/view/ldjGzV | CC BY-NC-SA 4.0 |
| Rain on the window | "Rain drops on screen - notexture" by Élie Michel – https://www.shadertoy.com/view/MlfBWr | CC BY 3.0 |

The shaders are ported to WGSL and used with `wgslFn` in a `MeshBasicNodeMaterial`.
Changes: the VCR shader has an `amount` uniform (0 = calm, 1 = full glitch) and a hash function instead of its noise texture; the CRT shader got scanlines and a flicker; the computer screen mixes the CRT and VCR shaders with a `uGlitch` uniform (wrong code / twist).

## Features

- Shadertoy shaders ported to WGSL, running in Three.js with the `WebGPURenderer`
- Multiple shaders: CRT + VCR mixed on the computer, VCR on the monitor, rain on the window
- Interaction: hover highlights, inspect mode (objects float to the centre and can be rotated), zoom on the monitor and computer, a code lock on the screen, a story with a twist and an end screen
- Own Blender model with baked lighting (`baked.jpg`), plus Blender renders for the camera feeds and the city
- Blender animations controlled from code: `DoorOpen`, `LampFlicker`, `ClockTick`
- Sound effects with the Web Audio API

## Run locally

```
npm install
npm run dev
```
