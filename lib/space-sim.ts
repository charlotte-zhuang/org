export type SpaceSimConfig = {
  /** Viewport width in CSS pixels. */
  width: number;
  /** Viewport height in CSS pixels. */
  height: number;
  /** Distance between dot home positions. */
  gridSpacing?: number;
  /** Dot pull strength; a dot's target displacement is `dotPull / (r² + dotSoftening²)`. */
  dotPull?: number;
  /** Softening length that keeps the dot pull finite at `r = 0`. */
  dotSoftening?: number;
  /** Cap on how far a dot may sit from its home. */
  dotMaxDisplacement?: number;
  /** Per-second rate at which a dot's displacement relaxes toward its target. */
  dotRelaxRate?: number;
  /** Star pool size — the most stars alive at once. */
  starCount?: number;
  /** Mean seconds between star spawns (jittered ±50%). */
  starSpawnSeconds?: number;
  /** Launch speed in px/s. */
  starSpeed?: number;
  /** Hard cap on star speed in px/s. */
  starMaxSpeed?: number;
  /** Star pull strength; acceleration is `starPull · Δ / (r² + starSoftening²)^(3/2)`. */
  starPull?: number;
  /** Softening length that keeps star acceleration finite near the pointer. */
  starSoftening?: number;
  /** Past positions remembered per star for its trail. */
  starTrailLength?: number;
  /** Distance from the pointer at which a star crashes. */
  crashRadius?: number;
  /** Particles emitted per crash. */
  particlesPerExplosion?: number;
  /** Particle lifetime in seconds. */
  explosionSeconds?: number;
  /** Base outward particle speed in px/s. */
  explosionSpeed?: number;
  /** Largest time step fed to the integrator, in seconds. */
  maxDt?: number;
  /** Returns [0, 1); injectable for deterministic tests. */
  random?: () => number;
};

export type Star = {
  /** Inactive entries are pool slots waiting for the spawn timer. */
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Past positions, oldest first, as `[x0, y0, x1, y1, …]`. */
  trail: Float32Array;
  /** Number of valid position pairs in `trail`. */
  trailCount: number;
};

const DEFAULTS = {
  gridSpacing: 24,
  dotPull: 20_000,
  dotSoftening: 24,
  dotMaxDisplacement: 18,
  dotRelaxRate: 10,
  starCount: 3,
  starSpawnSeconds: 4,
  starSpeed: 280,
  starMaxSpeed: 640,
  starPull: 15_000_000,
  starSoftening: 30,
  starTrailLength: 6,
  crashRadius: 14,
  particlesPerExplosion: 20,
  explosionSeconds: 0.6,
  explosionSpeed: 120,
  maxDt: 1 / 30,
} as const;

/** How far outside the viewport stars spawn. */
const SPAWN_MARGIN = 20;
/** How far outside the viewport a star must drift before being recycled. */
const OFFSCREEN_MARGIN = 100;

/**
 * Lo-fi 2D gravity simulation: a grid of dots displaced toward a single
 * pointer, plus shooting stars that deflect under the same gravity and explode
 * if they reach it. Stability over physical fidelity throughout — every force
 * is softened, capped, or both, so no value can run away no matter where the
 * pointer sits or how large a time step arrives.
 *
 * Framework-agnostic on purpose: it knows nothing about React or the DOM. A
 * renderer calls `step(dt)` once per frame and reads the public views.
 */
export class SpaceSim {
  /** Number of grid dots. */
  dotCount = 0;
  /** Dot home positions as `[x0, y0, x1, y1, …]` in CSS pixels. */
  homes = new Float32Array(0);
  /** Dot displacements from home, same layout; add to `homes` when rendering. */
  offsets = new Float32Array(0);
  /** Displacement cap, public so renderers can normalize pull strength. */
  readonly dotMaxDisplacement: number;
  /** Star pool; iterate and skip inactive entries when rendering. */
  readonly stars: readonly Star[];

