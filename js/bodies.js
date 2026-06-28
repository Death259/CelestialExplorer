// Scene construction: sun, planets, moons, orbits, belts, starfield, galaxy.
import * as THREE from './vendor/three.module.js';
import { BODIES, MOONS, COMETS, MINORS, AU, bodyPosition } from './data.js';
import { buildConstellations } from './sky.js';
import { makePlanetTexture, moonTexture, sunTexture, ringTexture, uranusRingTexture, jupiterRingTexture, neptuneRingTexture, flareTexture, glowTexture, asteroidTexture } from './textures.js';

const TEX_BASE = './textures/';
const RES = (id, file) => (window.__resources && window.__resources[id]) || (TEX_BASE + file);

function tryLoadTexture(url, onOk) {
  new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; onOk(t); }, undefined, () => {});
}

// Loader for non-color data maps (height / bump / displacement): keep linear,
// never sRGB-decode the elevation values.
function tryLoadData(url, onOk) {
  new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; onOk(t); }, undefined, () => {});
}

// Real photographic surface maps per planet. Each entry's color map is loaded over
// the procedural fallback via the same RES() hero path Earth & the Moon use, so the
// scene shows the procedural version instantly / offline-without-resources and swaps
// to the real imagery the moment it's available. `bump` (rocky worlds with a real
// elevation map) drives crater/relief shading like the Moon's LDEM.
const REAL_TEX = {
  mercury: { colorId: 'mercuryColor', colorFile: 'mercury_color.jpg' },
  venus:   { colorId: 'venusColor',   colorFile: 'venus_atmosphere.jpg' },
  mars:    { colorId: 'marsColor',    colorFile: 'mars_color.jpg' },
  jupiter: { colorId: 'jupiterColor', colorFile: 'jupiter_color.jpg' },
  saturn:  { colorId: 'saturnColor',  colorFile: 'saturn_color.jpg' },
  uranus:  { colorId: 'uranusColor',  colorFile: 'uranus_color.jpg' },
  neptune: { colorId: 'neptuneColor', colorFile: 'neptune_color.jpg' },
  pluto:   { colorId: 'plutoColor',   colorFile: 'pluto_color.jpg' },
};

// ---------- Earth (hero treatment: day/night shader, clouds, atmosphere) ----------
function buildEarth(radius) {
  const group = new THREE.Group();
  const uniforms = {
    dayMap: { value: makePlanetTexture('earth') },
    nightMap: { value: null },
    hasNight: { value: 0 },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv; varying vec3 vNormalW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D dayMap, nightMap; uniform float hasNight; uniform vec3 sunDir;
      varying vec2 vUv; varying vec3 vNormalW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float l = dot(normalize(vNormalW), normalize(sunDir));
        float day = smoothstep(-0.08, 0.25, l);
        vec3 dayCol = texture2D(dayMap, vUv).rgb * max(day, 0.0) * (0.32 + 0.80*max(l,0.0));
        // Soft shoulder on day highlights: directly under the Sun, high-albedo terrain
        // (Sahara, bright cloud tops) would push past 1.0 and clip into a flat white
        // blob that the bloom then balloons. Compress only the part above 0.85 so bright
        // ground rolls smoothly toward white instead of becoming a blown-out hotspot;
        // everything below 0.85 (most of the disc) is untouched.
        float mx = max(dayCol.r, max(dayCol.g, dayCol.b));
        if (mx > 0.85) dayCol *= (0.85 + (mx - 0.85) * 0.22) / mx;
        // Smooth exponential rolloff instead of a hard multiply: bright city texels
        // approach (but never reach) white, so a single magnified texel reads as a soft
        // glow rather than a flat-topped clipped white square that pops in and out of
        // the bloom threshold as Earth rotates (the flickering the user saw up close).
        vec3 nightRaw = texture2D(nightMap, vUv).rgb * vec3(1.0,0.85,0.6) * 2.0;
        vec3 nightCol = hasNight > 0.5 ? (vec3(1.0) - exp(-nightRaw)) : vec3(0.0);
        // City lights belong to the genuinely dark hemisphere + civil twilight only.
        // Use a dedicated, tighter mask (full when the Sun is well below the horizon,
        // gone by the time it is ~1.5 deg up) so lights don't linger across the morning/
        // evening crescent that is already in daylight — which read as "lights on the
        // lit side". Kept separate from the day blend so the day texture still fades.
        float nightMask = 1.0 - smoothstep(-0.10, 0.03, l);
        vec3 col = dayCol + nightCol * nightMask;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
  group.add(globe);

  // clouds
  const cloudMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.85, depthWrite: false });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.006, 72, 48), cloudMat);
  clouds.visible = false;
  group.add(clouds);

  // atmosphere fresnel
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.035, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { sunDir: uniforms.sunDir },
      vertexShader: `
        varying vec3 vN; varying vec3 vP;
        void main(){
          vN = normalize(mat3(modelMatrix)*normal);
          vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 sunDir; varying vec3 vN; varying vec3 vP;
        void main(){
          vec3 view = normalize(cameraPosition - vP);
          float rim = pow(1.0 - abs(dot(view, normalize(vN))), 2.4);
          float lit = 0.25 + 0.75 * max(dot(normalize(vN), normalize(sunDir)), 0.0);
          gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * rim * lit * 1.4, rim * lit);
        }`,
    })
  );
  group.add(atmo);

  tryLoadTexture(RES('earthDay', 'earth_atmos_2048.jpg'), (t) => { uniforms.dayMap.value = t; });
  tryLoadTexture(RES('earthNight', 'earth_lights_2048.png'), (t) => { uniforms.nightMap.value = t; uniforms.hasNight.value = 1; });
  tryLoadTexture(RES('earthClouds', 'earth_clouds_1024.png'), (t) => { cloudMat.map = t; cloudMat.needsUpdate = true; clouds.visible = true; });

  return { group, globe, clouds, earthUniforms: uniforms };
}

