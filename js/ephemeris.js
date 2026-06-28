// Accurate ephemerides — real planet & Moon positions for any date (past or future).
//
// Planets:  JPL "Keplerian Elements for Approximate Positions of the Major Planets"
//           (Standish), the 3000 BC – 3000 AD table, including the b/c/s/f long-period
//           correction terms for Jupiter..Pluto. Accuracy is ~arcminute near the present
//           epoch, degrees-class out toward the ±3000-yr edges.
// Moon:     Truncated ELP-2000/82 lunar theory (Meeus, Astronomical Algorithms ch. 47) —
//           principal periodic terms in longitude, latitude and distance.
//
// Coordinate convention matches data.js: heliocentric/geocentric ecliptic (x→equinox,
// z→ecliptic north), emitted into three.js space as out.set(x, z, -y). 1 unit = 1000 km.

const D2R = Math.PI / 180;
const KM_U = 1 / 1000;                       // km -> scene units
const AU_U = 149597870.7 * KM_U;             // 1 AU in scene units
const DAY_MS = 86400000;
const JD_UNIX = 2440587.5;                   // JD at Unix epoch
const J2000_JD = 2451545.0;

// Julian centuries (TT≈UTC here; the sub-minute difference is invisible at this scale)
function centuries(dateMs) {
  return (dateMs / DAY_MS + JD_UNIX - J2000_JD) / 36525;
}
const norm360 = (x) => ((x % 360) + 360) % 360;

// ---- JPL Keplerian elements (epoch J2000) + rates per Julian century ----
// a [AU], e, I [deg], L [deg] (mean longitude), w=ϖ [deg] (long. of perihelion),
// O=Ω [deg] (long. of ascending node). *Dot = rate per century.
// b,c,s,f present for the outer planets (additive mean-anomaly correction).
export const JPL = {
  mercury: { a: 0.38709843, aDot: 0.0,        e: 0.20563661, eDot: 0.00002123,  I: 7.00559432,  IDot: -0.00590158, L: 252.25166724, LDot: 149472.67486623, w: 77.45771895,  wDot: 0.15940013, O: 48.33961819,  ODot: -0.12214182 },
  venus:   { a: 0.72332102, aDot: -0.00000026, e: 0.00676399, eDot: -0.00005107, I: 3.39777545,  IDot: 0.00043494,  L: 181.97970850, LDot: 58517.81560260,  w: 131.76755713, wDot: 0.05679648, O: 76.67261496,  ODot: -0.27274174 },
  earth:   { a: 1.00000018, aDot: -0.00000003, e: 0.01673163, eDot: -0.00003661, I: -0.00054346, IDot: -0.01337178, L: 100.46691572, LDot: 35999.37306329,  w: 102.93005885, wDot: 0.31795260, O: -5.11260389,  ODot: -0.24123856 },
  mars:    { a: 1.52371243, aDot: 0.00000097,  e: 0.09336511, eDot: 0.00009149,  I: 1.85181869,  IDot: -0.00724757, L: -4.56813164,  LDot: 19140.29934243,  w: -23.91744784, wDot: 0.45223625, O: 49.71320984,  ODot: -0.26852431 },
  jupiter: { a: 5.20248019, aDot: -0.00002864, e: 0.04853590, eDot: 0.00018026,  I: 1.29861416,  IDot: -0.00322699, L: 34.33479152,  LDot: 3034.90371757,   w: 14.27495244,  wDot: 0.18199196, O: 100.29282654, ODot: 0.13024619,  b: -0.00012452, c: 0.06064060, s: -0.35635438, f: 38.35125000 },
  saturn:  { a: 9.54149883, aDot: -0.00003065, e: 0.05550825, eDot: -0.00032044, I: 2.49424102,  IDot: 0.00451969,  L: 50.07571329,  LDot: 1222.11494724,   w: 92.86136063,  wDot: 0.54179478, O: 113.63998702, ODot: -0.25015002, b: 0.00025899,  c: -0.13434469, s: 0.87320147, f: 38.35125000 },
  uranus:  { a: 19.18797948, aDot: -0.00020455, e: 0.04685740, eDot: -0.00001550, I: 0.77298127, IDot: -0.00180155, L: 314.20276625, LDot: 428.49512595,    w: 172.43404441, wDot: 0.09266985, O: 73.96250215,  ODot: 0.05739699,  b: 0.00058331,  c: -0.97731848, s: 0.17689245, f: 7.67025000 },
  neptune: { a: 30.06952752, aDot: 0.00006447,  e: 0.00895439, eDot: 0.00000818, I: 1.77005520,  IDot: 0.00022400,  L: 304.22289287, LDot: 218.46515314,    w: 46.68158724,  wDot: 0.01009938, O: 131.78635853, ODot: -0.00606302, b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025000 },
  pluto:   { a: 39.48686035, aDot: 0.00449751,  e: 0.24885238, eDot: 0.00006016, I: 17.14104260, IDot: 0.00000501,  L: 238.96535011, LDot: 145.18042903,    w: 224.09702598, wDot: -0.00968827, O: 110.30167986, ODot: -0.00809981, b: -0.01262724, c: 0.0, s: 0.0, f: 0.0 },
};

