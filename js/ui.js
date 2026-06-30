// UI layer: labels, picking, info cards, time controls, scrubber, tour.
import * as THREE from './vendor/three.module.js';
import { BODIES, MOONS, COMETS, MINORS, AU, TOUR, EVENTS } from './data.js';
import { App } from './app.js';

const { camera, controls, registry, helio } = App.three;
const Time = App.Time;

const $ = (s) => document.querySelector(s);
const labelLayer = $('#labels');

// ---------------- 3D labels (projected HTML) ----------------
const LABELED = [...BODIES.map(b => b.id), ...MOONS.map(m => m.id), ...COMETS.map(c => c.id), ...MINORS.map(c => c.id)];
const labels = {};
for (const id of LABELED) {
  const el = document.createElement('div');
  el.className = 'label' + (registry[id].isMoon ? ' moon' : '') + (registry[id].isComet ? ' comet' : '') + (registry[id].isMinor ? ' minor' : '');
  el.innerHTML = `<i></i><span>${registry[id].body.name}</span>`;
  el.addEventListener('pointerup', (e) => { e.stopPropagation(); select(id, true); });
  labelLayer.appendChild(el);
  labels[id] = el;
}

const _p = new THREE.Vector3();
const _lp2 = new THREE.Vector3();   // reused: moon-parent distance test (avoids per-frame alloc)
function updateLabels() {
  const f = helio[App.Focus.id];
  const tw = App.tweaks;
  for (const id of LABELED) {
    const el = labels[id];
    const e = registry[id];
    _p.copy(helio[id]).sub(f);
    // hide bodies that don't exist yet at the current sim time (e.g. ISS before 1998)
    if (e.body.since && Time.simMs < e.body.since) { el.style.display = 'none'; continue; }
    const dist = _p.distanceTo(camera.position);
    const r = e.body.radius;
    _p.project(camera);
    const behind = _p.z > 1;
    // hide when too close (planet fills view) or moons when far from parent
    let vis = !behind && _p.x > -1.1 && _p.x < 1.1 && _p.y > -1.1 && _p.y < 1.1;
    if (e.isMoon) { if (!tw.moonLabels || !tw.moons) vis = false; }
    else if (e.isComet) { if (!tw.labels || !tw.comets) vis = false; }
    else if (e.isMinor) { if (!tw.labels || !tw.minors) vis = false; }
    else if (!tw.labels) vis = false;
    if (dist < r * 8) vis = false;
    if (e.isMoon) {
      const pd = _lp2.copy(helio[e.parentId]).sub(f).distanceTo(camera.position);
      if (pd > e.body.a * 40) vis = false;
    } else if (id !== 'sun' && dist > helio[id].length() * 14) vis = false;
    if (id === 'sun' && App.camDist() > 2.5e9) vis = false;
    el.style.display = vis ? '' : 'none';
    if (!vis) continue;
    el.style.transform = `translate(${(_p.x * 0.5 + 0.5) * innerWidth}px, ${(-_p.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}

// ---------------- Picking ----------------
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let downAt = null;
addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 6 || e.target.closest('.ui') || e.target.closest('.label')) return;
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  // generous threshold for tiny planets: test proxies + screen-space distance fallback
  const meshes = [];
  for (const id in registry) {
    const e = registry[id];
    if (e.isMoon && !App.tweaks.moons) continue;
    if (e.isComet && !App.tweaks.comets) continue;
    if (e.isMinor && !App.tweaks.minors) continue;
    if (e.body && e.body.since && Time.simMs < e.body.since) continue; // not in orbit yet
    if (e.proxy) meshes.push(e.proxy);
    if (e.mesh) meshes.push(e.mesh);
  }
  const hits = ray.intersectObjects(meshes, false);
  if (hits.length) { select(hits[0].object.userData.bodyId, true); return; }
  // fallback: nearest label within 28px
  let best = null, bestD = 28;
  for (const id of LABELED) {
    const el = labels[id];
    if (el.style.display === 'none') continue;
    const m = /translate\(([\d.e+-]+)px, ([\d.e+-]+)px\)/.exec(el.style.transform);
    if (!m) continue;
    const d = Math.hypot(e.clientX - +m[1], e.clientY - +m[2]);
    if (d < bestD) { bestD = d; best = id; }
  }
  if (best) select(best, true);
});

// ---------------- Selection & info card ----------------
const card = $('#card');
let selected = null;
function select(id, fly) {
  const bdy = registry[id] && registry[id].body;
  // Don't select bodies that don't exist yet at the current sim time (e.g. the ISS
  // before its 1998 launch) — flying there would just frame empty space.
  if (bdy && bdy.since && Time.simMs < bdy.since) {
    flashToast(`<b>${bdy.name}</b>Not in orbit until ${new Date(bdy.since).getUTCFullYear()} — advance time to see it`);
    return;
  }
  selected = id;
  const b = registry[id].body;
  $('#cardName').textContent = b.name;
  $('#cardBlurb').textContent = b.blurb || '';
  const rows = Object.entries(b.facts || {}).map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  $('#cardFacts').innerHTML = rows;
  $('#cardFly').classList.remove('show');
  card.classList.add('open');
  document.querySelectorAll('#nav button').forEach(btn => btn.classList.toggle('on', btn.dataset.id === id));
  if (fly) App.flyTo(id, registry[id].isComet ? { distAbs: 0.012 * AU } : id === 'iss' ? { distAbs: 20 } : { dist: id === 'sun' ? 6 : 4.5 });
}
$('#cardClose').addEventListener('click', () => { card.classList.remove('open'); selected = null; document.querySelectorAll('#nav button').forEach(b => b.classList.remove('on')); });
App.select = select;

// ---------------- Planet nav ----------------
const nav = $('#nav');
for (const b of [...BODIES, ...COMETS, ...MINORS]) {
  const btn = document.createElement('button');
  btn.dataset.id = b.id;
  if (registry[b.id].isComet) { btn.classList.add('comet'); btn.textContent = b.name.replace(/^\d+P\//, '').replace(/^C\/\d+ \w+ /, ''); }
  else if (registry[b.id].isMinor) { btn.classList.add('minor'); btn.textContent = b.name; }
  else btn.textContent = b.name;
  btn.addEventListener('click', () => select(b.id, true));
  nav.appendChild(btn);
}
// bodies dropdown open/close
{
  const wrap = $('#bodiesWrap');
  $('#bodiesBtn').addEventListener('click', () => wrap.classList.toggle('open'));
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#bodiesWrap')) wrap.classList.remove('open'); });
  nav.addEventListener('click', (e) => { if (e.target.closest('button')) wrap.classList.remove('open'); });
}

// ---------------- Far-field labels (stars, probes, deep sky, galaxy) ----------------
const farLabels = [];
for (const o of App.three.far.objects) {
  const el = document.createElement('div');
  el.className = 'farlabel ' + o.kind + (o.facts ? ' click' : '');
  el.innerHTML = `<i></i><span>${o.name}${o.sub ? `<em>${o.sub}</em>` : ''}</span>`;
  if (o.facts) el.addEventListener('pointerup', (ev) => { ev.stopPropagation(); showFarCard(o); });
  labelLayer.appendChild(el);
  farLabels.push({ el, o });
}
const _fp = new THREE.Vector3();
function updateFarLabels() {
  for (const { el, o } of farLabels) {
    if (o.alpha < 0.04) { el.style.display = 'none'; continue; }
    _fp.copy(o.worldPos).project(camera);
    const vis = _fp.z < 1 && _fp.x > -1.05 && _fp.x < 1.05 && _fp.y > -1.05 && _fp.y < 1.05;
    el.style.display = vis ? '' : 'none';
    if (!vis) continue;
    el.style.opacity = Math.min(1, o.alpha).toFixed(2);
    el.style.transform = `translate(${(_fp.x * 0.5 + 0.5) * innerWidth}px, ${(-_fp.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}
function showFarCard(o) {
  selected = null;
  $('#cardName').textContent = o.name;
  $('#cardBlurb').textContent = o.blurb || '';
  $('#cardFacts').innerHTML = Object.entries(o.facts || {}).map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  const flyBtn = $('#cardFly');
  if (o.local && o.flyDist) {
    flyBtn.classList.add('show');
    flyBtn.onclick = () => { App.flyToFar(o.local, { dist: o.flyDist }); card.classList.remove('open'); };
  } else {
    flyBtn.classList.remove('show');
    flyBtn.onclick = null;
  }
  card.classList.add('open');
  document.querySelectorAll('#nav button').forEach(btn => btn.classList.remove('on'));
}

// ---------------- Search (every named body + far-field object) ----------------
// Menu actions (events, missions, view toggles, looks) register themselves here as the
// sections below build their menus; the search merges them with the celestial index.
const menuCommands = [];
{
  const input = $('#searchInput');
  const resultsEl = $('#searchResults');

  // Flat index over planets, moons, comets and far-field objects. Each entry knows how
  // to act on itself, reusing the same handlers as clicking in 3D: select() flies to a
  // body/moon/comet and opens its card; showFarCard() opens a star/probe/deep-sky card.
  const index = [];
  const planetType = (b) => b.id === 'sun' ? 'Star' : b.id === 'pluto' ? 'Dwarf planet' : 'Planet';
  for (const b of BODIES) {
    const type = planetType(b);
    index.push({ name: b.name, type, dot: b.id === 'sun' ? 'star' : 'planet',
      terms: (b.name + ' ' + type).toLowerCase(), run: () => select(b.id, true) });
  }
  const parentName = (pid) => (BODIES.find(x => x.id === pid) || {}).name || pid;
  for (const m of MOONS) {
    const type = m.id === 'iss' ? 'Space station' : 'Moon of ' + parentName(m.parent);
    index.push({ name: m.name, type, dot: 'moon',
      terms: (m.name + ' ' + type + ' moon station spacecraft').toLowerCase(), run: () => select(m.id, true) });
  }
  for (const c of COMETS) {
    index.push({ name: c.name, type: 'Comet', dot: 'comet',
      terms: (c.name + ' comet').toLowerCase(), run: () => select(c.id, true) });
  }
  for (const c of MINORS) {
    const type = (c.kind === 'dwarf' ? 'Dwarf planet' : 'Asteroid') + ' · ' + c.region;
    index.push({ name: c.name, type, dot: c.kind,
      terms: (c.name + ' ' + type + ' minor planet').toLowerCase(), run: () => select(c.id, true) });
  }
  const FAR_TYPE = { star: 'Star', probe: 'Spacecraft', deep: 'Deep sky', edge: 'Boundary', gal: 'Galactic' };
  for (const o of App.three.far.objects) {
    if (!o.facts) continue;                       // skip non-interactive markers (spiral arms)
    const type = FAR_TYPE[o.kind] || 'Object';
    index.push({ name: o.name, type, dot: o.kind, sub: o.sub,
      terms: (o.name + ' ' + type + ' ' + (o.sub || '')).toLowerCase(), run: () => showFarCard(o) });
  }

  const CAT_ORDER = ['planet', 'star', 'moon', 'comet', 'dwarf', 'asteroid', 'probe', 'deep', 'edge', 'gal', 'event', 'mission', 'view', 'look'];
  let matches = [], active = -1;

  // simple substring match: name-prefix beats name-substring beats other-terms
  const score = (it, q) => {
    const n = it.name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.includes(q)) return 1;
    if (it.terms.includes(q)) return 2;
    return -1;
  };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      resultsEl.innerHTML = '<div class="srEmpty">Search planets, moons, events, missions, settings…</div>';
      resultsEl.classList.add('open'); matches = []; active = -1; return;
    }
    matches = index.concat(menuCommands).map(it => ({ it, s: score(it, q) })).filter(x => x.s >= 0)
      .sort((a, b) => a.s - b.s
        || CAT_ORDER.indexOf(a.it.dot) - CAT_ORDER.indexOf(b.it.dot)
        || a.it.name.localeCompare(b.it.name))
      .slice(0, 50).map(x => x.it);
    active = matches.length ? 0 : -1;
    resultsEl.innerHTML = matches.length
      ? matches.map((it, i) =>
          `<div class="srRow${i === active ? ' active' : ''}" data-i="${i}">` +
          `<i class="srDot ${it.dot}"></i>` +
          `<div class="srTxt"><div class="srName">${esc(it.name)}</div>` +
          `<div class="srType">${esc(it.type)}${it.sub ? ' · ' + esc(it.sub) : ''}</div></div></div>`).join('')
      : '<div class="srEmpty">No match for \u201C' + esc(input.value.trim()) + '\u201D</div>';
    resultsEl.classList.add('open');
  }
  function ensureVisible(el) {
    if (!el) return;
    const top = el.offsetTop, bot = top + el.offsetHeight;
    if (top < resultsEl.scrollTop) resultsEl.scrollTop = top;
    else if (bot > resultsEl.scrollTop + resultsEl.clientHeight) resultsEl.scrollTop = bot - resultsEl.clientHeight;
  }
  function markActive() {
    const rows = resultsEl.querySelectorAll('.srRow');
    rows.forEach((r, i) => r.classList.toggle('active', i === active));
    ensureVisible(rows[active]);
  }
  function close() { resultsEl.classList.remove('open'); active = -1; }
  function choose(i) {
    const it = matches[i];
    if (!it) return;
    input.value = '';
    close();
    input.blur();
    it.run();
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (matches.length) { active = (active + 1) % matches.length; markActive(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (matches.length) { active = (active - 1 + matches.length) % matches.length; markActive(); } }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active >= 0 ? active : 0); }
    else if (e.key === 'Escape') { e.stopPropagation(); if (input.value) { input.value = ''; render(); } else { close(); input.blur(); } }
  });
  resultsEl.addEventListener('click', (e) => {
    const row = e.target.closest('.srRow'); if (row) choose(+row.dataset.i);
  });
  resultsEl.addEventListener('pointermove', (e) => {
    const row = e.target.closest('.srRow'); if (!row) return;
    active = +row.dataset.i; markActive();
  });
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#searchWrap')) close(); });

  // global shortcut: "/" or Cmd/Ctrl-K focuses search from anywhere
  addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault(); input.focus(); render();
    }
  });
}

