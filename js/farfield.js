// Far field — everything beyond the planets: nearby stars, the heliosphere and
// the Voyagers, deep-sky landmarks, and galactic-scale markers.
// Interstellar distances use a compressed scale (1 ly = 2.5e5 units) so the
// stellar neighborhood stays navigable; labels always state REAL distances.
import * as THREE from './vendor/three.module.js';
import { AU } from './data.js';
import { starDirection } from './sky.js';
import { GALAXY } from './bodies.js';
import { glowTexture } from './textures.js';
import { buildHorseheadCloud } from './horsehead.js';

export const LY = 1.2e7; // compressed light-year (true ly = 9.46e9 units; Oort cloud tops out ~3.9e7)
const smooth = THREE.MathUtils.smoothstep;

// ---- Nearby stars (RA hours, Dec deg, real distance ly) ----
const NEARBY_STARS = [
  { id: 'alphacen', name: 'Alpha Centauri', ra: 14.66, dec: -60.84, ly: 4.37, color: 'rgba(255,242,214,1)', size: 0.012,
    facts: { 'Distance': '4.37 ly — closest system', 'Stars': 'A (sunlike) + B + Proxima', 'Planets': 'Proxima b, in habitable zone', 'At Voyager speed': '75,000 years away' },
    blurb: 'Our nearest stellar neighbors. Proxima, the faint third member, hosts a rocky planet in its habitable zone.' },
  { id: 'barnard', name: 'Barnard\u2019s Star', ra: 17.96, dec: 4.69, ly: 5.96, color: 'rgba(255,170,130,1)', size: 0.008,
    facts: { 'Distance': '5.96 ly', 'Type': 'M4 red dwarf', 'Famous for': 'Fastest proper motion in the sky' },
    blurb: 'A dim red dwarf racing across the sky — it crosses a full Moon-width every 180 years.' },
  { id: 'wolf359', name: 'Wolf 359', ra: 10.94, dec: 7.01, ly: 7.86, color: 'rgba(255,165,125,1)', size: 0.007,
    facts: { 'Distance': '7.86 ly', 'Type': 'M6 red dwarf', 'Luminosity': '0.001% of the Sun' },
    blurb: 'One of the faintest stars known — if it replaced the Sun, daylight would be barely brighter than moonlight.' },
  { id: 'sirius', name: 'Sirius', ra: 6.75, dec: -16.72, ly: 8.6, color: 'rgba(200,220,255,1)', size: 0.013,
    facts: { 'Distance': '8.6 ly', 'Type': 'A1 + white-dwarf companion', 'Brightness': 'Brightest star in our night sky' },
    blurb: 'The Dog Star. Its tiny companion packs the Sun\u2019s mass into a body the size of Earth.' },
  { id: 'epseri', name: 'Epsilon Eridani', ra: 3.55, dec: -9.46, ly: 10.5, color: 'rgba(255,205,150,1)', size: 0.009,
    facts: { 'Distance': '10.5 ly', 'Type': 'K2 orange dwarf', 'Age': 'Under 1 billion years', 'Planets': 'At least one gas giant' },
    blurb: 'A young orange sun still wrapped in asteroid belts and dust — a picture of our own system\u2019s youth.' },
  { id: 'procyon', name: 'Procyon', ra: 7.66, dec: 5.22, ly: 11.5, color: 'rgba(255,235,225,1)', size: 0.011,
    facts: { 'Distance': '11.5 ly', 'Type': 'F5 + white-dwarf companion', 'Brightness': '8th brightest in our sky' },
    blurb: 'The Little Dog Star — like Sirius, it travels with a burned-out white dwarf.' },
  { id: 'tauceti', name: 'Tau Ceti', ra: 1.73, dec: -15.94, ly: 11.9, color: 'rgba(255,242,214,1)', size: 0.009,
    facts: { 'Distance': '11.9 ly', 'Type': 'G8 — sunlike', 'Planets': '4 candidates, 2 near habitable zone' },
    blurb: 'The nearest single sunlike star — a perennial target in the search for habitable worlds.' },
  { id: 'altair', name: 'Altair', ra: 19.85, dec: 8.87, ly: 16.7, color: 'rgba(230,238,255,1)', size: 0.011,
    facts: { 'Distance': '16.7 ly', 'Type': 'A7 — fast rotator', 'Day': '9 hours — visibly flattened' },
    blurb: 'Spins so fast it bulges at the equator — a day on Altair lasts nine hours.' },
  { id: 'vega', name: 'Vega', ra: 18.62, dec: 38.78, ly: 25.0, color: 'rgba(205,225,255,1)', size: 0.012,
    facts: { 'Distance': '25 ly', 'Type': 'A0 blue-white', 'Trivia': 'Will be the pole star in ~13,700 AD' },
    blurb: 'The astronomers\u2019 benchmark star. Earth\u2019s wobbling axis will point at it again in 13,700 years.' },
  { id: 'arcturus', name: 'Arcturus', ra: 14.26, dec: 19.18, ly: 36.7, color: 'rgba(255,200,140,1)', size: 0.013,
    facts: { 'Distance': '36.7 ly', 'Type': 'K1.5 orange giant', 'Size': '25\u00d7 the Sun\u2019s diameter' },
    blurb: 'An old orange giant from the galaxy\u2019s thick disk, just passing through our neighborhood.' },
];

