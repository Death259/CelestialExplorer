// App core: renderer, camera, floating-origin focus system, time, render loop.
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/jsm/controls/OrbitControls.js';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';
import { BODIES, MOONS, COMETS, MINORS, AU, bodyPosition, moonPosition } from './data.js';
import { buildScene, GALAXY } from './bodies.js';
import { buildFarField } from './farfield.js';
import { buildArtemis } from './artemis.js';

export const App = {};
window.SolarApp = App;

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
addEventListener('error', (e) => console.error('APP ERROR:', e.message, e.filename, e.lineno));
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x01030a);

const camera = new THREE.PerspectiveCamera(55, 1, 0.005, 4e10);
camera.position.set(0, 1800, 5200);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxDistance = 9e9;
controls.zoomSpeed = 1.4;

// Post-processing
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.0, 0.5, 0.82);
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// Scene content
const world = buildScene(scene);
const { registry, system, stars, galaxy } = world;
const far = buildFarField(scene, world);

// ---- Artemis II: real Orion trajectory (NASA OEM ephemeris) ----
const artemis = buildArtemis();
registry.earth.root.add(artemis.group);
registry.artemis = { body: { id: 'artemis', name: 'Orion', radius: 0.05 }, root: artemis.marker, isCraft: true };
const Artemis = { active: false, follow: false, obj: artemis };
App.Artemis = Artemis;

// ---------------- Time ----------------
const Time = {
  simMs: Date.now(),
  speed: 3600,         // sim seconds per real second
  playing: true,
  // marked slider stops; the slider interpolates log-spaced in between
  stops: [1, 3600, 86400, 86400 * 7, 86400 * 30, 86400 * 365.25, 86400 * 3652.5],
  stopLabels: ['Real time', '1 hr/s', '1 day/s', '7 days/s', '1 mo/s', '1 yr/s', '10 yr/s'],
  sliderPos: 1,        // continuous 0 .. stops.length-1
};
App.Time = Time;

// ---------------- Focus / floating origin ----------------
// All heliocentric positions computed in JS doubles; the focused body is held
// at the scene origin so float32 precision never degrades up close.
const helio = {};   // id -> THREE.Vector3 heliocentric position (this frame)
for (const id in registry) helio[id] = new THREE.Vector3();

const Focus = { id: 'sun', anim: null };
App.Focus = Focus;

function computePositions(ms) {
  for (const b of BODIES) {
    if (b.id === 'sun') { helio.sun.set(0, 0, 0); continue; }
    bodyPosition(b, ms, helio[b.id]);
  }
  const tmp = computePositions._t || (computePositions._t = new THREE.Vector3());
  for (const m of MOONS) {
    moonPosition(m, ms, tmp);
    helio[m.id].copy(helio[m.parent]).add(tmp);
  }
  for (const c of COMETS) bodyPosition(c, ms, helio[c.id]);
  for (const c of MINORS) bodyPosition(c, ms, helio[c.id]);
}

function radiusOf(id) { return registry[id].body.radius; }

// Distance from camera to focus body center (scene units; focus is at origin)
function camDist() { return camera.position.length(); }

// Heliocentric camera position (for galaxy fades / auto-refocus)
const _camHelio = new THREE.Vector3();
function cameraHelio() { return _camHelio.copy(camera.position).add(helio[Focus.id]); }

function setFocus(id, { jump = false } = {}) {
  if (!registry[id] || id === Focus.id) return;
  const oldHelio = helio[Focus.id].clone();
  Focus.id = id;
  // keep camera world-position AND look-target continuous across the origin rebase
  camera.position.add(oldHelio).sub(helio[id]);
  controls.target.add(oldHelio).sub(helio[id]);
  controls.minDistance = radiusOf(id) * 1.12;
  if (jump) {
    const d = radiusOf(id) * 4.5;
    camera.position.setLength(d);
  }
  App.onFocusChange && App.onFocusChange(id);
}

