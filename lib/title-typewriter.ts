export type TitleTypewriterConfig = {
  /** Text that stays fixed on both sides of the effect, e.g. `"charlotte "`. */
  prefix: string;
  /** Suffix that gets deleted first, e.g. `"zhuang"`. */
  deleteText: string;
  /** Suffix that gets typed out afterwards, e.g. `"says hi"`. */
  typeText: string;
  /** Called with the current title every time a character is added or removed. */
  onText: (text: string) => void;
  /** Per-character delay while deleting. */
  deleteStepMs?: number;
  /** Per-character delay while typing. */
  typeStepMs?: number;
};

/**
 * Drives a "delete the last name, then type a new phrase" title effect.
 *
 * The whole animation is a single integer `progress` walking a fixed path:
 * `0` is the resting title (`prefix + deleteText`) and `total` is the revealed
 * title (`prefix + typeText`). The displayed string is a pure function of that
 * index, so reversing mid-flight is just flipping the target — progress keeps
 * moving from wherever it currently is, which makes the effect interruptible in
 * both directions for free.
 *
 * Framework-agnostic on purpose: it knows nothing about React and reports every
 * change through the `onText` callback.
 */
export class TitleTypewriter {
  private readonly prefix: string;
  private readonly deleteText: string;
  private readonly typeText: string;
  private readonly total: number;
  private readonly deleteStepMs: number;
  private readonly typeStepMs: number;
  private readonly onText: (text: string) => void;

  private progress = 0;
  private target = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: TitleTypewriterConfig) {
    this.prefix = config.prefix;
    this.deleteText = config.deleteText;
    this.typeText = config.typeText;
    this.total = config.deleteText.length + config.typeText.length;
    this.deleteStepMs = config.deleteStepMs ?? 45;
    this.typeStepMs = config.typeStepMs ?? 75;
    this.onText = config.onText;
  }

  /** Animate toward the revealed phrase. */
  play(): void {
    this.setTarget(this.total);
  }

  /** Animate back toward the resting title. */
  reverse(): void {
    this.setTarget(0);
  }

  /** Cancel any in-flight animation and release the timer. */
  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setTarget(target: number): void {
    this.target = target;
    // A step is already scheduled; the running loop reads `target` each tick, so
    // it will redirect itself. Only kick off a new loop when none is pending.
    if (this.timer === null && this.progress !== this.target) {
      this.scheduleStep();
    }
  }

  private scheduleStep(): void {
    // Deleting is snappier than typing, which reads more like a person at a
    // keyboard than a uniform ticker.
    const inTypePhase = this.progress >= this.deleteText.length;
    const delay = inTypePhase ? this.typeStepMs : this.deleteStepMs;
    this.timer = setTimeout(() => this.step(), delay);
  }

  private step(): void {
    this.timer = null;
    if (this.progress === this.target) return;
    this.progress += this.progress < this.target ? 1 : -1;
    this.onText(this.textFor(this.progress));
    if (this.progress !== this.target) this.scheduleStep();
  }

  private textFor(progress: number): string {
    if (progress <= this.deleteText.length) {
      return this.prefix + this.deleteText.slice(0, this.deleteText.length - progress);
    }
    return this.prefix + this.typeText.slice(0, progress - this.deleteText.length);
  }
}
