// Solar system data — real orbital elements (J2000), real radii.
// Units: 1 unit = 1000 km. Distances/sizes are TRUE ratio.
import * as THREE from './vendor/three.module.js';
import { JPL, planetPosition, moonGeocentric } from './ephemeris.js';

export const KM = 1 / 1000;                  // km -> units
export const AU = 149597870.7 * KM;          // astronomical unit in units
export const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
export const DAY_MS = 86400000;
const D2R = Math.PI / 180;

// a(AU), e, i, L0 (mean longitude), varpi (long. of perihelion), Omega (asc node) — degrees @ J2000
export const BODIES = [
  {
    id: 'sun', name: 'Sun', radius: 696340 * KM, rotH: 609.12, tilt: 7.25,
    type: 'star',
    facts: { 'Type': 'G2V main-sequence star', 'Diameter': '1,392,680 km', 'Surface temp': '5,505 °C', 'Age': '4.6 billion years', 'Mass': '99.86% of the solar system' },
    blurb: 'Every 1.5 millionths of its mass it converts to light each second — enough to power civilization for 500,000 years.'
  },
  {
    id: 'mercury', name: 'Mercury', radius: 2439.7 * KM, rotH: 1407.6, tilt: 0.03,
    a: 0.38710, e: 0.20563, i: 7.005, L0: 252.251, varpi: 77.456, Omega: 48.331, periodD: 87.969,
    facts: { 'Distance from Sun': '0.39 AU', 'Year': '88 Earth days', 'Day': '176 Earth days', 'Surface temp': '−173 to 427 °C', 'Moons': '0' },
    blurb: 'A day on Mercury lasts two of its years. Its cratered surface swings through the widest temperature range in the solar system.'
  },
  {
    id: 'venus', name: 'Venus', radius: 6051.8 * KM, rotH: -5832.5, tilt: 177.4,
    a: 0.72333, e: 0.00677, i: 3.395, L0: 181.980, varpi: 131.533, Omega: 76.680, periodD: 224.701,
    facts: { 'Distance from Sun': '0.72 AU', 'Year': '225 Earth days', 'Surface temp': '464 °C', 'Pressure': '92× Earth', 'Rotation': 'Retrograde' },
    blurb: 'Hotter than Mercury despite being farther out — a runaway greenhouse beneath unbroken sulfuric-acid clouds. It spins backwards.'
  },
  {
    id: 'earth', name: 'Earth', radius: 6371 * KM, rotH: 23.934, tilt: 23.44,
    a: 1.00000, e: 0.01671, i: 0.0, L0: 100.464, varpi: 102.937, Omega: 0.0, periodD: 365.256,
    facts: { 'Distance from Sun': '1 AU (149.6M km)', 'Year': '365.25 days', 'Surface': '71% ocean', 'Atmosphere': 'N₂ / O₂', 'Moons': '1' },
    blurb: 'The only world known to harbor life. From space, its night side glitters with the lights of eight billion people.'
  },
  {
    id: 'mars', name: 'Mars', radius: 3389.5 * KM, rotH: 24.623, tilt: 25.19,
    a: 1.52371, e: 0.09339, i: 1.850, L0: 355.447, varpi: 336.041, Omega: 49.559, periodD: 686.980,
    facts: { 'Distance from Sun': '1.52 AU', 'Year': '687 Earth days', 'Day': '24h 37m', 'Surface temp': '−63 °C avg', 'Moons': '2 (Phobos, Deimos)' },
    blurb: 'Home to Olympus Mons, a volcano three times the height of Everest, and Valles Marineris, a canyon as long as the United States.'
  },
  {
    id: 'jupiter', name: 'Jupiter', radius: 69911 * KM, rotH: 9.925, tilt: 3.13,
    a: 5.20289, e: 0.04839, i: 1.304, L0: 34.397, varpi: 14.728, Omega: 100.474, periodD: 4332.59,
    facts: { 'Distance from Sun': '5.20 AU', 'Year': '11.86 Earth years', 'Day': '9h 56m', 'Rings': 'Faint dust — main ring + 2 gossamer', 'Moons': '95 known' },
    blurb: 'The Great Red Spot is a storm wider than Earth that has raged for at least 360 years. Jupiter shields the inner planets from comets.'
  },
  {
    id: 'saturn', name: 'Saturn', radius: 58232 * KM, rotH: 10.656, tilt: 26.73,
    a: 9.53707, e: 0.05415, i: 2.489, L0: 49.944, varpi: 92.598, Omega: 113.662, periodD: 10759.22,
    facts: { 'Distance from Sun': '9.54 AU', 'Year': '29.4 Earth years', 'Rings': '282,000 km wide, ~10 m thick', 'Density': 'Would float in water', 'Moons': '146 known' },
    blurb: 'Its rings are 99% water ice — billions of fragments from house-sized to dust, in a sheet thinner than a city block is tall.'
  },
  {
    id: 'uranus', name: 'Uranus', radius: 25362 * KM, rotH: -17.24, tilt: 97.77,
    a: 19.18913, e: 0.04717, i: 0.773, L0: 313.238, varpi: 170.954, Omega: 74.017, periodD: 30688.5,
    facts: { 'Distance from Sun': '19.19 AU', 'Year': '84 Earth years', 'Axial tilt': '98° — rolls on its side', 'Rings': '13 narrow, charcoal-dark rings', 'Moons': '28 known' },
    blurb: 'Knocked sideways by an ancient collision, Uranus rolls around the Sun — each pole gets 42 years of daylight, then 42 of night.'
  },
  {
    id: 'neptune', name: 'Neptune', radius: 24622 * KM, rotH: 16.11, tilt: 28.32,
    a: 30.06992, e: 0.00859, i: 1.770, L0: 304.880, varpi: 44.965, Omega: 131.784, periodD: 60182,
    facts: { 'Distance from Sun': '30.07 AU', 'Year': '165 Earth years', 'Winds': '2,100 km/h — fastest known', 'Rings': '5 faint rings — Adams has bright arcs', 'Moons': '16 known' },
    blurb: 'So far away that it has completed just one orbit since its discovery. Its supersonic winds are the fastest in the solar system.'
  },
  {
    id: 'pluto', name: 'Pluto', radius: 1188.3 * KM, rotH: -153.29, tilt: 122.5,
    a: 39.48169, e: 0.24881, i: 17.142, L0: 238.929, varpi: 224.067, Omega: 110.303, periodD: 90560,
    facts: { 'Distance from Sun': '39.5 AU average', 'Year': '248 Earth years', 'Class': 'Dwarf planet', 'Heart': 'Tombaugh Regio — a nitrogen-ice glacier', 'Moons': '5 (Charon largest)' },
    blurb: 'A world of nitrogen glaciers and water-ice mountains. Its orbit is so stretched it sometimes swings inside Neptune\u2019s.'
  },
];