// Cinematic fly-to: ease camera from current offset to a nice vantage of target
function flyTo(id, { dist = null, distAbs = null, duration = 2600, onDone = null, dir = null } = {}) {
  if (!registry[id]) return;
  setFocus(id);
  const r = radiusOf(id);
  const targetDist = distAbs != null ? distAbs : (dist != null ? dist * r : Math.max(r * 4.2, r + 0.02));
  const from = camera.position.clone();
  let to;
  if (dir) {
    to = dir.clone().normalize().multiplyScalar(targetDist);
  } else {
    // arrival direction: slightly above orbital plane, lit side biased toward sun
    const sunward = helio[id].clone().multiplyScalar(-1).normalize();
    if (sunward.lengthSq() < 0.5) sunward.set(0.6, 0, 0.8).normalize();
    const side = new THREE.Vector3().crossVectors(sunward, new THREE.Vector3(0, 1, 0)).normalize();
    to = sunward.clone().multiplyScalar(0.82).add(side.multiplyScalar(0.45)).add(new THREE.Vector3(0, 0.3, 0)).normalize().multiplyScalar(targetDist);
  }
  const t0 = performance.now();
  // ease any pan-offset look-target back to the body (origin) during the flight,
  // otherwise we arrive at the right distance but looking off into empty space
  Focus.anim = { from, to, t0, duration, onDone, targetFrom: controls.target.clone() };
  controls.enabled = false;
}
App.flyTo = flyTo;
App.setFocus = setFocus;

// Fly to a far-field landmark (deep-sky object, probe…) that lives at a fixed scene
// position relative to the Sun rather than being a focusable body. We snap focus to
// the Sun (so the floating origin is stable and its `local` position is its true
// scene position), then ease the camera to a framed vantage and orbit-target it.
// `look` is the landmark's local Vector3; `dist` is how far to sit from it.
function flyToFar(look, { dist = 1.1e8, duration = 3000, onDone = null } = {}) {
  setFocus('sun');
  const target = look.clone();
  const from = camera.position.clone();
  // sit slightly sunward of the object and a touch above, so it's lit from behind
  // (the emission glow backlights the dust) and framed against open sky
  const sunward = target.clone().negate().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(sunward, up).normalize();
  const off = sunward.multiplyScalar(0.96).add(side.multiplyScalar(0.18)).add(up.clone().multiplyScalar(0.12)).normalize().multiplyScalar(dist);
  const to = target.clone().add(off);
  Focus.anim = { from, to, t0: performance.now(), duration, onDone, targetFrom: controls.target.clone(), look: target };
  controls.enabled = false;
}
App.flyToFar = flyToFar;

// ---- Artemis II controls ----
Artemis.setActive = (on) => { Artemis.active = !!on; if (!on) { Artemis.follow = false; applyStyle(); } };
Artemis.frameAll = () => {
  Artemis.active = true;
  applyStyle();
  // top-down vantage over the Earth–Moon plane, tilted away from the Sun (keeps the
  // Sun's glow out of frame so the figure-eight reads cleanly)
  const antiSun = helio.earth.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(antiSun, up).normalize();
  const dir = antiSun.multiplyScalar(0.35).add(up.multiplyScalar(0.92)).add(side.multiplyScalar(0.18)).normalize();
  flyTo('earth', { distAbs: 760, duration: 2600, dir });
};
Artemis.setFollow = (on) => {
  if (on) {
    Artemis.active = true; Artemis.follow = true;
    // up close the fully-lit hull/Moon would bloom out — drop bloom + exposure
    bloomPass.strength = 0.1;
    renderer.toneMappingExposure = 0.92;
    // default fly-to framing is sun-safe (camera sits sunward of the target,
    // so the Sun stays behind the camera and out of frame)
    flyTo('artemis', { distAbs: 34, duration: 2200 });
  } else { Artemis.follow = false; applyStyle(); flyTo('earth', { distAbs: 60, duration: 1800 }); }
  App.onArtemisFollow && App.onArtemisFollow(Artemis.follow);
};
Artemis.getState = () => {
  const a = artemis;
  const inWin = Time.simMs >= a.startMs && Time.simMs <= a.endMs;
  const distKm = _aTmp.copy(helio.artemis).sub(helio.earth).length() * 1000;
  return { inWin, active: Artemis.active, follow: Artemis.follow, met: Time.simMs - a.startMs,
           startMs: a.startMs, endMs: a.endMs, flybyMs: a.flybyMs, distKm };
};

function stepFlyAnim(now) {
  const a = Focus.anim;
  if (!a) return;
  let t = (now - a.t0) / a.duration;
  if (t >= 1) {
    camera.position.copy(a.to);
    if (a.look) controls.target.copy(a.look); else controls.target.set(0, 0, 0);
    Focus.anim = null;
    controls.enabled = true;
    a.onDone && a.onDone();
    return;
  }
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  // far-field flight: straight eased lerp toward a non-origin look target
  if (a.look) {
    controls.target.copy(a.targetFrom).lerp(a.look, e);
    camera.position.copy(a.from).lerp(a.to, e);
    return;
  }
  // smooth ease in-out with log-distance interpolation (feels right across scales)
  controls.target.copy(a.targetFrom).multiplyScalar(1 - e);
  const dir = a.from.clone().normalize().lerp(a.to.clone().normalize(), e).normalize();
  const len = Math.exp(THREE.MathUtils.lerp(Math.log(a.from.length()), Math.log(a.to.length()), e));
  camera.position.copy(dir.multiplyScalar(len));
}