// ---------- Sun ----------
function buildSun(radius) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: sunTexture() });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 144, 96), mat);
  group.add(mesh);
  // real photospheric granulation map over the procedural fallback
  tryLoadTexture(RES('sunColor', 'sun_color.jpg'), (t) => { mat.map = t; mat.needsUpdate = true; });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,200,110,1)', 'rgba(255,120,20,0)', 512, 0.5),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(radius * 5.2);
  group.add(glow);
  // hotter, tighter inner corona — a fiery reddish-orange halo hugging the limb
  const inner = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,150,60,1)', 'rgba(255,60,10,0)', 256, 0.42),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  inner.scale.setScalar(radius * 2.7);
  group.add(inner);

  // ---- Solar prominences / flares: flame plumes that erupt off the surface ----
  // Each is a flat plume billboarded around its own radial axis (so limb plumes jet
  // out past the silhouette, disk plumes read as bright active regions). Heights and
  // brightness animate independently, with occasional larger flare bursts.
  const flareGroup = new THREE.Group();
  const flareTex = flareTexture();
  const flares = [];
  const FN = 13;
  let fs = 12345;
  const frnd = () => { fs = (fs * 16807) % 2147483647; return fs / 2147483647; };
  for (let i = 0; i < FN; i++) {
    // even-ish spherical distribution (golden spiral) + jitter
    const yv = 1 - (i + 0.5) / FN * 2;
    const rad = Math.sqrt(Math.max(0, 1 - yv * yv));
    const th = i * 2.39996 + frnd() * 0.6;
    const dir = new THREE.Vector3(Math.cos(th) * rad, yv, Math.sin(th) * rad).normalize();
    const baseH = radius * (0.22 + frnd() * 0.4);
    const wide = radius * (0.4 + frnd() * 0.2);
    const geo = new THREE.PlaneGeometry(wide, baseH);
    geo.translate(0, baseH / 2, 0); // anchor the base at the origin (the surface)
    const mat = new THREE.MeshBasicMaterial({ map: flareTex, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(dir).multiplyScalar(radius * 0.96);
    m.frustumCulled = false;
    flareGroup.add(m);
    flares.push({ mesh: m, dir, baseH, phase: frnd() * 100, speed: 0.4 + frnd() * 0.7, burstPhase: frnd() * 100, burstSpeed: 0.12 + frnd() * 0.16 });
  }
  group.add(flareGroup);

  // far-out marker so the sun is findable at system/galaxy scale
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,235,200,1)', 'rgba(255,200,120,0)', 128, 0.35),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
  }));
  marker.scale.setScalar(0.018);
  group.add(marker);
  const light = new THREE.PointLight(0xfff3e0, 2.6, 0, 0); // decay 0: reaches Neptune
  group.add(light);

  // Animate the prominences: billboard each plume around its radial axis toward the
  // camera, pulse its height/brightness, and fade the whole set out when the camera
  // pulls away from the Sun (they only matter up close).
  const _camLocal = new THREE.Vector3(), _toCam = new THREE.Vector3();
  const _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
  const _sunW = new THREE.Vector3();
  function updateFlares(now, camera) {
    flareGroup.rotation.y += 0.0009;   // slow churn for life
    flareGroup.updateWorldMatrix(true, false);
    group.getWorldPosition(_sunW);
    const dist = camera.position.distanceTo(_sunW);
    const fade = 1 - THREE.MathUtils.smoothstep(dist, radius * 45, radius * 220);
    flareGroup.visible = fade > 0.01;
    if (!flareGroup.visible) return;
    _camLocal.copy(camera.position); flareGroup.worldToLocal(_camLocal);
    const t = now * 0.001;
    for (const f of flares) {
      // billboard: +Y = radial (outward), +Z (face normal) = toward camera
      _toCam.copy(_camLocal).sub(f.mesh.position).normalize();
      const dot = _toCam.dot(f.dir);
      _z.copy(_toCam).addScaledVector(f.dir, -dot).normalize();
      if (_z.lengthSq() < 1e-4) continue;
      _x.crossVectors(f.dir, _z).normalize();
      _m.makeBasis(_x, f.dir, _z);
      f.mesh.quaternion.setFromRotationMatrix(_m);
      // pulse + occasional flare burst
      const pulse = 0.5 + 0.5 * Math.sin(t * f.speed + f.phase);
      const burst = Math.pow(Math.max(0, Math.sin(t * f.burstSpeed + f.burstPhase)), 6);
      f.mesh.scale.set(0.85 + 0.3 * Math.sin(t * 1.7 + f.phase), 0.45 + pulse * 0.55 + burst * 0.85, 1);
      f.mesh.material.opacity = (0.3 + 0.4 * pulse + burst * 0.6) * fade;
    }
  }

  return { group, mesh, glow, inner, marker, light, flareGroup, updateFlares };
}