// ---- Voyagers (approx. mid-2026) ----
const VOYAGERS = [
  { id: 'voyager1', name: 'Voyager 1', ra: 17.27, dec: 12.5, au: 169,
    facts: { 'Launched': 'September 1977', 'Distance': '169 AU — farthest human object', 'Speed': '17 km/s', 'Heliopause': 'Crossed August 2012', 'Signal time': '23.5 hours one-way' },
    blurb: 'The farthest human-made object, carrying the Golden Record into interstellar space.' },
  { id: 'voyager2', name: 'Voyager 2', ra: 20.12, dec: -59.3, au: 141,
    facts: { 'Launched': 'August 1977', 'Distance': '141 AU', 'Grand Tour': 'Only craft to visit Uranus & Neptune', 'Heliopause': 'Crossed November 2018', 'Signal time': '19.5 hours one-way' },
    blurb: 'The only spacecraft ever to visit all four giant planets, now sailing the interstellar medium.' },
];

// ---- Deep-sky landmarks ----
const DEEPSKY = [
  { id: 'pleiades', name: 'Pleiades', ra: 3.79, dec: 24.1, distU: 6e8, sub: '444 ly',
    color: ['rgba(175,205,255,1)', 'rgba(120,160,255,0)'], scale: [2.8e7, 2.8e7], rot: 0,
    facts: { 'Type': 'Open star cluster', 'Distance': '444 ly', 'Age': '~100 million years', 'Stars': '1,000+' },
    blurb: 'The Seven Sisters — a young cluster still wrapped in wisps of blue reflection nebula.' },
  { id: 'orionneb', name: 'Orion Nebula', ra: 5.59, dec: -5.39, distU: 9e8, sub: '1,344 ly',
    color: ['rgba(235,185,215,1)', 'rgba(180,110,200,0)'], scale: [5.5e7, 4.2e7], rot: 0.4,
    facts: { 'Type': 'Stellar nursery', 'Distance': '1,344 ly', 'Width': '24 ly', 'Visible': 'Naked eye — Orion\u2019s sword' },
    blurb: 'The nearest massive star factory — thousands of new suns igniting inside a collapsing gas cloud.' },
  { id: 'horsehead', name: 'Horsehead Nebula', ra: 5.68, dec: -2.46, distU: 9.2e8, sub: '1,375 ly',
    color: ['rgba(232,120,128,1)', 'rgba(150,55,85,0)'], scale: [4.4e7, 5.2e7], rot: 0.15,
    facts: { 'Type': 'Dark nebula', 'Distance': '1,375 ly', 'Constellation': 'Orion', 'Silhouette': 'Cold dust against a red hydrogen glow' },
    blurb: 'A pillar of cold dust shaped like a horse\u2019s head, set against the red glow of hydrogen behind it \u2014 one of the most photographed sights in the sky.' },
  { id: 'ringneb', name: 'Ring Nebula', ra: 18.89, dec: 33.03, distU: 1.05e9, sub: '2,570 ly',
    color: ['rgba(150,228,212,1)', 'rgba(120,90,205,0)'], scale: [2.6e7, 2.6e7], rot: 0,
    facts: { 'Type': 'Planetary nebula', 'Distance': '2,570 ly', 'Source': 'A dying sunlike star', 'Width': '~1 ly' },
    blurb: 'A smoke ring of glowing gas puffed off by a dying star \u2014 a preview of the Sun\u2019s own distant future.' },
  { id: 'crabneb', name: 'Crab Nebula', ra: 5.58, dec: 22.01, distU: 1.5e9, sub: '6,500 ly',
    color: ['rgba(236,172,140,1)', 'rgba(120,110,205,0)'], scale: [3.4e7, 3e7], rot: 0.5,
    facts: { 'Type': 'Supernova remnant', 'Distance': '6,500 ly', 'Explosion seen': '1054 AD', 'Heart': 'A spinning neutron star' },
    blurb: 'The wreckage of a star that exploded in 1054 AD \u2014 bright enough then to be seen in daylight. A pulsar spins at its center.' },
  { id: 'eagleneb', name: 'Eagle Nebula', ra: 18.31, dec: -13.82, distU: 1.75e9, sub: '~7,000 ly',
    color: ['rgba(190,206,176,1)', 'rgba(120,140,110,0)'], scale: [4.2e7, 5e7], rot: 0.25,
    facts: { 'Type': 'Star-forming region', 'Distance': '~7,000 ly', 'Famous for': 'The Pillars of Creation', 'Imaged by': 'Hubble (1995), Webb (2022)' },
    blurb: 'Towering columns of gas and dust where new stars are being born \u2014 the iconic Pillars of Creation rise inside.' },
  { id: 'andromeda', name: 'Andromeda Galaxy', ra: 0.71, dec: 41.27, distU: 4.6e9, sub: '2.5 million ly',
    color: ['rgba(255,235,210,1)', 'rgba(180,170,220,0)'], scale: [5.2e8, 1.9e8], rot: 0.6,
    facts: { 'Type': 'Spiral galaxy', 'Distance': '2.5 million ly', 'Stars': '~1 trillion', 'Future': 'Merges with the Milky Way in ~4.5 byr' },
    blurb: 'The nearest large galaxy — and the most distant thing visible to the naked eye. It is coming toward us.' },
];

