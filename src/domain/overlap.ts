import type { Block } from './types';
import { KIND_LABEL } from './types';
import { formatLocal, isLocalDateTime, parseLocal, MIN_PER_DAY } from './time';

/** 블록 하나의 최대 길이 (24시간 당직 + 여유) */
export const MAX_BLOCK_MIN = 2 * MIN_PER_DAY;

export interface Interval {
  start: number;
  end: number;
}

export function toInterval(b: Pick<Block, 'start' | 'end'>): Interval {
  return { start: parseLocal(b.start), end: parseLocal(b.end) };
}

/** 반열린 구간 [s, e) 기준. 끝과 시작이 같으면 겹치지 않는다. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function describe(b: Block): string {
  const s = formatLocal(parseLocal(b.start)).replace('T', ' ');
  const e = formatLocal(parseLocal(b.end)).replace('T', ' ');
  return `${KIND_LABEL[b.kind]} ${s}–${e}${b.note ? ` (${b.note})` : ''}`;
}

/**
 * 저장 전 검사. 근무·잘 수 없는 시간·실제 수면 기록은 서로 겹칠 수 없다.
 * existing 안에 같은 id가 있으면(수정) 그 블록은 비교에서 뺀다.
 */
export function validateBlock(candidate: Block, existing: Block[]): string[] {
  const errors: string[] = [];
  if (!isLocalDateTime(candidate.start) || !isLocalDateTime(candidate.end)) {
    return ['시작·종료 시각 형식이 잘못되었습니다.'];
  }
  const c = toInterval(candidate);
  if (c.end <= c.start) errors.push('종료 시각이 시작 시각보다 늦어야 합니다.');
  if (c.end - c.start > MAX_BLOCK_MIN) errors.push('블록 하나는 48시간을 넘을 수 없습니다.');
  if (errors.length) return errors;
  for (const other of existing) {
    if (other.id === candidate.id) continue;
    if (overlaps(c, toInterval(other))) {
      errors.push(`겹치는 블록이 있습니다: ${describe(other)}`);
    }
  }
  return errors;
}

/** 블록 목록 전체 검사(가져오기용). */
export function validateBlockSet(blocks: Block[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (ids.has(b.id)) errors.push(`중복된 id: ${b.id}`);
    ids.add(b.id);
    const own = validateBlock(b, []);
    if (own.length) {
      errors.push(...own.map((e) => `${b.id}: ${e}`));
      continue;
    }
    for (let j = i + 1; j < sorted.length; j++) {
      const o = sorted[j];
      if (!isLocalDateTime(o.start) || !isLocalDateTime(o.end)) continue;
      if (parseLocal(o.start) >= parseLocal(b.end)) break;
      if (overlaps(toInterval(b), toInterval(o))) errors.push(`겹치는 블록: ${describe(b)} ↔ ${describe(o)}`);
    }
  }
  return errors;
}