// ---------- Orbit line for a body ----------
function buildOrbitLine(body, color = 0x3a4a5a, segments = 512) {
  const pts = [];
  const tmp = new THREE.Vector3();
  for (let s = 0; s <= segments; s++) {
    const frac = s / segments;
    const ms = Date.UTC(2000, 0, 1, 12) + frac * body.periodD * 86400000;
    pts.push(bodyPosition(body, ms, tmp).clone());
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
  return new THREE.Line(geo, mat);
}

// ---------- Particle helpers ----------
let _dotTex = null;
function dotTexture() {
  if (!_dotTex) _dotTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64, 0.55);
  return _dotTex;
}
function ringParticles({ count, rMin, rMax, ySpread, size, color, opacity = 0.8, seed = 1 }) {
  const pos = new Float32Array(count * 3);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rMin + Math.pow(rnd(), 0.7) * (rMax - rMin);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (rnd() - 0.5) * ySpread;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture() });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

// Jupiter's Trojan asteroids: two swarms locked 60° ahead (L4, the "Greek" camp)
// and 60° behind (L5, the "Trojan" camp) Jupiter along its orbit. Built around a
// base longitude of 0 (the +X axis); app.js rotates the parent group each frame so
// the swarms stay pinned to Jupiter's moving position. Each camp is an elongated,
// puffy cloud spread ~±22° in longitude with real (high) orbital inclinations.
function trojanCloud({ count, centerDeg, color, size, seed }) {
  const pos = new Float32Array(count * 3);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5; // ~[-1,1], centre-weighted
  const c0 = centerDeg * Math.PI / 180;
  for (let i = 0; i < count; i++) {
    const lon = c0 + gauss() * (22 * Math.PI / 180);
    const r = 5.2 * AU + gauss() * 0.42 * AU;
    pos[i * 3] = Math.cos(lon) * r;
    pos[i * 3 + 1] = gauss() * 0.55 * AU;     // inclination spread (Trojans run hot)
    pos[i * 3 + 2] = Math.sin(lon) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture() });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

function shellParticles({ count, rMin, rMax, size, color, opacity, seed = 9 }) {
  const pos = new Float32Array(count * 3);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
    const r = rMin + rnd() * (rMax - rMin), q = Math.sqrt(1 - u * u);
    pos[i * 3] = q * Math.cos(th) * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = q * Math.sin(th) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture() });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

// ---------- Comet: nucleus + coma glow + particle tail ----------
function buildComet(c) {
  const root = new THREE.Group();
  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(c.radius, 24, 16),
    new THREE.MeshStandardMaterial({ map: makePlanetTexture('rocky'), roughness: 1 })
  );
  nucleus.userData.bodyId = c.id;
  root.add(nucleus);
  const coma = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(190,225,255,1)', 'rgba(120,180,255,0)', 256, 0.4),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
  }));
  root.add(coma);
  // tail: particles in a widening cone along +X (oriented anti-sunward each frame)
  const N = 700, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  let s = c.id.length * 1013 + 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < N; i++) {
    const t = Math.pow(rnd(), 1.6);                  // dense near head
    const spread = 0.045 + t * 0.16;
    const ion = rnd() < 0.45;                        // ion tail: straighter, bluer
    const sp = ion ? spread * 0.35 : spread;
    pos[i * 3] = t + (rnd() - 0.5) * 0.02;
    pos[i * 3 + 1] = (rnd() - 0.5) * sp + (ion ? 0 : t * t * 0.06);
    pos[i * 3 + 2] = (rnd() - 0.5) * sp;
    const fade = 1 - t * 0.75;
    if (ion) { col[i * 3] = 0.55 * fade; col[i * 3 + 1] = 0.75 * fade; col[i * 3 + 2] = 1.0 * fade; }
    else { col[i * 3] = 1.0 * fade; col[i * 3 + 1] = 0.92 * fade; col[i * 3 + 2] = 0.78 * fade; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tail = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true,
    opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture(),
  }));
  tail.frustumCulled = false;
  root.add(tail);
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.userData.bodyId = c.id;
  root.add(proxy);
  return { root, nucleus, coma, tail, proxy };
}

// Comet orbit line — sampled uniformly in eccentric anomaly (dense at perihelion)
function cometOrbitLine(c, segments = 360) {
  const D2R = Math.PI / 180;
  const a = c.a * AU, w = (c.varpi - c.Omega) * D2R, O = c.Omega * D2R, inc = c.i * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const pts = [];
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * Math.PI * 2;
    const xp = a * (Math.cos(E) - c.e), yp = a * Math.sqrt(1 - c.e * c.e) * Math.sin(E);
    const X = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
    const Y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
    const Z = (sw * si) * xp + (cw * si) * yp;
    pts.push(new THREE.Vector3(X, Z, -Y));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x4a7a8c, transparent: true, opacity: 0.3 })
  );
  return line;
}

