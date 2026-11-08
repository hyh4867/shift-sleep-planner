import { describe, expect, it } from 'vitest';
import { validateBlock, validateBlockSet } from '../src/domain/overlap';
import { blk } from './helpers';

describe('겹친 블록 거부', () => {
  const night = blk('shift', '2026-11-09', '22:00', '06:00');

  it('자정을 넘는 근무와 다음 날 새벽 블록이 겹치면 오류', () => {
    const early = blk('busy', '2026-11-10', '05:00', '07:00', '점호');
    const errs = validateBlock(early, [night]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('겹치는 블록');
    expect(errs[0]).toContain('2026-11-09 22:00–2026-11-10 06:00');
  });

  it('끝과 시작이 맞닿기만 하면 허용', () => {
    expect(validateBlock(blk('sleep', '2026-11-10', '06:00', '12:00'), [night])).toEqual([]);
    expect(validateBlock(blk('busy', '2026-11-09', '18:00', '22:00'), [night])).toEqual([]);
  });

  it('실제 수면 기록도 근무와 겹치면 오류', () => {
    expect(validateBlock(blk('sleep', '2026-11-10', '01:00', '03:00'), [night])).not.toEqual([]);
  });

  it('완전히 포함된 블록도 오류', () => {
    expect(validateBlock(blk('busy', '2026-11-09', '23:00', '23:30'), [night])).not.toEqual([]);
  });

  it('수정할 때는 자기 자신과 비교하지 않는다', () => {
    const edited = { ...night, end: '2026-11-10T05:00' };
    expect(validateBlock(edited, [night])).toEqual([]);
  });

  it('종료가 시작보다 이르거나 48시간 초과면 오류', () => {
    expect(validateBlock({ ...night, end: night.start }, [])).toContain('종료 시각이 시작 시각보다 늦어야 합니다.');
    expect(validateBlock({ ...night, end: '2026-11-12T06:00' }, [])[0]).toContain('48시간');
  });

  it('가져오기 데이터 전체 검사에서 겹침을 찾는다', () => {
    const a = blk('shift', '2026-11-11', '08:00', '17:00');
    const b = blk('busy', '2026-11-11', '16:00', '18:00');
    const c = blk('sleep', '2026-11-11', '23:00', '06:00');
    const errs = validateBlockSet([c, b, a]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('겹치는 블록');
    expect(validateBlockSet([a, c])).toEqual([]);
  });
});
