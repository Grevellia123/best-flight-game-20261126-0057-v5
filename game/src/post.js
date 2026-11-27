// TALON STRIKE — golden-hour post: HDR bloom + screen-space god rays.
// Self-contained, no vendored EffectComposer: a bright-pass + separable
// blur chain, composited additively over the direct render.
//
// Why this shape (not UnrealBloomPass): the three examples modules are not
// vendored and would need six version-coupled files with import rewrites;
// this is ~200 lines, fully quality-gated, and cheaper on mobile.
//
// Pipeline per frame (post on):
//   1. scene -> rtScene (half-res, HDR half-float) — the bloom source.
//   2. bright-pass (threshold 1.0 linear) rtScene -> rtBloomA (quarter-res).
//   3. separable Gaussian blur, ping-pong rtBloomA <-> rtBloomB.
//   4. scene -> screen directly (the base image, pixel-identical to the
//      old direct render — the sky, terrain and jets keep their exact look).
//   5. composite into rtComp (half-res): bloom + god rays (a radial march
//      through the bloom texture toward the sun's screen position). The
//      16-tap march runs at half res — at full res it dominates the frame
//      cost on software renderers.
//   6. additive blit rtComp -> screen (one tap).
// With post off (level 0) steps 1-3, 5 and 6 are skipped entirely.
// Bright things are genuinely HDR (material colours > 1, see render3d.js),
// so the 1.0 linear threshold catches the sun, explosions, tracers and
// the afterburner — but not the terrain or the sky (both stay under 1.0).
import * as THREE from 'three';

const LEVELS = {
  // bloom: additive strength. threshold/knee: linear-space bright-pass.
  // blurIters: separable blur passes (H+V each). rays: god-ray strength.
  // taps: radial march samples toward the sun.
  1: { bloom: 0.38, threshold: 1.0, knee: 0.4, blurIters: 1, rays: 0.4, taps: 6 },
  2: { bloom: 0.6, threshold: 1.0, knee: 0.4, blurIters: 2, rays: 0.7, taps: 16 },
};
const MAX_TAPS = 16;

const QUAD_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Soft-threshold bright-pass: only HDR highlights survive.
const BRIGHT_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(uThreshold, uThreshold + uKnee, l);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

// 5-tap linear-sampled Gaussian (== 9-tap). uDir is (1/w,0) or (0,1/h).
const BLUR_FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uDir;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  vec2 o1 = uDir * 1.3846153846;
  vec2 o2 = uDir * 3.2307692308;
  c += texture2D(tDiffuse, vUv + o1).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv - o1).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv + o2).rgb * 0.0702702703;
  c += texture2D(tDiffuse, vUv - o2).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

// Additive composite: bloom + god rays. The sun and the bright sky live in
// the (blurred) bloom texture, so marching from each pixel toward the sun
// and averaging the samples gives light shafts that fade with distance.
const COMPOSITE_FRAG = `
varying vec2 vUv;
uniform sampler2D tBloom;
uniform vec2 uSunUV;
uniform float uSunVis;
uniform float uBloom;
uniform float uRays;
uniform int uTaps;
void main(){
  vec3 col = texture2D(tBloom, vUv).rgb * uBloom;
  vec2 dir = vUv - uSunUV;
  vec3 rays = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < ${MAX_TAPS}; i++) {
    if (i >= uTaps) break;
    float s = float(i) / float(uTaps);
    float w = (1.0 - s) * (1.0 - s);
    rays += texture2D(tBloom, vUv - dir * s * 0.55).rgb * w;
    total += w;
  }
  rays /= max(total, 0.001);
  // Angular bands break the smooth radial glow into distinct shafts —
  // without them the march of a single bright blob reads as a plain halo.
  float ang = atan(dir.y, dir.x);
  float bands = 0.55 + 0.45 * (0.5 + 0.5 * sin(ang * 7.0 + 1.3 * sin(ang * 3.0)));
  // Shafts are strongest near the sun and die off toward the screen edges.
  float fall = exp(-length(dir) * 1.2);
  col += rays * uRays * uSunVis * fall * bands;
  gl_FragColor = vec4(col, 1.0);
}
`;

function makeQuadScene(material) {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { scene, cam, mesh };
}

