import type { AiPayload } from './payload';
import { validateAiPayload } from './payload';

export interface SummaryResult {
  text: string;
  /** 서버가 AI를 부르지 않고 고정 예시를 돌려준 경우 */
  demo: boolean;
}

export async function requestSummary(payload: AiPayload, deviceId: string): Promise<SummaryResult> {
  const check = validateAiPayload(payload);
  if (!check.ok) throw new Error(`보낼 수 없는 내용입니다: ${check.error}`);
  if (!navigator.onLine) throw new Error('오프라인 상태입니다. AI 요약은 온라인에서만 쓸 수 있습니다.');
  const res = await fetch('/api/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
    body: JSON.stringify(check.value),
  });
  let data: { summary?: string; error?: string; demo?: boolean } = {};
  try {
    data = await res.json();
  } catch {
    /* 서버 함수가 없는 환경(정적 배포·로컬 미리보기) */
  }
  if (!res.ok || !data.summary) throw new Error(data.error ?? `AI 요약을 받을 수 없습니다 (HTTP ${res.status}).`);
  return { text: data.summary, demo: data.demo === true };
}
