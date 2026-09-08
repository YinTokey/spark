export type RecorderState = "idle" | "armingBuzz" | "recording" | "stoppingBuzz" | "saved";

export type Capture = {
  id: string;
  startedAt: number;
  durationMs: number;
  peaks: number[];
  simulated: boolean;
};

export type MachineState = {
  status: RecorderState;
  startedAt: number | null;
  captures: Capture[];
};

export type MachineEvent =
  | { type: "PRESS"; now: number }
  | { type: "BUZZ_END"; now: number; peaks?: number[]; simulated?: boolean }
  | { type: "SAVE_END" };

export const ARMING_BUZZ_MS = 180;
export const STOPPING_BUZZ_MS = 260;
export const SAVED_MS = 1600;
export const MAX_CAPTURES = 5;

export const initialMachineState: MachineState = {
  status: "idle",
  startedAt: null,
  captures: [],
};

/**
 * Pure reducer: no timers, no browser APIs, no wall-clock reads. Callers pass
 * `now` explicitly on timestamped events so behavior stays deterministic and
 * testable. Any event not valid for the current state returns the identical
 * state object.
 */
export function reducer(state: MachineState, event: MachineEvent): MachineState {
  switch (state.status) {
    case "idle":
    case "saved":
      if (event.type === "PRESS") {
        return { ...state, status: "armingBuzz", startedAt: null };
      }
      if (state.status === "saved" && event.type === "SAVE_END") {
        return { ...state, status: "idle" };
      }
      return state;

    case "armingBuzz":
      if (event.type === "BUZZ_END") {
        return { ...state, status: "recording", startedAt: event.now };
      }
      return state;

    case "recording":
      if (event.type === "PRESS") {
        return { ...state, status: "stoppingBuzz" };
      }
      return state;

    case "stoppingBuzz":
      if (event.type === "BUZZ_END") {
        const startedAt = state.startedAt ?? event.now;
        const capture: Capture = {
          id: `capture-${event.now}-${state.captures.length}`,
          startedAt,
          durationMs: Math.max(0, event.now - startedAt),
          peaks: event.peaks ?? [],
          simulated: event.simulated ?? false,
        };
        const captures = [capture, ...state.captures].slice(0, MAX_CAPTURES);
        return { ...state, status: "saved", startedAt: null, captures };
      }
      return state;

    default:
      return state;
  }
}