// ---- Spiral-arm labels (relative to the Sun\u2019s galactocentric radius/angle) ----
const ARMS = [
  { name: 'Orion Arm', rf: 1.0, dth: 0.2 },
  { name: 'Perseus Arm', rf: 1.3, dth: -0.16 },
  { name: 'Sagittarius Arm', rf: 0.72, dth: 0.22 },
  { name: 'Scutum\u2013Centaurus Arm', rf: 0.45, dth: 0.85 },
  { name: 'Outer Arm', rf: 1.58, dth: -0.6 },
];

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(185,210,255,1)';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(64, 64, 48, 0, Math.PI * 2);
  x.stroke();
  return new THREE.CanvasTexture(c);
}

export function buildFarField(scene, world) {
  const group = new THREE.Group(); // heliocentric-fixed; position = -focus each frame
  scene.add(group);
  const objects = []; // labeled anchors consumed by ui.js

  const dotTex = (c) => glowTexture(c, 'rgba(10,10,20,0)', 64, 0.5);

  // ---- nearby stars ----
  const starSprites = [];
  const starObjs = [];
  for (const st of NEARBY_STARS) {
    const pos = starDirection(st.ra, st.dec, new THREE.Vector3()).multiplyScalar(st.ly * LY);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex(st.color), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
    }));
    spr.scale.setScalar(st.size);
    spr.position.copy(pos);
    group.add(spr);
    starSprites.push(spr);
    const o = { id: st.id, name: st.name, sub: st.ly.toFixed(1) + ' ly', kind: 'star', local: pos, worldPos: new THREE.Vector3(), alpha: 0, facts: st.facts, blurb: st.blurb };
    objects.push(o);
    starObjs.push(o);
  }

  // ---- heliosphere (rim-lit bubble, nose toward the interstellar wind) ----
  const HELIO_R = 121 * AU;
  const heliGroup = new THREE.Group();
  heliGroup.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), starDirection(16.8, -16, new THREE.Vector3()));
  const heliMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: `
      varying float vRim;
      void main(){
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vRim = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 2.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uAlpha; varying float vRim;
      void main(){ gl_FragColor = vec4(vec3(0.42, 0.72, 0.85) * vRim, vRim * uAlpha); }`,
  });
  const heli = new THREE.Mesh(new THREE.SphereGeometry(HELIO_R, 48, 32), heliMat);
  heli.scale.set(1.35, 1, 1);       // teardrop-ish: stretched along the wind axis
  heli.position.x = -HELIO_R * 0.28; // tail extends downwind
  heliGroup.add(heli);
  group.add(heliGroup);
  const heliObj = { id: 'heliopause', name: 'Heliopause', sub: '~120 AU', kind: 'edge',
    heliLocal: new THREE.Vector3(HELIO_R * 1.12, 0, 0), worldPos: new THREE.Vector3(), alpha: 0,
    facts: { 'Boundary': 'Solar wind meets interstellar gas', 'Distance': '~120 AU from the Sun', 'Crossed by': 'Voyager 1 (2012), Voyager 2 (2018)', 'Inside': 'The Sun\u2019s protective bubble' },
    blurb: 'The edge of the Sun\u2019s influence — beyond this line, the wind between the stars takes over.' };
  objects.push(heliObj);

  // ---- Voyagers ----
  const voyObjs = [];
  for (const v of VOYAGERS) {
    const pos = starDirection(v.ra, v.dec, new THREE.Vector3()).multiplyScalar(v.au * AU);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex('rgba(255,215,150,1)'), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false,
    }));
    spr.scale.setScalar(0.006);
    spr.position.copy(pos);
    group.add(spr);
    const o = { id: v.id, name: v.name, sub: v.au + ' AU', kind: 'probe', local: pos, worldPos: new THREE.Vector3(), alpha: 0, facts: v.facts, blurb: v.blurb, sprite: spr };
    objects.push(o);
    voyObjs.push(o);
  }

  // ---- deep-sky landmarks ----
  const deepObjs = [];
  for (const d of DEEPSKY) {
    const pos = starDirection(d.ra, d.dec, new THREE.Vector3()).multiplyScalar(d.distU);
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(d.color[0], d.color[1], 256, 0.4), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, rotation: d.rot,
    });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(d.scale[0], d.scale[1], 1);
    spr.position.copy(pos);
    group.add(spr);
    const o = { id: d.id, name: d.name, sub: d.sub, kind: 'deep', local: pos, worldPos: new THREE.Vector3(), alpha: 0, facts: d.facts, blurb: d.blurb, sprite: spr };

    // The Horsehead gets a real volumetric dust cloud with its own emission backdrop.
    if (d.id === 'horsehead') {
      spr.visible = false; // the cloud supplies its own IC 434 glow; hide the generic sprite
      const cloud = buildHorseheadCloud({ span: d.scale[1] });
      cloud.position.copy(pos);
      cloud.lookAt(0, 0, 0); // face the inner system so the silhouette reads
      group.add(cloud);
      o.cloud = cloud;
      o.flyDist = d.scale[1] * 1.9; // a framed vantage that shows the dust detail
    }

    objects.push(o);
    deepObjs.push(o);
  }

  // ---- galactic markers (in galaxy-local space) ----
  const rotM = new THREE.Matrix4().makeRotationFromEuler(GALAXY.tilt);
  const sunLocal = GALAXY.center.clone().negate().applyMatrix4(rotM.clone().invert());
  const rSun = Math.hypot(sunLocal.x, sunLocal.z);
  const thSun = Math.atan2(sunLocal.z, sunLocal.x);

  // Sun's 230-million-year orbit around the galactic center
  const orbPts = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    orbPts.push(new THREE.Vector3(Math.cos(a) * rSun, sunLocal.y, Math.sin(a) * rSun));
  }
  const sunOrbit = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbPts),
    new THREE.LineBasicMaterial({ color: 0x8fa8d0, transparent: true, opacity: 0, depthWrite: false })
  );
  sunOrbit.frustumCulled = false;
  world.galaxy.group.add(sunOrbit);

  const galObjs = [];
  for (const arm of ARMS) {
    const a = thSun + arm.dth, r = rSun * arm.rf;
    const o = { id: arm.name, name: arm.name, kind: 'gal', galLocal: new THREE.Vector3(Math.cos(a) * r, sunLocal.y, Math.sin(a) * r), worldPos: new THREE.Vector3(), alpha: 0 };
    objects.push(o);
    galObjs.push(o);
  }
  const sgrObj = { id: 'sgra', name: 'Galactic Center', sub: 'Sgr A* \u00b7 26,000 ly', kind: 'gal',
    galLocal: new THREE.Vector3(0, 0, 0), worldPos: new THREE.Vector3(), alpha: 0,
    facts: { 'Object': 'Sagittarius A* — supermassive black hole', 'Mass': '4.3 million Suns', 'Distance': '26,000 ly', 'First imaged': 'Event Horizon Telescope, 2022' },
    blurb: 'Every star in this disc — including ours — orbits the black hole hiding here.' };
  objects.push(sgrObj);
  galObjs.push(sgrObj);
  const aOrb = thSun + 0.55;
  const orbObj = { id: 'sunorbit', name: 'Sun\u2019s galactic orbit', sub: '230 million years', kind: 'gal',
    galLocal: new THREE.Vector3(Math.cos(aOrb) * rSun, sunLocal.y, Math.sin(aOrb) * rSun), worldPos: new THREE.Vector3(), alpha: 0 };
  objects.push(orbObj);
  galObjs.push(orbObj);

  // ---- "You are here" ring at the Sun ----
  const hereSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ringTexture(), transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: false,
  }));
  hereSpr.scale.setScalar(0.05);
  group.add(hereSpr);
  const hereObj = { id: 'youarehere', name: 'You are here', kind: 'here', local: new THREE.Vector3(0, 0, 0), worldPos: new THREE.Vector3(), alpha: 0 };
  objects.push(hereObj);

  // ---- per-frame ----
  function update({ f, dHelio: d, galT, now, tweaks: tw }) {
    group.position.copy(f).negate();

    // scene yardsticks: AU = 1.496e5 units · Oort 1.65e7–3.9e7 · heliopause 1.8e7 · galaxy fade 2.2e7→6.5e8
    const aStars = (tw.nearbyStars ? 1 : 0) * smooth(d, 8e6, 6e7) * (1 - smooth(d, 2e9, 5e9));
    const aStarLbl = aStars * (1 - smooth(d, 8e8, 2e9));
    const aHelio = (tw.heliosphere ? 1 : 0) * smooth(d, 1.6e7, 3.2e7) * (1 - smooth(d, 4e8, 1.2e9));
    const aVoy = (tw.heliosphere ? 1 : 0) * smooth(d, 9e6, 2e7) * (1 - smooth(d, 3e8, 1e9));
    const aDeep = (tw.deepSky ? 1 : 0) * smooth(d, 1e8, 5e8) * (1 - smooth(d, 3e9, 7e9));
    const aAndro = (tw.deepSky ? 1 : 0) * smooth(d, 3e8, 1.5e9);
    const aGal = (tw.galaxyMarkers ? 1 : 0) * galT;
    const aHere = (tw.galaxyMarkers ? 1 : 0) * smooth(d, 1.5e8, 6e8) * (1 - smooth(d, 5e9, 9e9));

    for (let i = 0; i < starSprites.length; i++) starSprites[i].material.opacity = aStars;
    for (const o of starObjs) o.alpha = aStarLbl;

    heliMat.uniforms.uAlpha.value = aHelio * 0.9;
    heli.visible = aHelio > 0.01;
    heliObj.alpha = aHelio;
    for (const o of voyObjs) { o.alpha = aVoy; o.sprite.material.opacity = aVoy; }

    for (const o of deepObjs) {
      const a = o.id === 'andromeda' ? aAndro : aDeep;
      o.alpha = a;
      o.sprite.material.opacity = a * (o.id === 'horsehead' ? 0.22 : 0.55);
      o.sprite.visible = o.id !== 'horsehead' && a > 0.01;
      if (o.cloud) o.cloud.setOpacity(a);
    }

    sunOrbit.material.opacity = aGal * 0.4;
    sunOrbit.visible = aGal > 0.02;
    for (const o of galObjs) o.alpha = aGal;

    hereObj.alpha = aHere;
    hereSpr.material.opacity = aHere * 0.9;
    hereSpr.scale.setScalar(0.05 + Math.sin(now * 0.0025) * 0.007);

    // world positions for the label layer
    for (const o of objects) {
      if (o.galLocal) o.worldPos.copy(o.galLocal).applyMatrix4(rotM).add(world.galaxy.group.position);
      else if (o.heliLocal) o.worldPos.copy(o.heliLocal).applyQuaternion(heliGroup.quaternion).add(group.position);
      else o.worldPos.copy(o.local).add(group.position);
    }
  }

  return { group, objects, update };
}
