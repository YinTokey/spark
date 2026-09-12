import { NextRequest, NextResponse } from 'next/server.js';
import { getSupabaseConfig } from '../../../lib/server/supabase.ts';
import { readBoundedJson, readBoundedText } from '../../../lib/server/bounded-response.ts';

const MAX_BODY_BYTES = 1_024;
const MAX_UPSTREAM_BYTES = 16_384;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthBody =
  | { mode: 'login'; email: string; password: string }
  | { mode: 'register'; email: string; confirmEmail: string; password: string };

function invitationCodeIsValid(body: Record<string, unknown>) {
  return process.env.NODE_ENV === 'development' || body.invitationCode === 'sparkvid';
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

function parseAuthBody(value: unknown): AuthBody | null {
  if (typeof value !== 'object' || value === null) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.email !== 'string' || typeof body.password !== 'string') return null;
  const email = body.email.trim();
  if (!emailPattern.test(email) || email.length > 254 || body.password.length < 6 || body.password.length > 72) return null;
  if (body.mode === 'login') return { mode: 'login', email, password: body.password };
  if (body.mode !== 'register' || typeof body.confirmEmail !== 'string' || !invitationCodeIsValid(body)) return null;
  const confirmEmail = body.confirmEmail.trim();
  if (!emailPattern.test(confirmEmail) || confirmEmail.length > 254 || confirmEmail !== email) return null;
  return { mode: 'register', email, confirmEmail, password: body.password };
}

function invalidInputMessage(value: unknown) {
  if (typeof value !== 'object' || value === null) return 'Register with a valid email and a password of at least 6 characters.';
  const body = value as Record<string, unknown>;
  if (body.mode === 'register' && typeof body.email === 'string' && typeof body.confirmEmail === 'string' && body.email.trim() !== body.confirmEmail.trim()) {
    return 'Email addresses do not match.';
  }
  if (body.mode === 'register' && !invitationCodeIsValid(body)) return 'Enter a valid invitation code.';
  if (body.mode === 'register') return 'Register with a valid email and a password of at least 6 characters.';
  if (typeof body.email !== 'string' || !emailPattern.test(body.email.trim()) || body.email.trim().length > 254) {
    return 'Enter a valid email address.';
  }
  return 'Password must be at least 6 characters.';
}

async function readSmallJson(response: Response): Promise<Record<string, unknown> | null> {
  const value = await readBoundedJson(response, MAX_UPSTREAM_BYTES);
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return errorResponse('Request not allowed.', 403);

  const declaredLength = request.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) return errorResponse('Request is too large.', 413);

  let parsed: unknown;
  const incoming = await readBoundedText(request.body, MAX_BODY_BYTES);
  if (!incoming.ok) return errorResponse('Request is too large.', 413);
  try { parsed = JSON.parse(incoming.text); } catch { parsed = null; }
  const body = parseAuthBody(parsed);
  if (!body) return errorResponse(invalidInputMessage(parsed), 400);

  const config = getSupabaseConfig();
  if (!config) return errorResponse('Sign in is not configured yet.', 503);
  const endpoint = body.mode === 'register'
    ? `${config.url}/auth/v1/signup`
    : `${config.url}/auth/v1/token?grant_type=password`;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body.email, password: body.password }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch {
    return errorResponse('Could not connect. Please try again.', 502);
  }

  const result = await readSmallJson(upstream);
  if (!result) return errorResponse('Could not continue. Please try again.', 502);
  if (upstream.status >= 500) return errorResponse('Sign in is temporarily unavailable. Please try again.', 502);
  if (!upstream.ok) {
    if (upstream.status === 429) return errorResponse('Too many attempts. Please wait and try again.', 429);
    return errorResponse(body.mode === 'login' ? 'Email or password is incorrect.' : 'Could not create that account.', 400);
  }

  if (typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string') {
    const confirmationUser = body.mode === 'register' && typeof result.id === 'string' && result.id.length > 0 && typeof result.email === 'string';
    if (confirmationUser) {
      return NextResponse.json({ message: 'Check your email to finish registering.' }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return errorResponse('Could not start your session. Please try again.', 502);
  }

  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  const secure = process.env.NODE_ENV === 'production';
  const accessMaxAge = typeof result.expires_in === 'number' && Number.isFinite(result.expires_in)
    ? Math.max(60, Math.min(Math.floor(result.expires_in), 3_600))
    : 3_600;
  response.cookies.set('spark-access-token', result.access_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: accessMaxAge });
  response.cookies.set('spark-refresh-token', result.refresh_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return response;
}
