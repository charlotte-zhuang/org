import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

import { TitleTypewriter } from "./title-typewriter";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("deletes the initial suffix and types a different suffix", () => {
  vi.useFakeTimers();
  const texts: string[] = [];
  const typewriter = new TitleTypewriter({
    prefix: "charlotte ",
    suffixes: ["zhuang", "says hi"],
    onText: (text) => texts.push(text),
    deleteStepMs: 1,
    typeStepMs: 1,
  });

  typewriter.play();
  for (let step = 0; step < 13; step++) vi.runOnlyPendingTimers();

  assert.deepEqual(texts, [
    "charlotte zhuan",
    "charlotte zhua",
    "charlotte zhu",
    "charlotte zh",
    "charlotte z",
    "charlotte ",
    "charlotte s",
    "charlotte sa",
    "charlotte say",
    "charlotte says",
    "charlotte says ",
    "charlotte says h",
    "charlotte says hi",
  ]);
});

test("reverses from the current position when interrupted", () => {
  vi.useFakeTimers();
  const texts: string[] = [];
  const typewriter = new TitleTypewriter({
    prefix: "prefix ",
    suffixes: ["abc", "xyz"],
    onText: (text) => texts.push(text),
    deleteStepMs: 1,
    typeStepMs: 1,
  });

  typewriter.play();
  vi.runOnlyPendingTimers();
  vi.runOnlyPendingTimers();
  typewriter.reverse();
  vi.runOnlyPendingTimers();
  vi.runOnlyPendingTimers();

  assert.deepEqual(texts, ["prefix ab", "prefix a", "prefix ab", "prefix abc"]);
});

test("starts a fresh cycle from the completed suffix", () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  const texts: string[] = [];
  const typewriter = new TitleTypewriter({
    prefix: "prefix ",
    suffixes: ["a", "b", "c"],
    onText: (text) => texts.push(text),
    deleteStepMs: 1,
    typeStepMs: 1,
  });

  typewriter.play();
  vi.runOnlyPendingTimers();
  vi.runOnlyPendingTimers();
  typewriter.play();
  vi.runOnlyPendingTimers();
  vi.runOnlyPendingTimers();

  assert.deepEqual(texts, ["prefix ", "prefix c", "prefix ", "prefix b"]);
});

test.each([
  { name: "no suffixes", suffixes: [] },
  { name: "no distinct suffixes", suffixes: ["same", "same"] },
])("does nothing with $name", ({ suffixes }) => {
  vi.useFakeTimers();
  const onText = vi.fn();
  const typewriter = new TitleTypewriter({
    prefix: "prefix ",
    suffixes: suffixes as [string, string, ...string[]],
    onText,
  });

  typewriter.play();
  typewriter.reverse();
  vi.runAllTimers();

  assert.equal(onText.mock.calls.length, 0);
  assert.equal(vi.getTimerCount(), 0);
});
