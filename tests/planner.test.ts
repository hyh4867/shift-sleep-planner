import { describe, expect, it } from 'vitest';
import { planSleep, isNightShift } from '../src/domain/planner';
import { DEFAULT_SETTINGS, type Settings } from '../src/domain/settings';
import { formatLocal, parseLocal } from '../src/domain/time';
import { blk } from './helpers';

const S = DEFAULT_SETTINGS;
const at = (t: number) => formatLocal(t);
const T = (s: string) => parseLocal(s);

describe('야간 근무 정의', () => {
  it('00:00–06:00과 겹치면 야간', () => {
    const n = blk('shift', '2026-11-09', '22:00', '06:00');
    expect(isNightShift(T(n.start), T(n.end), S)).toBe(true);
    const late = blk('shift', '2026-11-09', '16:00', '00:30');
    expect(isNightShift(T(late.start), T(late.end), S)).toBe(true);
    const day = blk('shift', '2026-11-09', '08:00', '17:00');
    expect(isNightShift(T(day.start), T(day.end), S)).toBe(false);
    const evening = blk('shift', '2026-11-09', '15:00', '23:59');
    expect(isNightShift(T(evening.start), T(evening.end), S)).toBe(false);
    const dawn = blk('shift', '2026-11-10', '05:30', '09:00');
    expect(isNightShift(T(dawn.start), T(dawn.end), S)).toBe(true);
  });
});

describe('낮잠 배치와 30분 여유', () => {
  it('근무 전 빈 시간 2시간 이상 → 90분 낮잠, 근무 30분 전에 끝남', () => {
    const night = blk('shift', '2026-11-10', '22:00', '06:00');
    const plan = planSleep([night], S, '2026-11-10', '2026-11-11');
    const d = plan.naps.find((x) => x.shiftId === night.id)!;
    expect(d.nap).toBeDefined();
    expect(at(d.nap!.start)).toBe('2026-11-10T20:00');
    expect(at(d.nap!.end)).toBe('2026-11-10T21:30');
    expect(T(night.start) - d.nap!.end).toBe(30);
    expect(d.nap!.end - d.nap!.start).toBe(90);
  });

  it('빈 시간이 정확히 2시간이면 90분 + 30분이 꼭 맞는다', () => {
    const busy = blk('busy', '2026-11-10', '08:00', '20:00');
    const night = blk('shift', '2026-11-10', '22:00', '06:00');
    const plan = planSleep([busy, night], S, '2026-11-10', '2026-11-10');
    const d = plan.naps[0];
    expect(d.gapMin).toBe(120);
    expect(at(d.nap!.start)).toBe('2026-11-10T20:00');
    expect(at(d.nap!.end)).toBe('2026-11-10T21:30');
  });

  it('45분 이상 2시간 미만 → 20분 낮잠, 근무 30분 전 종료', () => {
    const busy = blk('busy', '2026-11-10', '08:00', '21:00');
    const night = blk('shift', '2026-11-10', '22:00', '06:00');
    const plan = planSleep([busy, night], S, '2026-11-10', '2026-11-10');
    const d = plan.naps[0];
    expect(d.gapMin).toBe(60);
    expect(at(d.nap!.start)).toBe('2026-11-10T21:10');
    expect(at(d.nap!.end)).toBe('2026-11-10T21:30');
  });

  it('45분 미만이면 낮잠 없음', () => {
    const busy = blk('busy', '2026-11-10', '08:00', '21:20');
    const night = blk('shift', '2026-11-10', '22:00', '06:00');
    const d = planSleep([busy, night], S, '2026-11-10', '2026-11-10').naps[0];
    expect(d.nap).toBeUndefined();
    expect(d.skippedReason).toContain('미만');
  });

  it('45–49분이면 20분 + 30분 여유가 안 들어가 생략(여유를 깨지 않음)', () => {
    const busy = blk('busy', '2026-11-10', '08:00', '21:13');
    const night = blk('shift', '2026-11-10', '22:00', '06:00');
    const d = planSleep([busy, night], S, '2026-11-10', '2026-11-10').naps[0];
    expect(d.gapMin).toBe(47);
    expect(d.nap).toBeUndefined();
    expect(d.skippedReason).toContain('여유');
  });

  it('주간 근무 전에는 낮잠을 두지 않는다', () => {
    const day = blk('shift', '2026-11-10', '08:00', '17:00');
    const plan = planSleep([day], S, '2026-11-10', '2026-11-10');
    expect(plan.naps).toEqual([]);
    expect(plan.sleeps.filter((p) => p.kind === 'nap')).toEqual([]);
  });

  it('설정을 바꾸면 기준이 바뀐다', () => {
    const custom: Settings = { ...S, napBufferMin: 15, napLongMin: 60 };
    const night = blk('shift', '2026-11-10', '22:00', '06:00');
    const d = planSleep([night], custom, '2026-11-10', '2026-11-10').naps[0];
    expect(at(d.nap!.start)).toBe('2026-11-10T20:45');
    expect(at(d.nap!.end)).toBe('2026-11-10T21:45');
  });
});

