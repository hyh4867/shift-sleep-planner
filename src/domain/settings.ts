export interface Settings {
  /** 하루 수면 목표(분) */
  sleepTargetMin: number;
  /** 야간 근무 판정 구간(자정 기준 분) */
  nightWindowStartMin: number;
  nightWindowEndMin: number;
  /** 근무 전 빈 시간이 이 값 이상이면 긴 낮잠 */
  napLongThresholdMin: number;
  napLongMin: number;
  /** 근무 전 빈 시간이 이 값 이상이면 짧은 낮잠 */
  napShortThresholdMin: number;
  napShortMin: number;
  /** 낮잠은 근무 시작 이 시간 전에 끝남 */
  napBufferMin: number;
  /** 본 수면 후 근무 시작까지 남길 여유(앱 운영 정의) */
  wakeBufferMin: number;
  /** 근무 종료 후 취침까지 여유(퇴근·정리, 앱 운영 정의) */
  postShiftBufferMin: number;
  /** 평소 취침 시각(자정 기준 분) — 큰 빈 구간에서 본 수면 위치를 정할 때 사용 */
  preferredBedtimeMin: number;
  /** 카페인 마감: 본 수면 시작 몇 시간 전 */
  caffeineCutoffHours: number;
  /** "근무 초반" 길이(분) */
  caffeineEarlyWindowMin: number;
  /** 조명 낮추기 안내: 수면 몇 분 전부터 몇 분 전까지 */
  dimLightMaxLeadMin: number;
  dimLightMinLeadMin: number;
  /** 보충 수면·분할 수면의 최소 길이 */
  minSleepChunkMin: number;
  /** 기록된 수면 중 이 길이 미만은 낮잠으로 집계 */
  napCountMaxMin: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sleepTargetMin: 420,
  nightWindowStartMin: 0,
  nightWindowEndMin: 360,
  napLongThresholdMin: 120,
  napLongMin: 90,
  napShortThresholdMin: 45,
  napShortMin: 20,
  napBufferMin: 30,
  wakeBufferMin: 30,
  postShiftBufferMin: 30,
  preferredBedtimeMin: 23 * 60,
  caffeineCutoffHours: 6,
  caffeineEarlyWindowMin: 120,
  dimLightMaxLeadMin: 120,
  dimLightMinLeadMin: 60,
  minSleepChunkMin: 20,
  napCountMaxMin: 120,
};

type Range = [number, number];
export const SETTING_RANGES: Record<keyof Settings, Range> = {
  sleepTargetMin: [240, 720],
  nightWindowStartMin: [0, 1439],
  nightWindowEndMin: [1, 1440],
  napLongThresholdMin: [30, 600],
  napLongMin: [10, 180],
  napShortThresholdMin: [10, 600],
  napShortMin: [5, 90],
  napBufferMin: [0, 120],
  wakeBufferMin: [0, 180],
  postShiftBufferMin: [0, 180],
  preferredBedtimeMin: [0, 1439],
  caffeineCutoffHours: [0, 12],
  caffeineEarlyWindowMin: [0, 480],
  dimLightMaxLeadMin: [0, 240],
  dimLightMinLeadMin: [0, 240],
  minSleepChunkMin: [5, 120],
  napCountMaxMin: [10, 240],
};

/** 저장·가져오기 때 쓰는 검증. 문제가 있으면 오류 문구 목록을 돌려준다. */
export function validateSettings(input: unknown): { ok: true; value: Settings } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) return { ok: false, errors: ['설정 형식이 잘못되었습니다.'] };
  const src = input as Record<string, unknown>;
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = src[key];
    if (v === undefined) continue;
    const [lo, hi] = SETTING_RANGES[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
      errors.push(`${key} 값은 ${lo}–${hi} 범위의 숫자여야 합니다.`);
      continue;
    }
    out[key] = v;
  }
  if (out.nightWindowEndMin <= out.nightWindowStartMin) errors.push('야간 판정 구간의 끝이 시작보다 늦어야 합니다.');
  if (out.napShortThresholdMin > out.napLongThresholdMin) errors.push('짧은 낮잠 기준은 긴 낮잠 기준 이하여야 합니다.');
  if (out.dimLightMinLeadMin > out.dimLightMaxLeadMin) errors.push('조명 안내 구간의 시작·끝이 뒤바뀌었습니다.');
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}
