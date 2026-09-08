export type BoundedTextResult = { ok: true; text: string } | { ok: false };

export async function readBoundedText(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<BoundedTextResult> {
  if (!stream) return { ok: true, text: '' };
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return { ok: true, text: text + decoder.decode() };
  } catch {
    return { ok: false };
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown | null> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) return null;
  const body = await readBoundedText(response.body, maxBytes);
  if (!body.ok) return null;
  try {
    return JSON.parse(body.text) as unknown;
  } catch {
    return null;
  }
}
