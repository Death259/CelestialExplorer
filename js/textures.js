// Procedural planet textures — canvas-based, no external assets needed.
import * as THREE from './vendor/three.module.js';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise that can be made periodic in x at an arbitrary integer period `px`
// (the texture's left/right edges meet seamlessly when px divides the x-span).
function makeNoise(seed) {
  const rand = mulberry32(seed), N = 256, g = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) g[i] = rand();
  const sm = (t) => t * t * (3 - 2 * t);
  return function (x, y, px) {
    px = px || N;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = sm(x - xi), yf = sm(y - yi);
    // wrap in period space first (seam continuity), then reduce into the grid
    const wx0 = ((xi % px) + px) % px, wx1 = (wx0 + 1) % px;
    const x0 = wx0 % N, x1 = wx1 % N;
    const y0 = ((yi % N) + N) % N, y1 = (y0 + 1) % N;
    const a = g[y0 * N + x0], b = g[y0 * N + x1], c = g[y1 * N + x0], dd = g[y1 * N + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + dd) * xf * yf;
  };
}

// fbm with optional horizontal tiling: pass x = u * periodX and periodX = that same
// integer, and every octave wraps so u=0 and u=1 produce identical values.
function fbm(noise, x, y, oct = 5, periodX = 0) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) {
    v += amp * noise(x * f, y * f, periodX ? periodX * f : 0);
    amp *= 0.5; f *= 2;
  }
  return v;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function paletteSampler(stops) {
  const cols = stops.map(hexToRgb);
  return function (t) {
    t = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1);
    const i = Math.floor(t), f = t - i, a = cols[i], b = cols[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
}

function canvasTexture(w, h, fill) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  fill(d, w, h);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;   // sample seamlessly across the longitude seam
  return tex;
}

