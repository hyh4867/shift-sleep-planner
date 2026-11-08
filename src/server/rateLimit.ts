/** 기기·IP별 하루 호출 횟수 제한. */
export interface RateLimiter {
  /** key의 카운트를 1 올리고 올린 뒤 값을 돌려준다. ttlSec 뒤 만료. */
  hit(key: string, ttlSec: number): Promise<number>;
}

/** 서버 인스턴스 메모리 — 인스턴스가 바뀌면 초기화된다(로컬 개발·대체용). */
export function memoryLimiter(): RateLimiter {
  const store = new Map<string, { count: number; expires: number }>();
  return {
    async hit(key, ttlSec) {
      const now = Date.now();
      const cur = store.get(key);
      if (!cur || cur.expires <= now) {
        store.set(key, { count: 1, expires: now + ttlSec * 1000 });
        return 1;
      }
      cur.count += 1;
      return cur.count;
    },
  };
}

/** Upstash Redis(또는 Vercel KV) REST API — 공개 데모용 영구 카운터 */
export function upstashLimiter(url: string, token: string, fetchImpl: typeof fetch = fetch): RateLimiter {
  return {
    async hit(key, ttlSec) {
      const res = await fetchImpl(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        // 키가 없을 때만 0으로 만들며 만료를 걸고(SET NX EX), 그 다음 1 올린다.
        body: JSON.stringify([
          ['SET', key, '0', 'EX', String(ttlSec), 'NX'],
          ['INCR', key],
        ]),
      });
      if (!res.ok) throw new Error(`rate limit store error ${res.status}`);
      const data = (await res.json()) as { result?: number; error?: string }[];
      const n = data[1]?.result;
      if (typeof n !== 'number') throw new Error('rate limit store: unexpected response');
      return n;
    },
  };
}

/** 한국 시간 기준 날짜(하루 제한의 경계) */
export function kstDay(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
