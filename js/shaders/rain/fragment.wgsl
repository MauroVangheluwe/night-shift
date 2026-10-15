// "Rain drops on screen - notexture" by Elie Michel - https://www.shadertoy.com/view/MlfBWr
// License CC BY 3.0
// iChannel0 = the city at night, rendered in Blender
// the main function comes first (wgslFn reads its signature), helper functions follow below
fn rain(fragCoord: vec2f, iResolution: vec2f, iTime: f32, iChannel0: texture_2d<f32>, iChannel0Sampler: sampler) -> vec4f {
  let u = fragCoord / iResolution;
  let v = (fragCoord * 0.1) / iResolution;
  let n = rainNoise(v * 200.0); // displacement

  // blurry background (mip level 2.5), like looking through wet glass
  var f = textureSampleLevel(iChannel0, iChannel0Sampler, u, 2.5);

  // loop through the different inverse sizes of drops
  for (var r = 4.0; r > 0.0; r -= 1.0) {
    let x = iResolution * r * 0.015; // number of potential drops (in a grid)
    let p = 6.28 * u * x + (n - 0.5) * 2.0;
    let s = sin(p);

    // current drop properties, rounded so all fragments of one drop share them
    let cell = round(u * x - 0.25) / x;
    let d = vec4f(rainNoise(cell * 200.0), rainNoise(cell));

    // drop shape and fading
    let t = (s.x + s.y) * max(0.0, 1.0 - fract(iTime * (d.b + 0.1) + d.g) * 2.0);

    // d.r -> only x% of drops are kept on, with x depending on the size of drops
    if (d.r < (5.0 - r) * 0.08 && t > 0.5) {
      // drop normal (named nrm: WGSL doesn't allow shadowing like GLSL does here)
      let nrm = normalize(-vec3f(cos(p), mix(0.2, 2.0, t - 0.5)));
      // poor man's refraction
      // textureSampleLevel: WGSL only allows textureSample in uniform control flow, not inside this if
      f = textureSampleLevel(iChannel0, iChannel0Sampler, u - nrm.xy * 0.3, 0.0);
    }
  }
  return f;
}

fn rainRand(c: vec2f) -> vec2f {
  let m = mat2x2f(12.9898, 0.16180, 78.233, 0.31415);
  return fract(sin(m * c) * vec2f(43758.5453, 14142.1));
}

fn rainNoise(p: vec2f) -> vec2f {
  let co = floor(p);
  var mu = fract(p);
  mu = 3.0 * mu * mu - 2.0 * mu * mu * mu;
  let a = rainRand(co + vec2f(0.0, 0.0));
  let b = rainRand(co + vec2f(1.0, 0.0));
  let c = rainRand(co + vec2f(0.0, 1.0));
  let d = rainRand(co + vec2f(1.0, 1.0));
  return mix(mix(a, b, mu.x), mix(c, d, mu.x), mu.y);
}
