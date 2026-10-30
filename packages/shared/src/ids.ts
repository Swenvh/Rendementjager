import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let lastTime = -1;
let lastRand: number[] = [];

/**
 * ULID-like id: 10 chars of millisecond timestamp + 16 chars of randomness (Crockford base32),
 * lexicographically sortable by creation time. Optional prefix, e.g. newId('ci') -> "ci_01J...".
 * Monotonic within a process: ids in the same millisecond (or after a small clock step back)
 * increment the random part, so sorting by id equals creation order.
 */
export function newId(prefix?: string, now: number = Date.now()): string {
  let digits: number[];
  if (now <= lastTime && lastTime - now < 10_000) {
    now = lastTime;
    digits = [...lastRand];
    for (let i = 15; i >= 0; i--) {
      if (digits[i]! < 31) {
        digits[i]!++;
        break;
      }
      digits[i] = 0;
    }
  } else {
    const bytes = randomBytes(16);
    digits = Array.from(bytes, (b) => b % 32);
    digits[0] = digits[0]! % 16; // headroom for increments
  }
  lastTime = now;
  lastRand = digits;
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rand = digits.map((d) => CROCKFORD[d]).join('');
  const id = time + rand;
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso(date: Date = new Date()): string {
  return date.toISOString();
}