// ---------------- Time controls ----------------
const fmtDate = (ms) => { const iso = new Date(ms).toISOString(); return iso.slice(0, 10) + ' ' + iso.slice(11, 16) + ' UTC'; };

// speed slider: marked stops, log-interpolated in between, magnetic snap near marks
const speedSlider = $('#speedSlider');
{
  const ticks = $('#speedTicks');
  for (let i = 0; i < Time.stops.length; i++) {
    const t = document.createElement('i');
    t.style.left = (i / (Time.stops.length - 1) * 100) + '%';
    t.title = Time.stopLabels[i];
    ticks.appendChild(t);
  }
}
function speedFromPos(p) {
  const i = Math.max(0, Math.min(Time.stops.length - 2, Math.floor(p)));
  const f = p - i;
  return Math.exp(Math.log(Time.stops[i]) * (1 - f) + Math.log(Time.stops[i + 1]) * f);
}
function fmtSpeed() {
  const near = Math.round(Time.sliderPos);
  if (Math.abs(Time.sliderPos - near) < 0.001) return Time.stopLabels[near];
  const s = Time.speed;
  if (s < 90) return s.toFixed(0) + ' sec/s';
  if (s < 5400) return (s / 60).toFixed(0) + ' min/s';
  if (s < 86400 * 1.5) return (s / 3600).toFixed(1) + ' hr/s';
  if (s < 86400 * 45) return (s / 86400).toFixed(1) + ' days/s';
  if (s < 86400 * 550) return (s / (86400 * 30.44)).toFixed(1) + ' mo/s';
  return (s / (86400 * 365.25)).toFixed(1) + ' yr/s';
}
function setSliderPos(p) {
  if (Math.abs(p - Math.round(p)) < 0.09) p = Math.round(p); // snap to marks
  Time.sliderPos = p;
  Time.speed = speedFromPos(p);
  renderTime();
}
function renderTime() {
  speedSlider.value = Time.sliderPos;
  $('#date').textContent = fmtDate(Time.simMs);
  $('#speed').textContent = fmtSpeed();
  $('#playBtn').textContent = Time.playing ? '❚❚' : '▶';
}
speedSlider.addEventListener('input', () => setSliderPos(+speedSlider.value));
$('#playBtn').addEventListener('click', () => { Time.playing = !Time.playing; renderTime(); });
$('#nowBtn').addEventListener('click', () => { Time.simMs = Date.now(); renderTime(); });

