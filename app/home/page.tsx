import Capture from '@/components/capture';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseConfig } from '@/lib/server/supabase';

const MAX_USER_RESPONSE_BYTES = 16_384;

async function hasVerifiedUser(response: Response) {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_USER_RESPONSE_BYTES)) return false;
  const reader = response.body?.getReader();
  if (!reader) return false;
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_USER_RESPONSE_BYTES) {
        await reader.cancel();
        return false;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    return response.ok && typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string' && value.id.length > 0;
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

export default async function HomePage() {
  const accessToken = (await cookies()).get('spark-access-token')?.value;
  const config = getSupabaseConfig();
  if (!accessToken || !config) redirect('/');

  let session: Response;
  try {
    session = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    redirect('/');
  }
  if (!await hasVerifiedUser(session)) redirect('/');
  return <Capture />;
}