// Lumpy, irregular geometry for small asteroids: displace a sphere's vertices with a few
// low-frequency sinusoids of the vertex direction (smooth, seam-free, deterministic) so
// the body reads as battered rock instead of a billiard ball. Bodies large enough to be
// gravitationally rounded (the dwarf planets) keep a plain sphere.
function lumpyGeometry(radius, seed, amp) {
  const geo = new THREE.SphereGeometry(radius, 72, 48);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const x = v.x / radius, y = v.y / radius, z = v.z / radius;
    const n =
      Math.sin(x * 2.3 + seed) * Math.cos(y * 1.9 - seed) * 0.5 +
      Math.sin(y * 3.7 + seed * 2.0) * Math.cos(z * 3.1 + seed) * 0.3 +
      Math.sin(z * 5.3 - seed) * Math.cos(x * 4.7 + seed * 1.7) * 0.22 +
      Math.sin(x * 8.1 + seed * 3.0) * Math.sin(y * 6.7 - seed) * 0.12;
    v.multiplyScalar(1 + amp * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- Background starfield (follows camera) ----------
function buildStarfield(count = 9000) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count);
  let s = 1234;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const tints = [[1, 1, 1], [1, 0.92, 0.8], [0.8, 0.88, 1], [1, 0.82, 0.7], [0.92, 0.95, 1]];
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    pos[i * 3] = q * Math.cos(th); pos[i * 3 + 1] = u; pos[i * 3 + 2] = q * Math.sin(th);
    const t = tints[(rnd() * tints.length) | 0], b = 0.35 + rnd() * rnd() * 0.65;
    col[i * 3] = t[0] * b; col[i * 3 + 1] = t[1] * b; col[i * 3 + 2] = t[2] * b;
    sz[i] = rnd() < 0.03 ? 2.6 : 0.8 + rnd() * 1.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 1 } },
    vertexShader: `
      attribute float aSize; varying vec3 vC;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float uOpacity; varying vec3 vC;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(vC, a * uOpacity); }`,
    vertexColors: true,
  });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  stars.scale.setScalar(1);
  return stars;
}

// ---------- Milky Way (particle spiral; appears when you zoom way out) ----------
export const GALAXY = {
  radius: 1.5e9,                 // 1.5e9 units ≈ 50k ly equivalent (compressed scale)
  center: new THREE.Vector3(-6.6e8, -1.4e8, -3.4e8), // sun ~26k-ly-equivalent from core
  tilt: new THREE.Euler(1.05, 0.4, 0.2),
};

function buildGalaxy() {
  const group = new THREE.Group();
  const count = 42000, arms = 4;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let s = 777;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const cCore = [1, 0.88, 0.7], cArm = [0.62, 0.72, 1], cDust = [1, 0.62, 0.45];
  for (let i = 0; i < count; i++) {
    const r = Math.pow(rnd(), 0.55) * GALAXY.radius;
    const armAng = ((i % arms) / arms) * Math.PI * 2;
    const rot = (r / GALAXY.radius) * 4.6;
    const spread = 0.18 + 0.5 * (r / GALAXY.radius);
    const ang = armAng + rot + (rnd() - 0.5) * spread * 2.4;
    const y = (rnd() - 0.5) * GALAXY.radius * 0.05 * (1 - 0.6 * r / GALAXY.radius)
            + (r < GALAXY.radius * 0.18 ? (rnd() - 0.5) * GALAXY.radius * 0.08 : 0);
    pos[i * 3] = Math.cos(ang) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(ang) * r;
    const coreT = Math.max(0, 1 - r / (GALAXY.radius * 0.3));
    const dust = rnd() < 0.12 ? 1 : 0;
    const base = dust ? cDust : cArm;
    const b = 0.4 + rnd() * 0.6;
    col[i * 3] = (base[0] + (cCore[0] - base[0]) * coreT) * b;
    col[i * 3 + 1] = (base[1] + (cCore[1] - base[1]) * coreT) * b;
    col[i * 3 + 2] = (base[2] + (cCore[2] - base[2]) * coreT) * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: GALAXY.radius / 260, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture() });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,230,190,1)', 'rgba(255,170,90,0)', 512, 0.45),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  core.scale.setScalar(GALAXY.radius * 0.42);
  group.add(core);
  group.position.copy(GALAXY.center);
  group.rotation.copy(GALAXY.tilt);
  return { group, points, core };
}

