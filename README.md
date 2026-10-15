# Night Shift

Creative Development – WebGPU + Three.js

**Live:** https://night-shiftt.netlify.app/

An escape room in a 1989 security post. It is 02:00, the power just failed and the door is locked. Find the four digits of the door code in the room and get out… but who has been sitting in this chair before you?

Use **Chrome or Edge** (WebGPU).

## How to play

- Drag to look around, click on objects to interact, `Esc` to go back.
- Inspected objects float to the centre and can be turned by dragging (turn the mug over, flip the notebook).
- The key goes to your inventory, use it on the drawer.
- Use the ◀ ▶ buttons on the security monitor to switch cameras.
- Turn the desk lamp to light up the dark corner.
- Click the digits on the computer screen to change them, then click ENTER.
- Stuck? Click the walkie-talkie for a tip.

## Original shaders (Shadertoy → WGSL)

| Where | Shader | License |
|---|---|---|
| Computer screen (CRT) | "Simple VHS effect" – https://www.shadertoy.com/view/cl2SR3 | – |
| Security monitor, live camera + glitch on the computer | "VCR distortion" – https://www.shadertoy.com/view/ldjGzV | CC BY-NC-SA 4.0 |
| Rain on the window | "Rain drops on screen - notexture" by Élie Michel – https://www.shadertoy.com/view/MlfBWr | CC BY 3.0 |

The shaders are ported to WGSL and used with `wgslFn` in a `MeshBasicNodeMaterial`.
Changes: the VCR shader has an `amount` uniform (0 = calm, 1 = full glitch) and a hash function instead of its noise texture; the CRT shader got scanlines and a flicker; the computer screen mixes the CRT and VCR shaders with a `uGlitch` uniform (wrong code / twist).

## Features

- Shadertoy shaders ported to WGSL, running in Three.js with the `WebGPURenderer`
- Multiple shaders: CRT + VCR mixed on the computer, VCR on the monitor, rain over a rendered night city on the window
- Live camera feed: at the twist, CAM 04 renders the room from the corner into a `RenderTarget` and the VCR shader is applied on top of it
- Interaction: hover highlights, inspect mode with rotating objects, inventory, zoom on the monitor and computer, a code lock with feedback per digit, a hint system and an end screen
- Own Blender model with baked lighting (`baked.jpg`), plus Blender renders for the camera feeds and the city
- Blender animations controlled from code: `DrawerOpen`, `DrawerRattle`, `KeyTurn`, `LampTurn`, `LampFlicker`, `ClockTick`, `DoorOpen` (played forward and backward)
- Sound effects synthesized with the Web Audio API (no audio files)

## Run locally

```
npm install
npm run dev
```
