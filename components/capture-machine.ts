export type CapturePhase = "ready" | "requesting" | "recording" | "processing" | "done" | "error";

export type CaptureEvent =
  | { type: "REQUESTED" }
  | { type: "RECORDING" }
  | { type: "STOPPED" }
  | { type: "SUCCEEDED" }
  | { type: "FAILED" }
  | { type: "RETRY" }
  | { type: "RESET" };

export const initialPhase: CapturePhase = "ready";

/**
 * Pure reducer for the capture lifecycle. No timers, no browser APIs, no
 * side effects. Events that are not valid for the current phase return the
 * identical phase so stale completions after a reset cannot move "ready".
 */
export function reducePhase(phase: CapturePhase, event: CaptureEvent): CapturePhase {
  switch (phase) {
    case "ready":
      return event.type === "REQUESTED" ? "requesting" : phase;
    case "requesting":
      if (event.type === "RECORDING") return "recording";
      if (event.type === "FAILED") return "error";
      if (event.type === "RESET") return "ready";
      return phase;
    case "recording":
      if (event.type === "STOPPED") return "processing";
      if (event.type === "FAILED") return "error";
      if (event.type === "RESET") return "ready";
      return phase;
    case "processing":
      if (event.type === "SUCCEEDED") return "done";
      if (event.type === "FAILED") return "error";
      if (event.type === "RESET") return "ready";
      return phase;
    case "error":
      if (event.type === "RETRY") return "processing";
      if (event.type === "REQUESTED") return "requesting";
      if (event.type === "RESET") return "ready";
      return phase;
    case "done":
      if (event.type === "RESET") return "ready";
      if (event.type === "REQUESTED") return "requesting";
      return phase;
  }
}
