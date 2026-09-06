export type RingBuffer = {
  capacity: number;
  values: Float32Array;
  head: number;
  filled: number;
};

export function createRingBuffer(capacity: number): RingBuffer {
  return { capacity, values: new Float32Array(capacity), head: 0, filled: 0 };
}

export function clearRingBuffer(buffer: RingBuffer): void {
  buffer.values.fill(0);
  buffer.head = 0;
  buffer.filled = 0;
}

export function pushSample(buffer: RingBuffer, value: number): void {
  buffer.values[buffer.head] = value;
  buffer.head = (buffer.head + 1) % buffer.capacity;
  buffer.filled = Math.min(buffer.filled + 1, buffer.capacity);
}

/** Returns up to `count` most recent samples, oldest first. */
export function readRecent(buffer: RingBuffer, count: number): number[] {
  const n = Math.min(count, buffer.filled);
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const offset = n - i;
    const index = (buffer.head - offset + buffer.capacity * 2) % buffer.capacity;
    out[i] = buffer.values[index];
  }
  return out;
}
