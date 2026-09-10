type Operation = 'ai_capture' | 'idea_write';
type Window = { hour: number; count: number };

const HOUR_MS = 60 * 60 * 1_000;
const DEFAULT_MAX_KEYS = 1_000;

export function createFixedWindowRateLimiter(options: { maxKeys?: number; now?: () => number } = {}) {
  const windows = new Map<string, Window>();
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const now = options.now ?? Date.now;

  return {
    consume(userId: string, operation: Operation, limit: number) {
      const hour = Math.floor(now() / HOUR_MS);
      const key = `${userId}:${operation}`;
      const current = windows.get(key);

      if (current?.hour === hour) {
        if (current.count >= limit) return false;
        current.count += 1;
        return true;
      }

      for (const [storedKey, window] of windows) {
        if (window.hour !== hour) windows.delete(storedKey);
      }
      if (!windows.has(key) && windows.size >= maxKeys) return false;
      windows.set(key, { hour, count: 1 });
      return true;
    },
  };
}

export const demoRateLimiter = createFixedWindowRateLimiter();
