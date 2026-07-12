"use client";

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { SpaceSim } from "@/lib/space-sim";

const DOT_SIZE = 2;
const DOT_MAX_SCALE = 2;
const DOT_ALPHA = 0.35;
const STAR_SIZE = 3;
const TRAIL_MIN_ALPHA = 0.1;
const TRAIL_MAX_ALPHA = 0.8;
const PARTICLE_SIZE = 2;
// Cap the backing store so 4K/retina screens don't quadruple the pixel work
// for detail that is invisible at this dot size anyway.
const MAX_DPR = 2;

type Colors = { dot: string; star: string; explosion: string };

/** Resolve the space tokens to concrete colors; canvas can't use `var()`. */
function resolveColors(): Colors {
  const style = getComputedStyle(document.documentElement);
  return {
    dot: style.getPropertyValue("--space-dot"),
    star: style.getPropertyValue("--space-star"),
    explosion: style.getPropertyValue("--space-explosion"),
  };
}

/**
 * Everything is a tiny square snapped to whole device pixels — the lo-fi
 * dot-matrix look, and also the fastest thing a 2D canvas can draw. Only three
 * fillStyle changes per frame; state changes, not rect count, are what cost.
 */
function draw(ctx: CanvasRenderingContext2D, sim: SpaceSim, colors: Colors, dpr: number): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // grid dots — size swells with displacement so the gravity reads at 2 px
  ctx.fillStyle = colors.dot;
  ctx.globalAlpha = DOT_ALPHA;
  for (let i = 0; i < sim.dotCount; i++) {
    const ox = sim.offsets[2 * i] ?? 0;
    const oy = sim.offsets[2 * i + 1] ?? 0;
    const x = (sim.homes[2 * i] ?? 0) + ox;
    const y = (sim.homes[2 * i + 1] ?? 0) + oy;
    const pull = Math.min(Math.hypot(ox, oy) / sim.dotMaxDisplacement, 1);
    const size = Math.round(DOT_SIZE * (1 + (DOT_MAX_SCALE - 1) * pull) * dpr);
    ctx.fillRect(Math.round(x * dpr - size / 2), Math.round(y * dpr - size / 2), size, size);
  }

  // star trails — oldest to newest with stepped alpha, slightly larger head
  ctx.fillStyle = colors.star;
  for (const star of sim.stars) {
    if (!star.active) continue;
    for (let t = 0; t < star.trailCount; t++) {
      const newest = t === star.trailCount - 1;
      const progress = star.trailCount === 1 ? 1 : t / (star.trailCount - 1);
      ctx.globalAlpha = TRAIL_MIN_ALPHA + (TRAIL_MAX_ALPHA - TRAIL_MIN_ALPHA) * progress;
      const size = Math.round((newest ? STAR_SIZE : STAR_SIZE - 1) * dpr);
      const x = star.trail[2 * t] ?? 0;
      const y = star.trail[2 * t + 1] ?? 0;
      ctx.fillRect(Math.round(x * dpr - size / 2), Math.round(y * dpr - size / 2), size, size);
    }
  }

  // explosion particles — alpha follows remaining life
  ctx.fillStyle = colors.explosion;
  const particleSize = Math.round(PARTICLE_SIZE * dpr);
  for (const particle of sim.particles) {
    if (!particle.active) continue;
    ctx.globalAlpha = particle.life;
    ctx.fillRect(
      Math.round(particle.x * dpr - particleSize / 2),
      Math.round(particle.y * dpr - particleSize / 2),
      particleSize,
      particleSize,
    );
  }

  ctx.globalAlpha = 1;
}

/**
 * Full-viewport gravity background. Fixed behind the page with pointer events
 * off; gravity tracks the pointer via window listeners so content above stays
 * fully interactive. Reduced motion renders the static grid with no loop.
 */
export function SpaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let colors = resolveColors();
    const sim = new SpaceSim({ width: canvas.clientWidth, height: canvas.clientHeight });

    let rafId = 0;
    let running = false;
    let lastTime = 0;

    const frame = (time: number) => {
      sim.step((time - lastTime) / 1000);
      lastTime = time;
      draw(ctx, sim, colors, dpr);
      rafId = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running || prefersReducedMotion) return;
      running = true;
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
    };

    const applySize = () => {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      sim.resize(canvas.clientWidth, canvas.clientHeight);
      draw(ctx, sim, colors, dpr);
    };
    applySize();

    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(canvas);

    // next-themes flips the `dark` class on <html>; re-resolve colors then.
    const themeObserver = new MutationObserver(() => {
      colors = resolveColors();
      if (!running) draw(ctx, sim, colors, dpr);
    });
    themeObserver.observe(document.documentElement, { attributeFilter: ["class"] });

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Fine pointers: hover drives gravity; leaving the page or window clears
    // it (pointerleave misses window switches, hence the blur guard — same
    // insight as use-pointer-interaction). Touch: gravity while a finger is
    // down, since touch pointermove only fires mid-drag.
    const onPointer = (event: PointerEvent) => sim.setPointer(event.clientX, event.clientY);
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") sim.clearPointer();
    };
    const onLeave = () => sim.clearPointer();
    if (!prefersReducedMotion) {
      window.addEventListener("pointermove", onPointer);
      window.addEventListener("pointerdown", onPointer);
      window.addEventListener("pointerup", onPointerEnd);
      window.addEventListener("pointercancel", onPointerEnd);
      document.documentElement.addEventListener("pointerleave", onLeave);
      window.addEventListener("blur", onLeave);
    }

    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [prefersReducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