  private width: number;
  private height: number;
  private readonly gridSpacing: number;
  private readonly dotPull: number;
  private readonly dotSoftening: number;
  private readonly dotRelaxRate: number;
  private readonly maxDt: number;
  private pointer: { x: number; y: number } | null = null;
  private readonly random: () => number;
  private readonly starSpawnSeconds: number;
  private readonly starSpeed: number;
  private readonly starMaxSpeed: number;
  private readonly starPull: number;
  private readonly starSoftening: number;
  private readonly starTrailLength: number;
  private spawnCountdown: number;

  constructor(config: SpaceSimConfig) {
    this.width = config.width;
    this.height = config.height;
    this.gridSpacing = config.gridSpacing ?? DEFAULTS.gridSpacing;
    this.dotMaxDisplacement = config.dotMaxDisplacement ?? DEFAULTS.dotMaxDisplacement;
    this.dotPull = config.dotPull ?? DEFAULTS.dotPull;
    this.dotSoftening = config.dotSoftening ?? DEFAULTS.dotSoftening;
    this.dotRelaxRate = config.dotRelaxRate ?? DEFAULTS.dotRelaxRate;
    this.maxDt = config.maxDt ?? DEFAULTS.maxDt;
    this.random = config.random ?? Math.random;
    this.starSpawnSeconds = config.starSpawnSeconds ?? DEFAULTS.starSpawnSeconds;
    this.starSpeed = config.starSpeed ?? DEFAULTS.starSpeed;
    this.starMaxSpeed = config.starMaxSpeed ?? DEFAULTS.starMaxSpeed;
    this.starPull = config.starPull ?? DEFAULTS.starPull;
    this.starSoftening = config.starSoftening ?? DEFAULTS.starSoftening;
    this.starTrailLength = config.starTrailLength ?? DEFAULTS.starTrailLength;
    this.spawnCountdown = this.starSpawnSeconds * (0.5 + this.random());
    this.stars = Array.from({ length: config.starCount ?? DEFAULTS.starCount }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      trail: new Float32Array(2 * this.starTrailLength),
      trailCount: 0,
    }));
    this.buildGrid();
  }

  /** Rebuild the dot grid for a new viewport. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.buildGrid();
  }

  /** Place the gravity source, in CSS pixels. */
  setPointer(x: number, y: number): void {
    this.pointer = { x, y };
  }

  /** Remove the gravity source; dots relax home and stars fly straight. */
  clearPointer(): void {
    this.pointer = null;
  }

  /** Advance the simulation. `dt` is in seconds and clamped to `maxDt`. */
  step(dt: number): void {
    const clamped = Math.min(dt, this.maxDt);
    if (clamped <= 0) return;
    this.stepDots(clamped);
    this.stepStars(clamped);
  }

  private stepDots(dt: number): void {
    // Exponential relaxation toward a target displacement is the discrete form
    // of a critically damped response: dots can never overshoot or oscillate,
    // so the field is stable for any dt and always settles back into the grid.
    const blend = 1 - Math.exp(-this.dotRelaxRate * dt);
    const softening2 = this.dotSoftening * this.dotSoftening;
    for (let i = 0; i < this.dotCount; i++) {
      let targetX = 0;
      let targetY = 0;
      if (this.pointer !== null) {
        const dx = this.pointer.x - (this.homes[2 * i] ?? 0);
        const dy = this.pointer.y - (this.homes[2 * i + 1] ?? 0);
        const r2 = dx * dx + dy * dy;
        const r = Math.sqrt(r2);
        if (r > 0) {
          // Softened inverse square: finite at r = 0 and capped, so a dot can
          // never stray more than dotMaxDisplacement from home.
          const pull = Math.min(this.dotPull / (r2 + softening2), this.dotMaxDisplacement);
          targetX = (dx / r) * pull;
          targetY = (dy / r) * pull;
        }
      }
      const ox = this.offsets[2 * i] ?? 0;
      const oy = this.offsets[2 * i + 1] ?? 0;
      this.offsets[2 * i] = ox + (targetX - ox) * blend;
      this.offsets[2 * i + 1] = oy + (targetY - oy) * blend;
    }
  }

  private stepStars(dt: number): void {
    this.spawnCountdown -= dt;
    if (this.spawnCountdown <= 0) {
      this.spawnCountdown = this.starSpawnSeconds * (0.5 + this.random());
      const idle = this.stars.find((star) => !star.active);
      if (idle !== undefined) this.spawnStar(idle);
    }
    const softening2 = this.starSoftening * this.starSoftening;
    for (const star of this.stars) {
      if (!star.active) continue;
      if (this.pointer !== null) {
        const dx = this.pointer.x - star.x;
        const dy = this.pointer.y - star.y;
        const r2 = dx * dx + dy * dy;
        // Semi-implicit Euler — velocity first, then position from the new
        // velocity. Same cost as naive Euler, far more stable near the source;
        // the softening keeps acceleration finite even at r = 0.
        const invR3 = 1 / (r2 + softening2) ** 1.5;
        star.vx += this.starPull * dx * invR3 * dt;
        star.vy += this.starPull * dy * invR3 * dt;
        const speed = Math.hypot(star.vx, star.vy);
        if (speed > this.starMaxSpeed) {
          const scale = this.starMaxSpeed / speed;
          star.vx *= scale;
          star.vy *= scale;
        }
      }
      star.x += star.vx * dt;
      star.y += star.vy * dt;
      this.pushTrail(star);
      if (
        star.x < -OFFSCREEN_MARGIN ||
        star.x > this.width + OFFSCREEN_MARGIN ||
        star.y < -OFFSCREEN_MARGIN ||
        star.y > this.height + OFFSCREEN_MARGIN
      ) {
        star.active = false;
        star.trailCount = 0;
      }
    }
  }

  private spawnStar(star: Star): void {
    // Enter from just outside a random edge, aimed at the middle 60% of the
    // viewport so every star actually crosses visible space.
    const edge = Math.floor(this.random() * 4);
    let x: number;
    let y: number;
    if (edge === 0) {
      x = this.random() * this.width;
      y = -SPAWN_MARGIN;
    } else if (edge === 1) {
      x = this.width + SPAWN_MARGIN;
      y = this.random() * this.height;
    } else if (edge === 2) {
      x = this.random() * this.width;
      y = this.height + SPAWN_MARGIN;
    } else {
      x = -SPAWN_MARGIN;
      y = this.random() * this.height;
    }
    const targetX = this.width * (0.2 + 0.6 * this.random());
    const targetY = this.height * (0.2 + 0.6 * this.random());
    const distance = Math.hypot(targetX - x, targetY - y) || 1;
    const speed = this.starSpeed * (0.8 + 0.4 * this.random());
    star.active = true;
    star.x = x;
    star.y = y;
    star.vx = ((targetX - x) / distance) * speed;
    star.vy = ((targetY - y) / distance) * speed;
    star.trailCount = 0;
  }

  private pushTrail(star: Star): void {
    if (star.trailCount === this.starTrailLength) {
      star.trail.copyWithin(0, 2);
      star.trailCount -= 1;
    }
    star.trail[2 * star.trailCount] = star.x;
    star.trail[2 * star.trailCount + 1] = star.y;
    star.trailCount += 1;
  }

  private buildGrid(): void {
    const spacing = this.gridSpacing;
    const cols = Math.max(1, Math.floor((this.width - spacing / 2) / spacing) + 1);
    const rows = Math.max(1, Math.floor((this.height - spacing / 2) / spacing) + 1);
    // Center the grid so leftover space splits evenly between opposite edges.
    const marginX = (this.width - (cols - 1) * spacing) / 2;
    const marginY = (this.height - (rows - 1) * spacing) / 2;
    this.dotCount = cols * rows;
    this.homes = new Float32Array(2 * this.dotCount);
    this.offsets = new Float32Array(2 * this.dotCount);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        this.homes[2 * i] = marginX + col * spacing;
        this.homes[2 * i + 1] = marginY + row * spacing;
      }
    }
  }
}
