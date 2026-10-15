// "VCR distortion" - https://www.shadertoy.com/view/ldjGzV
// License CC BY-NC-SA 4.0 - https://creativecommons.org/licenses/by-nc-sa/4.0/
// Changes: the noise texture (iChannel1) is replaced by a hash function,
// and an `amount` uniform controls how strong the distortion is (0 = calm, 1 = full glitch).
// the main function comes first (wgslFn reads its signature), helper functions follow below
fn vcr(fragCoord: vec2f, iResolution: vec2f, iTime: f32, amount: f32, iChannel0: texture_2d<f32>, iChannel0Sampler: sampler) -> vec4f {
  var uv = fragCoord / iResolution;
  uv = vcrScreenDistort(uv);
  var video = vcrGetVideo(uv, iTime, amount, iChannel0, iChannel0Sampler);
  let vigAmt = 3.0 + 0.3 * sin(iTime + 5.0 * cos(iTime * 5.0));
  let vignette = (1.0 - vigAmt * (uv.y - 0.5) * (uv.y - 0.5)) * (1.0 - vigAmt * (uv.x - 0.5) * (uv.x - 0.5));

  video += vec3f(vcrStripes(uv, iTime) * amount);
  video += vec3f(vcrNoise(uv * 2.0, iTime) / 2.0 * amount);
  video *= vignette;
  video *= (12.0 + vcrMod(uv.y * 30.0 + iTime, 1.0)) / 13.0;

  return vec4f(video, 1.0);
}

// GLSL mod(): WGSL's % operator keeps the sign of the dividend, GLSL's mod() doesn't
fn vcrMod(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

fn vcrHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

// replaces the 256x256 noise texture of the original (bilinear value noise)
fn vcrNoiseTex(p: vec2f) -> f32 {
  let q = p * 256.0;
  let i = floor(q);
  let f = fract(q);
  let a = vcrHash(i);
  let b = vcrHash(i + vec2f(1.0, 0.0));
  let c = vcrHash(i + vec2f(0.0, 1.0));
  let d = vcrHash(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn vcrNoise(p: vec2f, iTime: f32) -> f32 {
  var s = vcrNoiseTex(vec2f(1.0, 2.0 * cos(iTime)) * iTime * 8.0 + p);
  s *= s;
  return s;
}

fn vcrOnOff(a: f32, b: f32, c: f32, iTime: f32) -> f32 {
  return step(c, sin(iTime + a * cos(iTime * b)));
}

fn vcrRamp(y: f32, start: f32, end: f32) -> f32 {
  let inside = step(start, y) - step(end, y);
  let fact = (y - start) / (end - start) * inside;
  return (1.0 - fact) * inside;
}

fn vcrStripes(uv: vec2f, iTime: f32) -> f32 {
  let noi = vcrNoise(uv * vec2f(0.5, 1.0) + vec2f(1.0, 3.0), iTime);
  return vcrRamp(vcrMod(uv.y * 4.0 + iTime / 2.0 + sin(iTime + sin(iTime * 0.63)), 1.0), 0.5, 0.6) * noi;
}

fn vcrGetVideo(uv: vec2f, iTime: f32, amount: f32, iChannel0: texture_2d<f32>, iChannel0Sampler: sampler) -> vec3f {
  var look = uv;
  let w = look.y - vcrMod(iTime / 4.0, 1.0);
  let window = 1.0 / (1.0 + 20.0 * w * w);
  look.x = look.x + sin(look.y * 10.0 + iTime) / 50.0 * vcrOnOff(4.0, 4.0, 0.3, iTime) * (1.0 + cos(iTime * 80.0)) * window * amount;
  let vShift = 0.4 * vcrOnOff(2.0, 3.0, 0.9, iTime) * (sin(iTime) * sin(iTime * 20.0) + (0.5 + 0.1 * sin(iTime * 200.0) * cos(iTime)));
  look.y = vcrMod(look.y + vShift * amount, 1.0);
  return textureSampleLevel(iChannel0, iChannel0Sampler, look, 0.0).rgb;
}

fn vcrScreenDistort(uvIn: vec2f) -> vec2f {
  var uv = uvIn - vec2f(0.5, 0.5);
  uv = uv * 1.2 * (1.0 / 1.2 + 2.0 * uv.x * uv.x * uv.y * uv.y);
  return uv + vec2f(0.5, 0.5);
}
