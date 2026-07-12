# space sim — interactive gravity background

**Date:** 2026-07-12
**Status:** approved plan

## Summary

A lo-fi, dot-matrix-style 2D gravity simulation as the main interactive element of
charlottezhuang.org. A full-viewport grid of tiny dots is subtly pulled toward the
pointer with a softened inverse-square law; shooting stars fly across the screen,
deflect under the pointer's gravity, and explode in a small pixel burst if they get
too close. Everything is rendered as tiny squares — detail comes from motion and
density, not per-element rendering.

Design priorities, in order: unconditional numerical stability, simplicity,
zero dependencies, testability. "Looks like gravity" beats "is gravity."

## Decisions made

| Question | Decision |
| --- | --- |
| Placement | Full-page fixed background behind header and future content |
| Touch devices | Gravity exists while a finger is down; releases on lift |
| Star color | `--muted-foreground` (secondary is near-invisible in light mode) |
| Rendering tech | Canvas 2D, zero dependencies (no three.js/pixi/matter) |
| Color plumbing | Dedicated `--space-*` CSS vars aliasing existing tokens |

## Architecture

Mirrors the animated-title split: framework-agnostic engine in `lib/`, thin
client leaf component, server page untouched otherwise.

### `lib/space-sim.ts` — `SpaceSim` (new)

Plain class, no React or DOM. Owns all simulation state: grid dot displacements,
star positions/velocities, explosion particles, pointer position (or absent).

API:

- `constructor(config)` — viewport size, grid spacing, physics constants; all
  tunables are named constants in one config object with defaults.
- `resize(width, height)` — rebuilds the grid; preserves in-flight stars where possible.
- `setPointer(x, y)` / `clearPointer()` — the only interaction inputs. The sim
  does not distinguish mouse hover from touch press; gravity exists while a
  pointer does.
- `step(dt)` — advances one frame; `dt` clamped internally to 33 ms.
- Read-only typed views (flat `Float32Array`s) of dots, stars, and particles so
  the renderer is a dumb loop.
- RNG injected via constructor for deterministic tests.

Fixed-size pools for stars and explosion particles; zero allocation per frame.

### `components/space-canvas.tsx` (new)

`"use client"` leaf. Owns:

- the `<canvas>` and `requestAnimationFrame` loop
- DPR-aware sizing via `ResizeObserver` (DPR capped at 2)
- pointer wiring: `window`-level `pointermove`/`pointerdown`/`pointerup`/
  `pointercancel`/`pointerleave`. Desktop: hover move sets pointer, leave clears.
  Touch: down/move sets, up/cancel clears. The existing `use-pointer-interaction`
  hook is deliberately NOT reused — it is built for enter/leave toggling on an
  element, not continuous window-level position tracking.
- theme-token color resolution: on mount and on `dark`-class flips (a
  `MutationObserver` on `<html>`, matching how next-themes applies the class),
  re-read the `--space-*` vars via `getComputedStyle` and cache resolved strings.
- `document.visibilitychange` pauses the rAF loop while the tab is hidden.
- reduced motion (via existing `use-prefers-reduced-motion`): render the static
  dot grid once; no rAF loop, no stars, no pointer interaction.

### `app/page.tsx`

Mounts `<SpaceCanvas />` as a fixed full-viewport background:
`fixed inset-0 -z-10`, `pointer-events: none` on the canvas itself. Pointer
position comes from window listeners, so header links stay fully clickable while
gravity tracks the cursor everywhere.

### `app/globals.css`

New entity tokens so the palette is adjustable in one place:

```css
:root {
  --space-dot: var(--primary);
  --space-star: var(--muted-foreground);
  --space-explosion: var(--muted-foreground);
}
```

One block only — the aliased vars flip with `.dark` on their own, and
`getComputedStyle` resolves the chain. Add a `.dark` override block only if dark
mode should later diverge.

### SSR

The canvas paints nothing until mount; the page's `bg-background` shows through,
so there is no flash or hydration mismatch. Consistent with the CLAUDE.md note:
resting render identical regardless of client-only media-query values.

## Physics model

### Grid dots (`--space-dot`)

