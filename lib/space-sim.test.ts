import assert from "node:assert/strict";
import { test } from "vitest";

import { SpaceSim } from "./space-sim";

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