// ---------------- Visual style ----------------
const Style = { mode: 'cinematic' };
App.Style = Style;
function applyStyle() {
  const cine = Style.mode === 'cinematic';
  bloomPass.strength = cine ? App.tweaks.bloom : App.tweaks.bloom * 0.25;
  renderer.toneMappingExposure = cine ? 1.18 : 1.0;
  world.sun.glow.material.opacity = cine ? 1 : 0.55;
  document.body.classList.toggle('cinematic', cine);
}
App.setStyleMode = (m) => { Style.mode = m; applyStyle(); App.onStyleChange && App.onStyleChange(m); };

// ---------------- Tweaks ----------------
App.tweaks = {
  bloom: 1.0, starBrightness: 1.0,
  orbitLines: true, labels: true, moonLabels: true, moonOrbits: true,
  moons: true, comets: true, minors: true, constellations: true, belts: true, trojans: true, flares: true,
  nearbyStars: true, heliosphere: true, deepSky: true, galaxyMarkers: true,
};
App.applyTweaks = (t) => { Object.assign(App.tweaks, t); applyStyle(); };

// ---------------- Per-frame update ----------------
const ROT_MS = 3600000;
let lastReal = performance.now();
const _v1 = new THREE.Vector3();
const _aTmp = new THREE.Vector3();
const _aTmp2 = new THREE.Vector3();
const _aFwd = new THREE.Vector3();
const _mNear = new THREE.Vector3();   // reused: moon-orbit proximity test (avoids per-frame alloc)
const FWD = new THREE.Vector3(0, 0, 1);

function updateArtemis() {
  const a = artemis;
  const inWin = Time.simMs >= a.startMs && Time.simMs <= a.endMs;
  a.group.visible = Artemis.active;
  if (inWin) {
    a.sampleAt(Time.simMs, _aTmp);
    a.marker.position.copy(_aTmp);
    a.sampleDir(Time.simMs, _aFwd);
    a.model.quaternion.setFromUnitVectors(FWD, _aFwd);
    a.marker.visible = Artemis.active;
    helio.artemis.copy(helio.earth).add(_aTmp);
  } else {
    a.marker.visible = false;
    helio.artemis.copy(helio.earth);
    if (Focus.id === 'artemis') { Artemis.follow = false; setFocus('earth'); App.onArtemisFollow && App.onArtemisFollow(false); }
  }
}

// keep the marker glow + milestone dots ~constant screen size. MUST run after the
// camera is finalized for the frame (stepFlyAnim + controls.update), otherwise the
// scale lags a frame behind the camera and balloons when zooming in.
function scaleArtemisMarkers() {
  if (!Artemis.active) return;
  const rel = _aTmp2.copy(helio.artemis).sub(helio[Focus.id]);
  const fdist = camera.position.distanceTo(rel);
  artemis.model.scale.setScalar(Math.min(11, Math.max(1.2, fdist * 0.082)));
  artemis.glow.scale.setScalar(Math.min(5, Math.max(0.4, fdist * 0.004)));
  for (const d of artemis.msDots) d.scale.setScalar(Math.min(9, Math.max(0.8, fdist * 0.01)));
}