- Fixed home positions on a grid, ~24 px spacing, ~2 px squares. Density is one
  constant (the spacing).
- Dots are NOT free bodies. Per frame, displacement = pull toward pointer with
  magnitude `G / (r² + ε²)` (softened inverse-square), capped at roughly one grid
  cell, plus a critically damped spring back to home.
- Consequence: bounded displacement, no energy accumulation, no orbits, no
  escape. Field always relaxes to a clean grid when the pointer leaves.
  Unconditionally stable by construction.

### Shooting stars (`--space-star`)

- Spawn on a jittered timer at a random screen edge, velocity aimed loosely
  across the viewport. Small max population (~3).
- Free bodies: acceleration `= G · (pointer − pos) / (r² + ε²)^(3/2)`, integrated
  with semi-implicit Euler (velocity update before position update). Speed
  clamped to a max.
- Trail rendered from a short ring buffer of past positions; no extra physics.
- Crash: within ~12 px of the pointer → star dies, explosion spawns. The crash
  radius doubles as the singularity guard — stars never reach the tiny-r regime.
- Off-screen with margin → recycled to a new spawn.

### Explosions (`--space-explosion`)

- ~20 particles from the crash point, random radial velocities, no gravity,
  linear damping, alpha fade over ~600 ms. 1–2 px squares. Pool-backed.

### Time stepping

`step(dt)` clamps `dt` to 33 ms; a backgrounded tab produces one normal step on
return. No fixed-timestep accumulator or substepping — unnecessary at this
energy scale.

## Rendering

Lo-fi commitment: every mark is a tiny `fillRect` (1–3 physical px), positions
snapped to whole device pixels. No circles, gradients, or antialiased strokes.

Frame loop:

1. `sim.step(dt)` from the rAF timestamp.
2. Clear to transparent — page `bg-background` shows through; theme switches
   need no canvas backdrop work.
3. Grid dots in one pass, one `fillStyle`. Dots near the pointer scale up to ~2×
   proportional to pull strength (makes gravity readable at this scale). Base
   opacity ~35% so the field reads as background texture.
4. Star trails oldest-to-newest with stepped alpha (~6 segments, 10%→80%),
   slightly larger head. One `fillStyle`.
5. Explosion particles with per-particle alpha fade (star color at boosted alpha).

Three `fillStyle` changes per frame total; state changes, not rect count, are
Canvas 2D's cost center.

Sizing: backing store = `clientSize × min(devicePixelRatio, 2)`;
`sim.resize()` in CSS pixels; drawing in CSS units via `ctx.scale(dpr, dpr)`
with device-pixel snapping.

Idle: loop always runs while visible (stars are always moving);
`visibilitychange` is the only pause.

## Testing

`lib/space-sim.test.ts` (Vitest, no DOM, injected RNG):

- Grid: dot count for size/spacing; clean `resize` rebuild.
- Gravity: displacement points toward pointer; magnitude decreases with
  distance; never exceeds cap even with pointer exactly on a dot's home
  (softening test).
- Spring: after `clearPointer()`, all dots converge home without oscillation
  blow-up.
- Stars: spawn at an edge and enter; deflect toward pointer; speed never
  exceeds max; off-screen exit recycles.
- Crash: star inside crash radius → removed + explosion spawned at site;
  particles fade to zero and free pool slots.
- Stability sweep: thousands of steps, worst-case `dt`, pointer parked on the
  field — every value stays finite.

Component behavior (pointer tracking, theme flip recolor, reduced-motion static
render, tab-hide pause, touch press/release) is verified manually in the
browser during implementation, not unit-tested.

## Files touched

- `lib/space-sim.ts` — new
- `lib/space-sim.test.ts` — new
- `components/space-canvas.tsx` — new
- `app/globals.css` — three `--space-*` vars
- `app/page.tsx` — mount `<SpaceCanvas />`
- `CLAUDE.md` — short architecture note alongside the animated-title section

## Out of scope

- WebGL/shader effects, bloom, 3D parallax (revisit only if the dot grid
  measurably janks on real devices; the physics class carries over unchanged)
- Collisions between stars or dots
- Persistent gravity wells, multi-touch (first pointer wins)
- Pausing/settings UI
