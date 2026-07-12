# CLAUDE.md

This file provides guidance to coding agents when working with code in this repository.

Personal website for charlottezhuang.org.

Please push back against the user if instructions are unclear, if there is a better way to do things, or if the user appears misinformed. Do not blindly follow user instructions or just get things working. The user prefers more interaction, not less.

## Commands

Package manager is **pnpm** (CI pins 11.4.0, Node 24). Tests use **Vitest**.

- `pnpm dev` — dev server (Next.js + Turbopack)
- `pnpm build` — production build
- `pnpm test` — run the Vitest suite once
- `pnpm check` — the full CI gate: `format:check` + `lint` + `typecheck`. Run this before considering work done.
- `pnpm fix` — auto-fix pass: `format` + `lint:fix` + `typecheck`
- Individually: `pnpm typecheck` (`tsc --noEmit`), `pnpm lint` (`oxlint .`), `pnpm format` (`oxfmt .`)

CI (`.github/workflows/ci.yml`) runs `pnpm check`, `pnpm test`, then `pnpm build` on PRs and pushes to `main`.

## Tooling notes

- Lint/format use the **oxc** toolchain (`oxlint` + `oxfmt`), **not** ESLint/Prettier. Configs are `.oxlintrc.json` / `.oxfmtrc.json`. oxlint runs the `correctness` category as errors with the `react`, `jsx-a11y`, and `nextjs` plugins enabled — accessibility and React-hooks violations fail the build.
- Next.js 16 App Router, React 19, Tailwind CSS **v4** (config-less; theme lives in CSS), TypeScript in strict mode with `@/*` aliased to the repo root.

## Architecture

**Stack:** App Router with Server Components by default. `app/layout.tsx` wraps everything in `next-themes` (`ThemeProvider`, class-based dark mode, `defaultTheme="system"`); `app/page.tsx` composes the page from components.

**Styling:** Tailwind v4 is imported in `app/globals.css`, which also defines the design tokens as oklch CSS variables under `:root` and `.dark`, mapped into Tailwind via `@theme inline`. Components are **shadcn/ui** (style `base-vega`, base color `mist`) — regenerate/add primitives with the shadcn CLI rather than hand-authoring `components/ui/*`. Fonts are Inter (`--font-sans`) and Geist Mono (`--font-geist-mono`) via `next/font`. `tw-animate-css` provides animation utilities (e.g. `animate-caret-blink`).

**Directory conventions** (kebab-case filenames): framework-agnostic logic in `lib/`, React hooks in `hooks/`, shadcn primitives in `components/ui/`, feature components in `components/`.

**Client-boundary discipline:** keep pages and layout containers as Server Components and push interactivity down into leaf `"use client"` components (e.g. `root-header.tsx` stays server-rendered and renders the client `AnimatedTitle`).

### Animated title (spans `lib/`, `hooks/`, `components/`)

The header's interactive title starts with "charlotte zhuang", deletes the current suffix, and types a randomly selected different suffix. After a reveal completes, that suffix becomes the next cycle's starting point. Every interaction edge triggers the engine: fine-pointer enter and leave, or each coarse-pointer tap. An in-flight forward animation reverses; otherwise the event starts or resumes a forward animation. The implementation is deliberately split so the animation logic is framework-agnostic and testable:

- `lib/title-typewriter.ts` — `TitleTypewriter`, a plain class with no React dependency. It accepts a `[string, string, ...string[]]` suffix tuple, uses the first suffix initially, and randomly chooses a different destination for each cycle. The whole effect is modeled as a single integer `progress` walking a fixed path (`0` = current suffix, `total` = revealed suffix); the displayed string is a pure function of `progress`. Its only animation method, `toggle()`, switches the target between `0` and `total`, so an interaction can redirect mid-flight without the caller tracking engine state. On completion, the revealed suffix is promoted to the current suffix and `progress`/`target` reset to `0`, making the next toggle start a new cycle. Runtime inputs with fewer than two distinct suffixes are inert. Emits each change through a single `onText` callback; behavior is covered by `lib/title-typewriter.test.ts`.
- `hooks/use-pointer-interaction.ts` — returns spreadable handler props. Fine pointers use hover (enter/leave) plus `window` blur + `visibilitychange` guards (because `pointerleave` doesn't fire when switching windows with the cursor parked on the element); coarse pointers tap-to-toggle. Keeps callbacks in a ref so window listeners subscribe once.
- `hooks/use-prefers-reduced-motion.ts` — reduced-motion users get the static name with the interaction disabled.
- `components/animated-title.tsx` — `"use client"`; bridges the engine to React state and renders the `<h1>`. Accessible name is pinned via `aria-label`; width is reserved with a stacked grid of every possible suffix so the nav never shifts.

Note on SSR: `prefers-reduced-motion` and `(pointer: coarse)` are client-only, so their hooks start from a default and correct after mount. This is safe here only because the resting render is identical regardless of those values. If a future consumer needs a _correct first paint_ from a media query, prefer CSS `@media` or a blocking head script over React state — a client-side initializer would still paint the server's guess first and only add a hydration mismatch.

### Space sim background (spans `lib/`, `components/`)

The full-page background is a lo-fi dot-matrix gravity simulation: a grid of dots pulled toward the pointer with a softened inverse-square law, plus shooting stars that deflect under the same gravity and explode into pixel bursts if they reach the pointer (design/spec: `docs/superpowers/specs/2026-07-12-space-sim-design.md`). Same split as the animated title:

- `lib/space-sim.ts` — `SpaceSim`, a plain class with no React/DOM dependency. Stability over fidelity: grid dots are not free bodies (their displacement relaxes exponentially toward a capped, softened inverse-square target, so the field cannot oscillate or escape); stars are free bodies integrated with semi-implicit Euler and a speed clamp, and the crash radius around the pointer doubles as the singularity guard. `step(dt)` clamps `dt`. Fixed pools, zero per-frame allocation, RNG injected for deterministic tests (`lib/space-sim.test.ts`).
- `components/space-canvas.tsx` — `"use client"` leaf; owns the canvas, rAF loop, DPR-capped sizing, window-level pointer wiring (hover on fine pointers, press-and-hold on touch, blur/leave guards), theme-aware color resolution (`getComputedStyle` re-read on `dark`-class flips), and a `visibilitychange` pause. Draws everything as device-pixel-snapped `fillRect`s. Colors come from the `--space-dot`/`--space-star`/`--space-explosion` aliases in `app/globals.css` (declared with `@theme static` — Tailwind v4 strips plain `:root` custom properties that only JS reads) — tune the palette there, not in the component.
- Reduced motion (`use-prefers-reduced-motion`): static grid, no loop, no interaction.

## Style notes

- Prefer all lowercase for any visible text / copy (e.g. charlotte)
- Prefer SSR over CSR
- Be extremely judicious with `useEffect` for React
  - Prefer an imperative pattern to avoid `useEffect`
  - Do be sure to call `useEffect` when appropriate, e.g. adding event listeners
- Strongly avoid code that bypasses TypeScript compiler like `foo as string` or `arr[0]!.value`
  - Strongly prefer to get the TypeScript types correct
  - Type casts are acceptable where safety can be guaranteed and proper typing would be overly complex
- Strongly avoid `any` types
