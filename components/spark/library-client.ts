import { isRecord, parseIdea, parseScript, readBoundedText } from "../../lib/client-http.ts";
import type { Idea, LibraryData, Script } from "../../lib/spark-data.ts";

export type IdeaCreateResult = { idea: Idea } | { error: string };
export type ScriptCreateResult = { script: Script } | { error: string };
export type LibraryLoadResult = { library: LibraryData } | { error: string };

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_LIBRARY_BYTES = 600 * 1024;
const MAX_IDEA_TEXT_LENGTH = 8_000;
const MAX_SCRIPT_IDEAS = 12;

const statusMessages: Record<number, string> = {
  401: "Please sign in again to keep saving ideas.",
  429: "Too many saved ideas. Please wait an hour before trying again.",
  502: "Could not confirm that your idea was saved. Check your library before trying again.",
  503: "Saving ideas is temporarily unavailable. Please try again later.",
};

export async function createIdea(text: string, signal?: AbortSignal): Promise<IdeaCreateResult> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { error: "Enter an idea before saving." };
  if (trimmed.length > MAX_IDEA_TEXT_LENGTH) return { error: "Keep your idea under 8,000 characters." };

  let response: Response;
  try {
    response = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { error: "Could not reach Spark. Check your connection and try again." };
  }

  if (!response.ok) {
    return { error: statusMessages[response.status] ?? "Could not save your idea. Please try again." };
  }

  const responseText = await readBoundedText(response, MAX_RESPONSE_BYTES);
  if (responseText === null) return { error: "Spark sent an unexpected response. Please try again." };
  let parsed: unknown;
  try { parsed = JSON.parse(responseText); } catch { return { error: "Spark sent an unexpected response. Please try again." }; }
  if (!isRecord(parsed) || !isRecord(parsed.idea)) return { error: "Spark sent an unexpected response. Please try again." };
  const idea = parseIdea(parsed.idea);
  return idea ? { idea } : { error: "Spark sent an unexpected response. Please try again." };
}

export async function createScriptFromIdeas(ideaIds: string[], signal?: AbortSignal): Promise<ScriptCreateResult> {
  if (ideaIds.length === 0 || ideaIds.length > MAX_SCRIPT_IDEAS || new Set(ideaIds).size !== ideaIds.length) {
    return { error: "Select between 1 and 12 ideas." };
  }

  let response: Response;
  try {
    response = await fetch("/api/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaIds }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { error: "Could not reach Spark. Check your connection and try again." };
  }

  if (!response.ok) {
    const message = response.status === 401 ? "Please sign in again to create a script."
      : response.status === 429 ? "Too many scripts. Please wait an hour before trying again."
        : "Could not create a script. Please try again.";
    return { error: message };
  }

  const responseText = await readBoundedText(response, MAX_RESPONSE_BYTES);
  if (responseText === null) return { error: "Spark sent an unexpected response. Please try again." };
  let parsed: unknown;
  try { parsed = JSON.parse(responseText); } catch { return { error: "Spark sent an unexpected response. Please try again." }; }
  if (!isRecord(parsed) || !isRecord(parsed.script)) return { error: "Spark sent an unexpected response. Please try again." };
  const script = parseScript(parsed.script);
  return script ? { script } : { error: "Spark sent an unexpected response. Please try again." };
}

export async function loadLibrary(signal?: AbortSignal): Promise<LibraryLoadResult> {
  let response: Response;
  try {
    response = await fetch("/api/library", { cache: "no-store", signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { error: "Could not reach Spark. Check your connection and try again." };
  }

  if (!response.ok) {
    return { error: response.status === 401 ? "Please sign in again." : "Could not load your library. Check your connection and try again." };
  }

  const responseText = await readBoundedText(response, MAX_LIBRARY_BYTES);
  if (responseText === null) return { error: "Spark sent an unexpected response. Please try again." };
  let parsed: unknown;
  try { parsed = JSON.parse(responseText); } catch { return { error: "Spark sent an unexpected response. Please try again." }; }
  if (!isRecord(parsed) || !Array.isArray(parsed.ideas) || !Array.isArray(parsed.scripts)) return { error: "Spark sent an unexpected response. Please try again." };

  const ideas: Idea[] = [];
  for (const value of parsed.ideas) {
    const idea = parseIdea(value);
    if (!idea) return { error: "Spark sent an unexpected response. Please try again." };
    ideas.push(idea);
  }
  const scripts: Script[] = [];
  for (const value of parsed.scripts) {
    const script = parseScript(value);
    if (!script) return { error: "Spark sent an unexpected response. Please try again." };
    scripts.push(script);
  }
  return { library: { ideas, scripts } };
}
