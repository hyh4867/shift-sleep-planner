/**
 * Vercel 서버 함수: POST /api/summary
 * 환경변수 (src/server/config.ts)
 *  - ANTHROPIC_API_KEY                         API 키. 클라이언트로 내보내지 않는다.
 *  - ANTHROPIC_MODEL                           기본 claude-haiku-5-5
 *  - UPSTASH_REDIS_REST_URL / _TOKEN           호출 제한 저장소 (또는 Vercel KV의 KV_REST_API_URL / _TOKEN)
 *  - DAILY_LIMIT_PER_DEVICE (3), DAILY_LIMIT_PER_IP (20), GLOBAL_DAILY_LIMIT (50)
 * 공개 배포(VERCEL_ENV=production|preview)에서 KV가 없거나, API 키가 없으면 AI를 부르지 않고 "데모 예시" 고정 요약을 돌려준다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { handleSummary } from '../src/server/summaryHandler.js';
import { memoryLimiter, upstashLimiter, type RateLimiter } from '../src/server/rateLimit.js';
import { resolveConfig } from '../src/server/config.js';

/** 서버 측 거절 대체(fallbacks: "default")를 지원하는 모델 */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1']);

const config = resolveConfig(process.env);
let limiter: RateLimiter | null = null;
function getLimiter(): RateLimiter {
  limiter ??= config.kv ? upstashLimiter(config.kv.url, config.kv.token) : memoryLimiter();
  return limiter;
}

async function generate(system: string, userText: string) {
  const client = new Anthropic(); // ANTHROPIC_API_KEY를 환경변수에서 읽는다
  const response = await client.beta.messages.create({
    model: config.model,
    max_tokens: 4000,
    system,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: userText }],
    ...(FALLBACK_MODELS.has(config.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  });
  if (response.stop_reason === 'refusal') return { text: '', refused: true };
  const text = response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  return { text, refused: false };
}

export async function POST(request: Request): Promise<Response> {
  return handleSummary(request, {
    generate,
    limiter: getLimiter(),
    dailyLimitPerDevice: config.dailyLimitPerDevice,
    dailyLimitPerIp: config.dailyLimitPerIp,
    globalDailyLimit: config.globalDailyLimit,
    demoMode: config.demoReason !== null,
  });
}
