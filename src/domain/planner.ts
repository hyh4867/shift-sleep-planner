/**
 * 수면 추천 엔진 — 모든 함수는 순수 함수(입력만으로 결과가 정해짐).
 *
 * 순서
 *  1) 본 수면: 날짜마다 하나. 야간 근무 뒤에는 근무 종료 직후 구간 우선, 아니면 가장 긴 빈 구간.
 *  2) 야간 근무 전 낮잠: 근무 직전 빈 구간 길이에 따라 90분/20분, 근무 시작 30분 전에 끝나게.
 *  3) 보충 수면: 하루 합계가 목표에 못 미치면 남은 빈 구간에 채움.
 *  4) 카페인 마감·조명 안내: 본 수면 시작 시각에서 계산.
 */
import type { Block } from './types';
import type { Settings } from './settings';
import type { RuleId } from './sources';
import { addDays, dateKey, dayStart, hhmm, formatDuration, MIN_PER_DAY, parseLocal } from './time';

export type PlannedKind = 'main' | 'nap' | 'extra';

export interface PlannedSleep {
  kind: PlannedKind;
  start: number;
  end: number;
  /** 이 수면이 합산되는 날짜(기상일) */
  date: string;
  rule: RuleId;
  reason: string;
}

export interface NapDecision {
  shiftId: string;
  shiftStart: number;
  shiftEnd: number;
  /** 근무 직전 빈 시간(분). 빈 시간이 없으면 0 */
  gapMin: number;
  nap?: PlannedSleep;
  skippedReason?: string;
}

export type CaffeineStatus =
  /** 마감이 근무 시작 전 — 이번 근무 중에는 카페인 금지 */
  | 'before-shift'
  /** 마감이 근무 시간 안에 걸림 */
  | 'during-shift'
  /** 마감이 근무 종료 뒤 */
  | 'after-shift'
  /** 관련 근무 없음 */
  | 'no-shift';

export interface CaffeineAdvice {
  sleepStart: number;
  cutoff: number;
  status: CaffeineStatus;
  shift?: { id: string; start: number; end: number };
  /** 근무 초반 섭취 권장 구간 */
  earlyWindow?: { start: number; end: number };
}

export interface LightAdvice {
  sleepStart: number;
  from: number;
  until: number;
  duringShift: boolean;
}

export interface DaySummary {
  date: string;
  targetMin: number;
  loggedMin: number;
  plannedMin: number;
  totalMin: number;
  shortfallMin: number;
  recorded: boolean;
  loggedNapCount: number;
  plannedNapCount: number;
}

export interface Plan {
  fromDate: string;
  toDate: string;
  sleeps: PlannedSleep[];
  naps: NapDecision[];
  caffeine: CaffeineAdvice[];
  light: LightAdvice[];
  days: DaySummary[];
}

type OccKind = 'shift' | 'busy' | 'sleep' | 'planned';
interface Occ {
  start: number;
  end: number;
  kind: OccKind;
  id?: string;
}
interface Gap {
  start: number;
  end: number;
  endsAtShift: boolean;
}

/** 근무 종료 + 취침 전 여유 뒤, 이 시간 안에 시작하는 빈 구간까지를 "근무 종료 직후"로 본다. */
export const POST_SHIFT_MAX_DELAY_MIN = 120;

/** 수면이 합산되는 날짜: 끝난 시각이 속한 날짜(정확히 24:00에 끝나면 그 전날). */
export function attributedDate(end: number): string {
  return dateKey(end - 1);
}

/** 근무가 야간 판정 구간(기본 00:00–06:00)과 겹치는가 */
export function isNightShift(start: number, end: number, s: Settings): boolean {
  const firstDay = Math.floor(start / MIN_PER_DAY) - 1;
  const lastDay = Math.floor((end - 1) / MIN_PER_DAY);
  for (let d = firstDay; d <= lastDay; d++) {
    const ws = d * MIN_PER_DAY + s.nightWindowStartMin;
    const we = d * MIN_PER_DAY + s.nightWindowEndMin;
    if (start < we && ws < end) return true;
  }
  return false;
}

