// Constellations — bright-star positions (RA hours, Dec degrees, J2000) + line figures.
// Rendered on the celestial sphere around the camera, faded out at galactic scale.
import * as THREE from './vendor/three.module.js';

// s: [raHours, decDeg] per star; l: index pairs forming the figure
export const CONSTELLATIONS = [
  { n: 'Orion', s: [[5.92, 7.41], [5.68, -1.94], [5.60, -1.20], [5.53, -0.30], [5.24, -8.20], [5.80, -9.67], [5.42, 6.35], [4.83, 6.96], [5.59, 9.93], [5.41, -2.40]], l: [[0, 3], [3, 2], [2, 1], [1, 5], [5, 4], [4, 9], [9, 2], [0, 6], [6, 7], [0, 8], [3, 0]] },
  { n: 'Ursa Major', s: [[11.06, 61.75], [11.03, 56.38], [11.90, 53.69], [12.26, 57.03], [12.90, 55.96], [13.40, 54.93], [13.79, 49.31]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [3, 0]] },
  { n: 'Ursa Minor', s: [[2.53, 89.26], [17.54, 86.59], [16.77, 82.04], [15.74, 77.79], [16.29, 75.76], [15.35, 71.83], [14.85, 74.16]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
  { n: 'Cassiopeia', s: [[0.15, 59.15], [0.68, 56.54], [0.95, 60.72], [1.43, 60.24], [1.91, 63.67]], l: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  { n: 'Scorpius', s: [[16.49, -26.43], [16.01, -22.62], [15.98, -26.11], [16.09, -19.81], [16.84, -34.29], [17.20, -37.10], [17.56, -37.10], [17.62, -43.00], [16.60, -28.22]], l: [[3, 1], [1, 2], [2, 0], [0, 8], [8, 4], [4, 5], [5, 7], [7, 6]] },
  { n: 'Leo', s: [[10.14, 11.97], [10.33, 19.84], [10.12, 16.76], [9.76, 23.77], [9.69, 9.89], [11.24, 20.52], [11.82, 14.57], [11.23, 15.43]], l: [[0, 4], [4, 2], [2, 3], [3, 1], [1, 2], [1, 5], [5, 6], [6, 7], [7, 0], [7, 5]] },
  { n: 'Taurus', s: [[4.60, 16.51], [4.48, 15.87], [4.33, 15.63], [4.38, 17.54], [5.63, 21.14], [4.70, 22.96], [3.79, 24.11]], l: [[0, 1], [1, 2], [2, 3], [3, 5], [5, 4], [1, 3], [5, 6]] },
  { n: 'Gemini', s: [[7.58, 31.89], [7.76, 28.03], [7.34, 21.98], [6.63, 25.13], [6.38, 22.51], [7.07, 20.57], [6.73, 12.90]], l: [[0, 3], [3, 4], [1, 5], [5, 6], [0, 1], [5, 2]] },
  { n: 'Cygnus', s: [[20.69, 45.28], [20.37, 40.26], [19.51, 27.96], [19.75, 45.13], [21.22, 30.23], [19.29, 53.37]], l: [[0, 1], [1, 2], [1, 3], [3, 5], [1, 4]] },
  { n: 'Lyra', s: [[18.62, 38.78], [18.75, 37.61], [18.83, 33.36], [18.98, 32.69], [18.91, 36.90]], l: [[0, 1], [1, 4], [4, 0], [1, 2], [2, 3], [3, 4]] },
  { n: 'Aquila', s: [[19.85, 8.87], [19.77, 10.61], [19.92, 6.41], [19.09, 13.86], [20.19, -0.82], [19.10, -4.88]], l: [[1, 0], [0, 2], [0, 3], [0, 4], [2, 5]] },
  { n: 'Canis Major', s: [[6.75, -16.72], [6.98, -28.97], [7.14, -26.39], [7.40, -29.30], [6.38, -17.96], [6.34, -30.06]], l: [[0, 4], [0, 1], [1, 2], [2, 3], [1, 5]] },
  { n: 'Crux', s: [[12.44, -63.10], [12.79, -59.69], [12.52, -57.11], [12.25, -58.75]], l: [[0, 2], [1, 3]] },
  { n: 'Pegasus', s: [[23.08, 15.21], [23.06, 28.08], [0.22, 29.09], [0.14, 15.18], [21.74, 9.88], [22.69, 10.83], [22.17, 6.20]], l: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 5], [5, 6], [5, 4]] },
  { n: 'Andromeda', s: [[0.14, 29.09], [0.66, 30.86], [1.16, 35.62], [2.07, 42.33]], l: [[0, 1], [1, 2], [2, 3]] },
  { n: 'Perseus', s: [[3.41, 49.86], [3.14, 40.96], [3.96, 40.01], [3.90, 31.88], [2.84, 55.90], [4.11, 50.35]], l: [[4, 0], [0, 1], [1, 3], [0, 5], [5, 2], [2, 1]] },
  { n: 'Sagittarius', s: [[18.40, -34.38], [18.47, -25.42], [18.76, -26.99], [19.04, -29.88], [19.16, -21.06], [18.92, -22.67], [18.35, -29.83], [18.10, -30.42]], l: [[7, 6], [6, 0], [0, 2], [2, 3], [3, 4], [4, 5], [5, 2], [5, 1], [1, 6], [6, 2]] },
  { n: 'Boötes', s: [[14.26, 19.18], [14.75, 27.07], [15.03, 40.39], [14.53, 38.31], [14.27, 46.09], [13.91, 18.40], [13.79, 17.46]], l: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [0, 5], [0, 6]] },
  { n: 'Virgo', s: [[13.42, -11.16], [12.93, 3.40], [12.69, -1.45], [12.33, -0.67], [13.04, 10.96], [13.58, -0.60], [14.21, -10.27]], l: [[0, 2], [2, 3], [2, 1], [1, 4], [1, 5], [5, 0], [5, 6]] },
  { n: 'Auriga', s: [[5.28, 46.00], [5.99, 44.95], [5.99, 37.21], [5.11, 41.23], [4.95, 33.17], [5.03, 43.82]], l: [[0, 1], [1, 2], [2, 4], [4, 3], [3, 0], [3, 5], [5, 0]] },
  { n: 'Pisces Austrinus', s: [[22.96, -29.62], [22.93, -32.87], [22.52, -32.35], [21.75, -33.03]], l: [[0, 1], [1, 2], [2, 3]] },
];