// scrubber: drag horizontally = ±2 years from drag start
const scrub = $('#scrub');
let scrubStart = null;
scrub.addEventListener('pointerdown', (e) => { scrubStart = { x: e.clientX, ms: Time.simMs }; Time.scrubbing = true; scrub.setPointerCapture(e.pointerId); });
scrub.addEventListener('pointermove', (e) => {
  if (!scrubStart) return;
  const frac = (e.clientX - scrubStart.x) / innerWidth;
  Time.simMs = scrubStart.ms + frac * 2 * 365.25 * 86400000;
  renderTime();
});
const endScrub = () => { scrubStart = null; Time.scrubbing = false; };
scrub.addEventListener('pointerup', endScrub);
scrub.addEventListener('pointercancel', endScrub);

// ---------------- View menu (layer toggles) ----------------
const VIEW_KEY = 'sol3d-view';
const VIEW_ITEMS = [
  ['labels', 'Planet labels'],
  ['moonLabels', 'Moon labels'],
  ['orbitLines', 'Orbit lines'],
  ['moonOrbits', 'Moon orbits'],
  ['moons', 'Moons'],
  ['comets', 'Comets'],
  ['minors', 'Dwarfs & asteroids'],
  ['constellations', 'Constellations'],
  ['belts', 'Belts'],
  ['trojans', 'Jupiter Trojans'],
  ['flares', 'Solar flares'],
  ['nearbyStars', 'Nearby stars'],
  ['heliosphere', 'Heliosphere'],
  ['deepSky', 'Deep-sky objects'],
  ['galaxyMarkers', 'Galaxy markers'],
];
{
  let savedView = {};
  try { savedView = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); } catch (err) { /* corrupt entry — use defaults */ }
  const patch = {};
  for (const [k] of VIEW_ITEMS) if (typeof savedView[k] === 'boolean') patch[k] = savedView[k];
  App.applyTweaks(patch);

  const wrap = $('#viewWrap');
  const menu = $('#viewMenu');
  const saveView = () => {
    const out = {};
    for (const [k] of VIEW_ITEMS) out[k] = !!App.tweaks[k];
    localStorage.setItem(VIEW_KEY, JSON.stringify(out));
  };
  for (const [k, name] of VIEW_ITEMS) {
    const row = document.createElement('div');
    row.className = 'viewRow' + (App.tweaks[k] ? ' on' : '');
    row.innerHTML = `<i></i><span>${name}</span>`;
    const toggle = () => {
      const v = !App.tweaks[k];
      App.applyTweaks({ [k]: v });
      row.classList.toggle('on', v);
      saveView();
      flashToast(`<b>${name}</b>${v ? 'On' : 'Off'}`);
    };
    row.addEventListener('click', toggle);
    menu.appendChild(row);
    menuCommands.push({ name, type: 'View toggle', dot: 'view',
      terms: (name + ' view toggle layer show hide ' + k).toLowerCase(), run: toggle });
  }
  $('#viewBtn').addEventListener('click', () => wrap.classList.toggle('open'));
  addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#viewWrap')) wrap.classList.remove('open');
  });
}