// Major moons — circular orbits (a in km, period in days)
export const MOONS = [
  { id: 'moon', name: 'Moon', parent: 'earth', radius: 1737.4 * KM, a: 384400 * KM, periodD: 27.322, tex: 'moon',
    facts: { 'Distance from Earth': '384,400 km', 'Orbit': '27.3 days', 'Gravity': '1/6 of Earth', 'Same face': 'Tidally locked' },
    blurb: 'The only other world humans have walked on. It stabilizes Earth\u2019s tilt — and our seasons.' },
  { id: 'iss', name: 'ISS', parent: 'earth', radius: 0.05 * KM, a: 6779 * KM, periodD: 0.06453, tex: 'iss', inc: 0.9006,
    since: Date.UTC(1998, 10, 20),  // first module (Zarya) launched 20 Nov 1998 — hide before this
    facts: { 'Altitude': '~408 km', 'Speed': '27,600 km/h', 'Orbit': '92.9 min — 16 sunrises a day', 'Inclination': '51.6°', 'Crewed': 'Continuously since Nov 2000', 'Size': '109 m across — a football field' },
    blurb: 'The largest structure humans have ever built in space. It laps the Earth every 93 minutes — fast enough to cross a continent in the time it takes to read this.' },
  { id: 'io', name: 'Io', parent: 'jupiter', radius: 1821.6 * KM, a: 421700 * KM, periodD: 1.769, tex: 'io',
    facts: { 'Volcanoes': '400+ active', 'Orbit': '1.8 days' }, blurb: 'The most volcanically active world in the solar system, kneaded by Jupiter\u2019s tides.' },
  { id: 'europa', name: 'Europa', parent: 'jupiter', radius: 1560.8 * KM, a: 671034 * KM, periodD: 3.551, tex: 'ice',
    facts: { 'Ocean': 'Subsurface, ~100 km deep', 'Orbit': '3.6 days' }, blurb: 'Beneath its cracked ice shell lies twice as much liquid water as all Earth\u2019s oceans.' },
  { id: 'ganymede', name: 'Ganymede', parent: 'jupiter', radius: 2634.1 * KM, a: 1070412 * KM, periodD: 7.155, tex: 'rocky',
    facts: { 'Size': 'Largest moon — bigger than Mercury', 'Orbit': '7.2 days' }, blurb: 'The only moon with its own magnetic field.' },
  { id: 'callisto', name: 'Callisto', parent: 'jupiter', radius: 2410.3 * KM, a: 1882709 * KM, periodD: 16.689, tex: 'rocky',
    facts: { 'Surface': 'Most cratered in the solar system', 'Orbit': '16.7 days' }, blurb: 'An ancient, battered ice ball — its surface is 4 billion years old.' },
  { id: 'titan', name: 'Titan', parent: 'saturn', radius: 2574.7 * KM, a: 1221870 * KM, periodD: 15.945, tex: 'titan',
    facts: { 'Atmosphere': 'Thicker than Earth\u2019s', 'Lakes': 'Liquid methane', 'Orbit': '15.9 days' }, blurb: 'The only moon with a dense atmosphere, and the only other world with rain, rivers and seas — of methane.' },
  { id: 'phobos', name: 'Phobos', parent: 'mars', radius: 11.3 * KM, a: 9376 * KM, periodD: 0.319, tex: 'rocky',
    facts: { 'Orbit': '7.7 hours — faster than Mars spins', 'Fate': 'Spiraling inward — doomed' }, blurb: 'Rises in the west and sets in the east, twice a Martian day. In ~50 million years it will shatter into a ring.' },
  { id: 'deimos', name: 'Deimos', parent: 'mars', radius: 6.2 * KM, a: 23463 * KM, periodD: 1.263, tex: 'rocky',
    facts: { 'Size': '12 km — likely a captured asteroid', 'Orbit': '30.3 hours' }, blurb: 'A tiny lumpy moonlet. From the Martian surface it looks like a bright, slow star.' },
  { id: 'mimas', name: 'Mimas', parent: 'saturn', radius: 198.2 * KM, a: 185539 * KM, periodD: 0.942, tex: 'ice',
    facts: { 'Crater': 'Herschel — a third of its diameter', 'Orbit': '22.6 hours' }, blurb: 'One giant impact crater gives it an uncanny resemblance to the Death Star.' },
  { id: 'enceladus', name: 'Enceladus', parent: 'saturn', radius: 252.1 * KM, a: 237948 * KM, periodD: 1.370, tex: 'ice',
    facts: { 'Geysers': '100+ jets of water ice', 'Albedo': 'Most reflective body known', 'Orbit': '1.4 days' }, blurb: 'Ice geysers at its south pole vent a buried ocean straight into space — a prime place to look for life.' },
  { id: 'tethys', name: 'Tethys', parent: 'saturn', radius: 531.1 * KM, a: 294619 * KM, periodD: 1.888, tex: 'ice',
    facts: { 'Canyon': 'Ithaca Chasma — 2,000 km long', 'Orbit': '1.9 days' }, blurb: 'Almost pure water ice, split by a canyon stretching three-quarters of the way around it.' },
  { id: 'dione', name: 'Dione', parent: 'saturn', radius: 561.4 * KM, a: 377396 * KM, periodD: 2.737, tex: 'ice',
    facts: { 'Wisps': 'Bright ice cliffs', 'Orbit': '2.7 days' }, blurb: 'Threaded with brilliant ice cliffs hundreds of meters tall.' },
  { id: 'rhea', name: 'Rhea', parent: 'saturn', radius: 763.8 * KM, a: 527108 * KM, periodD: 4.518, tex: 'ice',
    facts: { 'Size': 'Saturn\u2019s second-largest moon', 'Orbit': '4.5 days' }, blurb: 'A frozen, heavily cratered ice ball — possibly with its own faint ring.' },
  { id: 'iapetus', name: 'Iapetus', parent: 'saturn', radius: 734.5 * KM, a: 3560820 * KM, periodD: 79.32, tex: 'rocky',
    facts: { 'Two-tone': 'One side coal-dark, one snow-bright', 'Ridge': 'Equatorial wall 13 km high', 'Orbit': '79 days' }, blurb: 'A two-faced moon: one hemisphere dark as coal, the other bright as snow, with a mountain ridge wrapping its equator.' },
  { id: 'miranda', name: 'Miranda', parent: 'uranus', radius: 235.8 * KM, a: 129390 * KM, periodD: 1.413, tex: 'ice',
    facts: { 'Cliff': 'Verona Rupes — 20 km, tallest known', 'Orbit': '1.4 days' }, blurb: 'A patchwork world that looks shattered and reassembled — home to the tallest cliff in the solar system.' },
  { id: 'ariel', name: 'Ariel', parent: 'uranus', radius: 578.9 * KM, a: 191020 * KM, periodD: 2.520, tex: 'ice',
    facts: { 'Surface': 'Youngest of Uranus\u2019s moons', 'Orbit': '2.5 days' }, blurb: 'The brightest of Uranus\u2019s moons, scored by canyons that once flowed with icy slush.' },
  { id: 'umbriel', name: 'Umbriel', parent: 'uranus', radius: 584.7 * KM, a: 266000 * KM, periodD: 4.144, tex: 'rocky',
    facts: { 'Albedo': 'Darkest of the major moons', 'Orbit': '4.1 days' }, blurb: 'Ancient and dark, with one mysterious bright ring of frost in crater Wunda.' },
  { id: 'titania', name: 'Titania', parent: 'uranus', radius: 788.4 * KM, a: 435910 * KM, periodD: 8.706, tex: 'ice',
    facts: { 'Size': 'Largest moon of Uranus', 'Orbit': '8.7 days' }, blurb: 'Uranus\u2019s largest moon, etched with enormous fault canyons.' },
  { id: 'oberon', name: 'Oberon', parent: 'uranus', radius: 761.4 * KM, a: 583520 * KM, periodD: 13.46, tex: 'rocky',
    facts: { 'Surface': 'Old, dark, cratered', 'Orbit': '13.5 days' }, blurb: 'The outermost of Uranus\u2019s big five — all named for Shakespeare.' },
  { id: 'triton', name: 'Triton', parent: 'neptune', radius: 1353.4 * KM, a: 354759 * KM, periodD: -5.877, tex: 'ice',
    facts: { 'Orbit': 'Backwards — a captured Kuiper Belt object', 'Geysers': 'Nitrogen, 8 km tall', 'Temp': '−235 °C' }, blurb: 'Orbits Neptune backwards — a captured Kuiper Belt world with nitrogen geysers, slowly spiraling to its doom.' },
  { id: 'charon', name: 'Charon', parent: 'pluto', radius: 606 * KM, a: 19591 * KM, periodD: 6.387, tex: 'rocky', colorId: 'charonColor', colorFile: 'charon_color.jpg',
    facts: { 'Size': 'Half of Pluto — a double planet', 'Locked': 'Mutually tidally locked', 'Orbit': '6.4 days' }, blurb: 'So large relative to Pluto that the two orbit a point in open space — the nearest thing to a double planet.' },
  { id: 'hyperion', name: 'Hyperion', parent: 'saturn', radius: 135 * KM, a: 1481009 * KM, periodD: 21.28, tex: 'sand',
    facts: { 'Shape': 'Sponge-like, porous — 40% empty', 'Rotation': 'Chaotic — no fixed day', 'Orbit': '21.3 days' },
    blurb: 'A battered, porous body that tumbles chaotically as it orbits — you could never predict which way its day would point.' },
  { id: 'phoebe', name: 'Phoebe', parent: 'saturn', radius: 106.5 * KM, a: 12952000 * KM, periodD: -550.31, tex: 'dark',
    facts: { 'Orbit': 'Backwards (retrograde), 550 days', 'Origin': 'A captured outer-system object', 'Visited': 'Cassini, 2004' },
    blurb: 'A dark, far-flung moon orbiting Saturn the wrong way — almost certainly a captured Centaur from the outer solar system.' },
  { id: 'proteus', name: 'Proteus', parent: 'neptune', radius: 210 * KM, a: 117647 * KM, periodD: 1.122, tex: 'dark',
    facts: { 'Albedo': 'Darker than soot', 'Shape': 'Box-like — near the limit before rounding', 'Orbit': '1.1 days' },
    blurb: 'One of the darkest objects in the solar system, and about as large as a body can get while still being lumpy rather than round.' },
  { id: 'nereid', name: 'Nereid', parent: 'neptune', radius: 170 * KM, a: 5513818 * KM, periodD: 360.13, tex: 'rocky',
    facts: { 'Orbit': 'Wildly eccentric — 1.4M to 9.7M km', 'Year': '360 days', 'Discovered': 'Kuiper, 1949' },
    blurb: 'Its stretched orbit swings it seven times closer at one end than the other — one of the most eccentric paths of any moon.' },
  { id: 'nix', name: 'Nix', parent: 'pluto', radius: 23 * KM, a: 48694 * KM, periodD: 24.85, tex: 'ice',
    facts: { 'Rotation': 'Chaotic — tumbles unpredictably', 'Orbit': '24.9 days', 'Discovered': '2005' },
    blurb: 'A tiny moon of Pluto that tumbles end over end so chaotically its sunrise could come at any time.' },
  { id: 'hydra', name: 'Hydra', parent: 'pluto', radius: 25 * KM, a: 64738 * KM, periodD: 38.20, tex: 'ice',
    facts: { 'Size': 'Pluto\u2019s outermost moon', 'Rotation': 'Chaotic tumble', 'Orbit': '38.2 days' },
    blurb: 'The outermost of Pluto\u2019s little moons, a bright chip of water ice tumbling chaotically through the system.' },
  { id: 'kerberos', name: 'Kerberos', parent: 'pluto', radius: 9 * KM, a: 57783 * KM, periodD: 32.17, tex: 'dark',
    facts: { 'Shape': 'Double-lobed — two merged bodies', 'Rotation': 'Chaotic tumble', 'Orbit': '32.2 days', 'Discovered': '2011' },
    blurb: 'A tiny, dark double-lobed moonlet between Nix and Hydra — likely two smaller bodies that gently stuck together.' },
  { id: 'styx', name: 'Styx', parent: 'pluto', radius: 6 * KM, a: 42656 * KM, periodD: 20.16, tex: 'ice',
    facts: { 'Size': 'Smallest of Pluto\u2019s moons', 'Rotation': 'Chaotic tumble', 'Orbit': '20.2 days', 'Discovered': '2012' },
    blurb: 'The faintest and innermost of Pluto\u2019s little moons, an irregular sliver of ice found just before New Horizons arrived.' },
  { id: 'janus', name: 'Janus', parent: 'saturn', radius: 89.5 * KM, a: 151460 * KM, periodD: 0.695, tex: 'ice',
    facts: { 'Co-orbital': 'Swaps orbits with Epimetheus', 'Swap': 'Every ~4 years', 'Orbit': '16.7 hours' },
    blurb: 'Shares its orbit with Epimetheus — every four years the two nearly collide, trade speeds, and swap paths in a slow gravitational dance.' },
  { id: 'epimetheus', name: 'Epimetheus', parent: 'saturn', radius: 58.1 * KM, a: 151410 * KM, periodD: 0.694, tex: 'rocky',
    facts: { 'Co-orbital': 'Swaps orbits with Janus', 'Separation': 'Just 50 km apart on average', 'Orbit': '16.7 hours' },
    blurb: 'The smaller half of Saturn\u2019s orbit-swapping duo — it and Janus take turns on the inner and outer track without ever colliding.' },
];

