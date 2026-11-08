import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeekView } from '../src/ui/WeekView';
import { summarizeWeek } from '../src/domain/weekly';
import { planSleep } from '../src/domain/planner';
import { DEFAULT_SETTINGS } from '../src/domain/settings';
import { RULES } from '../src/domain/sources';
import { demoBlocks } from '../src/domain/demo';

function render() {
  const plan = planSleep(demoBlocks('night', '2026-11-09'), DEFAULT_SETTINGS, '2026-11-03', '2026-11-09');
  const week = summarizeWeek(plan.days, DEFAULT_SETTINGS.sleepTargetMin);
  const html = renderToStaticMarkup(
    <WeekView week={week} refDate="2026-11-09" consent={{ enabled: false, consentedAt: null }} deviceId="" onGoSettings={() => {}} />,
  );
  return { html, week };
}

describe('초과 수면 비상쇄 규칙 표시', () => {
  it('주간 화면에 "앱 운영 정의" 표시와 함께 규칙 문장이 보인다(펼치지 않아도)', () => {
    const { html } = render();
    const note = /<p[^>]*data-testid="no-offset-rule"[^>]*>(.*?)<\/p>/s.exec(html)?.[1] ?? '';
    expect(note).toContain('앱 운영 정의');
    expect(note).toContain('초과 수면은 다른 날의 부족을 상쇄하지 않습니다');
  });

  it('규칙 출처는 외부 출처가 아닌 앱 운영 정의뿐이다', () => {
    expect(RULES.deficit.sources).toEqual(['app']);
    expect(RULES.deficit.operational).toContain('상쇄하지 않습니다');
  });

  it('화면 수치도 규칙대로: 야간 예시 주에서 9시간 잔 날이 있어도 기록 기준 누적 부족은 3시간 30분', () => {
    const { html, week } = render();
    expect(week.days.some((d) => d.source === 'log' && d.sleepMin === 540)).toBe(true);
    expect(week.recorded.cumulativeDeficitMin).toBe(210);
    expect(html).toContain('3시간 30분');
  });
});
