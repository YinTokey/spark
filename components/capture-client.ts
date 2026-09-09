import type { Idea, Script } from "@/lib/spark-data";

export type CaptureUploadResult =
  | { kind: "idea"; idea: Idea }
  | { kind: "script"; script: Script }
  | { kind: "no_recent_ideas"; message: string }
  | { kind: "error"; message: string; retryable: boolean };

const MAX_RESPONSE_BYTES = 64 * 1024;

const statusMessages: Record<number, { message: string; retryable: boolean }> = {
  401: { message: "Please sign in again to keep capturing ideas.", retryable: false },
  413: { message: "That recording is too large. Try a shorter thought.", retryable: false },
  429: { message: "Too many captures. Please wait an hour before trying again.", retryable: false },
  502: { message: "Spark couldn't finish this one. Please try again.", retryable: true },
  503: { message: "Spark is temporarily unavailable. Please try again later.", retryable: true },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    result.push(item);
  }
  return result;
}

function ideaFrom(value: Record<string, unknown>): Idea | null {
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.note !== "string" ||
      typeof value.date !== "string" || typeof value.time !== "string" ||
      (value.status !== "Raw" && value.status !== "Shaped")) return null;
  return { id: value.id, title: value.title, note: value.note, date: value.date, time: value.time, status: value.status };
}

function scriptFrom(value: Record<string, unknown>): Script | null {
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.hook !== "string" ||
      typeof value.outro !== "string" ||
      (value.status !== "Ready to record" && value.status !== "Draft" && value.status !== "Editing")) return null;
  const ideaIds = stringArray(value.ideaIds);
  const points = stringArray(value.points);
  if (!ideaIds || !points) return null;
  return { id: value.id, title: value.title, status: value.status, ideaIds, hook: value.hook, points, outro: value.outro };
}

function parseResult(value: unknown): CaptureUploadResult | null {
  if (!isRecord(value)) return null;
  if (value.kind === "idea" && isRecord(value.idea)) {
    const idea = ideaFrom(value.idea);
    return idea ? { kind: "idea", idea } : null;
  }
  if (value.kind === "script" && isRecord(value.script)) {
    const script = scriptFrom(value.script);
    return script ? { kind: "script", script } : null;
  }
  if (value.kind === "no_recent_ideas" && typeof value.message === "string" && value.message.length <= 500) {
    return { kind: "no_recent_ideas", message: value.message };
  }
  return null;
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) return null;
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel().catch(() => {}); return null; }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
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
    return { kind: "error", message: "Could not reach Spark. Check your connection and try again.", retryable: true };
  }

  if (!response.ok) {
    const mapped = statusMessages[response.status] ?? { message: "Spark couldn't finish this one. Please try again.", retryable: true };
    return { kind: "error", ...mapped };
  }

  const text = await readBoundedText(response, MAX_RESPONSE_BYTES);
  if (text === null) return { kind: "error", message: "Spark sent an unexpected response. Please try again.", retryable: true };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { kind: "error", message: "Spark sent an unexpected response. Please try again.", retryable: true }; }
  const result = parseResult(parsed);
  return result ?? { kind: "error", message: "Spark sent an unexpected response. Please try again.", retryable: true };
}
