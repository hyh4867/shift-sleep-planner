/**
 * 시각 표현: 기기 현지 벽시계 시각을 "YYYY-MM-DDTHH:mm" 문자열로 저장하고,
 * 계산은 1970-01-01T00:00(벽시계) 기준 분(minute) 정수로 한다.
 * Date.UTC로 해석하므로 서머타임 같은 시간대 변화의 영향을 받지 않는다.
 */
export type Minutes = number;
export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 1440;

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

export function isLocalDateTime(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = LOCAL_RE.exec(s);
  if (!m) return false;
  return formatLocal(parseLocal(s)) === s && Number(m[4]) < 24;
}

export function isDateKey(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s) && dateKey(dayStart(s)) === s;
}

export function parseLocal(s: string): Minutes {
  const m = LOCAL_RE.exec(s);
  if (!m) throw new Error(`잘못된 시각 형식: ${s}`);
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Math.round(ms / 60000);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatLocal(t: Minutes): string {
  const d = new Date(t * 60000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function dateKey(t: Minutes): string {
  return formatLocal(t).slice(0, 10);
}

export function dayStart(key: string): Minutes {
  const m = DATE_RE.exec(key);
  if (!m) throw new Error(`잘못된 날짜 형식: ${key}`);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 60000);
}

export function addDays(key: string, n: number): string {
  return dateKey(dayStart(key) + n * MIN_PER_DAY);
}

export function hhmm(t: Minutes): string {
  return formatLocal(t).slice(11);
}

export function parseHHMM(s: string): number {
  const m = TIME_RE.exec(s);
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`잘못된 시간 형식: ${s}`);
  return +m[1] * 60 + +m[2];
}

export function minutesToHHMM(min: number): string {
  const v = ((min % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}

/**
 * 날짜 + 시작·종료 "HH:mm"으로 구간을 만든다.
 * 종료 시각이 시작 시각보다 같거나 이르면 다음 날로 넘어간 것으로 본다(자정 넘김).
 */
export function resolveRange(date: string, startHHMM: string, endHHMM: string) {
  const base = dayStart(date);
  const s = base + parseHHMM(startHHMM);
  let e = base + parseHHMM(endHHMM);
  const crossesMidnight = e <= s;
  if (crossesMidnight) e += MIN_PER_DAY;
  return { start: formatLocal(s), end: formatLocal(e), crossesMidnight };
}

/** 길이(분)를 "7시간 30분" 형태로 */
export function formatDuration(min: number): string {
  const sign = min < 0 ? '-' : '';
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h === 0) return `${sign}${m}분`;
  if (m === 0) return `${sign}${h}시간`;
  return `${sign}${h}시간 ${m}분`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function weekdayKo(key: string): string {
  return WEEKDAYS[new Date(dayStart(key) * 60000).getUTCDay()];
}

/** 기기의 현지 날짜(오늘) */
export function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
