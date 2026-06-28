// Artemis II — render the REAL Orion trajectory from NASA OEM ephemeris.
// The path is built in Earth-relative ecliptic scene units (1 unit = 1000 km) and
// added as a child of Earth's root, so it travels with Earth and sits correctly
// against the accurate Moon. A moving marker is sampled by time.
import * as THREE from './vendor/three.module.js';
import { ARTEMIS_II } from './artemis-data.js';

const KM_U = 1 / 1000;

// soft radial sprite for the craft glow
function glowSprite(color, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,238,214,0.42)');
  g.addColorStop(0.32, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A small, recognizable Orion stack: crew module + European service module +
// the four-wing solar array “X”. Built nose-toward +Z; lit by the scene's Sun light.
function buildOrion() {
  const g = new THREE.Group();
  const matCM = new THREE.MeshStandardMaterial({ color: 0xbfc4cb, roughness: 0.5, metalness: 0.25 });
  const matSM = new THREE.MeshStandardMaterial({ color: 0x7e858f, roughness: 0.6, metalness: 0.4 });
  const matBand = new THREE.MeshStandardMaterial({ color: 0x32363c, roughness: 0.5, metalness: 0.5 });
  const matNoz = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.45, metalness: 0.7 });
  const matBoom = new THREE.MeshStandardMaterial({ color: 0x6c727b, roughness: 0.6, metalness: 0.5 });
  const matPanel = new THREE.MeshStandardMaterial({ color: 0x1c356b, emissive: 0x0a1838, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide });

  // Crew module (frustum): small nose forward (+Z), wide heat-shield base aft
  const cm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.20, 0.32, 24), matCM);
  cm.rotation.x = Math.PI / 2; cm.position.z = 0.30;
  g.add(cm);
  // Service module body
  const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.46, 24), matSM);
  sm.rotation.x = Math.PI / 2; sm.position.z = -0.05;
  g.add(sm);
  // dark band where CM meets SM
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, 0.05, 24), matBand);
  band.rotation.x = Math.PI / 2; band.position.z = 0.14;
  g.add(band);
  // main engine nozzle aft
  const noz = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 20), matNoz);
  noz.rotation.x = -Math.PI / 2; noz.position.z = -0.37;
  g.add(noz);
  // four solar-array wings, 45° apart → an “X” in the plane normal to the body axis
  for (let i = 0; i < 4; i++) {
    const wing = new THREE.Group();
    wing.rotation.z = Math.PI / 4 + i * Math.PI / 2;
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8), matBoom);
    boom.rotation.z = Math.PI / 2; boom.position.x = 0.27;
    wing.add(boom);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.012), matPanel);
    panel.position.x = 0.66; panel.position.z = -0.02;
    wing.add(panel);
    g.add(wing);
  }
  return g;
}

export function buildArtemis() {
  const D = ARTEMIS_II;
  const n = D.points.length;
  // Earth-relative scene points: ecliptic (x,y,z) km -> scene (x, z, -y) * KM_U
  const times = new Float64Array(n);              // absolute ms
  const pos = new Array(n);                        // THREE.Vector3 (scene units, Earth-rel)
  const flat = new Float32Array(n * 3);
  let flybyIdx = 0, maxR = 0;
  for (let i = 0; i < n; i++) {
    const p = D.points[i];
    times[i] = D.startMs + p[0] * 1000;
    const v = new THREE.Vector3(p[1] * KM_U, p[3] * KM_U, -p[2] * KM_U);
    pos[i] = v;
    flat[i * 3] = v.x; flat[i * 3 + 1] = v.y; flat[i * 3 + 2] = v.z;
    const r = p[1] * p[1] + p[2] * p[2] + p[3] * p[3];
    if (r > maxR) { maxR = r; flybyIdx = i; }
  }

  const group = new THREE.Group();
  group.visible = false;

  // ---- trajectory path: two-tone (outbound amber -> return cyan), split at flyby ----
  const mkLine = (a, b, color, opacity) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(flat.slice(a * 3, (b + 1) * 3), 3));
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  };
  const outbound = mkLine(0, flybyIdx, 0xff9d4d, 0.9);
  const inbound = mkLine(flybyIdx, n - 1, 0x57c7ff, 0.85);
  group.add(outbound, inbound);

  // ---- milestone dots ----
  const milestones = [
    { i: 0, name: 'Outbound coast', ms: times[0] },
    { i: flybyIdx, name: 'Lunar flyby', ms: times[flybyIdx] },
    { i: n - 1, name: 'Entry interface', ms: times[n - 1] },
  ];
  const msDots = [];
  for (const m of milestones) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    dot.position.copy(pos[m.i]);
    group.add(dot);
    m.pos = pos[m.i];
    msDots.push(dot);
  }

  // ---- moving Orion marker: 3D model + subtle glow halo ----
  const marker = new THREE.Group();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowSprite('rgba(255,205,130,0.5)'), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(3);
  const model = buildOrion();
  marker.add(glow, model);
  marker.visible = false;
  group.add(marker);

  // ---- time sampler (linear interp; ~105 s cadence is smooth) ----
  function sampleAt(ms, out) {
    out = out || new THREE.Vector3();
    if (ms <= times[0]) return out.copy(pos[0]);
    if (ms >= times[n - 1]) return out.copy(pos[n - 1]);
    // binary search
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= ms) lo = mid; else hi = mid; }
    const t = (ms - times[lo]) / (times[hi] - times[lo]);
    return out.copy(pos[lo]).lerp(pos[hi], t);
  }

  // ---- heading (unit velocity) via central difference ----
  const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3();
  function sampleDir(ms, out) {
    out = out || new THREE.Vector3();
    const dt = 150000;
    sampleAt(Math.min(D.endMs, ms + dt), _d2);
    sampleAt(Math.max(D.startMs, ms - dt), _d1);
    out.copy(_d2).sub(_d1);
    if (out.lengthSq() < 1e-9) out.set(0, 0, 1);
    return out.normalize();
  }

  return {
    group, marker, glow, model, outbound, inbound, msDots, milestones,
    sampleAt, sampleDir, startMs: D.startMs, endMs: D.endMs, flybyMs: times[flybyIdx],
    name: D.name, object: D.object,
  };
}
