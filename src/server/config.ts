/** 서버 함수 설정을 환경변수에서 읽는다(순수 함수 — 테스트 가능). */
export const DEFAULT_MODEL = 'claude-haiku-5-5';

export type DemoReason = 'no-api-key' | 'no-kv-on-public-deploy';

export interface ServerConfig {
  model: string;
  kv: { url: string; token: string } | null;
  /** 값이 있으면 AI를 호출하지 않고 "데모 예시" 고정 요약을 돌려준다 */
  demoReason: DemoReason | null;
  dailyLimitPerDevice: number;
  dailyLimitPerIp: number;
  globalDailyLimit: number;
}

type Env = Record<string, string | undefined>;

function posInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isInteger(n) && n > 0 ? n : fallback;
}

export function resolveConfig(env: Env): ServerConfig {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const kv = url && token ? { url, token } : null;
  // Vercel에 배포되면 VERCEL_ENV(production/preview/development)가 설정된다.
  const publicDeploy = env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview';
  let demoReason: DemoReason | null = null;
  if (!env.ANTHROPIC_API_KEY) demoReason = 'no-api-key';
  else if (publicDeploy && !kv) demoReason = 'no-kv-on-public-deploy';
  return {
    model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    kv,
    demoReason,
    dailyLimitPerDevice: posInt(env.DAILY_LIMIT_PER_DEVICE, 3),
    dailyLimitPerIp: posInt(env.DAILY_LIMIT_PER_IP, 20),
    globalDailyLimit: posInt(env.GLOBAL_DAILY_LIMIT, 50),
  };
}
