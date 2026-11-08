/**
 * AI 주간 요약 서버 로직. Vercel 함수(api/summary.ts)가 실제 의존성을 넣어 호출한다.
 * 테스트에서는 generate / limiter를 가짜로 바꿔 끼운다.
 */
import { validateAiPayload, type AiPayload } from '../ai/payload.js';
import { kstDay, sha256Hex, type RateLimiter } from './rateLimit.js';

export const SYSTEM_PROMPT = `당신은 교대 근무자의 주간 수면 집계를 한국어로 요약하는 도우미입니다.
입력은 최근 7일 중 실제로 수면을 기록한 날의 집계 수치(일별 총 수면 분, 낮잠 횟수)와 하루 목표, 기록한 날만의 누적 수면 부족, 기록 없는 일수뿐이며 시각 정보는 없습니다.
규칙:
- 한 단락(3–5문장)으로만 답합니다. 목록, 제목, 마크다운을 쓰지 않습니다.
- 수치는 "시간·분"으로 바꿔 말합니다. dayIndex는 1이 6일 전, 7이 기준일입니다.
- 기록 없는 날의 수면을 추측하지 않습니다. 기록 없는 날이 있으면 그 일수를 밝히고, 기록을 남기면 요약이 정확해진다고 말합니다.
- 진단, 질환 이름, 약물·보충제 권유를 하지 않습니다. 의료 조언이 아니라는 점을 전제로 합니다.
- 누적 부족이 크거나 낮잠에 많이 의존하면, 불면이나 심한 졸림이 계속될 때 의무대에 상담하라는 문장을 마지막에 넣습니다.
- 입력에 없는 사실(근무 종류, 시각, 개인 정보)을 지어내지 않습니다.`;

/** 공개 배포에 호출 제한 저장소(KV)나 API 키가 없을 때 돌려주는 고정 요약 */
export const DEMO_SUMMARY =
  '데모 예시입니다. 이 배포에서는 AI 호출이 꺼져 있어 보낸 기록을 분석하지 않았습니다. 실제 요약은 이런 형식입니다: “기록한 5일 가운데 3일이 하루 목표 7시간에 못 미쳐 누적 수면 부족이 3시간 30분 생겼고, 야간 근무 직후의 낮 수면이 짧았습니다. 기록 없는 2일은 계산에서 뺐습니다.” 불면이나 심한 졸림이 계속되면 의무대에 상담하세요.';

export interface SummaryDeps {
  generate: (system: string, userText: string) => Promise<{ text: string; refused: boolean }>;
  limiter: RateLimiter;
  dailyLimitPerDevice: number;
  dailyLimitPerIp: number;
  /** 모든 기기를 합한 하루 호출 상한 */
  globalDailyLimit: number;
  /** true면 모델을 부르지 않고 DEMO_SUMMARY를 돌려준다 */
  demoMode?: boolean;
  now?: () => Date;
}

const DEVICE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4096;

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export function userMessageFor(payload: AiPayload): string {
  return `다음 주간 수면 집계를 요약해 주세요.\n${JSON.stringify(payload)}`;
}

export async function handleSummary(request: Request, deps: SummaryDeps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'POST만 허용됩니다.' }, { Allow: 'POST' });

  const deviceId = request.headers.get('x-device-id') ?? '';
  if (!DEVICE_RE.test(deviceId)) return json(400, { error: '기기 식별자가 없습니다.' });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: '요청이 너무 큽니다.' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'JSON 형식이 아닙니다.' });
  }
  const check = validateAiPayload(body);
  if (!check.ok) return json(400, { error: `허용되지 않은 payload: ${check.error}` });

  if (deps.demoMode) return json(200, { summary: DEMO_SUMMARY, demo: true });

  const day = kstDay((deps.now ?? (() => new Date()))());
  const ttl = 36 * 3600;
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const deviceKey = `ssp:rl:dev:${day}:${await sha256Hex(deviceId)}`;
  const ipKey = `ssp:rl:ip:${day}:${await sha256Hex(ip)}`;
  const globalKey = `ssp:rl:global:${day}`;
  let deviceCount: number;
  try {
    deviceCount = await deps.limiter.hit(deviceKey, ttl);
    const ipCount = await deps.limiter.hit(ipKey, ttl);
    if (deviceCount > deps.dailyLimitPerDevice || ipCount > deps.dailyLimitPerIp) {
      return json(429, {
        error: `오늘 AI 요약 호출 한도(기기당 ${deps.dailyLimitPerDevice}회)를 넘었습니다. 내일 다시 시도하세요.`,
      });
    }
    // 전체 상한은 기기·IP 한도를 통과한 호출만 센다.
    const globalCount = await deps.limiter.hit(globalKey, ttl);
    if (globalCount > deps.globalDailyLimit) {
      return json(429, { error: '오늘 이 데모의 전체 AI 호출 한도에 도달했습니다. 내일 다시 시도하세요.' });
    }
  } catch {
    return json(503, { error: '호출 제한 저장소에 연결할 수 없습니다. 잠시 뒤 다시 시도하세요.' });
  }

  try {
    const out = await deps.generate(SYSTEM_PROMPT, userMessageFor(check.value));
    if (out.refused || !out.text.trim()) return json(502, { error: 'AI가 요약을 만들지 못했습니다.' });
    return json(200, {
      summary: out.text.trim(),
      remainingToday: Math.max(0, deps.dailyLimitPerDevice - deviceCount),
    });
  } catch {
    return json(502, { error: 'AI 호출에 실패했습니다. 앱의 다른 기능은 그대로 쓸 수 있습니다.' });
  }
}
