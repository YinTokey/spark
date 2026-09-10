import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixedWindowRateLimiter } from './rate-limit.ts';

test('denies requests after the fixed-window allowance and resets next hour', () => {
  let now = Date.parse('2026-09-10T12:15:00Z');
  const limiter = createFixedWindowRateLimiter({ now: () => now });

  assert.equal(limiter.consume('user-1', 'ai_capture', 2), true);
  assert.equal(limiter.consume('user-1', 'ai_capture', 2), true);
  assert.equal(limiter.consume('user-1', 'ai_capture', 2), false);

  now = Date.parse('2026-09-10T13:00:00Z');
  assert.equal(limiter.consume('user-1', 'ai_capture', 2), true);
});

test('keeps allowances isolated by user and operation', () => {
  const limiter = createFixedWindowRateLimiter();

  assert.equal(limiter.consume('user-1', 'ai_capture', 1), true);
  assert.equal(limiter.consume('user-1', 'ai_capture', 1), false);
  assert.equal(limiter.consume('user-1', 'idea_write', 1), true);
  assert.equal(limiter.consume('user-1', 'realtime_session', 1), true);
  assert.equal(limiter.consume('user-2', 'ai_capture', 1), true);
});

test('caps tracked keys and reclaims expired windows', () => {
  let now = Date.parse('2026-09-10T12:00:00Z');
  const limiter = createFixedWindowRateLimiter({ maxKeys: 2, now: () => now });

  assert.equal(limiter.consume('user-1', 'ai_capture', 1), true);
  assert.equal(limiter.consume('user-2', 'ai_capture', 1), true);
  assert.equal(limiter.consume('user-3', 'ai_capture', 1), false);

  now = Date.parse('2026-09-10T13:00:00Z');
  assert.equal(limiter.consume('user-3', 'ai_capture', 1), true);
});
