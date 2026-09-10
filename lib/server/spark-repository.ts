import { z } from 'zod';
import { toIdea, toScript, type Idea, type IdeaRecord, type LibraryData, type Script } from '../spark-data.ts';
import { readBoundedJson } from './bounded-response.ts';
import { getSupabaseConfig } from './supabase.ts';

const MAX_LIBRARY_ROWS = 50;
const MAX_RECENT_ROWS = 20;
const MAX_RESPONSE_BYTES = 262_144;
const REQUEST_TIMEOUT_MS = 5_000;
const uuid = z.uuid();
const timestamp = z.string().max(64).refine((value) => Number.isFinite(Date.parse(value)));
const ideaRecord = z.object({ id: uuid, text: z.string().min(1).max(8_000), created_at: timestamp }).strict();
const scriptRecord = z.object({
  id: uuid, text: z.string().min(1).max(8_000), idea_ids: z.array(uuid).min(1).max(12), created_at: timestamp,
}).strict();
const scriptInput = z.object({
  text: z.string().trim().min(1).max(8_000), ideaIds: z.array(uuid).min(1).max(12).refine((ids) => new Set(ids).size === ids.length),
}).strict();
const selectedIdeaIds = z.array(uuid).min(1).max(12).refine((ids) => new Set(ids).size === ids.length);

const stopWords = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'into', 'is', 'my', 'of', 'on', 'or', 'the', 'to', 'with']);

export class RepositoryError extends Error {
  readonly code: 'unavailable' | 'upstream_unavailable' | 'upstream_invalid' | 'invalid_idea' | 'invalid_script' | 'cancelled';

