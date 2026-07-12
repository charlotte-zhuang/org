import assert from "node:assert/strict";
import { test } from "vitest";

import { SpaceSim, type Star } from "./space-sim";

// 240 × 120 at spacing 24 → 10 columns × 5 rows, homes from (12, 12) to (228, 108).
const SIZE = { width: 240, height: 120, gridSpacing: 24 };

test("builds a centered grid of dots for the viewport", () => {
  const sim = new SpaceSim(SIZE);
  assert.equal(sim.dotCount, 50);
  assert.equal(sim.homes.length, 100);
  assert.equal(sim.offsets.length, 100);
  // first home sits half a cell in from the corner; grid is centered
  assert.equal(sim.homes[0], 12);
  assert.equal(sim.homes[1], 12);
  assert.equal(sim.homes[98], 228);
  assert.equal(sim.homes[99], 108);
});

test("centers the grid when the viewport is not a multiple of the spacing", () => {
  const sim = new SpaceSim({ width: 230, height: 120, gridSpacing: 24 });
  // 10 columns spanning 216 px → 7 px margin on each side
  assert.equal(sim.homes[0], 7);
});

test("resize rebuilds the grid for the new viewport", () => {
  const sim = new SpaceSim(SIZE);
  sim.resize(480, 120);
  assert.equal(sim.dotCount, 100);
  assert.equal(sim.homes.length, 200);
  assert.equal(sim.offsets.length, 200);
});

test("survives a viewport smaller than one grid cell", () => {
  const sim = new SpaceSim({ width: 10, height: 10, gridSpacing: 24 });
  assert.equal(sim.dotCount, 1);
});

/** Find a dot by its home position and return its current offset. */
function offsetAt(sim: SpaceSim, homeX: number, homeY: number): [number, number] {
  for (let i = 0; i < sim.dotCount; i++) {
    if (sim.homes[2 * i] === homeX && sim.homes[2 * i + 1] === homeY) {
      return [sim.offsets[2 * i] ?? 0, sim.offsets[2 * i + 1] ?? 0];
    }
  }
  throw new Error(`no dot homed at ${homeX}, ${homeY}`);
}

test("pulls dots toward the pointer", () => {
  const sim = new SpaceSim(SIZE);
  sim.setPointer(240, 60);
  sim.step(1 / 60);
  const [dx, dy] = offsetAt(sim, 12, 12);
  assert.ok(dx > 0); // pointer is to the right…
  assert.ok(dy > 0); // …and below this corner dot
});

test("pulls nearer dots harder", () => {
  const sim = new SpaceSim(SIZE);
  sim.setPointer(240, 60);
  sim.step(1 / 60);
  const [nearX] = offsetAt(sim, 132, 60);
  const [farX] = offsetAt(sim, 12, 60);
  assert.ok(nearX > farX);
  assert.ok(farX > 0);
});

test("caps displacement even with the pointer next to a home", () => {
  const sim = new SpaceSim(SIZE);
  sim.setPointer(13, 12); // 1 px from the corner dot's home
  for (let i = 0; i < 300; i++) sim.step(1 / 60);
  for (let i = 0; i < 2 * sim.dotCount; i++) {
    assert.ok(Number.isFinite(sim.offsets[i] ?? NaN));
  }
  const [dx, dy] = offsetAt(sim, 12, 12);
  assert.ok(Math.hypot(dx, dy) <= 18.001); // default dotMaxDisplacement
});

test("is inert with the pointer exactly on a home", () => {
  const sim = new SpaceSim(SIZE);
  sim.setPointer(12, 12);
  for (let i = 0; i < 100; i++) sim.step(1 / 60);
  const [dx, dy] = offsetAt(sim, 12, 12);
  assert.equal(dx, 0);
  assert.equal(dy, 0);
});

test("relaxes home after the pointer leaves", () => {
  const sim = new SpaceSim(SIZE);
  sim.setPointer(120, 60);
  for (let i = 0; i < 60; i++) sim.step(1 / 60);
  sim.clearPointer();
  for (let i = 0; i < 300; i++) sim.step(1 / 60);
  for (let i = 0; i < 2 * sim.dotCount; i++) {
    assert.ok(Math.abs(sim.offsets[i] ?? 0) < 0.001);
  }
});

test("clamps giant time steps", () => {
  const jumped = new SpaceSim(SIZE);
  const stepped = new SpaceSim(SIZE);
  jumped.setPointer(120, 60);
  stepped.setPointer(120, 60);
  jumped.step(10); // e.g. a tab restored after minutes in the background
  stepped.step(1 / 30); // default maxDt
  assert.deepEqual(jumped.offsets, stepped.offsets);
});

// random () => 0.5 always picks the bottom edge, centered, aimed straight up
// at the viewport center at exactly starSpeed. Spawn is 20 px outside.
const STAR_CONFIG = {
  width: 400,
  height: 300,
  starSpawnSeconds: 0.1,
  random: () => 0.5,
};

