// TALON STRIKE — configuration. One place for every tuning number.
export const CFG = {
  game: {
    title: 'TALON STRIKE',
    squadron: 'TALON SQUADRON',
    callsign: 'TALON-1',
    jetName: 'T-7 TALON',
    enemyFaction: 'CRIMSON WING',
  },
  world: {
    size: 12000,          // arena is size x size metres, centred on (0,0)
    seaLevel: 2,          // water plane height
    seaStartZ: 3800,      // terrain drops to sea south of this z
    maxHill: 280,
    home: { x: 0, y: 520, z: 900 }, // player spawn, heading north (-z)
  },
  player: {
    minSpeed: 62,         // m/s — below this the jet stalls
    maxSpeed: 275,        // m/s at full throttle
    cruiseThrottle: 0.62,
    accel: 55,            // m/s^2 towards target speed
    pitchRate: 0.8,      // rad/s at full stick
    rollRate: 1.9,        // rad/s at full stick
    turnRate: 0.85,       // yaw rad/s at full bank
    hull: 100,
    fuel: 100,
    fuelDrain: 0.08,      // %/s at cruise
    fuelDrainBoost: 0.08, // extra %/s at full throttle
    missiles: 6,
    gunHeatPerShot: 4.5,
    gunCoolRate: 42,      // heat/s
    gunFireRate: 16,      // shots/s
    gunDamage: 34,
    gunRange: 950,
    lockTime: 1.0,        // seconds to lock a missile
    lockAngle: 0.49,      // rad (~28 deg) off-nose cone
    lockRange: 1300,
    missileDamage: 120,
    missileSpeed: 430,
    terrainHitDamage: 30,
  },
  enemy: {
    hp: 100,
    aceHp: 260,
    speedMin: 150,
    speedMax: 225,
    fireRange: 700,
    fireAngle: 0.52,
    burstShots: 4,
    burstGap: 0.11,
    burstCooldown: 2.6,
    bulletDamage: 4,
    evadeTime: 2.2,
  },
  waves: [
    { name: 'FIRST CONTACT', count: 3, ace: false },
    { name: 'RIVER AMBUSH', count: 4, ace: false },
    { name: 'STORM FRONT', count: 5, ace: false },
    { name: 'CRIMSON TIDE', count: 6, ace: false },
    { name: 'ACE HUNT', count: 7, ace: true },
  ],
  score: {
    gunKill: 100,
    missileKill: 150,
    aceKill: 500,
    ring: 50,
    waveBonus: (w) => 200 + 100 * w,
  },
  rings: [
    { x: -600, y: 420, z: -600 },
    { x: 900, y: 520, z: -1600 },
    { x: -1100, y: 460, z: -2600 },
    { x: 300, y: 600, z: -3600 },
    { x: -1500, y: 380, z: -1200 },
    { x: 1400, y: 480, z: -3000 },
  ],
  quality: {
    // post: golden-hour post level — 0 off, 1 reduced bloom + light rays,
    // 2 full bloom + god rays. The FPS auto step-down sheds post first.
    // pixelRatio caps the render resolution against the screen's density:
    // at 1.0 a phone renders at CSS size and upscales ~2.5x, which is why
    // the jet looked blurry on MEDIUM. MEDIUM now renders at 1.5x.
    low:    { pixelRatio: 0.75, clouds: 14, particles: 0.4, shadows: false, streaks: false, post: 0 },
    medium: { pixelRatio: 1.5,  clouds: 26, particles: 0.7, shadows: false, streaks: true,  post: 1 },
    high:   { pixelRatio: 2.0,  clouds: 40, particles: 1.0, shadows: true,  streaks: true,  post: 2 },
  },
};

export const ENEMY_NAMES = {
  vulture: ['VULTURE-1', 'VULTURE-2', 'VULTURE-3', 'VULTURE-4'],
  cobra: ['COBRA-1', 'COBRA-2', 'COBRA-3'],
  raven: ['RAVEN-1', 'RAVEN-2', 'RAVEN-3'],
  jackal: ['JACKAL-1', 'JACKAL-2'],
  ghost: ['GHOST-1'],
};
export const ACE_NAME = 'CRIMSON ACE';