// Comets — same Keplerian fields as planets (high-eccentricity orbits)
export const COMETS = [
  { id: 'halley', name: '1P/Halley', radius: 5.5 * KM, a: 17.834, e: 0.96714, i: 162.262, L0: 236.17, varpi: 169.75, Omega: 58.42, periodD: 27509,
    facts: { 'Period': '75 years', 'Last perihelion': '1986 · next 2061', 'Nucleus': '15 × 8 km — darker than coal', 'Orbit': 'Retrograde' },
    blurb: 'The most famous comet — recorded by astronomers since 240 BC. Each pass sheds the dust that becomes the Orionid meteor shower.' },
  { id: 'encke', name: '2P/Encke', radius: 2.4 * KM, a: 2.2178, e: 0.8483, i: 11.78, L0: 85.93, varpi: 161.12, Omega: 334.57, periodD: 1207,
    facts: { 'Period': '3.3 years — shortest known', 'Shower': 'Source of the Taurid meteors', 'Nucleus': '4.8 km' },
    blurb: 'The fastest-returning comet, swinging inside Mercury\u2019s orbit every 3.3 years. Its debris lights up the Taurid meteor shower.' },
  { id: 'halebopp', name: 'C/1995 O1 Hale–Bopp', radius: 30 * KM, a: 186.0, e: 0.99492, i: 89.43, L0: 53.45, varpi: 53.06, Omega: 282.47, periodD: 926600,
    facts: { 'Period': '~2,500 years', 'Great Comet': 'Visible to the naked eye for 18 months', 'Nucleus': '60 km — unusually huge' },
    blurb: 'The Great Comet of 1997, seen by more people than any comet in history. It won\u2019t return until the year ~4385.' },
];