// ---------------- Look panel (style + bloom + star brightness) ----------------
const LOOK_KEY = 'sol3d-look';
{
  // restore saved look
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}'); } catch (err) { /* corrupt — defaults */ }
  const mode = (saved.styleMode === 'photoreal' || saved.styleMode === 'cinematic') ? saved.styleMode : App.Style.mode;
  const bloom = Number.isFinite(saved.bloom) ? saved.bloom : App.tweaks.bloom;
  const star = Number.isFinite(saved.starBrightness) ? saved.starBrightness : App.tweaks.starBrightness;

  const wrap = $('#styleWrap');
  const menu = $('#styleMenu');
  const btn = $('#styleBtn');
  const bloomIn = $('#tkBloom'), bloomVal = $('#tkBloomVal');
  const starIn = $('#tkStar'), starVal = $('#tkStarVal');
  const fmt = (v) => (+v).toFixed(2).replace(/0$/, '').replace(/\.$/, '.0');

  const save = () => localStorage.setItem(LOOK_KEY, JSON.stringify({
    styleMode: App.Style.mode, bloom: App.tweaks.bloom, starBrightness: App.tweaks.starBrightness,
  }));

  // apply restored values
  App.applyTweaks({ bloom, starBrightness: star });
  if (App.Style.mode !== mode) App.setStyleMode(mode);
  bloomIn.value = bloom; bloomVal.textContent = fmt(bloom);
  starIn.value = star; starVal.textContent = fmt(star);
  const markStyle = (m) => menu.querySelectorAll('.viewRow').forEach(r => r.classList.toggle('on', r.dataset.mode === m));
  markStyle(App.Style.mode);

  // style toggle (keep panel open so sliders stay reachable)
  for (const row of menu.querySelectorAll('.viewRow')) {
    const apply = () => { App.setStyleMode(row.dataset.mode); markStyle(row.dataset.mode); save(); };
    row.addEventListener('click', apply);
    const label = (row.textContent || row.dataset.mode).trim();
    menuCommands.push({ name: label + ' look', type: 'Look', dot: 'look',
      terms: (label + ' look style mode render ' + row.dataset.mode).toLowerCase(),
      run: () => { apply(); flashToast(`<b>Look</b>${label}`); } });
  }
  // sliders
  bloomIn.addEventListener('input', () => {
    const v = parseFloat(bloomIn.value);
    App.applyTweaks({ bloom: v }); bloomVal.textContent = fmt(v); save();
  });
  starIn.addEventListener('input', () => {
    const v = parseFloat(starIn.value);
    App.applyTweaks({ starBrightness: v }); starVal.textContent = fmt(v); save();
  });
  // keep external style changes (e.g. follow-cam) reflected in the toggle
  const prevOnStyle = App.onStyleChange;
  App.onStyleChange = (m) => { markStyle(m); prevOnStyle && prevOnStyle(m); };

  btn.addEventListener('click', () => wrap.classList.toggle('open'));
  addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#styleWrap')) wrap.classList.remove('open');
  });
}

