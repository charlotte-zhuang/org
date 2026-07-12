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
