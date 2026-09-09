import { Buffer } from 'node:buffer';

function extractBoundary(contentType: string): string | null {
  const match = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || boundary.length === 0 || boundary.length > 200) return null;
  return boundary;
}

function parsePartHeaders(block: string) {
  let name = '';
  let filename = '';
  let contentType = '';
  for (const line of block.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'content-disposition') {
      name = /(?:^|;)\s*name\s*=\s*"([^"]*)"/i.exec(value)?.[1] ?? '';
      filename = /(?:^|;)\s*filename\s*=\s*"([^"]*)"/i.exec(value)?.[1] ?? '';
    } else if (key === 'content-type') {
      contentType = value;
    }
  }
  return { name, filename, contentType };
}

export async function parseMultipartFormData(body: Blob, contentType: string): Promise<FormData | null> {
  const boundary = extractBoundary(contentType);
  if (!boundary) return null;

  // latin1 maps bytes to characters 1:1, so boundary search is lossless even around binary audio.
  const raw = Buffer.from(await body.arrayBuffer()).toString('latin1');
  const delimiter = `--${boundary}`;
  const open = raw.indexOf(delimiter);
  if (open === -1) return null;

  const form = new FormData();
  let cursor = open + delimiter.length;
  while (true) {
    if (raw.startsWith('--', cursor)) break;
    if (!raw.startsWith('\r\n', cursor)) return null;
    cursor += 2;
    const headerEnd = raw.indexOf('\r\n\r\n', cursor);
    if (headerEnd === -1) return null;
    const headers = parsePartHeaders(raw.slice(cursor, headerEnd));
    if (headers.name.length === 0) return null;
    const contentStart = headerEnd + 4;
    const next = raw.indexOf(`\r\n${delimiter}`, contentStart);
    if (next === -1) return null;
    const content = Buffer.from(raw.slice(contentStart, next), 'latin1');
    if (headers.filename) {
      form.append(headers.name, new File([content], headers.filename, { type: headers.contentType }));
    } else {
      form.append(headers.name, content.toString('utf8'));
    }
    cursor = next + 2 + delimiter.length;
  }
  return form;
}
