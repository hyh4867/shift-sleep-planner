import { describe, expect, it } from 'vitest';
import { planSleep, type DaySummary } from '../src/domain/planner';
import { summarizeWeek } from '../src/domain/weekly';
import { DEFAULT_SETTINGS } from '../src/domain/settings';
import { blk } from './helpers';

const day = (date: string, loggedMin: number, plannedMin = 0, naps = 0): DaySummary => ({
  date,
  targetMin: 420,
  loggedMin,
  plannedMin,
  totalMin: loggedMin + plannedMin,
  shortfallMin: Math.max(0, 420 - loggedMin - plannedMin),
  recorded: loggedMin > 0,
  loggedNapCount: loggedMin > 0 ? naps : 0,
  plannedNapCount: loggedMin > 0 ? 0 : naps,
});

describe('24시간 합계', () => {
  it('자정을 넘는 수면은 기상일에 전부 더하고, 낮잠도 합산한다', () => {
    const logs = [
      blk('sleep', '2026-11-09', '23:00', '04:00'), // 5h → 11-10
      blk('sleep', '2026-11-10', '14:00', '15:30'), // 1.5h 낮잠 → 11-10
      blk('sleep', '2026-11-10', '22:30', '00:00'), // 정확히 24:00에 끝남 → 11-10
    ];
    const plan = planSleep(logs, DEFAULT_SETTINGS, '2026-11-10', '2026-11-11');
    expect(plan.days[0].loggedMin).toBe(300 + 90 + 90);
    expect(plan.days[0].loggedNapCount).toBe(2);
    expect(plan.days[1].loggedMin).toBe(0);
  });
});

describe('누적 수면 부족', () => {
  const days = [
    day('d1', 360),
    day('d2', 480),
    day('d3', 300),
    day('d4', 0, 380, 1), // 기록 없음: 계획 값 6h20m (40분 부족 — 계획 포함 수치에만 반영)
    day('d5', 420),
    day('d6', 400),
    day('d7', 0, 450, 1),
  ];

  it('기준 수치는 기록한 날만, 부족분만 누적하고 초과분으로 상쇄하지 않는다', () => {
    const w = summarizeWeek(days, 420);
    expect(w.days.map((d) => d.deficitMin)).toEqual([60, 0, 120, 40, 0, 20, 0]);
    expect(w.days.map((d) => d.cumulativeRecordedDeficitMin)).toEqual([60, 60, 180, 180, 180, 200, 200]);
    expect(w.recorded.cumulativeDeficitMin).toBe(200);
    expect(w.recordedDays).toBe(5);
    expect(w.unrecordedDays).toBe(2);
    expect(w.recorded.totalSleepMin).toBe(360 + 480 + 300 + 420 + 400);
    expect(w.recorded.averageSleepMin).toBe(392);
    expect(w.recorded.totalNapCount).toBe(0); // 계획 낮잠은 기록 기준에 넣지 않음
  });

  it('계획 포함 수치는 따로 계산한다', () => {
    const w = summarizeWeek(days, 420);
    expect(w.days.map((d) => d.cumulativeWithPlanDeficitMin)).toEqual([60, 60, 180, 220, 220, 240, 240]);
    expect(w.withPlan.cumulativeDeficitMin).toBe(240);
    expect(w.days[3]).toMatchObject({ source: 'plan', sleepMin: 380 });
  });

  it('기록이 하나도 없으면 기록 기준 부족은 0, 평균은 없음', () => {
    const shifts = ['2026-11-03', '2026-11-04', '2026-11-05'].map((d) => blk('shift', d, '22:00', '06:00'));
    const plan = planSleep(shifts, DEFAULT_SETTINGS, '2026-11-02', '2026-11-08');
    const w = summarizeWeek(plan.days, 420);
    expect(w.recordedDays).toBe(0);
    expect(w.recorded.cumulativeDeficitMin).toBe(0);
    expect(w.recorded.averageSleepMin).toBeNull();
    expect(w.days.every((d) => d.sleepMin >= 420)).toBe(true);
    expect(w.withPlan.cumulativeDeficitMin).toBe(0);
  });
});