describe('본 수면 배치', () => {
  it('주간 근무: 평소 취침 시각(23:00)에 7시간', () => {
    const d1 = blk('shift', '2026-11-09', '08:00', '17:00');
    const d2 = blk('shift', '2026-11-10', '08:00', '17:00');
    const plan = planSleep([d1, d2], S, '2026-11-10', '2026-11-10');
    const main = plan.sleeps.find((p) => p.kind === 'main')!;
    expect(at(main.start)).toBe('2026-11-09T23:00');
    expect(at(main.end)).toBe('2026-11-10T06:00');
    expect(plan.days[0].totalMin).toBe(420);
  });

  it('야간 근무 뒤에는 종료 후 취침 전 여유(기본 30분) 뒤에 바로 배치', () => {
    const n1 = blk('shift', '2026-11-09', '22:00', '06:00');
    const n2 = blk('shift', '2026-11-10', '22:00', '06:00');
    const plan = planSleep([n1, n2], S, '2026-11-10', '2026-11-10');
    const main = plan.sleeps.find((p) => p.kind === 'main')!;
    expect(at(main.start)).toBe('2026-11-10T06:30');
    expect(at(main.end)).toBe('2026-11-10T13:30');
    expect(main.reason).toContain('취침 전 여유 30분 뒤');
  });

  it('취침 전 여유를 0으로 바꾸면 근무 종료 시각에 바로 배치', () => {
    const n1 = blk('shift', '2026-11-09', '22:00', '06:00');
    const plan = planSleep([n1], { ...S, postShiftBufferMin: 0 }, '2026-11-10', '2026-11-10');
    const main = plan.sleeps.find((p) => p.kind === 'main')!;
    expect(at(main.start)).toBe('2026-11-10T06:00');
  });

  it('취침 전 여유는 주간 근무 뒤에도 적용되고, 어떤 추천 수면도 근무 종료 후 여유 안에 들어가지 않는다', () => {
    const day = blk('shift', '2026-11-10', '08:00', '22:50');
    const plan = planSleep([day], S, '2026-11-11', '2026-11-11');
    const main = plan.sleeps.find((p) => p.kind === 'main')!;
    expect(at(main.start)).toBe('2026-11-10T23:20');
    for (const custom of [15, 45, 90]) {
      const night = blk('shift', '2026-11-09', '22:00', '06:00');
      const p2 = planSleep([night], { ...S, postShiftBufferMin: custom }, '2026-11-10', '2026-11-10');
      for (const x of p2.sleeps) expect(x.start >= T(night.end) + custom || x.end <= T(night.start)).toBe(true);
    }
  });

  it('근무 종료 직후 구간이 짧으면 보충 수면으로 24시간 목표를 채운다', () => {
    const n1 = blk('shift', '2026-11-09', '22:00', '06:00');
    const busy = blk('busy', '2026-11-10', '10:00', '15:00', '교육');
    const next = blk('shift', '2026-11-10', '23:00', '07:00');
    const plan = planSleep([n1, busy, next], S, '2026-11-10', '2026-11-10');
    const ofDay = plan.sleeps.filter((p) => p.date === '2026-11-10');
    const main = ofDay.find((p) => p.kind === 'main')!;
    expect(at(main.start)).toBe('2026-11-10T06:30');
    expect(at(main.end)).toBe('2026-11-10T10:00');
    expect(ofDay.some((p) => p.kind === 'nap')).toBe(true);
    expect(plan.days[0].totalMin).toBeGreaterThanOrEqual(420);
    // 추천 수면끼리, 그리고 블록과 겹치지 않는다
    const all = [...plan.sleeps].sort((a, b) => a.start - b.start);
    for (let i = 1; i < all.length; i++) expect(all[i].start).toBeGreaterThanOrEqual(all[i - 1].end);
    for (const p of all) {
      for (const b of [n1, busy, next]) expect(p.end <= T(b.start) || p.start >= T(b.end)).toBe(true);
    }
  });

  it('근무 직전 본 수면은 기상 여유(30분)를 남긴다', () => {
    const busy = blk('busy', '2026-11-09', '09:00', '23:00');
    const day = blk('shift', '2026-11-10', '06:00', '14:00');
    const after = blk('busy', '2026-11-10', '14:00', '00:00');
    const plan = planSleep([busy, day, after], S, '2026-11-10', '2026-11-10');
    const main = plan.sleeps.find((p) => p.kind === 'main')!;
    expect(at(main.start)).toBe('2026-11-09T23:00');
    expect(at(main.end)).toBe('2026-11-10T05:30');
    expect(main.end - main.start).toBe(390);
    // 남은 빈 구간이 없으니 30분 미달로 표시
    expect(plan.days[0].shortfallMin).toBe(30);
  });

  it('실제 수면 기록이 목표를 채운 날은 추가 추천이 없다', () => {
    const log = blk('sleep', '2026-11-09', '23:30', '07:00');
    const plan = planSleep([log], S, '2026-11-10', '2026-11-10');
    expect(plan.sleeps.filter((p) => p.date === '2026-11-10')).toEqual([]);
    expect(plan.days[0]).toMatchObject({ loggedMin: 450, recorded: true, shortfallMin: 0 });
  });
});