// ---- Gas giant: latitudinal bands distorted by turbulence ----
export function gasGiantTexture({ seed = 1, stops, bandFreq = 11, turb = 0.06, spot = null, w = 1024, h = 512 }) {
  const noise = makeNoise(seed), pal = paletteSampler(stops);
  return canvasTexture(w, h, (d, W, H) => {
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const warp = (fbm(noise, u * 14, v * 40, 5, 14) - 0.5) * turb
                   + (fbm(noise, u * 4 + 50, v * 9, 3, 4) - 0.5) * turb * 2.2;
        let t = 0.5 + 0.5 * Math.sin((v + warp) * bandFreq * Math.PI + Math.sin((v + warp) * 3.7) * 1.5);
        t = t * 0.7 + fbm(noise, u * 30, v * 60 + 99, 4, 30) * 0.3;
        let [r, g, b] = pal(t);
        if (spot) {
          const dx = Math.min(Math.abs(u - spot.u), 1 - Math.abs(u - spot.u)) / spot.ru;
          const dy = (v - spot.v) / spot.rv;
          const q = dx * dx + dy * dy;
          if (q < 1) {
            const s = (1 - q) * spot.strength;
            const [sr, sg, sb] = hexToRgb(spot.color);
            r += (sr - r) * s; g += (sg - g) * s; b += (sb - b) * s;
          }
        }
        const i = (y * W + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
  });
}

// ---- Rocky world: fbm albedo + craters, optional polar caps / dark maria ----
export function rockyTexture({ seed = 2, stops, craters = 0, caps = 0, capColor = '#e8e4dd', maria = 0, w = 1024, h = 512 }) {
  const noise = makeNoise(seed), pal = paletteSampler(stops);
  const rand = mulberry32(seed * 7 + 1);
  const cr = [];
  for (let i = 0; i < craters; i++) cr.push({ u: rand(), v: 0.12 + rand() * 0.76, r: 0.004 + rand() * rand() * 0.035 });
  const capRgb = hexToRgb(capColor);
  return canvasTexture(w, h, (d, W, H) => {
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        let t = fbm(noise, u * 8, v * 8, 6, 8);
        if (maria) {
          const m = fbm(noise, u * 3 + 31, v * 3 + 17, 4, 3);
          if (m > 0.55) t *= 1 - maria * Math.min(1, (m - 0.55) * 6);
        }
        let [r, g, b] = pal(t);
        // craters: darken bowl, lighten rim
        for (let k = 0; k < cr.length; k++) {
          const c = cr[k];
          let du = Math.abs(u - c.u); du = Math.min(du, 1 - du);
          const dv = (v - c.v);
          const q = Math.sqrt(du * du + dv * dv * 0.25) / c.r;
          if (q < 1.25) {
            if (q < 0.85) { const s = (0.85 - q) * 0.5; r *= 1 - s; g *= 1 - s; b *= 1 - s; }
            else { const s = (1 - Math.abs(q - 1.0) / 0.25) * 0.35; r = Math.min(255, r * (1 + s)); g = Math.min(255, g * (1 + s)); b = Math.min(255, b * (1 + s)); }
          }
        }
        if (caps) {
          const edge = fbm(noise, u * 12, v * 12 + 77, 3, 12) * 0.06;
          const polar = Math.max(0, Math.abs(v - 0.5) * 2 - (1 - caps) + edge);
          if (polar > 0) {
            const s = Math.min(1, polar * 14);
            r += (capRgb[0] - r) * s; g += (capRgb[1] - g) * s; b += (capRgb[2] - b) * s;
          }
        }
        const i = (y * W + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
  });
}

// ---- Asteroid: dense power-law crater field + fine roughness, with a matching bump
// map so craters and ridges catch real sunlight (like the Moon's relief). Returns
// { map, bump }. Used by the irregular minor bodies (Vesta, Pallas, Hygiea). ----
export function asteroidTexture({ seed = 2, stops, craters = 650, w = 1024, h = 512 } = {}) {
  const noise = makeNoise(seed), pal = paletteSampler(stops);
  const rand = mulberry32(seed * 7 + 3);
  const cr = [];
  for (let i = 0; i < craters; i++) {
    const r = 0.004 + Math.pow(rand(), 3) * 0.05;       // power-law: many small, few large
    cr.push({ u: rand(), v: 0.06 + rand() * 0.88, r, fresh: rand() < 0.14 });
  }
  // one big basin (Vesta's Rheasilvia, etc.)
  cr.push({ u: rand(), v: 0.5 + (rand() - 0.5) * 0.3, r: 0.12 + rand() * 0.06, fresh: false, basin: true });

  const W = w, H = h;
  const col = new Uint8ClampedArray(W * H * 4);
  const hgt = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const grain = fbm(noise, u * 9, v * 9, 6, 9);
      let [r, g, b] = pal(grain);
      let height = 0.5 + (grain - 0.5) * 0.35;            // base relief from fbm
      for (let k = 0; k < cr.length; k++) {
        const c = cr[k];
        let du = Math.abs(u - c.u); du = Math.min(du, 1 - du);
        const dv = (v - c.v);
        const q = Math.sqrt(du * du + dv * dv * 0.25) / c.r;
        if (q < 1.3) {
          if (q < 0.82) {
            const bowl = (0.82 - q) / 0.82;
            const s = bowl * (c.fresh ? 0.28 : 0.42);
            r *= 1 - s; g *= 1 - s; b *= 1 - s;
            height -= bowl * (c.basin ? 0.5 : 0.32);       // depression
          } else {
            const rim = 1 - Math.abs(q - 1.0) / 0.3;
            if (rim > 0) {
              const s = rim * (c.fresh ? 0.4 : 0.22);
              r = Math.min(255, r * (1 + s)); g = Math.min(255, g * (1 + s)); b = Math.min(255, b * (1 + s));
              height += rim * 0.16;                         // raised rim
            }
          }
        }
      }
      const i = (y * W + x) * 4;
      col[i] = r; col[i + 1] = g; col[i + 2] = b; col[i + 3] = 255;
      const hv = Math.max(0, Math.min(255, height * 255));
      hgt[i] = hgt[i + 1] = hgt[i + 2] = hv; hgt[i + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').putImageData(new ImageData(data, W, H), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  return { map: mk(col, true), bump: mk(hgt, false) };
}

// ---- Smooth ice giant: soft vertical gradient + faint bands ----
export function iceGiantTexture({ seed = 3, stops, bands = 0.05, w = 512, h = 256 }) {
  const noise = makeNoise(seed), pal = paletteSampler(stops);
  return canvasTexture(w, h, (d, W, H) => {
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const lat = Math.abs(v - 0.5) * 2;
        let t = lat * 0.55 + Math.sin(v * 26 + fbm(noise, u * 6, v * 18, 3, 6) * 4) * bands
              + fbm(noise, u * 5, v * 8, 4, 5) * 0.12;
        const [r, g, b] = pal(t);
        const i = (y * W + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
  });
}

// ---- Venus / Titan style haze swirls ----
export function hazeTexture({ seed = 4, stops, stretch = 7, w = 1024, h = 512 }) {
  const noise = makeNoise(seed), pal = paletteSampler(stops);
  return canvasTexture(w, h, (d, W, H) => {
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const warp = fbm(noise, u * 3 + 9, v * 6, 4, 3);
        const t = fbm(noise, u * stretch + warp * 2.5, v * 2.2, 5, stretch);
        const [r, g, b] = pal(t);
        const i = (y * W + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
  });
}

// ---- Sun photosphere granulation ----
export function sunTexture({ seed = 5, w = 1024, h = 512 } = {}) {
  const noise = makeNoise(seed);
  const pal = paletteSampler(['#ff7a00', '#ffac33', '#ffd24d', '#fff3c4', '#ffffff']);
  return canvasTexture(w, h, (d, W, H) => {
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        let t = fbm(noise, u * 26, v * 26, 5, 26) * 0.85 + fbm(noise, u * 90, v * 90, 2, 90) * 0.25;
        const [r, g, b] = pal(Math.min(1, t + 0.18));
        const i = (y * W + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
  });
}

// ---- Saturn ring strip (mapped radially) ----
export function ringTexture({ seed = 6, w = 1024 } = {}) {
  const noise = makeNoise(seed);
  const c = document.createElement('canvas'); c.width = w; c.height = 4;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, 4), d = img.data;
  for (let x = 0; x < w; x++) {
    const t = x / w;
    let a = 0.45 + fbm(noise, t * 60, 0.5, 5) * 0.9;
    // structure: C ring faint, B bright, Cassini gap, A ring, Encke gap
    if (t < 0.12) a *= 0.25 + t * 2;
    if (t > 0.50 && t < 0.565) a *= 0.06;            // Cassini division
    if (t > 0.86 && t < 0.875) a *= 0.15;            // Encke gap
    if (t > 0.97) a *= (1 - t) / 0.03;
    a = Math.max(0, Math.min(1, a));
    const warm = 200 + fbm(noise, t * 25, 3, 3) * 45;
    for (let y = 0; y < 4; y++) {
      const i = (y * w + x) * 4;
      d[i] = warm; d[i + 1] = warm * 0.92; d[i + 2] = warm * 0.78; d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Uranus ring strip (mapped radially) ----
// Uranus's rings are dark as charcoal and very narrow — 13 thin, sharply-bounded
// rings with wide empty gaps between them, the opposite of Saturn's broad bright
// sheet. Radii here are the real ones, expressed as a fraction across the modelled
// annulus (inner 1.6 R → outer 2.02 R), with the eccentric epsilon ring brightest
// at the outer edge. Mostly-transparent black between the bands.
export function uranusRingTexture({ seed = 17, w = 2048 } = {}) {
  const noise = makeNoise(seed);
  const c = document.createElement('canvas'); c.width = w; c.height = 4;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, 4), d = img.data;
  // each ring: [center t, half-width t, peak opacity]
  const rings = [
    [0.07, 0.012, 0.30],  // 6
    [0.10, 0.012, 0.33],  // 5
    [0.13, 0.013, 0.36],  // 4
    [0.33, 0.016, 0.42],  // alpha
    [0.39, 0.016, 0.44],  // beta
    [0.56, 0.010, 0.30],  // eta
    [0.60, 0.013, 0.40],  // gamma
    [0.66, 0.018, 0.46],  // delta
    [0.95, 0.030, 0.92],  // epsilon (brightest, widest)
  ];
  for (let x = 0; x < w; x++) {
    const t = x / w;
    let a = 0;
    for (const [c0, hw, peak] of rings) {
      const dd = Math.abs(t - c0) / hw;
      if (dd < 1) {
        // soft-edged band with a touch of fine structure
        const band = (1 - dd * dd) * peak * (0.8 + fbm(noise, t * 180, 0.5, 4) * 0.4);
        a = Math.max(a, band);
      }
    }
    // faint dusty background sheet across the main system
    if (t > 0.05 && t < 0.97) a = Math.max(a, 0.05 + fbm(noise, t * 40, 0.5, 3) * 0.04);
    a = Math.max(0, Math.min(1, a));
    const g = 96 + fbm(noise, t * 30, 7, 3) * 24; // cold charcoal grey
    for (let y = 0; y < 4; y++) {
      const i = (y * w + x) * 4;
      d[i] = g; d[i + 1] = g * 1.0; d[i + 2] = g * 1.06; d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Jupiter ring strip (faint dusty rings, mapped radially) ----
// Jupiter's rings are extremely faint dust: a bright, narrow main ring, a thick
// inner halo, and two broad, very faint "gossamer" rings shed from Amalthea and
// Thebe. Radii expressed as fraction across the annulus (inner 1.35 R, outer 3.1 R).
export function jupiterRingTexture({ seed = 31, w = 1024 } = {}) {
  const noise = makeNoise(seed);
  const c = document.createElement('canvas'); c.width = w; c.height = 4;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, 4), d = img.data;
  for (let x = 0; x < w; x++) {
    const t = x / w;
    let a = 0;
    // inner halo: faint, broad (t ~0.03–0.21)
    if (t > 0.03 && t < 0.21) a = Math.max(a, 0.05 + 0.05 * (1 - Math.abs(t - 0.12) / 0.09));
    // main ring: brightest, narrow (t ~0.21–0.27)
    if (t > 0.205 && t < 0.275) a = Math.max(a, 0.34 * (1 - Math.abs(t - 0.24) / 0.035) + 0.06);
    // Amalthea gossamer: very faint, wide (t ~0.27–0.68)
    if (t > 0.27 && t < 0.68) a = Math.max(a, 0.045 * (1 - (t - 0.27) / 0.41));
    // Thebe gossamer: fainter, widest (t ~0.68–1.0)
    if (t > 0.5 && t < 1.0) a = Math.max(a, 0.025 * (1 - (t - 0.5) / 0.5));
    a *= 0.85 + fbm(noise, t * 120, 0.5, 4) * 0.3;
    a = Math.max(0, Math.min(1, a));
    const r = 150 + fbm(noise, t * 40, 3, 3) * 30; // warm reddish-brown dust
    for (let y = 0; y < 4; y++) {
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = r * 0.78; d[i + 2] = r * 0.62; d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Solar prominence / flare plume (a flame tongue, bright base → wispy tip) ----
// Drawn pointing UP in texture space (+Y = outward from the Sun). Bright white-yellow
// at the anchored base, tapering through orange to deep red at the wispy tip, with
// fbm-driven flame tongues so no two plumes read the same.
export function flareTexture({ seed = 41, w = 128, h = 256 } = {}) {
  const noise = makeNoise(seed);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;            // 0 = top (tip), 1 = bottom (base)
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // plume widens toward the base, narrows to a wisp at the tip
      const halfW = 0.07 + 0.34 * v;
      let dx = Math.abs(u - 0.5) / halfW;
      // waver the centreline with noise so the tongue licks side to side
      dx += (fbm(noise, v * 5, u * 2 + 3, 4) - 0.5) * 1.4 * (1 - v);
      let core = dx < 1 ? (1 - dx * dx) : 0;
      // vertical profile: bright at the base, fading out toward the tip
      const vint = Math.pow(v, 1.15);
      // broken flame tongues
      const tongue = 0.65 + 0.35 * fbm(noise, u * 6, v * 9 + 11, 4);
      let a = core * vint * tongue;
      a = Math.max(0, Math.min(1, a));
      const i = (y * w + x) * 4;
      const inten = a;
      d[i] = 255;
      d[i + 1] = 90 + 150 * inten;
      d[i + 2] = 25 + 95 * inten * inten;
      d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Neptune rings (2D: angle × radius, so the Adams ring arcs can cluster) ----
// Neptune's faint rings include the broad Galle ring, the narrow Le Verrier, a
// dusty Lassell sheet, and the outer Adams ring — which is famously clumped into
// a handful of bright ARCS over a ~40° stretch rather than being continuous.
// x = azimuth (0..1 around the ring), y = radius fraction (inner 1.6 R → outer 2.7 R).
export function neptuneRingTexture({ seed = 32, w = 2048, h = 128 } = {}) {
  const noise = makeNoise(seed);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  // radius bands: [center v, half-width, peak]
  const bands = [
    [0.08, 0.07, 0.10],  // Galle — broad, faint
    [0.50, 0.018, 0.26], // Le Verrier — narrow
    [0.58, 0.06, 0.05],  // Lassell/Arago — faint dusty sheet
    [0.855, 0.016, 0.20],// Adams — narrow (continuous base under the arcs)
  ];
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let a = 0;
      for (const [c0, hw, peak] of bands) {
        const dd = Math.abs(v - c0) / hw;
        if (dd < 1) a = Math.max(a, (1 - dd * dd) * peak);
      }
      // Adams arcs: bright clumps clustered within ~u 0.0–0.16 (the real arcs span ~40°)
      const adams = Math.abs(v - 0.855) / 0.02;
      if (adams < 1) {
        const arcs = [0.02, 0.055, 0.085, 0.13];
        for (const ac of arcs) {
          const da = Math.abs(u - ac) / 0.016;
          if (da < 1) a = Math.max(a, (1 - da * da) * 0.85 * (1 - adams * adams));
        }
      }
      a *= 0.8 + fbm(noise, u * 60, v * 8, 4) * 0.4;
      a = Math.max(0, Math.min(1, a));
      const i = (y * w + x) * 4;
      const col = 150 + fbm(noise, u * 20, v * 6, 3) * 30; // cool grey-blue dust
      d[i] = col * 0.82; d[i + 1] = col * 0.9; d[i + 2] = col; d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// ---- Radial glow sprite (sun corona, galaxy core) ----
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,160,40,0)', size = 256, falloff = 0.5) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(falloff * 0.4, inner.replace(/[\d.]+\)$/, '0.55)'));
  g.addColorStop(falloff, inner.replace(/[\d.]+\)$/, '0.18)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ---- Moon: hero treatment — maria, power-law crater field, ray craters + bump map ----
// Returns { map, bump }: a detailed albedo texture plus a height/bump map so craters
// and basins catch the sunlight with real relief (the way Earth's terrain reads in 3D).
export function moonTexture({ w = 2048, h = 1024 } = {}) {
  const W = w, H = h, NP = W * H;
  const noise = makeNoise(40), noise2 = makeNoise(73), noise3 = makeNoise(211);
  const rand = mulberry32(1969);
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hiPal = paletteSampler(['#595550', '#726d66', '#8b867d', '#a39d93', '#bbb5aa']);
  const mareCol = hexToRgb('#3b3c41');

  const baseT = new Float32Array(NP);
  const mareAmt = new Float32Array(NP);
  const height = new Float32Array(NP);
  const albMul = new Float32Array(NP).fill(1);

  // ---- Pass 1: highlands tone, near-side maria, base relief ----
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const lat = Math.abs(v - 0.5) * 2;                 // 0 equator → 1 pole
    for (let x = 0; x < W; x++) {
      const u = x / W, idx = y * W + x;
      // tone: broad regional variation + fine regolith mottle
      let t = 0.46 + (fbm(noise, u * 5, v * 5, 5, 5) - 0.5) * 0.72
                   + (fbm(noise2, u * 44, v * 44, 4, 44) - 0.5) * 0.30;
      baseT[idx] = Math.max(0, Math.min(1, t));
      // maria: blobby dark basins, concentrated on the near side, mid-latitudes
      const near = 0.5 + 0.5 * Math.cos((u - 0.42) * Math.PI * 2);   // peaks near u=0.42
      const latFall = 1 - ss(0.45, 0.95, lat);
      const blob = fbm(noise, u * 3 + 20, v * 3 + 11, 4, 3);
      const ma = ss(0.5, 0.62, blob * 0.55 + near * 0.45) * latFall;
      mareAmt[idx] = ma;
      // base height: gentle large-scale undulation + fine roughness, basins sit lower & smoother
      let hgt = 0.5 + (fbm(noise3, u * 7, v * 7, 4, 7) - 0.5) * 0.10
                    + (fbm(noise2, u * 130, v * 130, 4, 130) - 0.5) * 0.05 * (1 - 0.7 * ma);
      hgt -= ma * 0.06;
      height[idx] = hgt;
    }
  }

  // ---- Crater field: a few bright ray craters + power-law distribution ----
  const craters = [];
  const rays = [
    { u: 0.40, v: 0.80, r: 0.032 },   // Tycho-like, southern near side
    { u: 0.35, v: 0.50, r: 0.024 },   // Copernicus-like
    { u: 0.29, v: 0.41, r: 0.016 },   // Kepler-like
    { u: 0.63, v: 0.31, r: 0.015 },
  ];
  for (const b of rays) craters.push({ ...b, depth: Math.min(0.5, 7 * b.r), fresh: true, ray: true, spokes: 6 + Math.floor(rand() * 7), phase: rand() * 6.283 });
  for (let i = 0; i < 1300; i++) {
    const r = 0.0024 + Math.pow(rand(), 3) * 0.030;
    craters.push({ u: rand(), v: 0.035 + rand() * 0.93, r, depth: Math.min(0.45, 7 * r), fresh: rand() < 0.12, ray: false });
  }

  for (const c of craters) {
    const lat = (c.v - 0.5) * Math.PI;
    const cosl = Math.max(0.18, Math.cos(lat));
    const reach = c.ray ? 6.0 : (c.fresh ? 2.8 : 1.9);
    const xc = c.u * W;
    const ySpan = reach * c.r * H;
    const xSpan = (reach * c.r / (2 * cosl)) * W;
    const ylo = Math.max(0, Math.floor(c.v * H - ySpan)), yhi = Math.min(H - 1, Math.ceil(c.v * H + ySpan));
    for (let y = ylo; y <= yhi; y++) {
      const v = (y + 0.5) / H, dlat = v - c.v;
      for (let pxi = Math.floor(xc - xSpan); pxi <= Math.ceil(xc + xSpan); pxi++) {
        const x = ((pxi % W) + W) % W, idx = y * W + x;
        const u = (pxi + 0.5) / W, dlon = (u - c.u) * 2 * cosl;
        const dist = Math.sqrt(dlat * dlat + dlon * dlon);
        const q = dist / c.r;
        if (q > reach) continue;
        // relief: parabolic bowl + raised rim ring
        const rim = c.depth * Math.exp(-Math.pow((q - 1) / 0.18, 2)) * 0.55;
        let dh = rim;
        if (q < 1) dh -= c.depth * (1 - q * q) * 0.85;
        height[idx] += dh;
        // dark bowl floor
        if (q < 0.85) albMul[idx] *= 1 - 0.16 * (0.85 - q) / 0.85 * (c.fresh ? 0.5 : 1);
        // bright rim + ejecta (and rays for fresh craters)
        if (c.fresh && q > 0.85) {
          const ej = Math.max(0, 1 - (q - 0.85) / (reach - 0.85));
          let rayMod = 1;
          if (c.ray) {
            const ang = Math.atan2(dlat, dlon);
            rayMod = 0.30 + 0.95 * Math.pow(0.5 + 0.5 * Math.sin(ang * c.spokes + Math.sin(ang * 2.3 + c.phase) * 1.6), 3);
          }
          albMul[idx] *= 1 + ej * ej * (c.ray ? 0.55 : 0.22) * rayMod;
        }
      }
    }
  }

  // ---- Pass 3: compose albedo + bump canvases ----
  const albC = document.createElement('canvas'); albC.width = W; albC.height = H;
  const bumpC = document.createElement('canvas'); bumpC.width = W; bumpC.height = H;
  const aCtx = albC.getContext('2d'), bCtx = bumpC.getContext('2d');
  const aImg = aCtx.createImageData(W, H), bImg = bCtx.createImageData(W, H);
  const ad = aImg.data, bd = bImg.data;
  for (let idx = 0; idx < NP; idx++) {
    let [r, g, b] = hiPal(baseT[idx]);
    const ma = mareAmt[idx];
    if (ma > 0) { r += (mareCol[0] - r) * ma; g += (mareCol[1] - g) * ma; b += (mareCol[2] - b) * ma; }
    const am = albMul[idx];
    r *= am; g *= am; b *= am;
    const i = idx * 4;
    ad[i] = Math.max(0, Math.min(255, r)); ad[i + 1] = Math.max(0, Math.min(255, g)); ad[i + 2] = Math.max(0, Math.min(255, b)); ad[i + 3] = 255;
    const hv = Math.max(0, Math.min(1, height[idx])) * 255;
    bd[i] = bd[i + 1] = bd[i + 2] = hv; bd[i + 3] = 255;
  }
  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  const mk = (canvas, srgb) => {
    const tex = new THREE.CanvasTexture(canvas);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8; tex.wrapS = THREE.RepeatWrapping;
    return tex;
  };
  return { map: mk(albC, true), bump: mk(bumpC, false) };
}

// ---- Per-planet texture factory ----
export function makePlanetTexture(id) {
  switch (id) {
    case 'mercury': return rockyTexture({ seed: 11, craters: 90, stops: ['#4d4a45', '#6b6660', '#8a847b', '#a39c91', '#787068'] });
    case 'venus': return hazeTexture({ seed: 12, stops: ['#a8763e', '#d9a85c', '#eccd8f', '#f5e3b8', '#caa05e'] });
    case 'earth': return rockyTexture({ seed: 13, stops: ['#0c2f5e', '#114b8a', '#1b6aa3', '#3b8a4e', '#8a7b4e'], caps: 0.08 }); // fallback only
    case 'mars': return rockyTexture({ seed: 14, craters: 35, maria: 0.45, caps: 0.06, stops: ['#7a3b22', '#9c4f2a', '#b96a3c', '#d08a55', '#c2754a'] });
    case 'jupiter': return gasGiantTexture({ seed: 15, bandFreq: 13, turb: 0.05, stops: ['#5e4a38', '#a98a68', '#d9c4a5', '#eee3cf', '#a0714f', '#c9b294'], spot: { u: 0.28, v: 0.66, ru: 0.05, rv: 0.035, strength: 0.85, color: '#b5512f' } });
    case 'saturn': return gasGiantTexture({ seed: 16, bandFreq: 9, turb: 0.025, stops: ['#a98d5f', '#cdb27e', '#e3cf9e', '#f0e3bd', '#d8bf8d'] });
    case 'uranus': return iceGiantTexture({ seed: 17, bands: 0.02, stops: ['#9fd8dd', '#b3e2e4', '#c8ecec', '#a8dde0'] });
    case 'neptune': return iceGiantTexture({ seed: 18, bands: 0.05, stops: ['#2440a8', '#2f5cc4', '#4979d6', '#6f9ce3', '#2c4eb8'] });
    case 'io': return rockyTexture({ seed: 19, craters: 12, stops: ['#c8a832', '#e3cc56', '#f0e08a', '#b87b2e', '#d9b944'] });
    case 'ice': return rockyTexture({ seed: 20, craters: 0, stops: ['#c4ccd4', '#d8e0e8', '#eef3f7', '#b8c4d0'] });
    case 'titan': return hazeTexture({ seed: 21, stops: ['#b5762a', '#d49a3e', '#e8b85e', '#c9883344'.slice(0, 7), '#dba84e'] });
    case 'pluto': return rockyTexture({ seed: 23, craters: 8, maria: 0.5, caps: 0.14, capColor: '#f2ead8', stops: ['#6b5140', '#9c7a5e', '#c4a07e', '#e3cdaa', '#b08a66'] });
    case 'dark': return rockyTexture({ seed: 24, craters: 55, stops: ['#201d1a', '#2c2823', '#39342d', '#443e35', '#2f2a24'] });
    case 'sand': return rockyTexture({ seed: 25, craters: 70, stops: ['#6b5740', '#8a7152', '#a98d68', '#c4a87e', '#7d6850'] });
    case 'moon': case 'rocky':
    default: return rockyTexture({ seed: 22, craters: 110, maria: 0.5, stops: ['#5a5752', '#787570', '#94908a', '#aaa59e', '#827e78'] });
  }
}