// ---------- Saturn rings: planet/ring shadows + close-up ice-chunk field ----------
// Authentic portrayal of the rings as countless icy bodies: at a distance the rings
// read as the smooth photographic sheet (which IS the dust + small particles), and
// the planet/ring shadow geometry makes them sit in real 3-D space. Fly down into the
// ring plane and a field of discrete ice boulders fades in around the camera — the
// large chunks you could actually resolve — recycled toroidally so they stay fixed in
// space as you move (correct parallax), culled to the real ring gaps, and tinted to the
// local ring colour.
function buildSaturnRingFX({ axis, planetMat, ringMat, radius }) {
  const rInner = radius * 1.24, rOuter = radius * 2.35;

  // (1a) Planet shadow cast across the ring — patch the unlit ring material so the
  // planet's cylindrical shadow (parallel sunlight) darkens the ring behind it.
  ringMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunDir = { value: new THREE.Vector3(1, 0, 0) };
    sh.uniforms.uPlanetCenter = { value: new THREE.Vector3() };
    sh.uniforms.uPlanetRadius = { value: radius };
    sh.uniforms.uShadowAmb = { value: 0.06 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'varying vec3 vWPos;\n#include <common>')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', 'varying vec3 vWPos;\nuniform vec3 uSunDir,uPlanetCenter;\nuniform float uPlanetRadius,uShadowAmb;\n#include <common>')
      .replace('#include <dithering_fragment>', `
        { vec3 D = vWPos - uPlanetCenter;
          float al = dot(D, uSunDir);
          if (al < 0.0) {
            float pd = length(D - al * uSunDir);
            float shf = mix(uShadowAmb, 1.0, smoothstep(uPlanetRadius * 0.985, uPlanetRadius * 1.03, pd));
            gl_FragColor.rgb *= shf;
          } }
        #include <dithering_fragment>`);
    ringMat.userData.shader = sh;
  };
  ringMat.needsUpdate = true;

  // (1b) Ring shadow cast onto the planet — patch the lit planet material: trace from
  // each surface point toward the Sun, and if that ray crosses the equatorial plane
  // within the ring annulus, darken it by the ring's local opacity.
  planetMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunDir = { value: new THREE.Vector3(1, 0, 0) };
    sh.uniforms.uPlanetCenter = { value: new THREE.Vector3() };
    sh.uniforms.uPoleAxis = { value: new THREE.Vector3(0, 1, 0) };
    sh.uniforms.uRingInner = { value: rInner };
    sh.uniforms.uRingOuter = { value: rOuter };
    sh.uniforms.uRingTex = { value: ringMat.map };
    sh.uniforms.uRingShadow = { value: 0.8 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'varying vec3 vWPos;\n#include <common>')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', 'varying vec3 vWPos;\nuniform vec3 uSunDir,uPlanetCenter,uPoleAxis;\nuniform float uRingInner,uRingOuter,uRingShadow;\nuniform sampler2D uRingTex;\n#include <common>')
      .replace('#include <dithering_fragment>', `
        { vec3 D = vWPos - uPlanetCenter;
          float dn = dot(uSunDir, uPoleAxis);
          if (abs(dn) > 1e-4) {
            float s = -dot(D, uPoleAxis) / dn;
            if (s > 0.0) {
              float rad = length(D + s * uSunDir);
              if (rad > uRingInner && rad < uRingOuter) {
                float u = (rad - uRingInner) / (uRingOuter - uRingInner);
                float aR = texture2D(uRingTex, vec2(u, 0.5)).a;
                gl_FragColor.rgb *= (1.0 - aR * uRingShadow);
              }
            }
          } }
        #include <dithering_fragment>`);
    planetMat.userData.shader = sh;
  };
  planetMat.needsUpdate = true;

  // (4) Close-up ice-chunk field: an instanced swarm that follows the camera footprint.
  const COUNT = 1300;
  const L = 8.0; // patch period (scene units) tiled toroidally around the camera
  const geo = new THREE.IcosahedronGeometry(1, 0); // angular crystalline shard
  const cmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true, transparent: true, opacity: 1, depthWrite: true });
  const chunks = new THREE.InstancedMesh(geo, cmat, COUNT);
  chunks.frustumCulled = false;
  chunks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
  chunks.visible = false;
  axis.add(chunks);

  const ox = new Float32Array(COUNT), oz = new Float32Array(COUNT), hy = new Float32Array(COUNT);
  const sX = new Float32Array(COUNT), sY = new Float32Array(COUNT), sZ = new Float32Array(COUNT);
  const quats = [];
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < COUNT; i++) {
    ox[i] = rnd() * L; oz[i] = rnd() * L;
    hy[i] = (rnd() - 0.5) * 0.09;                       // thin vertical spread
    const base = 0.013 + Math.pow(rnd(), 3.0) * 0.19;   // power law: many small, few huge
    sX[i] = base * (0.7 + rnd() * 0.6);
    sY[i] = base * (0.55 + rnd() * 0.5);
    sZ[i] = base * (0.7 + rnd() * 0.6);
    quats.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28)));
  }

  // ring colour/opacity look-up table sampled from the ring texture by radius
  let LUT = null;
  function buildLUT(tex) {
    try {
      const img = tex && tex.image; if (!img) return;
      const W = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = 1;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, W, 1);
      LUT = cx.getImageData(0, 0, W, 1).data;
    } catch (e) { LUT = null; }
  }

  const _planetW = new THREE.Vector3(), _pole = new THREE.Vector3(), _camL = new THREE.Vector3();
  const _wq = new THREE.Quaternion(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3();
  const _col = new THREE.Color(), _m = new THREE.Matrix4();
  const wrapHalf = (d) => d - L * Math.round(d / L);
  const ss = THREE.MathUtils.smoothstep;

  function update(camera, sunDirWorld) {
    axis.updateWorldMatrix(true, false);
    axis.getWorldPosition(_planetW);
    axis.getWorldQuaternion(_wq);
    _pole.set(0, 1, 0).applyQuaternion(_wq).normalize();

    const rs = ringMat.userData.shader;
    if (rs) { rs.uniforms.uSunDir.value.copy(sunDirWorld); rs.uniforms.uPlanetCenter.value.copy(_planetW); }
    const ps = planetMat.userData.shader;
    if (ps) {
      ps.uniforms.uSunDir.value.copy(sunDirWorld);
      ps.uniforms.uPlanetCenter.value.copy(_planetW);
      ps.uniforms.uPoleAxis.value.copy(_pole);
      ps.uniforms.uRingTex.value = ringMat.map;
    }

    // Chunk field activates only when the camera descends close to the ring PLANE
    // (skimming the rings) — never in normal off-plane views, where the clean
    // photographic sheet reads as the rings. Gate on perpendicular height above the
    // plane; per-instance radius culling (below) keeps them within the real annulus,
    // so flying low but outside the rings still shows nothing.
    _camL.copy(camera.position); axis.worldToLocal(_camL);
    const heightAbove = Math.abs(_camL.y);
    const fade = 1 - ss(heightAbove, 2.2, 11.0);
    if (fade <= 0.001) { if (chunks.visible) chunks.visible = false; return; }
    chunks.visible = true;
    cmat.opacity = fade;
    if (!LUT && ringMat.map) buildLUT(ringMat.map);

    const cx = _camL.x, cz = _camL.z;

    for (let i = 0; i < COUNT; i++) {
      const lx = cx + wrapHalf(ox[i] - cx);
      const lz = cz + wrapHalf(oz[i] - cz);
      const rad = Math.hypot(lx, lz);
      let vis = (rad > rInner && rad < rOuter) ? 1 : 0;
      let r = 0.82, g = 0.82, b = 0.82;
      if (vis && LUT) {
        const u = (rad - rInner) / (rOuter - rInner);
        const idx = Math.min(255, Math.max(0, Math.floor(u * 255))) * 4;
        if (LUT[idx + 3] / 255 < 0.18) vis = 0;          // real gaps (Cassini etc.) → empty lanes
        r = Math.min(1, LUT[idx] / 255 * 1.15 + 0.05);
        g = Math.min(1, LUT[idx + 1] / 255 * 1.15 + 0.05);
        b = Math.min(1, LUT[idx + 2] / 255 * 1.15 + 0.07);
      }
      const dxy = Math.hypot(lx - cx, lz - cz);
      const edge = 1 - ss(dxy, L * 0.30, L * 0.5);        // shrink to 0 at the window edge (hides wraps)
      const sc = vis * edge;
      if (sc <= 0.0001) {
        _m.makeScale(0, 0, 0);
      } else {
        _pos.set(lx, hy[i], lz);
        _scl.set(sX[i] * sc, sY[i] * sc, sZ[i] * sc);
        _m.compose(_pos, quats[i], _scl);
      }
      chunks.setMatrixAt(i, _m);
      _col.setRGB(r, g, b); _col.convertSRGBToLinear();
      chunks.setColorAt(i, _col);
    }
    chunks.instanceMatrix.needsUpdate = true;
    if (chunks.instanceColor) chunks.instanceColor.needsUpdate = true;
  }

  return { update, chunks, cmat };
}

