import { describe, expect, it } from 'vitest';
import { resolveRange, parseLocal, formatLocal, addDays, isLocalDateTime } from '../src/domain/time';

describe('자정을 넘는 근무', () => {
  it('종료가 시작보다 이르면 다음 날로 넘긴다', () => {
    const r = resolveRange('2026-11-09', '22:00', '06:00');
    expect(r).toEqual({ start: '2026-11-09T22:00', end: '2026-11-10T06:00', crossesMidnight: true });
    expect(parseLocal(r.end) - parseLocal(r.start)).toBe(8 * 60);
  });
  it('같은 날 근무는 그대로', () => {
    expect(resolveRange('2026-11-09', '08:00', '17:00')).toEqual({
      start: '2026-11-09T08:00',
      end: '2026-11-09T17:00',
      crossesMidnight: false,
    });
  });
  it('시작=종료면 24시간 근무로 본다', () => {
    const r = resolveRange('2026-11-09', '09:00', '09:00');
    expect(r.end).toBe('2026-11-10T09:00');
  });
  it('월말·연말도 넘긴다', () => {
    expect(resolveRange('2026-12-31', '23:00', '07:00').end).toBe('2027-01-01T07:00');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('시각 왕복 변환과 형식 검사', () => {
    expect(formatLocal(parseLocal('2026-11-09T22:15'))).toBe('2026-11-09T22:15');
    expect(isLocalDateTime('2026-02-30T10:00')).toBe(false);
    expect(isLocalDateTime('2026-11-09 10:00')).toBe(false);
  });
});
