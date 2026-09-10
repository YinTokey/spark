export const MAX_TITLE_LENGTH = 56;

export type IdeaRecord = {
  id: string;
  text: string;
  created_at: string;
};

export type ScriptRecord = {
  id: string;
  text: string;
  idea_ids: string[];
  created_at: string;
};

export type Idea = {
  id: string;
  title: string;
  note: string;
  date: string;
  time: string;
  status: "Raw" | "Shaped";
};

export type Script = {
  id: string;
  title: string;
  status: "Ready to record" | "Draft" | "Editing";
  ideaIds: string[];
  text: string;
};

export type LibraryData = { ideas: Idea[]; scripts: Script[] };

function truncateTitle(value: string) {
  if (value.length <= MAX_TITLE_LENGTH) return value;

  const truncated = value.slice(0, MAX_TITLE_LENGTH - 1);
  const wordBoundary = truncated.lastIndexOf(" ");
  const title = wordBoundary > 0 ? truncated.slice(0, wordBoundary) : truncated;

  return `${title.trimEnd()}…`;
}

function relativeDate(value: Date, now: Date) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysApart = Math.round((today.getTime() - date.getTime()) / 86_400_000);

  if (daysApart === 0) return "Today";
  if (daysApart === 1) return "Yesterday";

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(value);
}

export function toIdea(record: IdeaRecord, now = new Date()): Idea {
  const firstLine = record.text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
  const createdAt = new Date(record.created_at);

  return {
    id: record.id,
    title: truncateTitle(firstLine),
    note: record.text,
    date: relativeDate(createdAt, now),
    time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(createdAt),
    status: "Raw",
  };
}

function scriptLines(text: string) {
  return text.split(/\r?\n/);
}

function firstContentLine(lines: string[]) {
  return lines.findIndex((line) => line.trim().length > 0);
}

export function scriptBody(text: string) {
  const lines = scriptLines(text);
  const titleLine = firstContentLine(lines);
  return titleLine < 0 ? "" : lines.slice(titleLine + 1).join("\n").trim();
}

export function scriptParagraphs(text: string) {
  return scriptBody(text).split(/\r?\n\s*\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

export function toScript(record: ScriptRecord): Script {
  const lines = scriptLines(record.text);
  const titleLine = firstContentLine(lines);
  return {
    id: record.id,
    title: truncateTitle(titleLine < 0 ? "" : lines[titleLine].trim()),
    status: "Ready to record",
    ideaIds: record.idea_ids,
    text: record.text,
  };
}