export function freeGaps(occ: Occ[], winStart: number, winEnd: number): Gap[] {
  const items = occ.filter((o) => o.end > winStart && o.start < winEnd).sort((a, b) => a.start - b.start);
  const gaps: Gap[] = [];
  let cursor = winStart;
  for (const o of items) {
    if (o.start > cursor) gaps.push({ start: cursor, end: o.start, endsAtShift: o.kind === 'shift' });
    cursor = Math.max(cursor, o.end);
  }
  if (cursor < winEnd) gaps.push({ start: cursor, end: winEnd, endsAtShift: false });
  return gaps;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** D일 본 수면의 선호 시작 시각: 취침 시각이 정오 이후면 전날 밤, 아니면 당일 새벽 */
function preferredStart(d0: number, s: Settings): number {
  return d0 + s.preferredBedtimeMin - (s.preferredBedtimeMin >= 720 ? MIN_PER_DAY : 0);
}

/** "HH:MM–HH:MM", 날짜가 다르면 "M/D HH:MM–M/D HH:MM" */
export function fmtRange(s: number, e: number): string {
  const md = (t: number) => {
    const k = dateKey(t);
    return `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))} ${hhmm(t)}`;
  };
  return dateKey(s) === dateKey(e - 1) ? `${hhmm(s)}–${hhmm(e)}` : `${md(s)}–${md(e)}`;
}
const range = fmtRange;

export function planSleep(blocks: Block[], settings: Settings, fromDate: string, toDate: string): Plan {
  const s = settings;
  const fromStart = dayStart(fromDate);
  const toEnd = dayStart(toDate) + MIN_PER_DAY;
  const winStart = fromStart - 2 * MIN_PER_DAY;
  const winEnd = toEnd + 2 * MIN_PER_DAY;

  const dates: string[] = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) dates.push(d);

  const occ: Occ[] = blocks.map((b) => ({ start: parseLocal(b.start), end: parseLocal(b.end), kind: b.kind, id: b.id }));
  const shifts = occ.filter((o) => o.kind === 'shift').sort((a, b) => a.start - b.start);
  // 근무 종료 후 취침 전 여유: 빈 구간 계산에서만 근무를 그만큼 늘려 잡는다(근무 블록 자체는 그대로).
  if (s.postShiftBufferMin > 0) {
    for (const sh of shifts) occ.push({ start: sh.end, end: sh.end + s.postShiftBufferMin, kind: 'busy' });
  }
  const nightShifts = shifts.filter((o) => isNightShift(o.start, o.end, s));
  const logs = occ.filter((o) => o.kind === 'sleep');

  const loggedOn = (date: string) =>
    logs.filter((l) => attributedDate(l.end) === date).reduce((sum, l) => sum + (l.end - l.start), 0);

  const sleeps: PlannedSleep[] = [];
  const plannedOn = (date: string) =>
    sleeps.filter((p) => p.date === date).reduce((sum, p) => sum + (p.end - p.start), 0);
  const gaps = () => freeGaps(occ, winStart, winEnd);
  const place = (p: Omit<PlannedSleep, 'date'>) => {
    const full = { ...p, date: attributedDate(p.end) };
    sleeps.push(full);
    occ.push({ start: p.start, end: p.end, kind: 'planned' });
  };

  /**
   * D일에 끝나는 수면을 둘 수 있는 빈 구간 중 가장 긴 것.
   * withinDay면 D일 00:00 이후에서만 찾는다(보충 수면).
   */
  const bestGapFor = (d0: number, withinDay: boolean) => {
    const d1 = d0 + MIN_PER_DAY;
    let best: { lo: number; hi: number; len: number } | null = null;
    for (const g of gaps()) {
      const hi = Math.min(g.endsAtShift ? g.end - s.wakeBufferMin : g.end, d1);
      const lo = withinDay ? Math.max(g.start, d0) : g.start;
      if (hi <= d0) continue;
      const len = hi - lo;
      if (len < s.minSleepChunkMin) continue;
      if (!best || len > best.len) best = { lo, hi, len };
    }
    return best;
  };

  const placeInBestGap = (date: string, needed: number, kind: 'main' | 'extra', reasonPrefix: string) => {
    const d0 = dayStart(date);
    const g = bestGapFor(d0, kind === 'extra');
    if (!g) return 0;
    const len = Math.min(needed, g.len);
    // 끝이 D일 안(00:00 초과)에 오도록. 본 수면은 30분 이상이 D일에 걸치게 해 어색한 분 단위를 피한다.
    const minStart = kind === 'extra' ? g.lo : Math.max(g.lo, d0 - len + Math.min(30, len));
    const start = clamp(preferredStart(d0, s), minStart, g.hi - len);
    place({
      kind,
      start,
      end: start + len,
      rule: 'main',
      reason: `${reasonPrefix}빈 구간 중 가장 긴 곳(${range(g.lo, g.hi)})에 ${kind === 'main' ? '평소 취침 시각 기준으로 ' : ''}배치`,
    });
    return len;
  };

  // 1) 본 수면
  for (const date of dates) {
    if (loggedOn(date) > 0) continue; // 이미 잔 기록이 있으면 본 수면은 끝난 것으로 본다(부족분은 3단계)
    const needed = s.sleepTargetMin - plannedOn(date);
    if (needed < s.minSleepChunkMin) continue;
    const d0 = dayStart(date);
    const d1 = d0 + MIN_PER_DAY;

    const ended = nightShifts.find((n) => n.end >= d0 && n.end < d1);
    let placed = false;
    if (ended) {
      const earliest = ended.end + s.postShiftBufferMin;
      const g = gaps().find((x) => x.start >= earliest && x.start <= earliest + POST_SHIFT_MAX_DELAY_MIN);
      if (g && g.start < d1) {
        const hi = Math.min(g.endsAtShift ? g.end - s.wakeBufferMin : g.end, d1);
        const len = Math.min(needed, hi - g.start);
        if (len >= s.minSleepChunkMin) {
          place({
            kind: 'main',
            start: g.start,
            end: g.start + len,
            rule: 'main',
            reason:
              g.start === earliest && s.postShiftBufferMin > 0
                ? `야간 근무(${range(ended.start, ended.end)}) 종료 후 취침 전 여유 ${formatDuration(s.postShiftBufferMin)} 뒤에 우선 배치`
                : `야간 근무(${range(ended.start, ended.end)}) 종료 후 첫 빈 구간에 우선 배치`,
          });
          placed = true;
        }
      }
    }
    if (!placed) placeInBestGap(date, needed, 'main', '');
  }

  // 2) 야간 근무 전 낮잠
  const naps: NapDecision[] = [];
  for (const n of nightShifts) {
    const napEnd = n.start - s.napBufferMin;
    const napDate = attributedDate(napEnd);
    if (napDate < fromDate || napDate > toDate) continue;
    const decision: NapDecision = { shiftId: n.id ?? '', shiftStart: n.start, shiftEnd: n.end, gapMin: 0 };
    const g = gaps().find((x) => x.end === n.start);
    if (!g) {
      decision.skippedReason = '근무 직전에 빈 시간이 없습니다.';
    } else {
      const gapMin = g.end - g.start;
      decision.gapMin = gapMin;
      const options: number[] = [];
      if (gapMin >= s.napLongThresholdMin) options.push(s.napLongMin, s.napShortMin);
      else if (gapMin >= s.napShortThresholdMin) options.push(s.napShortMin);
      const fit = options.find((dur) => dur + s.napBufferMin <= gapMin);
      if (options.length === 0) {
        decision.skippedReason = `근무 전 빈 시간 ${formatDuration(gapMin)}이 ${formatDuration(s.napShortThresholdMin)} 미만입니다.`;
      } else if (fit === undefined) {
        decision.skippedReason = `근무 전 빈 시간 ${formatDuration(gapMin)}에는 낮잠 ${formatDuration(options[options.length - 1])}과 근무 전 여유 ${formatDuration(s.napBufferMin)}을 함께 넣을 수 없습니다.`;
      } else {
        const start = napEnd - fit;
        const p: PlannedSleep = {
          kind: 'nap',
          start,
          end: napEnd,
          date: attributedDate(napEnd),
          rule: 'nap',
          reason: `야간 근무(${range(n.start, n.end)}) 전 빈 시간 ${formatDuration(gapMin)} → ${fit}분 낮잠, 근무 ${s.napBufferMin}분 전 종료`,
        };
        place(p);
        decision.nap = p;
      }
    }
    naps.push(decision);
  }

  // 3) 보충 수면
  for (const date of dates) {
    for (let i = 0; i < 3; i++) {
      const short = s.sleepTargetMin - loggedOn(date) - plannedOn(date);
      if (short < s.minSleepChunkMin) break;
      const got = placeInBestGap(date, short, 'extra', `목표까지 ${formatDuration(short)} 부족 → `);
      if (got === 0) break;
    }
  }

  sleeps.sort((a, b) => a.start - b.start);

  // 4) 카페인·조명
  const mains = sleeps.filter((p) => p.kind === 'main');
  const caffeine: CaffeineAdvice[] = mains.map((m) => {
    const cutoff = m.start - s.caffeineCutoffHours * 60;
    const related = [...shifts].reverse().find((x) => x.start < m.start && x.start >= m.start - MIN_PER_DAY);
    if (!related) return { sleepStart: m.start, cutoff, status: 'no-shift' };
    const shift = { id: related.id ?? '', start: related.start, end: related.end };
    if (cutoff <= related.start) return { sleepStart: m.start, cutoff, status: 'before-shift', shift };
    const earlyEnd = Math.min(related.start + s.caffeineEarlyWindowMin, cutoff, related.end);
    const earlyWindow = { start: related.start, end: earlyEnd };
    if (cutoff < related.end) return { sleepStart: m.start, cutoff, status: 'during-shift', shift, earlyWindow };
    return { sleepStart: m.start, cutoff, status: 'after-shift', shift, earlyWindow };
  });
  const light: LightAdvice[] = mains.map((m) => {
    const from = m.start - s.dimLightMaxLeadMin;
    const until = m.start - s.dimLightMinLeadMin;
    const duringShift = shifts.some((x) => x.start < Math.max(until, from + 1) && from < x.end);
    return { sleepStart: m.start, from, until, duringShift };
  });

  const days: DaySummary[] = dates.map((date) => {
    const loggedMin = loggedOn(date);
    const plannedMin = plannedOn(date);
    const total = loggedMin + plannedMin;
    return {
      date,
      targetMin: s.sleepTargetMin,
      loggedMin,
      plannedMin,
      totalMin: total,
      shortfallMin: Math.max(0, s.sleepTargetMin - total),
      recorded: loggedMin > 0,
      loggedNapCount: logs.filter((l) => attributedDate(l.end) === date && l.end - l.start < s.napCountMaxMin).length,
      plannedNapCount: sleeps.filter((p) => p.date === date && p.kind === 'nap').length,
    };
  });

  return { fromDate, toDate, sleeps, naps, caffeine, light, days };
}
