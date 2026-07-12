"use client";

import { useEffect, useState } from "react";

import { usePointerInteraction } from "@/hooks/use-pointer-interaction";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { TitleTypewriter } from "@/lib/title-typewriter";

const PREFIX = "charlotte ";
const DELETE_TEXT = "zhuang";
const TYPE_TEXT = "says hi";

const RESTING_TITLE = PREFIX + DELETE_TEXT; // "charlotte zhuang"
const REVEALED_TITLE = PREFIX + TYPE_TEXT; // "charlotte says hi"

function useTitleTypewriter() {
  const [text, setText] = useState(RESTING_TITLE);
  const [engine] = useState(
    () =>
      new TitleTypewriter({
        prefix: PREFIX,
        deleteText: DELETE_TEXT,
        typeText: TYPE_TEXT,
        onText: setText,
      }),
  );

  useEffect(() => () => engine.dispose(), [engine]);

  return { text, engine };
}

/**
 * One line of the title stack. All lines share a single grid cell so the widest
 * one (caret included) fixes the width and the layout never shifts as the text
 * grows and shrinks. Only the visible line shows its caret.
 */
function TitleLine({
  children,
  visible = false,
  caretBlinking = false,
}: {
  children: string;
  visible?: boolean;
  caretBlinking?: boolean;
}) {
  return (
    <span
      aria-hidden={visible ? undefined : true}
      className={cn(
        "col-start-1 row-start-1 flex items-center whitespace-pre",
        !visible && "invisible",
      )}
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "ml-0.5 inline-block h-[1.1em] w-0.5 bg-current",
          caretBlinking ? "motion-safe:animate-caret-blink" : "opacity-0",
        )}
      />
    </span>
  );
}

export function AnimatedTitle() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const { text, engine } = useTitleTypewriter();

  const handlers = usePointerInteraction({
    onInteractionStart: () => engine.play(),
    onInteractionEnd: () => engine.reverse(),
    disabled: prefersReducedMotion,
  });

  // Only blink while characters are moving — hide it once the effect settles at
  // either end (resting or fully revealed).
  const showCaret = !prefersReducedMotion && text !== RESTING_TITLE && text !== REVEALED_TITLE;

  return (
    <h1
      {...handlers}
      aria-label={RESTING_TITLE}
      className="cursor-default text-xl font-bold select-none"
    >
      <span className="grid">
        <TitleLine>{RESTING_TITLE}</TitleLine>
        <TitleLine>{REVEALED_TITLE}</TitleLine>
        <TitleLine visible caretBlinking={showCaret}>
          {text}
        </TitleLine>
      </span>
    </h1>
  );
}