function update(now) {
  const dtReal = Math.min(100, now - lastReal);
  lastReal = now;
  if (Time.playing && !Time.scrubbing) Time.simMs += dtReal * Time.speed;
  computePositions(Time.simMs);
  updateArtemis();

  stepFlyAnim(now);
  controls.update();
  scaleArtemisMarkers();

  // floating origin: focused body sits at scene origin
  const f = helio[Focus.id];
  for (const b of BODIES) {
    const e = registry[b.id];
    e.root.position.copy(helio[b.id]).sub(f);
  }
  for (const m of MOONS) {
    const e = registry[m.id];
    e.root.visible = App.tweaks.moons;
    // moons are children of planet root: local = helio - parentHelio
    e.root.position.copy(helio[m.id]).sub(helio[m.parent]);
  }
  for (const ol of [...BODIES.slice(1), ...COMETS, ...MINORS]) {
    registry[ol.id].orbitLine.position.copy(_v1.copy(f).multiplyScalar(-1));
  }
  for (const c of COMETS) registry[c.id].root.position.copy(helio[c.id]).sub(f);
  for (const c of MINORS) {
    const e = registry[c.id];
    e.root.visible = App.tweaks.minors;
    e.root.position.copy(helio[c.id]).sub(f);
  }
  world.asteroidBelt.position.copy(_v1);
  world.kuiperBelt.position.copy(_v1);
  world.oort.position.copy(_v1);
  galaxy.group.position.copy(GALAXY.center).add(_v1);
  world.sun.group.position.copy(_v1); // sun root at -focus

  // rotation
  const spinT = Time.simMs / ROT_MS;
  for (const id in registry) {
    const e = registry[id], rotH = e.body.rotH;
    if (rotH && e.mesh) e.mesh.rotation.y = (spinT / rotH) * Math.PI * 2;
    if (e.clouds) e.clouds.rotation.y = (spinT / e.body.rotH) * Math.PI * 2 * 1.12;
  }
  // Moons are tidally locked: they DO rotate, but exactly once per orbit, so the same
  // hemisphere always faces their planet (why we only ever see one face of the Moon).
  // Track each moon's spin to its live orbital angle — its local position is the
  // planet→moon vector — so the near side stays pointed at the parent as it orbits.
  for (const m of MOONS) {
    const e = registry[m.id];
    if (e && e.mesh) e.mesh.rotation.y = Math.atan2(e.root.position.x, e.root.position.z);
  }
  // earth sun direction (world space; sun is at -f)
  if (registry.earth.earthUniforms) {
    registry.earth.earthUniforms.sunDir.value.copy(helio.earth).multiplyScalar(-1).normalize();
  }
  // solar prominences / flares
  if (App.tweaks.flares) { if (world.sun.updateFlares) world.sun.updateFlares(now, camera); }
  else if (world.sun.flareGroup) world.sun.flareGroup.visible = false;

  // Saturn ring FX: planet/ring shadows + close-up ice-chunk field
  if (world.saturnFX) {
    const _sd = update._satSun || (update._satSun = new THREE.Vector3());
    _sd.copy(helio.saturn).multiplyScalar(-1).normalize();
    world.saturnFX.update(camera, _sd);
  }

  // comets: orient tail anti-sunward, activity scales with solar distance
  const _tailDir = update._td || (update._td = new THREE.Vector3());
  const _q = update._q || (update._q = new THREE.Quaternion());
  const X_AXIS = update._x || (update._x = new THREE.Vector3(1, 0, 0));
  for (const c of COMETS) {
    const e = registry[c.id];
    e.root.visible = App.tweaks.comets;
    const rAU = helio[c.id].length() / AU;
    const act = Math.max(0, Math.min(1, (5 - rAU) / 4.2));   // active inside ~5 AU
    _tailDir.copy(helio[c.id]).normalize();                   // anti-sunward
    _q.setFromUnitVectors(X_AXIS, _tailDir);
    e.comet.tail.quaternion.copy(_q);
    const tailLen = act * (0.1 + act * 0.5) * AU;
    e.comet.tail.scale.setScalar(Math.max(tailLen, 1e-6));
    const comaWorld = 60 + act * 5200;
    e.comet.coma.scale.setScalar(comaWorld);
    // Distance attenuation. The coma sprite and the tail's dense head particles are
    // additive and (the tail) fixed screen-size, so from far the comet collapses into a
    // tiny saturated source that the bloom pass blocks up into a glowing SQUARE far
    // brighter than the Sun. Fade brightness by apparent size: full when you're near it
    // (the zoomed-in look is unchanged) and a faint speck when far — no blow-out, no box.
    const _cd = update._cd || (update._cd = new THREE.Vector3());
    const camD = _cd.copy(e.root.position).distanceTo(camera.position);
    const distFade = Math.max(0.1, Math.min(1, (comaWorld / Math.max(camD, 1e-3)) / 0.05));
    e.comet.tail.visible = act > 0.02 && distFade > 0.12;
    e.comet.tail.material.opacity = 0.85 * act * distFade;
    e.comet.coma.material.opacity = (0.18 + act * 0.75) * distFade;
  }

  // camera-follow starfield + scale fades
  stars.position.copy(camera.position);
  const dHelio = cameraHelio().length();
  const galT = THREE.MathUtils.smoothstep(dHelio, 2.2e7, 6.5e8);     // galaxy fade-in
  const starFade = 1 - THREE.MathUtils.smoothstep(dHelio, 3e8, 2.5e9);
  galaxy.points.material.opacity = galT * 0.9;
  galaxy.core.material.opacity = galT * 0.85;
  stars.material.uniforms.uOpacity.value = starFade * App.tweaks.starBrightness;
  // constellations: follow camera, fade with stars + when close to a body, toggleable
  const conProx = THREE.MathUtils.smoothstep(camDist() / radiusOf(Focus.id), 40, 140);
  const conT = starFade * conProx * (App.tweaks.constellations ? 1 : 0);
  world.constellations.group.position.copy(camera.position);
  world.constellations.lines.material.opacity = 0.32 * conT;
  world.constellations.stars.material.opacity = 0.95 * conT;
  world.constellations.group.visible = conT > 0.02;
  // belts: oort only appears once you're far out; all fade before galaxy scale
  const beltFade = (1 - THREE.MathUtils.smoothstep(dHelio, 1.5e8, 9e8)) * (App.tweaks.belts ? 1 : 0);
  world.asteroidBelt.visible = world.kuiperBelt.visible = world.oort.visible = App.tweaks.belts;
  world.asteroidBelt.material.opacity = 0.55 * beltFade;
  world.kuiperBelt.material.opacity = 0.5 * beltFade * THREE.MathUtils.smoothstep(dHelio, 2 * AU, 12 * AU);
  world.oort.material.opacity = 0.28 * THREE.MathUtils.smoothstep(dHelio, 35 * AU, 100 * AU) * beltFade;
  // Jupiter Trojans: track Jupiter's longitude, visible across the planetary-system
  // scale (same envelope as the belts), fading out only at deep-space distances.
  if (world.trojans) {
    world.trojans.rotation.y = Math.atan2(-helio.jupiter.z, helio.jupiter.x);
    const trojFade = beltFade;
    world.trojans.visible = App.tweaks.trojans && trojFade > 0.01;
    for (const c of world.trojans.children) c.material.opacity = 0.7 * trojFade * (App.tweaks.trojans ? 1 : 0);
  }
  const orbitFade = (1 - THREE.MathUtils.smoothstep(dHelio, 1.5e7, 1.2e8)) * (App.tweaks.orbitLines ? 1 : 0);
  for (const b of BODIES.slice(1)) {
    registry[b.id].orbitLine.material.opacity = 0.35 * orbitFade;
    registry[b.id].orbitLine.visible = orbitFade > 0.01;
  }
  // comet orbit lines: visible at system scale like planet orbits
  for (const c of COMETS) {
    registry[c.id].orbitLine.material.opacity = 0.3 * orbitFade;
    registry[c.id].orbitLine.visible = orbitFade > 0.01 && App.tweaks.comets;
  }
  // minor-planet orbit lines: same envelope, gated on the Minors layer
  for (const c of MINORS) {
    registry[c.id].orbitLine.material.opacity = 0.26 * orbitFade;
    registry[c.id].orbitLine.visible = orbitFade > 0.01 && App.tweaks.minors;
  }
  // moon orbit rings only when near their planet
  for (const m of MOONS) {
    const e = registry[m.id];
    const near = _mNear.copy(helio[m.parent]).sub(cameraHelio()).length() < m.a * 60;
    e.orbitLine.visible = near && App.tweaks.moonOrbits && App.tweaks.moons;
    e.orbitLine.material.opacity = 0.3;
  }
  // sun far-marker visibility
  world.sun.marker.material.opacity = THREE.MathUtils.smoothstep(dHelio, 5e5, 5e6) * (1 - galT * 0.4);

  // far field: nearby stars, heliosphere, deep sky, galactic markers
  far.update({ f, dHelio, galT, now, tweaks: App.tweaks });

  // auto-refocus to sun when far from a focused planet
  if (Focus.id !== 'sun' && !Focus.anim) {
    const fDist = helio[Focus.id].length() || AU;
    if (camDist() > Math.max(fDist * 6, 60 * AU)) setFocus('sun');
  }
  controls.minDistance = radiusOf(Focus.id) * 1.12;

  App.onFrame && App.onFrame({ dHelio, galT, conT, camDist: camDist(), now });
}

// ---------------- Resize & loop ----------------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((now) => {
  update(now);
  composer.render();
});

// expose for ui.js
App.three = { THREE, scene, camera, controls, renderer, registry, helio, world, bloomPass, far };
App.step = () => { update(performance.now()); composer.render(); };  // manual frame (testing/suspended iframes)
App.camDist = camDist;
App.cameraHelio = cameraHelio;
applyStyle();

// initial view: gentle establishing shot of the inner system from above Earth orbit
camera.position.set(AU * 0.9, AU * 0.55, AU * 1.6);
controls.minDistance = radiusOf('sun') * 1.12;
