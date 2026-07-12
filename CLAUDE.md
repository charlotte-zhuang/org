# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal website for charlottezhuang.org.

## Commands

Package manager is **pnpm** (CI pins 11.4.0, Node 24). There is no test runner configured.

- `pnpm dev` — dev server (Next.js + Turbopack)
- `pnpm build` — production build
- `pnpm check` — the full CI gate: `format:check` + `lint` + `typecheck`. Run this before considering work done.
- `pnpm fix` — auto-fix pass: `format` + `lint:fix` + `typecheck`
- Individually: `pnpm typecheck` (`tsc --noEmit`), `pnpm lint` (`oxlint .`), `pnpm format` (`oxfmt .`)

CI (`.github/workflows/ci.yml`) runs `pnpm check` then `pnpm build` on PRs and pushes to `main`.

## Tooling notes

- Lint/format use the **oxc** toolchain (`oxlint` + `oxfmt`), **not** ESLint/Prettier. Configs are `.oxlintrc.json` / `.oxfmtrc.json`. oxlint runs the `correctness` category as errors with the `react`, `jsx-a11y`, and `nextjs` plugins enabled — accessibility and React-hooks violations fail the build.
- Next.js 16 App Router, React 19, Tailwind CSS **v4** (config-less; theme lives in CSS), TypeScript in strict mode with `@/*` aliased to the repo root.

## Architecture

**Stack:** App Router with Server Components by default. `app/layout.tsx` wraps everything in `next-themes` (`ThemeProvider`, class-based dark mode, `defaultTheme="system"`); `app/page.tsx` composes the page from components.

**Styling:** Tailwind v4 is imported in `app/globals.css`, which also defines the design tokens as oklch CSS variables under `:root` and `.dark`, mapped into Tailwind via `@theme inline`. Components are **shadcn/ui** (style `base-vega`, base color `mist`) — regenerate/add primitives with the shadcn CLI rather than hand-authoring `components/ui/*`. Fonts are Inter (`--font-sans`) and Geist Mono (`--font-geist-mono`) via `next/font`. `tw-animate-css` provides animation utilities (e.g. `animate-caret-blink`).

**Directory conventions** (kebab-case filenames): framework-agnostic logic in `lib/`, React hooks in `hooks/`, shadcn primitives in `components/ui/`, feature components in `components/`.

**Client-boundary discipline:** keep pages and layout containers as Server Components and push interactivity down into leaf `"use client"` components (e.g. `root-header.tsx` stays server-rendered and renders the client `AnimatedTitle`).

### Animated title (spans `lib/`, `hooks/`, `components/`)

The header's hover-to-reveal effect ("charlotte zhuang" → deletes the last name → types "says hi", reversing on pointer-out) is deliberately split so the animation logic is framework-agnostic and testable:

- `lib/title-typewriter.ts` — `TitleTypewriter`, a plain class with no React dependency. The whole effect is modeled as a single integer `progress` walking a fixed path (`0` = resting title, `total` = revealed title); the displayed string is a pure function of `progress`. `play()`/`reverse()` only set a target and the stepping loop walks toward it, so the effect is **interruptible in both directions for free** — flipping the target mid-flight just redirects from the current position. Emits each change through a single `onText` callback.
- `hooks/use-pointer-interaction.ts` — returns spreadable handler props. Fine pointers use hover (enter/leave) plus `window` blur + `visibilitychange` guards (because `pointerleave` doesn't fire when switching windows with the cursor parked on the element); coarse pointers tap-to-toggle. Keeps callbacks in a ref so window listeners subscribe once.
- `hooks/use-prefers-reduced-motion.ts` — reduced-motion users get the static name with the interaction disabled.
- `components/animated-title.tsx` — `"use client"`; bridges the engine to React state and renders the `<h1>`. Accessible name is pinned via `aria-label`; width is reserved with a stacked grid of both end states so the nav never shifts.

Note on SSR: `prefers-reduced-motion` and `(pointer: coarse)` are client-only, so their hooks start from a default and correct after mount. This is safe here only because the resting render is identical regardless of those values. If a future consumer needs a _correct first paint_ from a media query, prefer CSS `@media` or a blocking head script over React state — a client-side initializer would still paint the server's guess first and only add a hydration mismatch.