// Minor planets — major asteroids & Kuiper-Belt/scattered-disc dwarf planets.
// Same fixed-element Keplerian solve as comets (a in AU, angles in degrees, period in days).
export const MINORS = [
  // ---- Main asteroid belt (2.1–3.3 AU) ----
  { id: 'ceres', name: 'Ceres', radius: 473 * KM, a: 2.7658, e: 0.0785, i: 10.594, L0: 162.0, varpi: 153.91, Omega: 80.31, periodD: 1681.6, rotH: 9.07, tex: 'dark', kind: 'dwarf', region: 'Main Belt', realMap: 'ceres_color.jpg',
    facts: { 'Class': 'Dwarf planet — largest asteroid', 'Distance': '2.77 AU', 'Year': '4.6 Earth years', 'Water': 'Ice mantle + briny deposits' },
    blurb: 'The largest body in the asteroid belt and the only dwarf planet inside Neptune — its bright spots are salt left by briny water.' },
  { id: 'vesta', name: 'Vesta', radius: 262.7 * KM, a: 2.3617, e: 0.0889, i: 7.142, L0: 308.0, varpi: 255.01, Omega: 103.81, periodD: 1325.8, rotH: 5.34, tex: 'rocky', kind: 'asteroid', region: 'Main Belt', shape: { seed: 11, amp: 0.17, scale: [1.0, 0.84, 0.93] }, palette: ['#6b6258', '#857b6e', '#a89c8b', '#c4b8a4', '#8f8576'], realMap: 'vesta_color.jpg',
    facts: { 'Class': 'Second-largest asteroid', 'Distance': '2.36 AU', 'Surface': 'Basaltic — once molten', 'Visited': 'Dawn, 2011–12' },
    blurb: 'The brightest asteroid, occasionally visible to the naked eye. A giant south-pole crater flings meteorites all the way to Earth.' },
  { id: 'pallas', name: 'Pallas', radius: 256 * KM, a: 2.7725, e: 0.2299, i: 34.84, L0: 96.0, varpi: 123.92, Omega: 173.02, periodD: 1686.0, rotH: 7.81, tex: 'rocky', kind: 'asteroid', region: 'Main Belt', shape: { seed: 23, amp: 0.21, scale: [1.05, 0.9, 0.85] }, palette: ['#41454a', '#565b61', '#6e747b', '#868d94', '#5a6066'],
    facts: { 'Class': 'Third-largest asteroid', 'Distance': '2.77 AU', 'Orbit': 'Steeply tilted — 34.8°', 'Shape': 'Battered, irregular' },
    blurb: 'The most steeply inclined of the big asteroids — its tilted, scarred orbit keeps it apart from the rest of the belt.' },
  { id: 'hygiea', name: 'Hygiea', radius: 217 * KM, a: 3.1415, e: 0.1125, i: 3.831, L0: 210.0, varpi: 235.50, Omega: 283.20, periodD: 2031.0, rotH: 13.83, tex: 'dark', kind: 'asteroid', region: 'Main Belt', shape: { seed: 37, amp: 0.12, scale: [1.0, 0.95, 0.93] }, palette: ['#221f1c', '#2e2a25', '#3a352e', '#454038', '#2c2823'],
    facts: { 'Class': 'Fourth-largest asteroid', 'Distance': '3.14 AU', 'Shape': 'Nearly round — a dwarf-planet candidate', 'Type': 'Dark, carbon-rich' },
    blurb: 'The largest of the dark carbonaceous asteroids — round enough that it may quietly qualify as a dwarf planet.' },
  // ---- Kuiper Belt & scattered disc dwarf planets ----
  { id: 'eris', name: 'Eris', radius: 1163 * KM, a: 67.864, e: 0.43607, i: 44.04, L0: 205.0, varpi: 187.55, Omega: 35.95, periodD: 203600, rotH: 25.9, tex: 'ice', kind: 'dwarf', region: 'Scattered Disc',
    facts: { 'Class': 'Dwarf planet — most massive known', 'Distance': '38–98 AU', 'Year': '557 Earth years', 'Moon': 'Dysnomia' },
    blurb: 'Slightly heavier than Pluto, its discovery is what got Pluto reclassified. A frozen world of methane ice at the solar system\u2019s edge.' },
  { id: 'makemake', name: 'Makemake', radius: 715 * KM, a: 45.43, e: 0.16126, i: 28.98, L0: 168.0, varpi: 16.22, Omega: 79.62, periodD: 111867, rotH: 22.83, tex: 'sand', kind: 'dwarf', region: 'Kuiper Belt',
    facts: { 'Class': 'Dwarf planet', 'Distance': '38–53 AU', 'Year': '306 Earth years', 'Surface': 'Frozen methane — reddish' },
    blurb: 'A reddish, methane-frosted dwarf planet named for the Rapa Nui creator god — bright enough to have been found from its reflected light.' },
  { id: 'haumea', name: 'Haumea', radius: 780 * KM, a: 43.13, e: 0.19642, i: 28.21, L0: 215.0, varpi: 1.16, Omega: 122.16, periodD: 103660, rotH: 3.92, tex: 'ice', kind: 'dwarf', region: 'Kuiper Belt', shape: { seed: 5, amp: 0.04, ellipsoid: [1.5, 0.66, 1.08] },
    facts: { 'Class': 'Dwarf planet', 'Spin': '3.9 hours — fastest large body', 'Shape': 'Egg-shaped from its spin', 'Rings': 'Yes — a faint ring + 2 moons' },
    blurb: 'Spins so fast it\u2019s stretched into an egg — a frozen dwarf planet with its own ring and two small moons.' },
  { id: 'gonggong', name: 'Gonggong', radius: 615 * KM, a: 67.38, e: 0.5024, i: 30.63, L0: 291.0, varpi: 184.46, Omega: 336.86, periodD: 202250, rotH: 22.4, tex: 'rocky', kind: 'dwarf', region: 'Scattered Disc',
    facts: { 'Class': 'Dwarf-planet candidate', 'Distance': '34–101 AU', 'Year': '554 Earth years', 'Surface': 'Dark red — methane frost', 'Moon': 'Xiangliu' },
    blurb: 'A dark red, slowly tumbling world far out in the scattered disc, named for a Chinese water god — one of the largest unvisited bodies.' },
  { id: 'quaoar', name: 'Quaoar', radius: 545 * KM, a: 43.69, e: 0.04, i: 7.99, L0: 290.0, varpi: 336.30, Omega: 188.80, periodD: 105495, rotH: 17.68, tex: 'rocky', kind: 'dwarf', region: 'Kuiper Belt',
    facts: { 'Class': 'Dwarf-planet candidate', 'Distance': '42–45 AU', 'Year': '289 Earth years', 'Rings': 'A ring where none should exist', 'Moon': 'Weywot' },
    blurb: 'A Kuiper-Belt world that defies the rules — it holds onto a ring far outside the distance where one should be possible.' },
  { id: 'orcus', name: 'Orcus', radius: 458 * KM, a: 39.42, e: 0.2271, i: 20.59, L0: 182.0, varpi: 340.90, Omega: 268.50, periodD: 90550, rotH: 10.5, tex: 'ice', kind: 'dwarf', region: 'Kuiper Belt',
    facts: { 'Class': 'Dwarf-planet candidate', 'Distance': '30–48 AU', 'Year': '248 Earth years', 'Nickname': 'The anti-Pluto', 'Moon': 'Vanth' },
    blurb: 'Nicknamed the anti-Pluto: it shares Pluto\u2019s orbit and period but always sits on the opposite side of the Sun.' },
];

