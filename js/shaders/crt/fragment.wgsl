// "Simple VHS effect" - https://www.shadertoy.com/view/cl2SR3
// CRT screen: barrel distortion + soft black edges. Added: scanlines and a subtle flicker.
// the main function comes first (wgslFn reads its signature), helper functions follow below
fn crt(fragCoord: vec2f, iResolution: vec2f, iTime: f32, iChannel0: texture_2d<f32>, iChannel0Sampler: sampler) -> vec4f {
  var uv = fragCoord / iResolution;

  // bulge the image like a curved CRT tube
  uv = uv * 2.0 - 1.0;
  uv += uv * length(uv) * length(uv) * 0.05;
  uv = uv * 0.5 + 0.5;

  // black, soft edges outside the tube
  let inVec = 1.0 - abs(uv * 2.0 - 1.0);
  let vignette = mix(vec2f(0.0), vec2f(10.0), inVec);
  let x = clamp(step(0.0, uv.x) * (1.0 - step(1.0, uv.x)) * vignette.x, 0.0, 1.0);
  let y = clamp(step(0.0, uv.y) * (1.0 - step(1.0, uv.y)) * vignette.y, 0.0, 1.0);

  var col = textureSampleLevel(iChannel0, iChannel0Sampler, uv, 0.0).rgb * x * y;

  // own addition: scanlines + flicker
  col *= 0.85 + 0.15 * sin(uv.y * iResolution.y * 1.5);
  col *= 0.97 + 0.03 * sin(iTime * 60.0);

  return vec4f(col, 1.0);
}