// ---------------- Events + date picker ----------------
const eventCap = $('#eventCap');
function flashToast(html) {
  eventCap.innerHTML = html;
  eventCap.classList.add('show');
  clearTimeout(jumpTo._t);
  jumpTo._t = setTimeout(() => eventCap.classList.remove('show'), 4200);
}
function jumpTo(ev) {
  Time.simMs = ev.when;
  Time.playing = false;
  renderTime();
  App.step && App.step();                 // refresh positions to the new date before framing
  const opts = { duration: 2600 };
  if (ev.auAbs != null) opts.distAbs = ev.auAbs * AU; else opts.dist = ev.dist || 5;
  App.flyTo(ev.target, opts);
  if (registry[ev.target] && !ev.auAbs) select(ev.target, false);
  eventCap.innerHTML = `<b>${ev.name} · ${ev.sub}</b>${ev.blurb}`;
  eventCap.classList.add('show');
  clearTimeout(jumpTo._t);
  jumpTo._t = setTimeout(() => eventCap.classList.remove('show'), 11000);
}
{
  const wrap = $('#eventsWrap'), menu = $('#eventsMenu');
  let lastCat = null;
  for (const ev of EVENTS) {
    if (ev.cat && ev.cat !== lastCat) {
      const h = document.createElement('div');
      h.className = 'evCat';
      h.textContent = ev.cat;
      menu.appendChild(h);
      lastCat = ev.cat;
    }
    const row = document.createElement('div');
    row.className = 'evRow';
    row.innerHTML = `<div class="nm">${ev.name}</div><div class="dt">${ev.sub}</div>`;
    row.addEventListener('click', () => { jumpTo(ev); wrap.classList.remove('open'); });
    menu.appendChild(row);
    menuCommands.push({ name: ev.name, type: 'Event' + (ev.cat ? ' \u00b7 ' + ev.cat : ''), dot: 'event', sub: ev.sub,
      terms: (ev.name + ' ' + (ev.cat || '') + ' ' + (ev.sub || '') + ' event date').toLowerCase(), run: () => jumpTo(ev) });
  }
  $('#eventsBtn').addEventListener('click', () => wrap.classList.toggle('open'));
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#eventsWrap')) wrap.classList.remove('open'); });
}