export function createPost(renderer) {
  // HDR render targets need EXT_color_buffer_float (WebGL2). Without it,
  // fall back to byte targets and a lower threshold (values clamp at 1.0).
  let halfFloat = false;
  try {
    halfFloat = !!renderer.getContext().getExtension('EXT_color_buffer_float');
  } catch { halfFloat = false; }
  const rtType = halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;

  const rtScene = new THREE.WebGLRenderTarget(2, 2, { type: rtType, depthBuffer: true });
  const rtBloomA = new THREE.WebGLRenderTarget(2, 2, { type: rtType, depthBuffer: false });
  const rtBloomB = new THREE.WebGLRenderTarget(2, 2, { type: rtType, depthBuffer: false });
  const rtComp = new THREE.WebGLRenderTarget(2, 2, { type: rtType, depthBuffer: false });

  const brightMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT, fragmentShader: BRIGHT_FRAG,
    uniforms: {
      tDiffuse: { value: null },
      uThreshold: { value: 1.0 },
      uKnee: { value: 0.4 },
    },
    depthTest: false, depthWrite: false,
  });
  const blurMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG,
    uniforms: {
      tDiffuse: { value: null },
      uDir: { value: new THREE.Vector2(1, 0) },
    },
    depthTest: false, depthWrite: false,
  });
  const compMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      tBloom: { value: null },
      uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
      uSunVis: { value: 0 },
      uBloom: { value: 0.6 },
      uRays: { value: 0.55 },
      uTaps: { value: 16 },
    },
    depthTest: false, depthWrite: false,
  });
  // Final blit: the half-res composite up to the screen, additively.
  const blitMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }`,
    uniforms: { tDiffuse: { value: null } },
    blending: THREE.AdditiveBlending,
    depthTest: false, depthWrite: false,
  });
  const quad = makeQuadScene(brightMat);

  const post = {
    level: 0,
    halfFloat,
    setLevel(l) { post.level = Math.max(0, Math.min(2, l | 0)); },
    resize() {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const sw = Math.max(2, size.x >> 1), sh = Math.max(2, size.y >> 1);
      rtScene.setSize(sw, sh);
      rtComp.setSize(sw, sh);
      rtBloomA.setSize(Math.max(2, sw >> 1), Math.max(2, sh >> 1));
      rtBloomB.setSize(Math.max(2, sw >> 1), Math.max(2, sh >> 1));
    },
    render(scene, camera, sunUV, sunVis) {
      if (post.level === 0) {
        renderer.render(scene, camera);
        return;
      }
      const cfg = LEVELS[post.level];
      // 1. Scene into the half-res HDR target (bloom source).
      renderer.setRenderTarget(rtScene);
      renderer.render(scene, camera);
      // 2. Bright-pass into the quarter-res bloom target.
      brightMat.uniforms.tDiffuse.value = rtScene.texture;
      brightMat.uniforms.uThreshold.value = halfFloat ? cfg.threshold : 0.85;
      brightMat.uniforms.uKnee.value = cfg.knee;
      quad.mesh.material = brightMat;
      renderer.setRenderTarget(rtBloomA);
      renderer.render(quad.scene, quad.cam);
      // 3. Separable blur, ping-pong. After each full H+V iteration the
      // result sits in rtBloomA again.
      const bw = rtBloomA.width, bh = rtBloomA.height;
      for (let i = 0; i < cfg.blurIters; i++) {
        blurMat.uniforms.tDiffuse.value = rtBloomA.texture;
        blurMat.uniforms.uDir.value.set(1 / bw, 0);
        quad.mesh.material = blurMat;
        renderer.setRenderTarget(rtBloomB);
        renderer.render(quad.scene, quad.cam);
        blurMat.uniforms.tDiffuse.value = rtBloomB.texture;
        blurMat.uniforms.uDir.value.set(0, 1 / bh);
        renderer.setRenderTarget(rtBloomA);
        renderer.render(quad.scene, quad.cam);
      }
      // 4. Base image straight to screen — the current look, unchanged.
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      // 5. Composite into the half-res target: bloom + god rays.
      compMat.uniforms.tBloom.value = rtBloomA.texture;
      compMat.uniforms.uSunUV.value.set(sunUV.x, sunUV.y);
      compMat.uniforms.uSunVis.value = sunVis;
      compMat.uniforms.uBloom.value = cfg.bloom;
      compMat.uniforms.uRays.value = cfg.rays;
      compMat.uniforms.uTaps.value = cfg.taps;
      quad.mesh.material = compMat;
      renderer.setRenderTarget(rtComp);
      renderer.render(quad.scene, quad.cam);
      // 6. Additive blit of the composite over the base image.
      // render() would clear the screen first, so hold the clear.
      blitMat.uniforms.tDiffuse.value = rtComp.texture;
      quad.mesh.material = blitMat;
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      renderer.render(quad.scene, quad.cam);
      renderer.autoClear = prevAutoClear;
    },
  };
  post.resize();
  return post;
}
