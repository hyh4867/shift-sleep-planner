import { describe, expect, it, vi } from 'vitest';
import { handleSummary, DEMO_SUMMARY, type SummaryDeps } from '../src/server/summaryHandler';
import { memoryLimiter, upstashLimiter } from '../src/server/rateLimit';
import { resolveConfig, DEFAULT_MODEL } from '../src/server/config';
import { buildAiPayload, type AiPayload } from '../src/ai/payload';
import { summarizeWeek } from '../src/domain/weekly';
import { planSleep } from '../src/domain/planner';
import { DEFAULT_SETTINGS } from '../src/domain/settings';

const DEVICE = '123e4567-e89b-42d3-a456-426614174000';
const payload: AiPayload = buildAiPayload(
  summarizeWeek(planSleep([], DEFAULT_SETTINGS, '2026-11-02', '2026-11-08').days, 420),
);
const device = (n: number) => `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;

function req(body: unknown, headers: Record<string, string> = { 'x-device-id': DEVICE }) {
  return new Request('https://example.test/api/summary', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deps(over: Partial<SummaryDeps> = {}): SummaryDeps {
  return {
    generate: vi.fn(async () => ({ text: '이번 주 요약입니다.', refused: false })),
    limiter: memoryLimiter(),
    dailyLimitPerDevice: 2,
    dailyLimitPerIp: 10,
    globalDailyLimit: 50,
    now: () => new Date('2026-11-08T03:00:00Z'),
    ...over,
  };
}

describe('AI 요약 서버 함수', () => {
  it('집계 payload만 모델에 전달하고 요약을 돌려준다', async () => {
    const d = deps();
    const res = await handleSummary(req(payload), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: '이번 주 요약입니다.', remainingToday: 1 });
    const [, userText] = (d.generate as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(userText).toContain(JSON.stringify(payload));
    expect(userText).not.toMatch(/\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}/);
  });

  it('시각이 들어간 payload는 모델을 부르지 않고 400', async () => {
    const d = deps();
    const res = await handleSummary(req({ ...payload, shiftStart: '22:00' }), d);
    expect(res.status).toBe(400);
    expect(d.generate).not.toHaveBeenCalled();
  });

  it('기기 식별자가 없으면 400', async () => {
    const res = await handleSummary(req(payload, {}), deps());
    expect(res.status).toBe(400);
  });

  it('기기당 하루 호출 횟수를 넘으면 429', async () => {
    const d = deps();
    expect((await handleSummary(req(payload), d)).status).toBe(200);
    expect((await handleSummary(req(payload), d)).status).toBe(200);
    const third = await handleSummary(req(payload), d);
    expect(third.status).toBe(429);
    expect(d.generate).toHaveBeenCalledTimes(2);
    // 다음 날(KST)에는 다시 허용
    d.now = () => new Date('2026-11-08T16:00:00Z');
    expect((await handleSummary(req(payload), d)).status).toBe(200);
  });

  it('기기마다 다르더라도 전체 하루 상한을 넘으면 429', async () => {
    const d = deps({ globalDailyLimit: 3, dailyLimitPerIp: 100 });
    for (let i = 0; i < 3; i++) expect((await handleSummary(req(payload, { 'x-device-id': device(i) }), d)).status).toBe(200);
    const over = await handleSummary(req(payload, { 'x-device-id': device(99) }), d);
    expect(over.status).toBe(429);
    expect((await over.json()).error).toContain('전체');
    expect(d.generate).toHaveBeenCalledTimes(3);
  });

  it('기기 한도로 거절된 호출은 전체 상한을 소모하지 않는다', async () => {
    const d = deps({ globalDailyLimit: 3, dailyLimitPerDevice: 1, dailyLimitPerIp: 100 });
    expect((await handleSummary(req(payload), d)).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await handleSummary(req(payload), d)).status).toBe(429);
    expect((await handleSummary(req(payload, { 'x-device-id': device(1) }), d)).status).toBe(200);
    expect((await handleSummary(req(payload, { 'x-device-id': device(2) }), d)).status).toBe(200);
  });

  it('데모 모드: 모델을 부르지 않고 "데모 예시" 고정 요약, payload 검사는 그대로', async () => {
    const d = deps({ demoMode: true });
    const res = await handleSummary(req(payload), d);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ summary: DEMO_SUMMARY, demo: true });
    expect(body.summary).toContain('데모 예시');
    expect(d.generate).not.toHaveBeenCalled();
    expect((await handleSummary(req({ ...payload, shiftStart: '22:00' }), d)).status).toBe(400);
  });

  it('모델 오류·거절은 502로 알리고 앱은 계속 동작', async () => {
    const failing = deps({ generate: async () => { throw new Error('boom'); } });
    expect((await handleSummary(req(payload), failing)).status).toBe(502);
    const refused = deps({ generate: async () => ({ text: '', refused: true }) });
    expect((await handleSummary(req(payload), refused)).status).toBe(502);
  });

  it('POST 외 메서드는 405', async () => {
    const res = await handleSummary(new Request('https://example.test/api/summary'), deps());
    expect(res.status).toBe(405);
  });
});

describe('서버 설정', () => {
  const KEY = { ANTHROPIC_API_KEY: 'sk-test' };
  const KV = { UPSTASH_REDIS_REST_URL: 'https://kv.example', UPSTASH_REDIS_REST_TOKEN: 't' };

  it('기본 모델은 claude-haiku-5-5, 한도 기본값 3/20/50', () => {
    const c = resolveConfig({ ...KEY, ...KV, VERCEL_ENV: 'production' });
    expect(DEFAULT_MODEL).toBe('claude-haiku-5-5');
    expect(c).toMatchObject({ model: 'claude-haiku-5-5', demoReason: null, dailyLimitPerDevice: 3, dailyLimitPerIp: 20, globalDailyLimit: 50 });
    expect(resolveConfig({ ...KEY, ANTHROPIC_MODEL: 'claude-sonnet-5-5' }).model).toBe('claude-sonnet-5-5');
    expect(resolveConfig({ ...KEY, GLOBAL_DAILY_LIMIT: '10' }).globalDailyLimit).toBe(10);
    expect(resolveConfig({ ...KEY, GLOBAL_DAILY_LIMIT: 'abc' }).globalDailyLimit).toBe(50);
  });

  it('공개 배포(production/preview)에서 KV가 없으면 데모 모드', () => {
    expect(resolveConfig({ ...KEY, VERCEL_ENV: 'production' }).demoReason).toBe('no-kv-on-public-deploy');
    expect(resolveConfig({ ...KEY, VERCEL_ENV: 'preview' }).demoReason).toBe('no-kv-on-public-deploy');
    expect(resolveConfig({ ...KEY, VERCEL_ENV: 'preview', KV_REST_API_URL: 'https://kv', KV_REST_API_TOKEN: 't' }).demoReason).toBeNull();
    // 로컬 개발(VERCEL_ENV 없음)은 메모리 카운터로 동작
    expect(resolveConfig({ ...KEY }).demoReason).toBeNull();
  });

  it('API 키가 없으면 데모 모드', () => {
    expect(resolveConfig({ ...KV, VERCEL_ENV: 'production' }).demoReason).toBe('no-api-key');
  });
});

describe('Upstash/KV 호출 카운터', () => {
  it('SET NX EX로 만료를 건 뒤 INCR 결과를 쓴다', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify([{ result: 'OK' }, { result: 4 }]), { status: 200 });
    }) as unknown as typeof fetch;
    const n = await upstashLimiter('https://kv.example/', 'tok', fake).hit('k1', 3600);
    expect(n).toBe(4);
    expect(calls[0].url).toBe('https://kv.example/pipeline');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[0].init.body as string)).toEqual([
      ['SET', 'k1', '0', 'EX', '3600', 'NX'],
      ['INCR', 'k1'],
    ]);
  });

  it('저장소 오류면 503, 모델은 부르지 않는다', async () => {
    const broken = { hit: async () => { throw new Error('down'); } };
    const d = deps({ limiter: broken });
    expect((await handleSummary(req(payload), d)).status).toBe(503);
    expect(d.generate).not.toHaveBeenCalled();
  });
});
