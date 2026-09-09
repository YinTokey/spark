import { parseIdea, readBoundedText } from "../../lib/client-http.ts";
import type { Idea } from "../../lib/spark-data.ts";

export type IdeaCreateResult = { idea: Idea } | { error: string };

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_LENGTH = 8_000;

const statusMessages: Record<number, string> = {
  401: "Please sign in again to keep saving ideas.",
  429: "Too many saved ideas. Please wait an hour before trying again.",
  502: "Could not confirm that your idea was saved. Check your library before trying again.",
  503: "Saving ideas is temporarily unavailable. Please try again later.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function createIdea(transcript: string, signal?: AbortSignal): Promise<IdeaCreateResult> {
  const trimmed = transcript.trim();
  if (trimmed.length === 0) return { error: "Enter an idea before saving." };
  if (trimmed.length > MAX_TRANSCRIPT_LENGTH) return { error: "Keep your idea under 8,000 characters." };

  let response: Response;
  try {
    response = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: trimmed }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { error: "Could not reach Spark. Check your connection and try again." };
  }

  if (!response.ok) {
    return { error: statusMessages[response.status] ?? "Could not save your idea. Please try again." };
  }

  const text = await readBoundedText(response, MAX_RESPONSE_BYTES);
  if (text === null) return { error: "Spark sent an unexpected response. Please try again." };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { error: "Spark sent an unexpected response. Please try again." }; }
  if (!isRecord(parsed) || !isRecord(parsed.idea)) return { error: "Spark sent an unexpected response. Please try again." };
  const idea = parseIdea(parsed.idea);
  return idea ? { idea } : { error: "Spark sent an unexpected response. Please try again." };
}