// Heliocentric ecliptic position of a JPL planet. `out` is a THREE.Vector3.
export function planetPosition(id, dateMs, out) {
  const el = JPL[id];
  const T = centuries(dateMs);
  const a = el.a + el.aDot * T;
  const e = el.e + el.eDot * T;
  const I = (el.I + el.IDot * T) * D2R;
  const L = el.L + el.LDot * T;
  const wbar = el.w + el.wDot * T;        // longitude of perihelion ϖ
  const O = el.O + el.ODot * T;           // longitude of ascending node Ω
  let M = L - wbar;
  if (el.b !== undefined) {
    M += el.b * T * T + el.c * Math.cos(el.f * T * D2R) + el.s * Math.sin(el.f * T * D2R);
  }
  M = (((M % 360) + 540) % 360 - 180) * D2R;   // wrap to [-180,180] then radians
  // Kepler's equation
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 12; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const arg = (wbar - O) * D2R, Or = O * D2R;   // ω = ϖ − Ω
  const cw = Math.cos(arg), sw = Math.sin(arg), cO = Math.cos(Or), sO = Math.sin(Or), ci = Math.cos(I), si = Math.sin(I);
  const xe = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
  const ye = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
  const ze = (sw * si) * xp + (cw * si) * yp;
  return out.set(xe * AU_U, ze * AU_U, -ye * AU_U);
}

// ---- Moon — Meeus ch. 47 periodic terms ----
// [ D, M, M', F, ΣL(1e-6 deg), ΣR(1e-3 km) ]  (E-factor applied for |M|=1,2)
const TERMS_LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258], [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];

// [ D, M, M', F, ΣB(1e-6 deg) ]
const TERMS_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833], [0, 0, 1, -3, 777], [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607], [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421], [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351], [4, 0, 0, 1, 331], [2, -1, 1, 1, 315], [2, -2, 0, -1, 302],
];

// Geocentric ecliptic position of the Moon. `out` is a THREE.Vector3, in scene units.
export function moonGeocentric(dateMs, out) {
  const T = centuries(dateMs);
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
  const D  = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
  const Ms = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
  const F  = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);
  const A1 = norm360(119.75 + 131.849 * T);
  const A2 = norm360(53.09 + 479264.290 * T);
  const A3 = norm360(313.45 + 481266.484 * T);
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  let sumL = 0, sumR = 0, sumB = 0;
  for (const [cd, cm, cmp, cf, sl, sr] of TERMS_LR) {
    const arg = (cd * D + cm * Ms + cmp * Mp + cf * F) * D2R;
    const am = Math.abs(cm), ef = am === 1 ? E : am === 2 ? E * E : 1;
    sumL += sl * ef * Math.sin(arg);
    sumR += sr * ef * Math.cos(arg);
  }
  for (const [cd, cm, cmp, cf, sb] of TERMS_B) {
    const arg = (cd * D + cm * Ms + cmp * Mp + cf * F) * D2R;
    const am = Math.abs(cm), ef = am === 1 ? E : am === 2 ? E * E : 1;
    sumB += sb * ef * Math.sin(arg);
  }
  // additive (planetary / flattening) terms
  sumL += 3958 * Math.sin(A1 * D2R) + 1962 * Math.sin((Lp - F) * D2R) + 318 * Math.sin(A2 * D2R);
  sumB += -2235 * Math.sin(Lp * D2R) + 382 * Math.sin(A3 * D2R) + 175 * Math.sin((A1 - F) * D2R)
        + 175 * Math.sin((A1 + F) * D2R) + 127 * Math.sin((Lp - Mp) * D2R) - 115 * Math.sin((Lp + Mp) * D2R);

  let lambda = Lp + sumL / 1e6;              // ecliptic longitude, equinox of date
  const beta = sumB / 1e6;                   // ecliptic latitude
  const dist = 385000.56 + sumR / 1000;      // km
  lambda -= 1.396971 * T;                    // precess to J2000 ecliptic (linear approx)

  const lr = lambda * D2R, br = beta * D2R, cb = Math.cos(br);
  const xe = dist * cb * Math.cos(lr);
  const ye = dist * cb * Math.sin(lr);
  const ze = dist * Math.sin(br);
  return out.set(xe * KM_U, ze * KM_U, -ye * KM_U);
}
