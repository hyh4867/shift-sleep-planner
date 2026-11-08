import { describe, expect, it } from 'vitest';
import { buildAiPayload, containsTimeInfo, validateAiPayload, type AiPayload } from '../src/ai/payload';
import { planSleep } from '../src/domain/planner';
import { summarizeWeek } from '../src/domain/weekly';
import { DEFAULT_SETTINGS } from '../src/domain/settings';
import { blk } from './helpers';

/** 시각이 많이 들어간 가상 일정 한 주 (2026-11-02 … 11-08) */
function weekWithManyTimes() {
  const blocks = [
    blk('shift', '2026-11-02', '22:00', '06:00', '야간 A'),
    blk('shift', '2026-11-03', '22:00', '06:00', '야간 B'),
    blk('busy', '2026-11-04', '13:00', '15:30', '교육'),
    blk('shift', '2026-11-05', '07:00', '15:00'),
    blk('sleep', '2026-11-03', '07:10', '12:40'), // 11-03 기록 5h30m
    blk('sleep', '2026-11-05', '23:10', '05:45'), // 11-06 기록 6h35m
    blk('sleep', '2026-11-06', '13:20', '14:05'), // 11-06 낮잠 45m
    blk('sleep', '2026-11-07', '23:00', '07:00'), // 11-08 기록 8h
  ];
  const plan = planSleep(blocks, DEFAULT_SETTINGS, '2026-11-02', '2026-11-08');
  return { blocks, plan, week: summarizeWeek(plan.days, DEFAULT_SETTINGS.sleepTargetMin) };
}

describe('AI 요청 payload에 시각 정보가 없다', () => {
  const { blocks, plan, week } = weekWithManyTimes();
  const payload = buildAiPayload(week);
  const json = JSON.stringify(payload);

  it('허용된 키만 있다', () => {
    expect(Object.keys(payload).sort()).toEqual(
      ['cumulativeDeficitMinutes', 'recordedDayCount', 'recordedDays', 'schema', 'targetSleepMinutes', 'totalNapCount', 'unrecordedDayCount'].sort(),
    );
    for (const d of payload.recordedDays) expect(Object.keys(d).sort()).toEqual(['dayIndex', 'napCount', 'totalSleepMinutes']);
  });

  it('근무·수면 블록의 시각·날짜·메모 문자열이 하나도 들어가지 않는다', () => {
    for (const b of blocks) {
      expect(json).not.toContain(b.start);
      expect(json).not.toContain(b.end);
      expect(json).not.toContain(b.start.slice(0, 10));
      expect(json).not.toContain(b.start.slice(11));
      expect(json).not.toContain(b.end.slice(11));
      if (b.note) expect(json).not.toContain(b.note);
      expect(json).not.toContain(b.id);
    }
    for (const p of plan.sleeps) {
      expect(json).not.toContain(String(p.start));
      expect(json).not.toContain(String(p.end));
    }
    expect(json).not.toMatch(/\d{1,2}:\d{2}/);
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(json).not.toMatch(/date|time|start|end|shift|note/i);
    expect(containsTimeInfo(payload)).toBe(false);
  });

  it('기록한 날만 보내고, 기록 없는 날은 일수만 보낸다', () => {
    expect(payload.recordedDays).toEqual([
      { dayIndex: 2, totalSleepMinutes: 330, napCount: 0 },
      { dayIndex: 5, totalSleepMinutes: 440, napCount: 1 },
      { dayIndex: 7, totalSleepMinutes: 480, napCount: 0 },
    ]);
    expect(payload.recordedDayCount).toBe(3);
    expect(payload.unrecordedDayCount).toBe(4);
    // 기록 기준 누적 부족 = (420−330) + (420−440→0) + 0 = 90
    expect(payload.cumulativeDeficitMinutes).toBe(90);
    expect(payload.totalNapCount).toBe(1);
    // 기록 없는 날의 계획 값은 보내지 않는다
    const planOnly = week.days.filter((d) => d.source === 'plan').map((d) => d.sleepMin);
    expect(planOnly.length).toBe(4);
    const sent = payload.recordedDays.map((d) => d.totalSleepMinutes);
    for (const v of planOnly) if (!sent.includes(v)) expect(json).not.toContain(`"totalSleepMinutes":${v}`);
    expect(validateAiPayload(payload).ok).toBe(true);
  });

  it('시각이 섞이거나 계획 값이 섞인 payload는 거부한다', () => {
    const withTime = { ...payload, recordedDays: payload.recordedDays.map((d, i) => (i === 0 ? { ...d, start: '22:00' } : d)) };
    expect(validateAiPayload(withTime).ok).toBe(false);
    expect(validateAiPayload({ ...payload, sleepStart: '2026-11-03T06:00' }).ok).toBe(false);
    const epoch = { ...payload, recordedDays: payload.recordedDays.map((d, i) => (i === 0 ? { ...d, totalSleepMinutes: 29_400_000 } : d)) };
    expect(validateAiPayload(epoch).ok).toBe(false);
    // 기록 없는 날을 끼워 넣으면 개수·일관성 검사에서 걸린다
    const sneaky: AiPayload = { ...payload, recordedDays: [...payload.recordedDays, { dayIndex: 1, totalSleepMinutes: 420, napCount: 0 }] };
    expect(validateAiPayload(sneaky).ok).toBe(false);
    expect(validateAiPayload({ ...payload, unrecordedDayCount: 3 }).ok).toBe(false);
    expect(validateAiPayload({ ...payload, cumulativeDeficitMinutes: 60 }).ok).toBe(false);
    expect(containsTimeInfo({ a: '22시 근무' })).toBe(true);
    expect(containsTimeInfo({ a: 'T22' })).toBe(true);
  });
});
