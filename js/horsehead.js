// Horsehead Nebula — a volumetric point cloud silhouetted against an emission glow.
//
// Pipeline (the one a NASA photo would go through, with the source image painted
// procedurally so no external asset is needed):
//
//   density map (painted silhouette)     <- swap in a real grayscale photo for higher fidelity
//        -> sample brightness per pixel
//        -> rejection-scatter points where dense (probability ∝ density)
//        -> push each point into a depth slab, thickness modulated by fbm noise
//        -> wispy fall-off at the edges (low-density pixels make sparse outliers)
//        -> DARK, occluding points drawn OVER a bright red emission backdrop
//
// The Horsehead is a DARK nebula: cold dust silhouetted against the glowing
// hydrogen of IC 434 behind it. So this builds two things — a bright red-pink
// emission field (additive), and a near-black dust cloud (normal-blended) that
// paints over it. The dust only "appears" where it occludes the glow, exactly
// like the famous image: a dark horse's head cut out of a luminous field.
import * as THREE from './vendor/three.module.js';

// ---- tiny self-contained value-noise (module is standalone) ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(seed) {
  const rand = mulberry32(seed), N = 256, g = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) g[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const ix = ((xi % N) + N) % N, iy = ((yi % N) + N) % N;
    const ix1 = (ix + 1) % N, iy1 = (iy + 1) % N;
    const a = g[iy * N + ix], b = g[iy * N + ix1];
    const c = g[iy1 * N + ix], d = g[iy1 * N + ix1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}
function fbm(noise, x, y, oct = 4) {
  let val = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { val += amp * noise(x * f, y * f); f *= 2; amp *= 0.5; }
  return val;
}

// ---- paint the iconic Horsehead silhouette as a grayscale density map ----
// White = dense dust, black = empty. A horse's head in profile facing LEFT: concave
// face, muzzle at lower-left, two pricked ears up top, the mane arching back to the
// right, all rising from a thick pillar/neck at the bottom.
function horseheadDensity(W = 300, H = 380) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(150, 372);                                  // base of the neck (in the pillar)
  ctx.bezierCurveTo(126, 344, 116, 312, 112, 270);       // front of the neck, up toward the chin
  ctx.bezierCurveTo(108, 244, 92, 236, 66, 226);         // jaw/chin juts forward-left
  ctx.bezierCurveTo(44, 218, 36, 206, 50, 194);          // out to the muzzle tip (lower-left)
  ctx.bezierCurveTo(62, 184, 72, 178, 80, 158);          // up the nose...
  ctx.bezierCurveTo(86, 142, 84, 126, 92, 112);          // ...concave face to the brow
  ctx.bezierCurveTo(100, 98, 104, 74, 114, 70);          // up to the first (front) ear
  ctx.bezierCurveTo(120, 68, 122, 88, 128, 96);          // ear tip + notch behind it
  ctx.bezierCurveTo(134, 86, 140, 70, 150, 70);          // second (back) ear
  ctx.bezierCurveTo(158, 70, 158, 90, 166, 100);         // its tip, down to the poll
  ctx.bezierCurveTo(188, 86, 214, 80, 232, 96);          // crest of the neck, mane begins
  ctx.bezierCurveTo(244, 106, 236, 122, 248, 130);       // mane wisp streaming up-right
  ctx.bezierCurveTo(262, 138, 252, 158, 238, 168);       // mane curling back down
  ctx.bezierCurveTo(226, 178, 220, 200, 214, 236);       // back of the neck (right edge)
  ctx.bezierCurveTo(208, 272, 206, 312, 196, 348);       // down toward the pillar
  ctx.bezierCurveTo(190, 364, 176, 374, 150, 372);       // close at the base
  ctx.closePath();
  ctx.fill();

  // soften so edges carry intermediate density -> wispy outliers, plus a dusty halo
  const soft = document.createElement('canvas'); soft.width = W; soft.height = H;
  const sx = soft.getContext('2d');
  sx.filter = 'blur(6px)'; sx.drawImage(c, 0, 0);
  sx.globalAlpha = 0.4; sx.filter = 'blur(16px)'; sx.drawImage(c, 0, 0);
  sx.globalAlpha = 1; sx.filter = 'none';
  return sx.getImageData(0, 0, W, H);
}

// ---- soft round dot sprite for each point ----
function dotTexture() {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.92)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

