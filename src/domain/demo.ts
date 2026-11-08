/**
 * 가상 일정 3종. 실제 근무표가 아니며, 기준일을 중심으로 상대 날짜로 만든다.
 * 기준일 R: 주간 그래프는 R−6…R, 타임라인은 R과 R+1.
 * 행의 offset은 블록이 시작하는 날짜(R 기준). 자정 이후에 잠든 기록은 그날 날짜로 적는다.
 */
import type { Block, BlockKind } from './types';
import { addDays, resolveRange } from './time';

export type DemoId = 'day' | 'night' | 'mixed';

export const DEMO_LABEL: Record<DemoId, string> = {
  day: '주간 근무만',
  night: '야간 근무',
  mixed: '교대가 섞인 주',
};

type Row = [offset: number, kind: BlockKind, start: string, end: string, note?: string];

const ROWS: Record<DemoId, Row[]> = {
  day: [
    ...[-6, -5, -4, -3, 0, 1].map((o): Row => [o, 'shift', '08:00', '17:00', '주간 근무(가상)']),
    [-5, 'busy', '18:00', '20:00', '야간 교육(가상)'],
    [0, 'busy', '18:30', '19:30', '체력단련(가상)'],
    [-7, 'sleep', '23:30', '06:00'],
    [-5, 'sleep', '00:30', '06:30'],
    [-5, 'sleep', '23:00', '06:30'],
    [-4, 'sleep', '23:50', '05:50'],
    [-2, 'sleep', '01:00', '09:00'],
    [-2, 'sleep', '23:30', '07:30'],
  ],
  night: [
    ...[-3, -2, -1, 0, 1].map((o): Row => [o, 'shift', '22:00', '06:00', '야간 근무(가상)']),
    [-6, 'shift', '08:00', '17:00', '주간 근무(가상)'],
    [-5, 'shift', '08:00', '17:00', '주간 근무(가상)'],
    [-1, 'busy', '15:00', '17:00', '정비(가상)'],
    [-7, 'sleep', '23:00', '06:30'],
    [-6, 'sleep', '23:30', '06:00'],
    [-4, 'sleep', '23:00', '07:00'],
    [-3, 'sleep', '16:00', '17:00'],
    [-2, 'sleep', '07:00', '12:00'],
    [-1, 'sleep', '07:00', '13:00'],
  ],
  mixed: [
    [-6, 'shift', '07:00', '15:00', '주간 근무(가상)'],
    [-5, 'shift', '07:00', '15:00', '주간 근무(가상)'],
    [-4, 'shift', '15:00', '23:00', '오후 근무(가상)'],
    [-3, 'shift', '15:00', '23:00', '오후 근무(가상)'],
    [-1, 'shift', '23:00', '07:00', '야간 근무(가상)'],
    [0, 'shift', '23:00', '07:00', '야간 근무(가상)'],
    [-2, 'busy', '09:00', '11:00', '체력단련(가상)'],
    [0, 'busy', '13:00', '16:00', '교육(가상)'],
    [-7, 'sleep', '22:30', '05:30'],
    [-6, 'sleep', '22:00', '05:40'],
    [-5, 'sleep', '23:50', '07:30'],
    [-3, 'sleep', '00:00', '08:00'],
    [-2, 'sleep', '01:00', '07:00'],
  ],
};

export function demoBlocks(id: DemoId, refDate: string): Block[] {
  return ROWS[id].map(([offset, kind, start, end, note], i) => {
    const r = resolveRange(addDays(refDate, offset), start, end);
    return { id: `demo-${id}-${i}`, kind, start: r.start, end: r.end, ...(note ? { note } : {}) };
  });
}

export function isDemoId(v: unknown): v is DemoId {
  return v === 'day' || v === 'night' || v === 'mixed';
}
