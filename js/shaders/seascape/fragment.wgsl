// "Seascape" by Alexander Alekseev aka TDM - 2014
// https://www.shadertoy.com/view/Ms2SD1
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// the main function comes first (wgslFn reads its signature), helper functions follow below
fn seascape(fragCoord: vec2f, iTime: f32, iMouse: vec2f, iResolution: vec2f) -> vec4f {
  let time = iTime * 0.3 + iMouse.x * 0.01;
  let color = seaGetPixel(fragCoord, time, iTime, iResolution);
  // post
  return vec4f(pow(color, vec3f(0.65)), 1.0);
}

const NUM_STEPS = 32;
const PI = 3.141592;
const EPSILON = 1e-3;

// sea
const ITER_GEOMETRY = 3;
const ITER_FRAGMENT = 5;
const SEA_HEIGHT = 0.6;
const SEA_CHOPPY = 4.0;
const SEA_SPEED = 0.8;
const SEA_FREQ = 0.16;
const SEA_BASE = vec3f(0.0, 0.09, 0.18);
const SEA_WATER_COLOR = vec3f(0.8, 0.9, 0.6) * 0.6;
const OCTAVE_M = mat2x2f(1.6, 1.2, -1.2, 1.6);

// math
fn seaFromEuler(ang: vec3f) -> mat3x3f {
  let a1 = vec2f(sin(ang.x), cos(ang.x));
  let a2 = vec2f(sin(ang.y), cos(ang.y));
  let a3 = vec2f(sin(ang.z), cos(ang.z));
  return mat3x3f(
    vec3f(a1.y * a3.y + a1.x * a2.x * a3.x, a1.y * a2.x * a3.x + a3.y * a1.x, -a2.y * a3.x),
    vec3f(-a2.y * a1.x, a1.y * a2.y, a2.x),
    vec3f(a3.y * a1.x * a2.x + a1.y * a3.x, a1.x * a3.x - a1.y * a3.y * a2.x, a2.y * a3.y)
  );
}

fn seaHash(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

fn seaNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return -1.0 + 2.0 * mix(mix(seaHash(i + vec2f(0.0, 0.0)), seaHash(i + vec2f(1.0, 0.0)), u.x),
                          mix(seaHash(i + vec2f(0.0, 1.0)), seaHash(i + vec2f(1.0, 1.0)), u.x), u.y);
}

// lighting
fn seaDiffuse(n: vec3f, l: vec3f, p: f32) -> f32 {
  return pow(dot(n, l) * 0.4 + 0.6, p);
}

fn seaSpecular(n: vec3f, l: vec3f, e: vec3f, s: f32) -> f32 {
  let nrm = (s + 8.0) / (PI * 8.0);
  return pow(max(dot(reflect(e, n), l), 0.0), s) * nrm;
}

// sky
fn seaSkyColor(eIn: vec3f) -> vec3f {
  // function parameters are immutable in WGSL, so copy before modifying
  var e = eIn;
  e.y = (max(e.y, 0.0) * 0.8 + 0.2) * 0.8;
  return vec3f(pow(1.0 - e.y, 2.0), 1.0 - e.y, 0.6 + (1.0 - e.y) * 0.4) * 1.1;
}

// sea
fn seaOctave(uvIn: vec2f, choppy: f32) -> f32 {
  let uv = uvIn + seaNoise(uvIn);
  var wv = 1.0 - abs(sin(uv));
  let swv = abs(cos(uv));
  wv = mix(wv, swv, wv);
  return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
}

// map() and map_detailed() only differ in the number of iterations
fn seaMap(p: vec3f, seaTime: f32, iterations: i32) -> f32 {
  var freq = SEA_FREQ;
  var amp = SEA_HEIGHT;
  var choppy = SEA_CHOPPY;
  var uv = p.xz;
  uv.x *= 0.75;

  var h = 0.0;
  for (var i = 0; i < iterations; i++) {
    var d = seaOctave((uv + seaTime) * freq, choppy);
    d += seaOctave((uv - seaTime) * freq, choppy);
    h += d * amp;
    uv = uv * OCTAVE_M;
    freq *= 1.9;
    amp *= 0.22;
    choppy = mix(choppy, 1.0, 0.2);
  }
  return p.y - h;
}

fn seaColor(p: vec3f, n: vec3f, l: vec3f, eye: vec3f, dist: vec3f) -> vec3f {
  var fresnel = clamp(1.0 - dot(n, -eye), 0.0, 1.0);
  fresnel = min(fresnel * fresnel * fresnel, 0.5);

  let reflected = seaSkyColor(reflect(eye, n));
  let refracted = SEA_BASE + seaDiffuse(n, l, 80.0) * SEA_WATER_COLOR * 0.12;

  var color = mix(refracted, reflected, fresnel);

  let atten = max(1.0 - dot(dist, dist) * 0.001, 0.0);
  color += SEA_WATER_COLOR * (p.y - SEA_HEIGHT) * 0.18 * atten;

  color += seaSpecular(n, l, eye, 600.0 * inverseSqrt(dot(dist, dist)));

  return color;
}

// tracing
fn seaGetNormal(p: vec3f, eps: f32, seaTime: f32) -> vec3f {
  let h = seaMap(p, seaTime, ITER_FRAGMENT);
  let nx = seaMap(vec3f(p.x + eps, p.y, p.z), seaTime, ITER_FRAGMENT) - h;
  let nz = seaMap(vec3f(p.x, p.y, p.z + eps), seaTime, ITER_FRAGMENT) - h;
  return normalize(vec3f(nx, eps, nz));
}

// WGSL has no out parameters: return the hit point instead
fn seaHeightMapTracing(ori: vec3f, dir: vec3f, seaTime: f32) -> vec3f {
  var tm = 0.0;
  var tx = 1000.0;
  var hx = seaMap(ori + dir * tx, seaTime, ITER_GEOMETRY);
  if (hx > 0.0) {
    return ori + dir * tx;
  }
  var hm = seaMap(ori, seaTime, ITER_GEOMETRY);
  var p = ori;
  for (var i = 0; i < NUM_STEPS; i++) {
    let tmid = mix(tm, tx, hm / (hm - hx));
    p = ori + dir * tmid;
    let hmid = seaMap(p, seaTime, ITER_GEOMETRY);
    if (hmid < 0.0) {
      tx = tmid;
      hx = hmid;
    } else {
      tm = tmid;
      hm = hmid;
    }
    if (abs(hmid) < EPSILON) {
      break;
    }
  }
  return p;
}

fn seaGetPixel(coord: vec2f, time: f32, iTime: f32, iResolution: vec2f) -> vec3f {
  let seaTime = 1.0 + iTime * SEA_SPEED;
  var uv = coord / iResolution;
  uv = uv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  // ray
  let ang = vec3f(sin(time * 3.0) * 0.1, sin(time) * 0.2 + 0.3, time);
  let ori = vec3f(0.0, 3.5, time * 5.0);
  var dir = normalize(vec3f(uv, -2.0));
  dir.z += length(uv) * 0.14;
  dir = normalize(dir) * seaFromEuler(ang);

  // tracing
  let p = seaHeightMapTracing(ori, dir, seaTime);
  let dist = p - ori;
  let epsilonNrm = 0.1 / iResolution.x;
  let n = seaGetNormal(p, dot(dist, dist) * epsilonNrm, seaTime);
  let light = normalize(vec3f(0.0, 1.0, 0.8));

  // color
  return mix(
    seaSkyColor(dir),
    seaColor(p, n, light, dir, dist),
    pow(smoothstep(0.0, -0.02, dir.y), 0.2));
}
