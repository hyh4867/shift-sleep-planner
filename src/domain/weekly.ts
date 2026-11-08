import type { DaySummary } from './planner';

export interface WeekDay {
  date: string;
  /** 그래프에 그리는 하루 합계(분): 기록이 있으면 기록, 없으면 추천 계획 값 */
  sleepMin: number;
  source: 'log' | 'plan';
  napCount: number;
  /** max(0, 목표 − sleepMin) */
  deficitMin: number;
  /** 기록한 날만 더한 누적 부족(기록 없는 날은 그대로 유지) */
  cumulativeRecordedDeficitMin: number;
  /** 기록 없는 날의 계획 값까지 포함한 누적 부족(참고용) */
  cumulativeWithPlanDeficitMin: number;
}

export interface WeekSummary {
  targetMin: number;
  days: WeekDay[];
  recordedDays: number;
  unrecordedDays: number;
  /** 기록한 날만의 집계 — 누적 부족 수치와 AI payload에 쓴다 */
  recorded: {
    cumulativeDeficitMin: number;
    totalSleepMin: number;
    averageSleepMin: number | null;
    totalNapCount: number;
  };
  /** 기록 없는 날을 추천 계획 값으로 채운 집계 — 참고 표시용 */
  withPlan: {
    cumulativeDeficitMin: number;
  };
}

/**
 * 일별 합계와 누적 수면 부족.
 * 부족분 = max(0, 목표 − 하루 합계). 초과분으로 상쇄하지 않는다(앱 운영 정의).
 * 누적 부족의 기준 수치는 실제 기록한 날만 쓴다. 계획 포함 수치는 따로 둔다.
 */
export function summarizeWeek(days: DaySummary[], targetMin: number): WeekSummary {
  let recordedCum = 0;
  let planCum = 0;
  const out: WeekDay[] = days.map((d) => {
    const source = d.recorded ? 'log' : 'plan';
    const sleepMin = d.recorded ? d.loggedMin : d.plannedMin;
    const deficitMin = Math.max(0, targetMin - sleepMin);
    planCum += deficitMin;
    if (d.recorded) recordedCum += deficitMin;
    return {
      date: d.date,
      sleepMin,
      source,
      napCount: d.recorded ? d.loggedNapCount : d.plannedNapCount,
      deficitMin,
      cumulativeRecordedDeficitMin: recordedCum,
      cumulativeWithPlanDeficitMin: planCum,
    };
  });
  const rec = out.filter((d) => d.source === 'log');
  const totalSleepMin = rec.reduce((n, d) => n + d.sleepMin, 0);
  return {
    targetMin,
    days: out,
    recordedDays: rec.length,
    unrecordedDays: out.length - rec.length,
    recorded: {
      cumulativeDeficitMin: recordedCum,
      totalSleepMin,
      averageSleepMin: rec.length ? totalSleepMin / rec.length : null,
      totalNapCount: rec.reduce((n, d) => n + d.napCount, 0),
    },
    withPlan: { cumulativeDeficitMin: planCum },
  };
}