/** Step until the first star spawns (bounded so a broken spawner can't hang). */
function spawnFirstStar(sim: SpaceSim): Star {
  for (let i = 0; i < 120 && sim.stars.every((star) => !star.active); i++) {
    sim.step(1 / 60);
  }
  const star = sim.stars.find((candidate) => candidate.active);
  assert.ok(star !== undefined, "expected a star to spawn");
  return star;
}

test("spawns a star at an edge flying into the viewport", () => {
  const sim = new SpaceSim(STAR_CONFIG);
  const star = spawnFirstStar(sim);
  assert.equal(star.x, 200);
  assert.ok(star.y > 300); // still just outside the bottom edge
  assert.equal(star.vx, 0);
  assert.ok(star.vy < 0); // heading up, into view
  for (let i = 0; i < 30; i++) sim.step(1 / 60);
  assert.ok(star.y < 300); // now inside the viewport
});

test("deflects toward the pointer", () => {
  const sim = new SpaceSim(STAR_CONFIG);
  const star = spawnFirstStar(sim);
  sim.setPointer(100, 150); // left of the star's straight-up path
  for (let i = 0; i < 30; i++) sim.step(1 / 60);
  assert.ok(star.vx < 0); // bent left
});

test("clamps star speed under heavy gravity", () => {
  const sim = new SpaceSim({ ...STAR_CONFIG, starMaxSpeed: 300 });
  const star = spawnFirstStar(sim);
  sim.setPointer(200, 150); // directly in the star's path
  let maxSpeed = 0;
  for (let i = 0; i < 240; i++) {
    sim.step(1 / 60);
    if (star.active) maxSpeed = Math.max(maxSpeed, Math.hypot(star.vx, star.vy));
  }
  assert.ok(maxSpeed > 280); // gravity actually sped it up…
  assert.ok(maxSpeed <= 300.001); // …but never past the cap
});

test("recycles a star once it leaves the viewport", () => {
  const sim = new SpaceSim(STAR_CONFIG);
  const star = spawnFirstStar(sim);
  // No pointer: it flies straight up and out. 420 px of travel at 280 px/s.
  let recycled = false;
  for (let i = 0; i < 200 && !recycled; i++) {
    sim.step(1 / 60);
    if (!star.active) recycled = true;
  }
  assert.ok(recycled);
});

test("keeps a bounded trail ending at the current position", () => {
  const sim = new SpaceSim(STAR_CONFIG);
  const star = spawnFirstStar(sim);
  for (let i = 0; i < 30; i++) sim.step(1 / 60);
  assert.equal(star.trailCount, 6); // default starTrailLength
  const headX = star.trail[10] ?? 0;
  const headY = star.trail[11] ?? 0;
  assert.ok(Math.abs(headX - star.x) < 0.001);
  assert.ok(Math.abs(headY - star.y) < 0.001);
});

test("a star that reaches the pointer explodes", () => {
  const sim = new SpaceSim(STAR_CONFIG);
  const star = spawnFirstStar(sim);
  for (let i = 0; i < 30; i++) sim.step(1 / 60); // move away from the spawn edge
  sim.setPointer(star.x, star.y); // park the pointer right on its position
  sim.step(1 / 60);
  assert.equal(star.active, false);
  const burst = sim.particles.filter((particle) => particle.active);
  assert.equal(burst.length, 20); // default particlesPerExplosion
  for (const particle of burst) {
    // spawned at the crash site, at most one frame of drift away
    assert.ok(Math.hypot(particle.x - star.x, particle.y - star.y) < 10);
  }
});

test("explosion particles fade and free their pool slots", () => {
  const sim = new SpaceSim(STAR_CONFIG);
  const star = spawnFirstStar(sim);
  for (let i = 0; i < 30; i++) sim.step(1 / 60);
  sim.setPointer(star.x, star.y);
  sim.step(1 / 60);
  assert.ok(sim.particles.some((particle) => particle.active));
  sim.clearPointer(); // so no follow-up star crashes during the fade
  for (let i = 0; i < 60; i++) sim.step(1 / 60); // 1 s ≫ 0.6 s lifetime
  assert.equal(sim.particles.filter((particle) => particle.active).length, 0);
});

test("stays finite through a long adversarial run", () => {
  // Deterministic LCG (minstd) so failures are reproducible.
  let seed = 1;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const sim = new SpaceSim({ width: 200, height: 200, starSpawnSeconds: 0.2, random });
  sim.setPointer(100, 100); // parked dead center, forever
  for (let i = 0; i < 5000; i++) {
    sim.step(i % 10 === 0 ? 10 : 1 / 60); // with occasional giant steps
  }
  for (let i = 0; i < 2 * sim.dotCount; i++) {
    const offset = sim.offsets[i] ?? NaN;
    assert.ok(Number.isFinite(offset));
    assert.ok(Math.abs(offset) <= 18.001);
  }
  for (const star of sim.stars) {
    assert.ok(Number.isFinite(star.x) && Number.isFinite(star.y));
    assert.ok(Number.isFinite(star.vx) && Number.isFinite(star.vy));
  }
  for (const particle of sim.particles) {
    assert.ok(Number.isFinite(particle.x) && Number.isFinite(particle.y));
    assert.ok(particle.life >= 0 && particle.life <= 1);
  }
});
