/**
 * AI 요약 요청 payload — 실제로 기록한 날의 집계 수치만 담는다.
 * 기록 없는 날의 추천 계획 값은 보내지 않고 일수만 보낸다.
 * 근무·수면의 시각, 날짜, 메모는 절대 넣지 않는다. 서버도 같은 검증을 다시 한다.
 */
import type { WeekSummary } from '../domain/weekly.js';

export const PAYLOAD_SCHEMA = 'ssp-weekly-aggregate-v2';

export interface AiDay {
  /** 1 = 6일 전, 7 = 기준일. 날짜 대신 순번만 보낸다. */
  dayIndex: number;
  totalSleepMinutes: number;
  napCount: number;
}

export interface AiPayload {
  schema: typeof PAYLOAD_SCHEMA;
  targetSleepMinutes: number;
  /** 실제 기록이 있는 날만 */
  recordedDays: AiDay[];
  recordedDayCount: number;
  unrecordedDayCount: number;
  /** 기록한 날만의 누적 부족 */
  cumulativeDeficitMinutes: number;
  totalNapCount: number;
}

const TOP_KEYS = [
  'schema',
  'targetSleepMinutes',
  'recordedDays',
  'recordedDayCount',
  'unrecordedDayCount',
  'cumulativeDeficitMinutes',
  'totalNapCount',
];
const DAY_KEYS = ['dayIndex', 'totalSleepMinutes', 'napCount'];

export function buildAiPayload(week: WeekSummary): AiPayload {
  const recordedDays: AiDay[] = [];
  week.days.forEach((d, i) => {
    if (d.source !== 'log') return;
    recordedDays.push({ dayIndex: i + 1, totalSleepMinutes: Math.round(d.sleepMin), napCount: d.napCount });
  });
  return {
    schema: PAYLOAD_SCHEMA,
    targetSleepMinutes: Math.round(week.targetMin),
    recordedDays,
    recordedDayCount: recordedDays.length,
    unrecordedDayCount: week.days.length - recordedDays.length,
    cumulativeDeficitMinutes: Math.round(week.recorded.cumulativeDeficitMin),
    totalNapCount: week.recorded.totalNapCount,
  };
}

function sameKeys(o: object, keys: string[]): boolean {
  const k = Object.keys(o).sort();
  const want = [...keys].sort();
  return k.length === want.length && k.every((x, i) => x === want[i]);
}

function intIn(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
}

/** 시각·날짜처럼 보이는 문자열, epoch처럼 큰 숫자가 있는지 */
export function containsTimeInfo(value: unknown): boolean {
  const json = JSON.stringify(value);
  if (/\d{1,2}:\d{2}/.test(json)) return true; // 22:00
  if (/\d{4}-\d{2}-\d{2}/.test(json)) return true; // 2026-11-08
  if (/T\d{2}/.test(json)) return true; // ISO 시각 조각
  if (/\d{1,2}\s*시/.test(json)) return true; // "22시"
  const nums = json.match(/-?\d+(\.\d+)?/g) ?? [];
  return nums.some((n) => Math.abs(Number(n)) > 7 * 1440);
}

export type ValidationResult = { ok: true; value: AiPayload } | { ok: false; error: string };

/** 허용된 키·범위·내부 일관성만 통과. 클라이언트와 서버가 함께 쓴다. */
export function validateAiPayload(input: unknown): ValidationResult {
  const fail = (error: string): ValidationResult => ({ ok: false, error });
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('payload는 객체여야 합니다.');
  const p = input as Record<string, unknown>;
  if (!sameKeys(p, TOP_KEYS)) return fail('허용되지 않은 필드가 있거나 필드가 빠졌습니다.');
  if (p.schema !== PAYLOAD_SCHEMA) return fail('schema 값이 다릅니다.');
  if (!intIn(p.targetSleepMinutes, 60, 1440)) return fail('targetSleepMinutes 범위 오류');
  if (!intIn(p.recordedDayCount, 0, 7) || !intIn(p.unrecordedDayCount, 0, 7)) return fail('일수 범위 오류');
  if (p.recordedDayCount + p.unrecordedDayCount !== 7) return fail('기록·미기록 일수의 합이 7이 아닙니다.');
  if (!Array.isArray(p.recordedDays) || p.recordedDays.length !== p.recordedDayCount) return fail('recordedDays 개수 오류');
  if (!intIn(p.totalNapCount, 0, 70)) return fail('totalNapCount 범위 오류');
  if (!intIn(p.cumulativeDeficitMinutes, 0, 7 * 1440)) return fail('cumulativeDeficitMinutes 범위 오류');
  let prev = 0;
  let naps = 0;
  let deficit = 0;
  for (let i = 0; i < p.recordedDays.length; i++) {
    const d = p.recordedDays[i] as Record<string, unknown>;
    if (typeof d !== 'object' || d === null || !sameKeys(d, DAY_KEYS)) return fail(`recordedDays[${i}] 필드 오류`);
    if (!intIn(d.dayIndex, 1, 7) || d.dayIndex <= prev) return fail(`recordedDays[${i}].dayIndex 오류`);
    if (!intIn(d.totalSleepMinutes, 1, 1440)) return fail(`recordedDays[${i}].totalSleepMinutes 범위 오류`);
    if (!intIn(d.napCount, 0, 10)) return fail(`recordedDays[${i}].napCount 범위 오류`);
    prev = d.dayIndex;
    naps += d.napCount;
    deficit += Math.max(0, p.targetSleepMinutes - d.totalSleepMinutes);
  }
  if (naps !== p.totalNapCount) return fail('totalNapCount가 일별 합과 다릅니다.');
  if (deficit !== p.cumulativeDeficitMinutes) return fail('cumulativeDeficitMinutes가 일별 값과 맞지 않습니다.');
  if (containsTimeInfo(p)) return fail('시각 정보로 보이는 값이 있습니다.');
  return { ok: true, value: p as unknown as AiPayload };
}