// ---- Orbital mechanics ----
// Planets use the JPL rate-based elements (accurate any date, past or future);
// comets fall back to the fixed-element Keplerian solve below.
export function bodyPosition(body, dateMs, out) {
  out = out || new THREE.Vector3();
  if (!body.a) return out.set(0, 0, 0); // sun
  if (JPL[body.id]) return planetPosition(body.id, dateMs, out);
  const d = (dateMs - J2000) / DAY_MS;
  const n = 360 / body.periodD;                       // deg/day
  let M = (body.L0 - body.varpi + n * d) * D2R;       // mean anomaly
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = body.e > 0.8 ? Math.PI : M;        // Newton-Raphson (handles comet eccentricities)
  for (let k = 0; k < 24; k++) {
    const d = (E - body.e * Math.sin(E) - M) / (1 - body.e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-8) break;
  }
  const a = body.a * AU;
  const xp = a * (Math.cos(E) - body.e);
  const yp = a * Math.sqrt(1 - body.e * body.e) * Math.sin(E);
  const w = (body.varpi - body.Omega) * D2R, O = body.Omega * D2R, inc = body.i * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(inc), si = Math.sin(inc);
  const X = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
  const Y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
  const Z = (sw * si) * xp + (cw * si) * yp;
  return out.set(X, Z, -Y); // ecliptic XY -> three.js XZ plane, +Y up
}