// ---- the bright emission backdrop (IC 434): a mottled red-pink glowing field ----
function emissionTexture(seed = 71) {
  const W = 512, H = 640, noise = makeNoise(seed);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const cx = 0.46, cy = 0.5; // glow brightest slightly left of centre (the bright ridge)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const dx = (u - cx) / 0.55, dy = (v - cy) / 0.62;
      let r = Math.sqrt(dx * dx + dy * dy);          // elliptical falloff
      let a = Math.max(0, 1 - r);
      a = a * a;                                      // soft round edge
      // mottled hydrogen structure
      const m = 0.6 + 0.4 * fbm(noise, u * 5, v * 6, 5);
      a *= m;
      // a brighter vertical ridge on the left (the lit edge of IC 434)
      a *= 1 + Math.max(0, 1 - Math.abs(u - 0.33) * 6) * 0.5;
      a = Math.max(0, Math.min(1, a));
      const i = (y * W + x) * 4;
      // red-pink emission: strong red, moderate blue-violet, low green
      d[i] = 255;
      d[i + 1] = 80 + 70 * a;
      d[i + 2] = 120 + 60 * (1 - a);
      d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Build the nebula. `span` = world size of the figure's long axis. Returns a
// THREE.Group whose +Z faces the viewer (caller does lookAt). Exposes setOpacity().
export function buildHorseheadCloud({ span = 5.2e7, count = 26000, seed = 23 } = {}) {
  const group = new THREE.Group();

  // --- emission backdrop, sized to frame the horse, sitting just behind the dust ---
  const bw = span * 1.5, bh = span * 1.9;
  const backMat = new THREE.MeshBasicMaterial({
    map: emissionTexture(), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), backMat);
  // shift the glow so the dark horse sits in its lower-bright region (head rising
  // out of the dark lane at the field's base, as in the real image)
  backdrop.position.set(span * 0.02, span * 0.18, -span * 0.12);
  backdrop.renderOrder = 1;
  group.add(backdrop);

  // --- dust point cloud ---
  const density = horseheadDensity();
  const W = density.width, H = density.height, data = density.data;
  const noise = makeNoise(seed);
  const rand = mulberry32(seed * 13 + 7);
  const aspect = W / H;
  const sx = span * aspect, sy = span;
  const thickness = span * 0.2;

  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let n = 0, guard = 0;
  while (n < count && guard < count * 200) {
    guard++;
    const px = Math.floor(rand() * W), py = Math.floor(rand() * H);
    const dens = data[(py * W + px) * 4] / 255;
    if (dens < 0.05) continue;
    const wisp = 0.6 + 0.4 * fbm(noise, px * 0.06, py * 0.06, 4);
    if (rand() > dens * wisp) continue;

    const nx = (px / W - 0.5);
    const ny = (0.5 - py / H);
    const x = nx * sx;
    const y = ny * sy;
    const znoise = fbm(noise, px * 0.05 + 11, py * 0.05 + 7, 4) - 0.5;
    const z = znoise * thickness * (0.4 + 0.6 * dens) + (rand() - 0.5) * thickness * 0.15;

    pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;

    // near-black dust so it OCCLUDES the glow into a crisp dark silhouette. Only a
    // whisper of warm rust where it thins right at the edges.
    const warm = 1 - dens;
    const r = 0.018 + warm * 0.035;
    const g = 0.008 + warm * 0.018;
    const b = 0.014 + warm * 0.022;
    const j = 0.85 + rand() * 0.3;
    col[n * 3] = r * j; col[n * 3 + 1] = g * j; col[n * 3 + 2] = b * j;
    n++;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, n * 3), 3));

  const mat = new THREE.PointsMaterial({
    size: span * 0.022,
    map: dotTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.NormalBlending,   // dark points OCCLUDE the glow -> true silhouette
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;             // draw AFTER the backdrop so they paint over it
  group.add(points);

  // --- a scatter of embedded young stars (the close-up payoff: hot blue-white
  //     stars forming inside the gas, plus a few foreground field stars) ---
  const ST = 70;
  const sp = new Float32Array(ST * 3);
  const sc = new Float32Array(ST * 3);
  for (let i = 0; i < ST; i++) {
    // bias stars toward the bright field above/around the dark horse
    const ang = rand() * Math.PI * 2, rad = Math.sqrt(rand());
    sp[i * 3] = Math.cos(ang) * rad * sx * 0.7 + span * 0.02;
    sp[i * 3 + 1] = Math.sin(ang) * rad * sy * 0.85 + span * 0.18;
    sp[i * 3 + 2] = (rand() - 0.5) * thickness * 1.4 + span * 0.1;
    // mostly hot blue-white, a few warmer
    const warm = rand() < 0.25 ? rand() * 0.4 : 0;
    const b = 0.9 + rand() * 0.1;
    sc[i * 3] = (0.75 + warm) * b; sc[i * 3 + 1] = (0.82 - warm * 0.2) * b; sc[i * 3 + 2] = b;
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sgeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const smat = new THREE.PointsMaterial({
    size: span * 0.03, map: dotTexture(), vertexColors: true,
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const stars = new THREE.Points(sgeo, smat);
  stars.frustumCulled = false;
  stars.renderOrder = 3;             // sparkle on top of everything
  group.add(stars);

  group.setOpacity = (a) => {
    const v = Math.min(1, a);
    backMat.opacity = v * 0.95;
    mat.opacity = v;
    smat.opacity = v;
    backdrop.visible = points.visible = stars.visible = v > 0.01;
  };
  group.pointCount = n;
  return group;
}