describe('카페인 마감 계산', () => {
  it('본 수면 시작 6시간 전', () => {
    const day = blk('shift', '2026-11-10', '08:00', '17:00');
    const plan = planSleep([day], S, '2026-11-11', '2026-11-11');
    const c = plan.caffeine[0];
    expect(at(c.sleepStart)).toBe('2026-11-10T23:00');
    expect(at(c.cutoff)).toBe('2026-11-10T17:00');
    expect(c.status).toBe('after-shift'); // 17:00 = 근무 종료, 근무 안에 걸리지 않음
    expect(at(c.earlyWindow!.start)).toBe('2026-11-10T08:00');
    expect(at(c.earlyWindow!.end)).toBe('2026-11-10T10:00');
  });

  it('야간 근무 중에 마감이 걸리면 표시하고, 초반 섭취 구간은 마감 전까지 (취침 전 여유 반영)', () => {
    const night = blk('shift', '2026-11-10', '22:00', '06:00');
    const plan = planSleep([night], S, '2026-11-11', '2026-11-11');
    const c = plan.caffeine.find((x) => at(x.sleepStart) === '2026-11-11T06:30')!;
    expect(at(c.cutoff)).toBe('2026-11-11T00:30');
    expect(c.status).toBe('during-shift');
    expect(at(c.earlyWindow!.start)).toBe('2026-11-10T22:00');
    expect(at(c.earlyWindow!.end)).toBe('2026-11-11T00:00');
  });

  it('취침 전 여유를 바꾸면 카페인 마감도 같이 움직인다', () => {
    const night = blk('shift', '2026-11-10', '22:00', '06:00');
    for (const [buf, cutoff] of [[0, '00:00'], [30, '00:30'], [60, '01:00']] as const) {
      const plan = planSleep([night], { ...S, postShiftBufferMin: buf }, '2026-11-11', '2026-11-11');
      const c = plan.caffeine.find((x) => x.shift?.id === night.id)!;
      expect(at(c.cutoff)).toBe(`2026-11-11T${cutoff}`);
      expect(c.sleepStart - c.cutoff).toBe(6 * 60);
    }
  });

  it('마감이 근무 시작 전이면 근무 중 카페인 금지', () => {
    const shift = blk('shift', '2026-11-10', '20:00', '00:00');
    const plan = planSleep([shift], { ...S, caffeineCutoffHours: 6 }, '2026-11-11', '2026-11-11');
    const c = plan.caffeine.find((x) => x.shift?.id === shift.id)!;
    expect(at(c.sleepStart)).toBe('2026-11-11T00:30');
    expect(at(c.cutoff)).toBe('2026-11-10T18:30');
    expect(c.status).toBe('before-shift');
    expect(c.earlyWindow).toBeUndefined();
  });

  it('마감 시간 설정 변경', () => {
    const day = blk('shift', '2026-11-10', '08:00', '17:00');
    const plan = planSleep([day], { ...S, caffeineCutoffHours: 8 }, '2026-11-11', '2026-11-11');
    expect(at(plan.caffeine[0].cutoff)).toBe('2026-11-10T15:00');
    expect(plan.caffeine[0].status).toBe('during-shift');
  });
});

describe('조명 안내', () => {
  it('본 수면 2시간 전부터 1시간 전', () => {
    const plan = planSleep([], S, '2026-11-11', '2026-11-11');
    const l = plan.light[0];
    expect(at(l.from)).toBe('2026-11-10T21:00');
    expect(at(l.until)).toBe('2026-11-10T22:00');
  });
});
