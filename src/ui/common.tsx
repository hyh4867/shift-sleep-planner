import { useState } from 'react';
import { RULES, SOURCES, type RuleId } from '../domain/sources';
import { dateKey, hhmm, weekdayKo } from '../domain/time';

/** 규칙의 출처를 칩으로 표시. 누르면 전체 인용이 펼쳐진다. */
export function SourceChips({ rule }: { rule: RuleId }) {
  const [open, setOpen] = useState(false);
  const info = RULES[rule];
  return (
    <div className="sources">
      <button type="button" className="chip-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        {info.sources.map((id) => (
          <span key={id} className={`chip ${id === 'app' ? 'chip-app' : ''}`}>
            {id === 'app' ? '앱 운영 정의' : `출처 · ${SOURCES[id].short}`}
          </span>
        ))}
      </button>
      {open && (
        <div className="source-detail">
          {info.operational && <p>{info.operational}</p>}
          <ul>
            {info.sources
              .filter((id) => id !== 'app')
              .map((id) => (
                <li key={id}>
                  {SOURCES[id].citation}{' '}
                  {SOURCES[id].url && (
                    <a href={SOURCES[id].url} target="_blank" rel="noreferrer">
                      링크
                    </a>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`disclaimer ${compact ? 'compact' : ''}`} role="note">
      이 앱의 추천은 일반적인 수면 위생 지침을 일정에 맞춰 계산한 것이며 <strong>의료 조언이 아닙니다</strong>. 불면이나
      심한 졸림이 계속되면 <strong>의무대에 상담</strong>하세요.
    </p>
  );
}

/** "11/9(월)" */
export function dayLabel(key: string): string {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}(${weekdayKo(key)})`;
}

/** 기준 날짜와 다르면 날짜를 붙인 시각 */
export function timeLabel(t: number, refDate?: string): string {
  const k = dateKey(t);
  return refDate && k !== refDate ? `${dayLabel(k)} ${hhmm(t)}` : hhmm(t);
}