const EPS = 23.43928 * Math.PI / 180; // obliquity: equatorial -> ecliptic

export function starDirection(raHours, decDeg, out) {
  out = out || new THREE.Vector3();
  const ra = raHours * 15 * Math.PI / 180, dec = decDeg * Math.PI / 180;
  const xq = Math.cos(dec) * Math.cos(ra), yq = Math.cos(dec) * Math.sin(ra), zq = Math.sin(dec);
  // rotate about x by -eps (equatorial -> ecliptic), then ecliptic (X,Y,Z) -> scene (X, Z, -Y)
  const ye = yq * Math.cos(EPS) + zq * Math.sin(EPS);
  const ze = -yq * Math.sin(EPS) + zq * Math.cos(EPS);
  return out.set(xq, ze, -ye);
}

// Builds { group, lines, starPts, labelAnchors } on a unit sphere (scale at use site)
export function buildConstellations() {
  const group = new THREE.Group();
  const linePts = [], starPts = [], labelAnchors = [];
  const v = new THREE.Vector3();
  for (const c of CONSTELLATIONS) {
    const dirs = c.s.map(([ra, dec]) => starDirection(ra, dec, new THREE.Vector3()).clone());
    for (const [i, j] of c.l) {
      // shorten segments slightly so lines don't touch the stars
      const a = dirs[i].clone().lerp(dirs[j], 0.06), b = dirs[j].clone().lerp(dirs[i], 0.06);
      linePts.push(a, b);
    }
    const centroid = new THREE.Vector3();
    for (const d of dirs) { centroid.add(d); starPts.push(d.x, d.y, d.z); }
    centroid.normalize();
    labelAnchors.push({ name: c.n, dir: centroid });
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x7e93b8, transparent: true, opacity: 0.32, depthWrite: false }));
  lines.frustumCulled = false;
  group.add(lines);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe8f5, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false }));
  stars.frustumCulled = false;
  group.add(stars);
  return { group, lines, stars, labelAnchors };
}