export function moonPosition(moon, dateMs, out) {
  out = out || new THREE.Vector3();
  // Earth's Moon: real Meeus lunar theory (varying distance + latitude).
  if (moon.id === 'moon') return moonGeocentric(dateMs, out);
  // Other moons: illustrative circular orbits (not date-accurate ephemerides).
  const d = (dateMs - J2000) / DAY_MS;
  const ang = (d / moon.periodD) * 2 * Math.PI + (moon.a % 7); // phase offset
  out.set(Math.cos(ang) * moon.a, 0, -Math.sin(ang) * moon.a);
  // inclined orbits (e.g. the ISS's 51.6°): rotate the flat ring about the X axis
  if (moon.inc) { const c = Math.cos(moon.inc), s = Math.sin(moon.inc), y = out.y, z = out.z; out.y = y * c - z * s; out.z = y * s + z * c; }
  return out;
}

// Notable dates — jump the simulation to the exact moment and fly to the body.
// `target` = body to frame; `dist` = camera distance in body radii, OR `auAbs` =
// absolute distance in AU (for wide configurations). `when` = UTC instant.
// `cat` groups events into sections in the menu.
// Planet & Moon geometry on these dates is computed, not staged — it's the real sky.
// (Spacecraft aren't modelled — mission events frame the true configuration of the
//  target world on that date.)
export const EVENTS = [
  // ---- Eclipses ----
  { cat: 'Eclipses', name: 'Total Solar Eclipse', when: Date.UTC(2027, 7, 2, 10, 7), target: 'earth', dist: 9,
    sub: '2 Aug 2027', blurb: 'The longest total eclipse on land this century — 6m23s of totality over Luxor, Egypt.' },
  { cat: 'Eclipses', name: 'Total Solar Eclipse', when: Date.UTC(2026, 7, 12, 17, 46), target: 'earth', dist: 9,
    sub: '12 Aug 2026', blurb: 'The first total eclipse over Europe since 1999 — sweeping across Greenland, Iceland and Spain.' },
  { cat: 'Eclipses', name: 'Total Solar Eclipse', when: Date.UTC(2024, 3, 8, 18, 18), target: 'earth', dist: 9,
    sub: '8 Apr 2024', blurb: 'The Moon\u2019s shadow sweeps from Mexico across the United States to Canada. New Moon, dead-centre between Earth and Sun.' },
  { cat: 'Eclipses', name: 'Great American Eclipse', when: Date.UTC(2017, 7, 21, 18, 26), target: 'earth', dist: 9,
    sub: '21 Aug 2017', blurb: 'Totality crosses the entire United States coast to coast for the first time since 1918.' },
  { cat: 'Eclipses', name: 'Longest Eclipse of the Century', when: Date.UTC(2009, 6, 22, 2, 35), target: 'earth', dist: 9,
    sub: '22 Jul 2009', blurb: '6 minutes 39 seconds of totality over Asia and the Pacific — the longest until 2132.' },
  { cat: 'Eclipses', name: 'Total Lunar Eclipse', when: Date.UTC(2025, 2, 14, 6, 59), target: 'moon', dist: 6,
    sub: '14 Mar 2025', blurb: 'A \u201cBlood Moon\u201d \u2014 the full Moon turns deep red inside Earth\u2019s shadow.' },
  { cat: 'Eclipses', name: 'Longest Lunar Eclipse', when: Date.UTC(2018, 6, 27, 20, 22), target: 'moon', dist: 6,
    sub: '27 Jul 2018', blurb: 'The longest total lunar eclipse of the century \u2014 1h43m, with Mars at its closest in 15 years nearby.' },

  // ---- Conjunctions & Alignments ----
  { cat: 'Conjunctions & Alignments', name: 'Planetary Alignment', when: Date.UTC(2025, 0, 25, 0, 0), target: 'sun', auAbs: 3.4,
    sub: '25 Jan 2025', blurb: 'Six planets gather on one side of the Sun \u2014 Venus, Mars, Jupiter, Saturn, Uranus and Neptune strung across the evening sky.' },
  { cat: 'Conjunctions & Alignments', name: 'Great Conjunction', when: Date.UTC(2020, 11, 21, 18, 22), target: 'jupiter', auAbs: 5.2,
    sub: '21 Dec 2020', blurb: 'Jupiter and Saturn pass a tenth of a degree apart in the sky \u2014 their closest meeting since 1623. The \u201cChristmas Star.\u201d' },
  { cat: 'Conjunctions & Alignments', name: 'Grand Alignment', when: Date.UTC(2000, 4, 5, 8, 0), target: 'sun', auAbs: 10,
    sub: '5 May 2000', blurb: 'Mercury, Venus, Mars, Jupiter and Saturn line up on the far side of the Sun within a 26\u00b0 span \u2014 with the Sun and Moon joining in.' },

  // ---- Transits & Oppositions ----
  { cat: 'Transits & Oppositions', name: 'Transit of Venus', when: Date.UTC(2012, 5, 6, 1, 30), target: 'earth', dist: 14,
    sub: '6 Jun 2012', blurb: 'Venus crosses the face of the Sun as a black dot \u2014 the last such transit until 2117.' },
  { cat: 'Transits & Oppositions', name: 'Transit of Mercury', when: Date.UTC(2019, 10, 11, 15, 20), target: 'earth', dist: 14,
    sub: '11 Nov 2019', blurb: 'Mercury\u2019s tiny silhouette glides across the Sun \u2014 the next isn\u2019t until 2032.' },
  { cat: 'Transits & Oppositions', name: 'Mars Closest Approach', when: Date.UTC(2003, 7, 27, 9, 51), target: 'mars', dist: 5,
    sub: '27 Aug 2003', blurb: 'Mars comes within 55.8 million km of Earth \u2014 the closest in nearly 60,000 years.' },
  { cat: 'Transits & Oppositions', name: 'Mars at Opposition', when: Date.UTC(2020, 9, 13, 23, 26), target: 'mars', dist: 5,
    sub: '13 Oct 2020', blurb: 'Mars sits directly opposite the Sun \u2014 biggest and brightest of the decade.' },

  // ---- Comets ----
  { cat: 'Comets', name: 'Halley\u2019s Comet Perihelion', when: Date.UTC(1986, 1, 9, 0, 0), target: 'halley', auAbs: 0.05,
    sub: '9 Feb 1986', blurb: 'Humanity\u2019s most famous comet swings closest to the Sun \u2014 met by a fleet of five spacecraft.' },
  { cat: 'Comets', name: 'Halley\u2019s 1910 Apparition', when: Date.UTC(1910, 3, 20, 0, 0), target: 'halley', auAbs: 0.05,
    sub: '20 Apr 1910', blurb: 'Earth passed through Halley\u2019s tail; the comet blazed brighter than the stars and gripped the world.' },
  { cat: 'Comets', name: 'Halley\u2019s Return', when: Date.UTC(2061, 6, 28, 0, 0), target: 'halley', auAbs: 0.05,
    sub: '28 Jul 2061', blurb: 'Halley\u2019s next perihelion \u2014 the comet returns to the inner solar system. Mark your calendar.' },
  { cat: 'Comets', name: 'Hale\u2013Bopp Perihelion', when: Date.UTC(1997, 3, 1, 0, 0), target: 'halebopp', auAbs: 0.05,
    sub: '1 Apr 1997', blurb: 'The Great Comet of 1997 rounds the Sun, naked-eye visible for a record 18 months.' },

  // ---- Missions & Landings ----
  { cat: 'Missions & Landings', name: 'Apollo 11 Moon Landing', when: Date.UTC(1969, 6, 20, 20, 17), target: 'moon', dist: 6,
    sub: '20 Jul 1969', blurb: 'Humanity\u2019s first steps on another world \u2014 the Moon shown where it rode in the sky that day.' },
  { cat: 'Missions & Landings', name: 'Voyager 1 at Jupiter', when: Date.UTC(1979, 2, 5, 12, 5), target: 'jupiter', dist: 4.5,
    sub: '5 Mar 1979', blurb: 'Voyager 1 reveals the Great Red Spot in motion and the erupting volcanoes of Io.' },
  { cat: 'Missions & Landings', name: 'Voyager 2 at Neptune', when: Date.UTC(1989, 7, 25, 3, 56), target: 'neptune', dist: 5,
    sub: '25 Aug 1989', blurb: 'The only spacecraft ever to visit Neptune \u2014 the final world of the Grand Tour.' },
  { cat: 'Missions & Landings', name: 'Cassini Arrives at Saturn', when: Date.UTC(2004, 6, 1, 2, 48), target: 'saturn', dist: 6,
    sub: '1 Jul 2004', blurb: 'Threading the rings, Cassini begins 13 years orbiting Saturn and its moons.' },
  { cat: 'Missions & Landings', name: 'New Horizons at Pluto', when: Date.UTC(2015, 6, 14, 11, 49), target: 'pluto', dist: 6,
    sub: '14 Jul 2015', blurb: 'After a 9-year, 5-billion-km journey, the first spacecraft to visit Pluto makes its closest approach.' },
  { cat: 'Missions & Landings', name: 'Perseverance Lands on Mars', when: Date.UTC(2021, 1, 18, 20, 55), target: 'mars', dist: 5,
    sub: '18 Feb 2021', blurb: 'The rover and the Ingenuity helicopter touch down in Jezero Crater.' },

  // ---- Discoveries ----
  { cat: 'Discoveries', name: 'Uranus Discovered', when: Date.UTC(1781, 2, 13, 22, 0), target: 'uranus', dist: 5,
    sub: '13 Mar 1781', blurb: 'William Herschel finds the first planet ever discovered with a telescope \u2014 shown where it sat that night.' },
  { cat: 'Discoveries', name: 'Neptune Discovered', when: Date.UTC(1846, 8, 23, 23, 0), target: 'neptune', dist: 5,
    sub: '23 Sep 1846', blurb: 'Predicted by mathematics, found the same night within 1\u00b0 of where the equations said it would be.' },
  { cat: 'Discoveries', name: 'Pluto Discovered', when: Date.UTC(1930, 1, 18, 4, 0), target: 'pluto', dist: 6,
    sub: '18 Feb 1930', blurb: 'Clyde Tombaugh spots Pluto on photographic plates after a year-long search.' },
];

