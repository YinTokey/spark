import { isRecord, parseIdea, parseScript, readBoundedText } from "../lib/client-http.ts";
import type { Idea, Script } from "../lib/spark-data.ts";

export type CaptureUploadResult =
  | { kind: "idea"; idea: Idea }
  | { kind: "script"; script: Script }
  | { kind: "no_recent_ideas"; message: string }
  | { kind: "error"; message: string; recovery: "retry" | "record_again" | "sign_in" | "wait" };

const MAX_RESPONSE_BYTES = 64 * 1024;

const statusMessages: Record<number, Extract<CaptureUploadResult, { kind: "error" }>> = {
  401: { kind: "error", message: "Please sign in again to keep capturing ideas.", recovery: "sign_in" },
  413: { kind: "error", message: "That recording is too large. Try a shorter thought.", recovery: "record_again" },
  429: { kind: "error", message: "Too many captures. Please wait an hour before trying again.", recovery: "wait" },
  502: { kind: "error", message: "Spark couldn't finish this one. Please try again.", recovery: "retry" },
  503: { kind: "error", message: "Spark is temporarily unavailable. Please try again later.", recovery: "retry" },
};

function retryError(message: string): Extract<CaptureUploadResult, { kind: "error" }> {
  return { kind: "error", message, recovery: "retry" };
}

function parseResult(value: unknown): CaptureUploadResult | null {
  if (!isRecord(value)) return null;
  if (value.kind === "idea" && isRecord(value.idea)) {
    const idea = parseIdea(value.idea);
    return idea ? { kind: "idea", idea } : null;
  }
  if (value.kind === "script" && isRecord(value.script)) {
    const script = parseScript(value.script);
    return script ? { kind: "script", script } : null;
  }
  if (value.kind === "no_recent_ideas" && typeof value.message === "string" && value.message.length <= 500) {
    return { kind: "no_recent_ideas", message: value.message };
  }
  return null;
}

function audioExtension(type: string) {
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4")) return "m4a";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("wav")) return "wav";
  return "webm";
}

export async function uploadCapture(audio: Blob, signal?: AbortSignal): Promise<CaptureUploadResult> {
  const type = audio.type || "audio/webm";
  const form = new FormData();
  form.set("audio", new File([audio], `capture.${audioExtension(type)}`, { type }));

  let response: Response;
  try {
    response = await fetch("/api/capture", { method: "POST", body: form, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return retryError("Could not reach Spark. Check your connection and try again.");
  }

  if (!response.ok) {
    return statusMessages[response.status] ?? retryError("Spark couldn't finish this one. Please try again.");
  }

  const text = await readBoundedText(response, MAX_RESPONSE_BYTES);
  if (text === null) return retryError("Spark sent an unexpected response. Please try again.");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return retryError("Spark sent an unexpected response. Please try again."); }
  const result = parseResult(parsed);
  return result ?? retryError("Spark sent an unexpected response. Please try again.");
}
