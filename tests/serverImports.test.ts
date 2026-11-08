import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vercel 서버 함수는 Node ESM으로 실행되어 상대 경로 import에 확장자(.js)가 꼭 있어야 한다.
 * (Vite·Vitest는 확장자 없이도 동작해서 로컬 테스트로는 드러나지 않는다 — 실제 배포에서 ERR_MODULE_NOT_FOUND로 확인됨)
 * api/에서 시작해 값(value) import로 닿는 모든 파일을 따라가며 검사한다.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_RE = /^\s*(import|export)\s+(?!type\b)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm;

function walk(file: string, seen: Set<string>, bad: string[]) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[2];
    if (!spec.endsWith('.js')) {
      bad.push(`${file.replace(root + '/', '')}: '${spec}'`);
      continue;
    }
    walk(resolve(dirname(file), spec.replace(/\.js$/, '.ts')), seen, bad);
  }
}

describe('서버 함수 import 경로', () => {
  it('api/summary.ts가 닿는 모든 상대 import에 .js 확장자가 있다', () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    walk(resolve(root, 'api/summary.ts'), seen, bad);
    expect(bad).toEqual([]);
    expect(seen.size).toBeGreaterThanOrEqual(4); // api, handler, rateLimit, config, payload
  });
});
