import { useCallback, useEffect, useRef, useState } from "react";

export type PointerInteractionHandlers = {
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onClick?: () => void;
};

export type UsePointerInteractionOptions = {
  /** Fired when the interaction begins (hover in, or a toggle-on tap). */
  onInteractionStart: () => void;
  /** Fired when the interaction ends (hover out, focus lost, or a toggle-off tap). */
  onInteractionEnd: () => void;
  /** When true, no handlers are returned and no listeners are attached. */
  disabled?: boolean;
};

const COARSE_POINTER_QUERY = "(pointer: coarse)";

/**
 * Abstracts the pointer plumbing for a hover-to-reveal interaction and returns
 * handler props to spread onto the target element.
 *
 * - Fine pointers (mouse/trackpad): enter starts, leave ends. Because
 *   `pointerleave` does not fire when the user switches windows with the cursor
 *   still parked on the element, window `blur` and tab `visibilitychange` also
 *   end the interaction so it reliably reverses.
 * - Coarse pointers (touch): each tap toggles the interaction on and off.
 */
export function usePointerInteraction({
  onInteractionStart,
  onInteractionEnd,
  disabled = false,
}: UsePointerInteractionOptions): PointerInteractionHandlers {
  // Keep the latest callbacks in a ref so the window listeners below subscribe
  // once instead of re-binding whenever a caller passes fresh callbacks.
  const callbacks = useRef({ onInteractionStart, onInteractionEnd });
  callbacks.current = { onInteractionStart, onInteractionEnd };

  const active = useRef(false);

  const start = useCallback(() => {
    if (active.current) return;
    active.current = true;
    callbacks.current.onInteractionStart();
  }, []);

  const end = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    callbacks.current.onInteractionEnd();
  }, []);

  const toggle = useCallback(() => {
    if (active.current) end();
    else start();
  }, [start, end]);

  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(COARSE_POINTER_QUERY);
    setCoarsePointer(query.matches);
    const onChange = (event: MediaQueryListEvent) => setCoarsePointer(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (disabled || coarsePointer) return;
    const handleAway = () => end();
    const handleVisibility = () => {
      if (document.hidden) end();
    };
    window.addEventListener("blur", handleAway);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", handleAway);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [disabled, coarsePointer, end]);

  // If interaction is switched off mid-gesture (e.g. reduced motion toggled on),
  // unwind whatever was in flight.
  useEffect(() => {
    if (disabled) end();
  }, [disabled, end]);

  if (disabled) return {};
  if (coarsePointer) return { onClick: toggle };
  return { onPointerEnter: start, onPointerLeave: end };
}