  constructor(code: 'unavailable' | 'upstream_unavailable' | 'upstream_invalid' | 'invalid_idea' | 'invalid_script' | 'cancelled') {
    super(code);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

function hintTokens(hint: string) {
  return [...new Set(hint.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu)?.filter((token) => !stopWords.has(token)) ?? [])].slice(0, 12);
}

export function createSparkRepository(token: string) {
  const config = getSupabaseConfig();
  if (!config || token.length === 0 || token.length > 8_192) throw new RepositoryError('unavailable');
  const supabaseUrl = config.url;
  const baseHeaders = { apikey: config.publishableKey, Authorization: `Bearer ${token}` };

  async function request(path: string, init: RequestInit = {}, signal?: AbortSignal) {
    if (signal?.aborted) throw new RepositoryError('cancelled');
    const startedAt = Date.now();
    const resource = path.split('?', 1)[0];
    const operation = init.method ?? 'GET';
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        ...init,
        headers: { ...baseHeaders, ...init.headers },
        signal: combined,
        cache: 'no-store',
        redirect: 'error',
      });
    } catch {
      console.info('repository.upstream_completed', { resource, operation, status: 0, durationMs: Date.now() - startedAt });
      throw new RepositoryError(signal?.aborted ? 'cancelled' : 'upstream_unavailable');
    }
    console.info('repository.upstream_completed', { resource, operation, status: response.status, durationMs: Date.now() - startedAt });
    if (signal?.aborted) throw new RepositoryError('cancelled');
    const result = await readBoundedJson(response, MAX_RESPONSE_BYTES);
    if (result === null || !response.ok) throw new RepositoryError('upstream_invalid');
    return result;
  }

  async function loadLibrary(): Promise<LibraryData> {
    const [ideasResult, scriptsResult] = await Promise.all([
      request(`ideas?${query({ select: 'id,text,created_at', order: 'created_at.desc', limit: String(MAX_LIBRARY_ROWS) })}`),
      request(`scripts?${query({ select: 'id,text,idea_ids,created_at', order: 'created_at.desc', limit: String(MAX_LIBRARY_ROWS) })}`),
    ]);
    const ideas = z.array(ideaRecord).max(MAX_LIBRARY_ROWS).safeParse(ideasResult);
    const scripts = z.array(scriptRecord).max(MAX_LIBRARY_ROWS).safeParse(scriptsResult);
    if (!ideas.success || !scripts.success) throw new RepositoryError('upstream_invalid');
    return { ideas: ideas.data.map((row) => toIdea(row)), scripts: scripts.data.map((row) => toScript(row)) };
  }

  async function insertIdea(text: string, signal?: AbortSignal): Promise<Idea> {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (trimmed.length === 0 || trimmed.length > 8_000) throw new RepositoryError('invalid_idea');
    const result = await request(`ideas?${query({ select: 'id,text,created_at' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ text: trimmed }) }, signal);
    const parsed = z.array(ideaRecord).length(1).safeParse(result);
    if (!parsed.success) throw new RepositoryError('upstream_invalid');
    return toIdea(parsed.data[0]);
  }

  async function findRecentIdeas(since: Date, hint: string, signal?: AbortSignal): Promise<IdeaRecord[]> {
    if (!(since instanceof Date) || !Number.isFinite(since.getTime()) || typeof hint !== 'string' || hint.length > 500) throw new RepositoryError('upstream_invalid');
    const result = await request(`ideas?${query({ select: 'id,text,created_at', created_at: `gte.${since.toISOString()}`, order: 'created_at.desc', limit: String(MAX_RECENT_ROWS) })}`, {}, signal);
    const parsed = z.array(ideaRecord).max(MAX_RECENT_ROWS).safeParse(result);
    if (!parsed.success) throw new RepositoryError('upstream_invalid');
    const newestFirst = [...parsed.data].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
    const tokens = hintTokens(hint);
    if (hint.length === 0) return newestFirst;
    if (tokens.length === 0) return [];
    return newestFirst
      .map((row) => ({ row, score: hintTokens(row.text).some((token) => tokens.includes(token)) ? 1 : 0 }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || Date.parse(right.row.created_at) - Date.parse(left.row.created_at))
      .map(({ row }) => row);
  }

  async function findIdeasByIds(ids: unknown, signal?: AbortSignal): Promise<IdeaRecord[]> {
    const parsedIds = selectedIdeaIds.safeParse(ids);
    if (!parsedIds.success) throw new RepositoryError('invalid_idea');
    const result = await request(`ideas?${query({ select: 'id,text,created_at', id: `in.(${parsedIds.data.join(',')})`, limit: String(parsedIds.data.length) })}`, {}, signal);
    const parsed = z.array(ideaRecord).max(parsedIds.data.length).safeParse(result);
    if (!parsed.success || parsed.data.length !== parsedIds.data.length || new Set(parsed.data.map((idea) => idea.id)).size !== parsedIds.data.length) {
      throw new RepositoryError('invalid_idea');
    }
    return parsed.data;
  }


  async function insertScript(input: unknown, signal?: AbortSignal): Promise<Script> {
    const validated = scriptInput.safeParse(input);
    if (!validated.success) throw new RepositoryError('invalid_script');
    const ids = validated.data.ideaIds;
    const owned = await request(`ideas?${query({ select: 'id', id: `in.(${ids.join(',')})`, limit: String(ids.length) })}`, {}, signal);
    const ownedRows = z.array(z.object({ id: uuid }).strict()).max(ids.length).safeParse(owned);
    if (!ownedRows.success || ownedRows.data.length !== ids.length || new Set(ownedRows.data.map((row) => row.id)).size !== ids.length) throw new RepositoryError('invalid_script');
    const result = await request(`scripts?${query({ select: 'id,text,idea_ids,created_at' })}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ text: validated.data.text, idea_ids: ids }),
    }, signal);
    const parsed = z.array(scriptRecord).length(1).safeParse(result);
    if (!parsed.success) throw new RepositoryError('upstream_invalid');
    return toScript(parsed.data[0]);
  }

  return { loadLibrary, insertIdea, findRecentIdeas, findIdeasByIds, insertScript };
}