// clickable date readout -> UTC date/time picker
{
  const pop = $('#datePop'), dateIn = $('#dateInput'), timeIn = $('#timeInput');
  const fill = () => {
    const iso = new Date(Time.simMs).toISOString();
    dateIn.value = iso.slice(0, 10);
    timeIn.value = iso.slice(11, 16);
  };
  $('#date').addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !pop.classList.contains('open');
    if (opening) fill();
    pop.classList.toggle('open');
  });
  $('#dateGo').addEventListener('click', () => {
    const dp = (dateIn.value || '').split('-').map(Number);
    const tp = (timeIn.value || '00:00').split(':').map(Number);
    if (!dp[0]) return;
    Time.simMs = Date.UTC(dp[0], (dp[1] || 1) - 1, dp[2] || 1, tp[0] || 0, tp[1] || 0);
    renderTime();
    App.step && App.step();
    pop.classList.remove('open');
  });
  $('#dateNow').addEventListener('click', () => {
    Time.simMs = Date.now();
    renderTime();
    App.step && App.step();
    pop.classList.remove('open');
  });
  addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#datePop') && !e.target.closest('#date')) pop.classList.remove('open');
  });
}

// ---------------- Missions (real spacecraft trajectories) ----------------
const _op = new THREE.Vector3();
const orionLabel = document.createElement('div');
orionLabel.className = 'label craft';
orionLabel.innerHTML = '<i></i><span>Orion</span>';
orionLabel.style.display = 'none';
labelLayer.appendChild(orionLabel);
const missionHud = $('#missionHud');
const MISSIONS = [
  { id: 'artemis2', name: 'Artemis II', sub: 'A crewed free-return flyby of the Moon — the first since Apollo. <b>Real NASA trajectory.</b>' },
];
function fmtMET(ms) {
  const neg = ms < 0; ms = Math.abs(ms);
  const d = Math.floor(ms / 86400000); ms -= d * 86400000;
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  return (neg ? 'T\u2212' : 'T+') + d + 'd ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function phaseOf(s) {
  if (Time.simMs < s.startMs) return 'Pre-flight';
  if (Time.simMs > s.endMs) return 'Entry · Splashdown';
  if (Math.abs(Time.simMs - s.flybyMs) < 3 * 3600 * 1000) return 'Lunar flyby';
  return Time.simMs < s.flybyMs ? 'Translunar coast — outbound' : 'Return coast — inbound';
}
function startArtemis() {
  const A = App.Artemis; if (!A) return;
  card.classList.remove('open'); selected = null;
  document.querySelectorAll('#nav button').forEach(b => b.classList.remove('on'));
  Time.simMs = A.getState().startMs;
  Time.playing = true;
  setSliderPos(1.35);                 // ~3 hr/s — full mission in ~70s
  A.frameAll();
  missionHud.classList.add('open');
  $('#mhFollow').classList.remove('on');
  renderTime();
}
{
  const wrap = $('#missionsWrap'), menu = $('#missionsMenu');
  for (const m of MISSIONS) {
    const row = document.createElement('div');
    row.className = 'miRow';
    row.innerHTML = `<div class="nm">${m.name}</div><div class="sb">${m.sub}</div>`;
    row.addEventListener('click', () => { startArtemis(); wrap.classList.remove('open'); });
    menu.appendChild(row);
    menuCommands.push({ name: m.name, type: 'Mission', dot: 'mission',
      terms: (m.name + ' mission spacecraft launch artemis').toLowerCase(), run: () => startArtemis() });
  }
  $('#missionsBtn').addEventListener('click', () => wrap.classList.toggle('open'));
  addEventListener('pointerdown', (e) => { if (!e.target.closest('#missionsWrap')) wrap.classList.remove('open'); });
}
$('#mhFollow').addEventListener('click', () => {
  const A = App.Artemis; if (!A) return;
  const on = !A.follow;
  A.setFollow(on);
  $('#mhFollow').classList.toggle('on', on);
});
$('#mhExit').addEventListener('click', () => {
  const A = App.Artemis; if (!A) return;
  A.setActive(false); A.follow = false;
  missionHud.classList.remove('open');
  orionLabel.style.display = 'none';
  $('#mhFollow').classList.remove('on');
  App.setFocus('earth');
});
App.onArtemisFollow = (on) => { $('#mhFollow').classList.toggle('on', on); };

