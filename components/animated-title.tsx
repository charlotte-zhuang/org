"use client";

import { useEffect, useState } from "react";

import { usePointerInteraction } from "@/hooks/use-pointer-interaction";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";
import { TitleTypewriter } from "@/lib/title-typewriter";

const PREFIX = "charlotte ";
const SUFFIXES: [string, string, ...string[]] = [
  "zhuang",
  "says hi",
  "ǝʇʇolɹɐɥɔ",
  "^_^",
  " ✧˖˙⊹₊⋆",
];

const RESTING_TITLE = PREFIX + SUFFIXES[0]; // "charlotte zhuang"
const POSSIBLE_TITLES = SUFFIXES.map((suffix) => PREFIX + suffix);

function useTitleTypewriter() {
  const [text, setText] = useState(RESTING_TITLE);
  const [engine] = useState(
    () =>
      new TitleTypewriter({
        prefix: PREFIX,
        suffixes: SUFFIXES,
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
    onInteractionStart: () => engine.toggle(),
    onInteractionEnd: () => engine.toggle(),
    disabled: prefersReducedMotion,
  });

  // Only blink while characters are moving — hide it once the effect settles at
  // either end (resting or fully revealed).
  const showCaret = !prefersReducedMotion && !POSSIBLE_TITLES.includes(text);

  return (
    <h1
      {...handlers}
      aria-label={RESTING_TITLE}
      className="cursor-default text-xl font-bold select-none"
    >
      <span className="grid">
        {POSSIBLE_TITLES.map((title) => (
          <TitleLine key={title}>{title}</TitleLine>
        ))}
        <TitleLine visible caretBlinking={showCaret}>
          {text}
        </TitleLine>
      </span>
    </h1>
  );
}
