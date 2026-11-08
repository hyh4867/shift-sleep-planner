import type { Block, BlockKind } from '../src/domain/types';
import { resolveRange } from '../src/domain/time';

let n = 0;
/** 가상 일정 블록 생성: 날짜 + "HH:mm"–"HH:mm" (종료가 이르면 다음 날) */
export function blk(kind: BlockKind, date: string, start: string, end: string, note?: string): Block {
  const r = resolveRange(date, start, end);
  return { id: `${kind}-${++n}`, kind, start: r.start, end: r.end, note };
}