// ---------------- Tour ----------------
const tourCap = $('#tourCaption');
let tour = { on: false, i: 0, timer: null };
function tourStep() {
  if (!tour.on) return;
  if (tour.i >= TOUR.length) { endTour(); return; }
  const stop = TOUR[tour.i];
  App.flyTo(stop.id, { dist: stop.dist, duration: 3400 });
  tourCap.textContent = stop.text;
  tourCap.classList.add('show');
  if (registry[stop.id] && stop.dist < 100) select(stop.id, false);
  tour.i++;
  tour.timer = setTimeout(tourStep, 9000);
}
function startTour() {
  tour = { on: true, i: 0, timer: null };
  document.body.classList.add('touring');
  card.classList.remove('open');
  tourStep();
}
function endTour() {
  tour.on = false;
  clearTimeout(tour.timer);
  document.body.classList.remove('touring');
  tourCap.classList.remove('show');
}
$('#tourBtn').addEventListener('click', () => tour.on ? endTour() : startTour());
$('#tourExit').addEventListener('click', endTour);
addEventListener('keydown', (e) => { if (e.key === 'Escape') endTour(); });

// ---------------- Scale readout & hint ----------------
// Distance ladder: km → M km → AU + light-time → (compressed) light-years.
// Beyond ~240 AU the scene compresses interstellar space; the ≈/* marks that.
// Blend from the neighborhood scale (1 ly = 1.2e7 units) to the galaxy scale (3e4).
const compressedLy = (units) => {
  const t = THREE.MathUtils.smoothstep(Math.log10(units), 8.65, 8.9);
  const scale = Math.exp(THREE.MathUtils.lerp(Math.log(1.2e7), Math.log(3e4), t));
  return units / scale;
};
const AU_KM = 149597870.7, LMIN_KM = 1.799e7, LHR_KM = 1.0794e9;
const fmtScale = (units) => {
  const km = units * 1000;
  if (km < 1e6) return Math.round(km).toLocaleString() + ' km';
  if (km < 0.1 * AU_KM) return (km / 1e6).toFixed(1) + 'M km';
  const au = km / AU_KM;
  if (au < 75) {
    const lmin = km / LMIN_KM;
    return (au < 10 ? au.toFixed(2) : au.toFixed(1)) + ' AU · ' + (lmin < 100 ? Math.round(lmin) + ' light-min' : (lmin / 60).toFixed(1) + ' light-hr');
  }
  if (au < 240) return Math.round(au) + ' AU · ' + Math.round(km / LHR_KM) + ' light-hr';
  const ly = compressedLy(units);
  if (ly < 20) return '≈ ' + ly.toFixed(1) + ' ly*';
  if (ly < 1500) return '≈ ' + Math.round(ly).toLocaleString() + ' ly*';
  return '≈ ' + (Math.round(ly / 100) * 100).toLocaleString() + ' ly*';
};
// cache HUD nodes + last-written values so a static frame does zero DOM work / string churn
const _hud = { date: $('#date'), alt: $('#alt'), scaleNote: $('#scaleNote') };
let _lastDateMs = NaN, _lastAltStr = '', _lastScaleOp = -1, _lastDU = -1, _lastFocusId = '';
App.onFrame = ({ dHelio, galT, conT }) => {
  updateLabels();
  updateConLabels(conT);
  updateFarLabels();
  // simMs only advances when playing/scrubbing — skip the Date()+string build on static frames
  const ms = Time.simMs;
  if (ms !== _lastDateMs) { _hud.date.textContent = fmtDate(ms); _lastDateMs = ms; }
  // Only rebuild the altitude string when it could actually change — building it every
  // frame (fmtScale + concatenation) is steady garbage that the GC has to sweep.
  const dU = Math.max(0, App.camDist() - registry[App.Focus.id].body.radius);
  if (Math.abs(dU - _lastDU) > Math.max(1, _lastDU * 1e-4) || App.Focus.id !== _lastFocusId) {
    _lastDU = dU; _lastFocusId = App.Focus.id;
    const altStr = fmtScale(dU) + (dU > 3.6e7 ? ' from ' : ' above ') + registry[App.Focus.id].body.name;
    if (altStr !== _lastAltStr) { _hud.alt.textContent = altStr; _lastAltStr = altStr; }
  }
  const scaleOp = galT > 0.05 ? 0.7 : 0;
  if (scaleOp !== _lastScaleOp) { _hud.scaleNote.style.opacity = scaleOp; _lastScaleOp = scaleOp; }

  // Orion spacecraft label + Artemis II mission HUD
  const A = App.Artemis;
  if (A && A.active) {
    const s = A.getState();
    if (missionHud.classList.contains('open')) {
      $('#mhPhase').textContent = phaseOf(s);
      $('#mhMet').textContent = fmtMET(s.met);
      $('#mhDist').textContent = fmtScale(s.distKm / 1000);
    }
    if (s.inWin) {
      _op.copy(App.three.helio.artemis).sub(App.three.helio[App.Focus.id]).project(camera);
      const vis = _op.z < 1 && _op.x > -1.1 && _op.x < 1.1 && _op.y > -1.1 && _op.y < 1.1 && App.Focus.id !== 'artemis';
      orionLabel.style.display = vis ? '' : 'none';
      if (vis) orionLabel.style.transform = `translate(${(_op.x * 0.5 + 0.5) * innerWidth}px, ${(-_op.y * 0.5 + 0.5) * innerHeight}px)`;
    } else orionLabel.style.display = 'none';
  } else {
    orionLabel.style.display = 'none';
  }
};
App.onFocusChange = () => {};

