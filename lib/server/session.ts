import { readBoundedJson } from './bounded-response.ts';
import { getSupabaseConfig } from './supabase.ts';

const MAX_USER_RESPONSE_BYTES = 16_384;

export type AuthenticatedUser = { id: string };

export async function authenticateAccessToken(token: string): Promise<AuthenticatedUser | null> {
  if (token.length === 0 || token.length > 8_192) return null;
  const config = getSupabaseConfig();
  if (!config) return null;
  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    return null;
  }
  const result = await readBoundedJson(response, MAX_USER_RESPONSE_BYTES);
  if (!response.ok || typeof result !== 'object' || result === null || !('id' in result) || typeof result.id !== 'string') return null;
  const id = result.id.trim();
  return id.length > 0 && id.length <= 128 ? { id } : null;
}
