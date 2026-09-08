/** Alternating [pulseMs, gapMs, pulseMs, ...] vibration pattern. */
export type BuzzPattern = number[];

export const START_BUZZ_PATTERN: BuzzPattern = [180];
export const STOP_BUZZ_PATTERN: BuzzPattern = [90, 80, 90];

export function patternDurationMs(pattern: BuzzPattern): number {
  return pattern.reduce((total, ms) => total + ms, 0);
}

/**
 * A haptic motor hums in this range; a sine here reads as vibration rather
 * than as a beep on devices that have no way to actually vibrate.
 */
const BUZZ_TONES: { hz: number; gain: number }[] = [
  { hz: 62, gain: 0.18 },
  { hz: 124, gain: 0.063 },
];

const ATTACK_S = 0.008;
const RELEASE_S = 0.03;

export type AudioBuzzContext = Pick<AudioContext, "currentTime" | "createOscillator" | "createGain" | "destination">;

/** Schedules the buzz's oscillators against `ctx`. No-ops if `ctx` is null. */
export function scheduleBuzz(ctx: AudioBuzzContext | null, pattern: BuzzPattern): void {
  if (!ctx) return;
  let t = ctx.currentTime;
  for (let i = 0; i < pattern.length; i += 2) {
    const durationS = pattern[i] / 1000;
    const gapMs = pattern[i + 1] ?? 0;
    for (const tone of BUZZ_TONES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.hz;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(tone.gain, t + ATTACK_S);
      gain.gain.setValueAtTime(tone.gain, t + Math.max(ATTACK_S, durationS - RELEASE_S));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + durationS);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + durationS + 0.02);
    }
    t += durationS + gapMs / 1000;
  }
}

export function vibrateDevice(pattern: BuzzPattern): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw when vibration is disallowed (e.g. no user
      // gesture, or the permission policy blocks it). The other three buzz
      // channels still carry the feedback, so this is safe to ignore.
    }
  }
}

export function activatePendant(
  recording: boolean,
  onPress: () => void,
  buzz: (pattern: BuzzPattern) => void = vibrateDevice,
): void {
  buzz(recording ? STOP_BUZZ_PATTERN : START_BUZZ_PATTERN);
  onPress();
}