// ---------- Build everything ----------
export function buildScene(scene) {
  const system = new THREE.Group(); // floating-origin group: position = -focusHelio
  scene.add(system);

  const registry = {}; // id -> { body, root, mesh, spin, orbitLine, ... }
  let saturnFX = null;

  // Sun
  const sunDef = BODIES[0];
  const sun = buildSun(sunDef.radius);
  system.add(sun.group);
  registry.sun = { body: sunDef, root: sun.group, mesh: sun.mesh, spin: sun.mesh, sun };

  // Planets
  for (const body of BODIES.slice(1)) {
    const root = new THREE.Group();        // positioned at heliocentric coords each frame
    const axis = new THREE.Group();        // axial tilt
    axis.rotation.z = -body.tilt * Math.PI / 180;
    root.add(axis);
    let mesh, extras = {};
    if (body.id === 'earth') {
      const e = buildEarth(body.radius);
      axis.add(e.group);
      mesh = e.globe; extras = e;
    } else {
      const pmat = new THREE.MeshStandardMaterial({ map: makePlanetTexture(body.id), roughness: 1, metalness: 0 });
      mesh = new THREE.Mesh(new THREE.SphereGeometry(body.radius, 144, 96), pmat);
      axis.add(mesh);
      const rt = REAL_TEX[body.id];
      if (rt) {
        tryLoadTexture(RES(rt.colorId, rt.colorFile), (t) => { pmat.map = t; pmat.needsUpdate = true; });
        if (rt.bumpId) tryLoadData(RES(rt.bumpId, rt.bumpFile), (t) => {
          pmat.bumpMap = t; pmat.bumpScale = rt.bumpScale || 2.0; pmat.needsUpdate = true;
        });
      }
    }
    if (body.id === 'saturn') {
      const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(body.radius * 1.24, body.radius * 2.35, 256, 1),
        ringMat
      );
      // remap UVs radially
      const uv = ring.geometry.attributes.uv, p = ring.geometry.attributes.position;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < uv.count; i++) {
        v3.fromBufferAttribute(p, i);
        const t = (v3.length() - body.radius * 1.24) / (body.radius * (2.35 - 1.24));
        uv.setXY(i, t, 0.5);
      }
      ring.rotation.x = -Math.PI / 2;
      axis.add(ring);
      extras.ring = ring;
      // real photographic ring (radial alpha strip) over the procedural fallback
      tryLoadTexture(RES('saturnRing', 'saturn_ring.png'), (t) => {
        t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
        ringMat.map = t; ringMat.needsUpdate = true;
      });
      // planet/ring shadows + close-up ice-chunk field
      saturnFX = buildSaturnRingFX({ axis, planetMat: mesh.material, ringMat, radius: body.radius });
    }
    if (body.id === 'uranus') {
      // Uranus's faint, narrow charcoal rings. Built procedurally at the real ring
      // radii (no good photographic texture exists for them). Attached to `axis`, so
      // they inherit Uranus's 98° tilt and correctly stand nearly vertical.
      const rInner = body.radius * 1.6, rOuter = body.radius * 2.02;
      const ringMat = new THREE.MeshBasicMaterial({ map: uranusRingTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(rInner, rOuter, 256, 1), ringMat);
      const uv = ring.geometry.attributes.uv, p = ring.geometry.attributes.position;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < uv.count; i++) {
        v3.fromBufferAttribute(p, i);
        const t = (v3.length() - rInner) / (rOuter - rInner);
        uv.setXY(i, t, 0.5);
      }
      ring.rotation.x = -Math.PI / 2;
      axis.add(ring);
      extras.ring = ring;
    }
    if (body.id === 'jupiter') {
      // Jupiter's faint dusty ring system (bright narrow main ring + halo + two broad
      // gossamer rings). Radial-strip UVs like Saturn. Additive so it reads as a thin
      // veil of dust catching sunlight rather than a solid sheet.
      const rInner = body.radius * 1.35, rOuter = body.radius * 3.1;
      const ringMat = new THREE.MeshBasicMaterial({ map: jupiterRingTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(new THREE.RingGeometry(rInner, rOuter, 220, 1), ringMat);
      const uv = ring.geometry.attributes.uv, p = ring.geometry.attributes.position;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < uv.count; i++) {
        v3.fromBufferAttribute(p, i);
        const t = (v3.length() - rInner) / (rOuter - rInner);
        uv.setXY(i, t, 0.5);
      }
      ring.rotation.x = -Math.PI / 2;
      axis.add(ring);
      extras.ring = ring;
    }
    if (body.id === 'neptune') {
      // Neptune's faint rings, including the Adams ring's bright ARCS. Uses a 2D
      // angle×radius texture (u = azimuth, v = radius) so the arcs cluster over one
      // stretch of the circumference instead of smearing all the way around.
      const rInner = body.radius * 1.6, rOuter = body.radius * 2.7;
      const ringMat = new THREE.MeshBasicMaterial({ map: neptuneRingTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      // Start the geometry at -π so its duplicated edge vertices sit on the -X axis,
      // exactly where atan2 flips from +π to -π — that aligns the geometry seam with
      // the texture's azimuth seam, eliminating the wedge gap across the ring.
      const ring = new THREE.Mesh(new THREE.RingGeometry(rInner, rOuter, 360, 1, -Math.PI, Math.PI * 2), ringMat);
      const uv = ring.geometry.attributes.uv, p = ring.geometry.attributes.position;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < uv.count; i++) {
        v3.fromBufferAttribute(p, i);
        const ang = Math.atan2(v3.y, v3.x) / (Math.PI * 2) + 0.5; // azimuth -> u
        const t = (v3.length() - rInner) / (rOuter - rInner);     // radius -> v
        uv.setXY(i, ang, t);
      }
      ring.rotation.x = -Math.PI / 2;
      axis.add(ring);
      extras.ring = ring;
    }
    // invisible pick-proxy (planets are tiny at system scale)
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(body.radius, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.userData.bodyId = body.id;
    root.add(proxy);
    mesh.userData.bodyId = body.id;
    const orbitLine = buildOrbitLine(body, body.id === 'earth' ? 0x4a6a8a : 0x36465a);
    system.add(orbitLine);
    system.add(root);
    registry[body.id] = { body, root, mesh, spin: mesh.parent === undefined ? mesh : (body.id === 'earth' ? extras.group : mesh), axis, orbitLine, proxy, ...extras };
  }

  // Moons — parented under their planet's root
  for (const m of MOONS) {
    const parent = registry[m.parent];
    const root = new THREE.Group();
    let mat, geo;
    if (m.tex === 'moon') {
      // Hero treatment: real NASA albedo (LRO) + real elevation (LDEM) for crater
      // relief that catches the sunlight — with a procedural fallback shown instantly
      // and used if the real maps are unavailable (e.g. offline without resources).
      const mt = moonTexture();
      mat = new THREE.MeshStandardMaterial({ map: mt.map, bumpMap: mt.bump, bumpScale: 1.4, roughness: 1, metalness: 0 });
      geo = new THREE.SphereGeometry(m.radius, 256, 160);
      tryLoadTexture(RES('moonColor', 'moon_color.jpg'), (t) => { mat.map = t; mat.needsUpdate = true; });
      tryLoadData(RES('moonHeight', 'moon_height.jpg'), (t) => {
        mat.bumpMap = t;
        mat.bumpScale = 3.0;
        // subtle real vertex relief so the limb silhouette isn't a perfect circle
        mat.displacementMap = t;
        mat.displacementScale = m.radius * 0.018;
        mat.displacementBias = -m.radius * 0.009;
        mat.needsUpdate = true;
      });
    } else {
      mat = new THREE.MeshStandardMaterial({ map: makePlanetTexture(m.tex), roughness: 1 });
      geo = new THREE.SphereGeometry(m.radius, m.colorFile ? 144 : 48, m.colorFile ? 96 : 32);
      // real photographic map for moons that have one (e.g. Charon), over the procedural fallback
      if (m.colorFile) tryLoadTexture(RES(m.colorId, m.colorFile), (t) => { mat.map = t; mat.needsUpdate = true; });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.bodyId = m.id;
    root.add(mesh);
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(m.radius, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.userData.bodyId = m.id;
    root.add(proxy);
    // circular orbit ring
    const seg = 128, pts = [];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * m.a, 0, Math.sin(a) * m.a)); }
    const oline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x3a4a5a, transparent: true, opacity: 0.3 }));
    parent.root.add(oline);
    parent.root.add(root);
    registry[m.id] = { body: m, isMoon: true, parentId: m.parent, root, mesh, spin: mesh, orbitLine: oline, proxy };
  }

  // Comets
  for (const c of COMETS) {
    const built = buildComet(c);
    const orbitLine = cometOrbitLine(c);
    system.add(built.root, orbitLine);
    registry[c.id] = { body: c, isComet: true, root: built.root, mesh: built.nucleus, spin: built.nucleus, orbitLine, proxy: built.proxy, comet: built };
  }

  // Minor planets (major asteroids + dwarf planets) — small spheres on Keplerian orbits,
  // built like a comet's nucleus but with no coma/tail. cometOrbitLine handles the ellipse.
  for (const c of MINORS) {
    const root = new THREE.Group();
    const sh = c.shape;
    // Dwarf planets are gravitationally rounded (plain spheres); the smaller asteroids
    // get irregular lumpy shapes; Haumea is stretched into its real spin-flattened
    // ellipsoid (long equatorial axes, short polar/spin axis).
    const geo = (sh && sh.amp)
      ? lumpyGeometry(c.radius, sh.seed || 1, sh.amp)
      : new THREE.SphereGeometry(c.radius, 64, 40);
    let mat;
    if (c.kind === 'asteroid') {
      // procedural cratered surface + bump map, so relief catches sunlight like the Moon
      const at = asteroidTexture({ seed: (sh && sh.seed) || 2, stops: c.palette });
      mat = new THREE.MeshStandardMaterial({ map: at.map, bumpMap: at.bump, bumpScale: 2.5, roughness: 1 });
      // Swap in the real Dawn photographic mosaic over the procedural surface when present
      // (instant/offline shows procedural; the real map replaces it once loaded).
      if (c.realMap) tryLoadTexture(RES(c.id, c.realMap), (t) => { mat.map = t; mat.needsUpdate = true; });
    } else {
      mat = new THREE.MeshStandardMaterial({ map: makePlanetTexture(c.tex || 'rocky'), roughness: 1 });
      if (c.realMap) tryLoadTexture(RES(c.id, c.realMap), (t) => { mat.map = t; mat.needsUpdate = true; });
    }
    const mesh = new THREE.Mesh(geo, mat);
    const triax = sh && (sh.ellipsoid || sh.scale);
    if (triax) mesh.scale.set(triax[0], triax[1], triax[2]);
    mesh.userData.bodyId = c.id;
    root.add(mesh);
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(c.radius, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    if (triax) proxy.scale.set(triax[0], triax[1], triax[2]);
    proxy.userData.bodyId = c.id;
    root.add(proxy);
    const orbitLine = cometOrbitLine(c);
    orbitLine.material.color.setHex(c.kind === 'dwarf' ? 0x5a6a86 : 0x6a6256);
    orbitLine.material.opacity = 0.26;
    system.add(root, orbitLine);
    registry[c.id] = { body: c, isMinor: true, root, mesh, spin: mesh, orbitLine, proxy };
  }

  // Belts & far structure
  const asteroidBelt = ringParticles({ count: 4500, rMin: 2.1 * AU, rMax: 3.3 * AU, ySpread: 0.18 * AU, size: 0.0018 * AU, color: 0x8a8276, opacity: 0.55, seed: 5 });
  const kuiperBelt = ringParticles({ count: 5200, rMin: 30 * AU, rMax: 50 * AU, ySpread: 3 * AU, size: 0.05 * AU, color: 0x6a7a96, opacity: 0.5, seed: 6 });
  const oort = shellParticles({ count: 3200, rMin: 110 * AU, rMax: 260 * AU, size: 0.9 * AU, color: 0x5a6a85, opacity: 0.28, seed: 7 });
  system.add(asteroidBelt, kuiperBelt, oort);

  // Jupiter's Trojan swarms — a group rotated each frame to track Jupiter's longitude
  const trojans = new THREE.Group();
  trojans.add(trojanCloud({ count: 1700, centerDeg: 60, color: 0x8a8270, size: 0.02 * AU, seed: 21 }));   // L4 (Greek camp, leading)
  trojans.add(trojanCloud({ count: 1700, centerDeg: -60, color: 0x8a8270, size: 0.02 * AU, seed: 22 }));  // L5 (Trojan camp, trailing)
  system.add(trojans);

  const stars = buildStarfield();
  scene.add(stars);

  const constellations = buildConstellations();
  scene.add(constellations.group);

  const galaxy = buildGalaxy();
  system.add(galaxy.group);

  scene.add(new THREE.AmbientLight(0x223344, 0.25));

  return { system, registry, sun, stars, galaxy, asteroidBelt, kuiperBelt, oort, trojans, constellations, saturnFX };
}