// ---------------- Constellation name labels ----------------
const conLabels = [];
{
  const anchors = App.three.world.constellations.labelAnchors;
  for (const a of anchors) {
    const el = document.createElement('div');
    el.className = 'conlabel';
    el.textContent = a.name;
    labelLayer.appendChild(el);
    conLabels.push({ el, dir: a.dir });
  }
}
const _cp = new THREE.Vector3();
function updateConLabels(conT) {
  const show = conT > 0.05;
  for (const c of conLabels) {
    if (!show) { c.el.style.display = 'none'; continue; }
    _cp.copy(c.dir).multiplyScalar(1e9).add(camera.position).project(camera);
    const vis = _cp.z < 1 && _cp.x > -1.05 && _cp.x < 1.05 && _cp.y > -1.05 && _cp.y < 1.05;
    c.el.style.display = vis ? '' : 'none';
    if (!vis) continue;
    c.el.style.opacity = (conT * 0.8).toFixed(2);
    c.el.style.transform = `translate(${(_cp.x * 0.5 + 0.5) * innerWidth}px, ${(-_cp.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}

renderTime();
setTimeout(() => $('#hint').classList.add('fade'), 7000);
$('#loading').classList.add('fade');
document.body.classList.add('loaded'); // reveal chrome that sits above the loading overlay (e.g. mobile menu FAB)
setTimeout(() => { $('#loading').style.display = 'none'; }, 1700); // hard-hide even if transitions are throttled

// initial cinematic: fly to Earth after a beat
setTimeout(() => select('earth', true), 1400);
