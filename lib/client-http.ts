import type { Idea, Script } from "./spark-data.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
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

export function parseIdea(value: unknown): Idea | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.note !== "string" ||
      typeof value.date !== "string" || typeof value.time !== "string" ||
      (value.status !== "Raw" && value.status !== "Shaped")) return null;
  return { id: value.id, title: value.title, note: value.note, date: value.date, time: value.time, status: value.status };
}

export function parseScript(value: unknown): Script | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.text !== "string" ||
      (value.status !== "Ready to record" && value.status !== "Draft" && value.status !== "Editing")) return null;
  const ideaIds = stringArray(value.ideaIds);
  if (!ideaIds) return null;
  return { id: value.id, title: value.title, status: value.status, ideaIds, text: value.text };
}

export async function readBoundedText(response: Response, maxBytes: number): Promise<string | null> {
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