// Tour stops: id, camera distance (× body radius), caption
export const TOUR = [
  { id: 'sun', dist: 6, text: 'The Sun — 99.86% of everything here. Its light takes 8 minutes to reach Earth, 4 hours to reach Neptune.' },
  { id: 'mercury', dist: 5, text: 'Mercury — a scorched, cratered world where a single day lasts two of its years.' },
  { id: 'venus', dist: 5, text: 'Venus — Earth\u2019s evil twin. 464 °C under permanent acid clouds, spinning slowly backwards.' },
  { id: 'earth', dist: 4.5, text: 'Earth — the pale blue dot. Watch the night side glitter with city lights.' },
  { id: 'moon', dist: 6, text: 'The Moon — locked face-to-face with Earth, a quarter-million miles out.' },
  { id: 'mars', dist: 5, text: 'Mars — rust-red deserts, polar ice, and the tallest volcano in the solar system.' },
  { id: 'jupiter', dist: 4.5, text: 'Jupiter — a failed star with 95 moons. The Great Red Spot could swallow Earth whole.' },
  { id: 'saturn', dist: 6, text: 'Saturn — its rings span 282,000 km but are barely 10 meters thick.' },
  { id: 'enceladus', dist: 8, text: 'Enceladus — ice geysers vent a buried ocean into space. One of the best places to look for life.' },
  { id: 'uranus', dist: 5, text: 'Uranus — knocked on its side, it rolls around the Sun like a barrel.' },
  { id: 'neptune', dist: 5, text: 'Neptune — supersonic winds at the edge of the planetary system.' },
  { id: 'triton', dist: 7, text: 'Triton — Neptune’s big moon orbits backwards: a captured Kuiper Belt world.' },
  { id: 'pluto', dist: 6, text: 'Pluto — nitrogen glaciers and ice mountains, 40 times farther from the Sun than Earth.' },
  { id: 'halley', dist: 4000, text: 'Halley’s Comet — humanity’s clock. Every 75 years it falls sunward and grows its tail.' },
  { id: 'sun', dist: 18000, text: 'Pulling back… every planet orbit visible at true scale. Notice how empty space really is.' },
  { id: 'sun', dist: 2200000, text: 'The Milky Way — 200 billion suns. Ours is one faint spark, two-thirds of the way out an arm.' },
  { id: 'earth', dist: 5, text: 'And back home. Click any planet to explore on your own.' },
];
