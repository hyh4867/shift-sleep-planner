import { useState } from 'react';
import type { WeekSummary, WeekDay } from '../domain/weekly';
import { formatDuration } from '../domain/time';
import { buildAiPayload, type AiPayload } from '../ai/payload';
import { requestSummary } from '../ai/client';
import type { AiConsent } from '../App';
import { SourceChips, dayLabel } from './common';

interface Props {
  week: WeekSummary;
  refDate: string;
  consent: AiConsent;
  deviceId: string;
  onGoSettings: () => void;
}

export function WeekView({ week, consent, deviceId, onGoSettings }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const selDay = sel === null ? null : week.days[sel];
  return (
    <div className="stack">
      <section className="card">
        <h2>
          주간 수면 <span className="muted">{dayLabel(week.days[0].date)}–{dayLabel(week.days[6].date)}</span>
        </h2>
        <div className="stats">
          <div>
            <span className="stat-label">누적 수면 부족 · 기록 기준</span>
            <strong className={week.recorded.cumulativeDeficitMin > 0 ? 'warn-text' : ''}>
              {formatDuration(week.recorded.cumulativeDeficitMin)}
            </strong>
          </div>
          <div>
            <span className="stat-label">계획 포함 시(참고)</span>
            <strong className="secondary">{formatDuration(week.withPlan.cumulativeDeficitMin)}</strong>
          </div>
          <div>
            <span className="stat-label">기록한 날 / 평균</span>
            <strong>
              {week.recordedDays}/7일
              {week.recorded.averageSleepMin !== null && (
                <span className="stat-sub">평균 {formatDuration(Math.round(week.recorded.averageSleepMin))}</span>
              )}
            </strong>
          </div>
        </div>
        {week.unrecordedDays > 0 && (
          <p className="small muted">
            기록 없는 {week.unrecordedDays}일은 누적 부족(기록 기준)에서 빠집니다. 그래프의 빗금 막대와 “계획 포함” 값은 추천
            계획을 따랐다고 가정한 참고치입니다.
          </p>
        )}

        <h3 className="chart-title">일별 수면 합계</h3>
        <SleepBars week={week} sel={sel} onSel={setSel} />
        <div className="legend">
          <span><i className="sw sw-bar" />실제 기록</span>
          <span><i className="sw sw-bar-plan" />기록 없음 → 추천 계획 값</span>
          <span><i className="sw sw-target" />목표 {formatDuration(week.targetMin)}</span>
        </div>

        <h3 className="chart-title">목표 대비 누적 수면 부족</h3>
        <DeficitLine week={week} sel={sel} onSel={setSel} />
        <div className="legend">
          <span><i className="sw sw-debt" />기록 기준</span>
          <span><i className="sw sw-debt-plan" />계획 포함(참고)</span>
          <span><i className="sw sw-hollow" />기록 없는 날</span>
        </div>
        <p className="rule-note small" data-testid="no-offset-rule">
          <span className="chip chip-app">앱 운영 정의</span> 목표를 넘긴 날의 초과 수면은 다른 날의 부족을 상쇄하지 않습니다.
          누적 부족은 모자란 날의 부족분만 더한 값입니다.
        </p>

        <p className="selected small" aria-live="polite">
          {selDay ? describe(selDay, week.targetMin) : '막대나 점을 누르면 그날 값을 보여 줍니다.'}
        </p>
        <SourceChips rule="deficit" />

        <details className="table-view">
          <summary>표로 보기</summary>
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>수면</th>
                <th>구분</th>
                <th>낮잠</th>
                <th>부족</th>
                <th>누적·기록</th>
                <th>누적·계획 포함</th>
              </tr>
            </thead>
            <tbody>
              {week.days.map((d) => (
                <tr key={d.date}>
                  <td>{dayLabel(d.date)}</td>
                  <td>{formatDuration(d.sleepMin)}</td>
                  <td>{d.source === 'log' ? '기록' : '계획'}</td>
                  <td>{d.napCount}</td>
                  <td>{formatDuration(d.deficitMin)}</td>
                  <td>{formatDuration(d.cumulativeRecordedDeficitMin)}</td>
                  <td>{formatDuration(d.cumulativeWithPlanDeficitMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <AiSummary week={week} consent={consent} deviceId={deviceId} onGoSettings={onGoSettings} />
    </div>
  );
}

function describe(d: WeekDay, target: number) {
  return `${dayLabel(d.date)} · ${formatDuration(d.sleepMin)} (${d.source === 'log' ? '실제 기록' : '추천 계획 값'}) · 목표 대비 ${
    d.deficitMin > 0 ? `${formatDuration(d.deficitMin)} 부족` : d.sleepMin > target ? `${formatDuration(d.sleepMin - target)} 초과` : '충족'
  } · 누적 부족: 기록 기준 ${formatDuration(d.cumulativeRecordedDeficitMin)}, 계획 포함 ${formatDuration(d.cumulativeWithPlanDeficitMin)}`;
}

const W = 340;
const PAD = { l: 30, r: 8, t: 10, b: 26 };

function SleepBars({ week, sel, onSel }: { week: WeekSummary; sel: number | null; onSel: (i: number | null) => void }) {
  const H = 170;
  const maxMin = Math.max(10 * 60, ...week.days.map((d) => d.sleepMin), week.targetMin + 60);
  const top = Math.ceil(maxMin / 120) * 120;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const y = (m: number) => PAD.t + ih - (m / top) * ih;
  const slot = iw / 7;
  const bw = Math.min(28, slot - 10);
  const ticks = [];
  for (let m = 0; m <= top; m += 120) ticks.push(m);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="일별 수면 합계 막대그래프">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="hatch-bg" />
          <line x1="0" y1="0" x2="0" y2="6" className="hatch-line" strokeWidth="3" />
        </pattern>
      </defs>
      {ticks.map((m) => (
        <g key={m}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(m)} y2={y(m)} className="grid" />
          <text x={PAD.l - 6} y={y(m) + 3} className="tick" textAnchor="end">
            {m / 60}h
          </text>
        </g>
      ))}
      {week.days.map((d, i) => {
        const cx = PAD.l + slot * i + slot / 2;
        const h = Math.max(0, y(0) - y(d.sleepMin));
        const r = Math.min(4, h / 2);
        const x0 = cx - bw / 2;
        const y0 = y(d.sleepMin);
        // 위쪽 모서리만 둥근 막대
        const path = h <= 0 ? '' : `M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y(0)} Z`;
        return (
          <g key={d.date} className={`bar-g ${sel === i ? 'sel' : ''}`} onClick={() => onSel(sel === i ? null : i)}>
            <rect x={cx - slot / 2} y={PAD.t} width={slot} height={ih} className="hit" />
            {path && <path d={path} className={d.source === 'log' ? 'bar' : 'bar-plan'} />}
            <text x={cx} y={H - 12} className="tick" textAnchor="middle">
              {dayLabel(d.date).replace(/\(.\)/, '')}
            </text>
            <text x={cx} y={H - 2} className="tick" textAnchor="middle">
              {dayLabel(d.date).slice(-2, -1)}
            </text>
            <title>{describe(d, week.targetMin)}</title>
          </g>
        );
      })}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(week.targetMin)} y2={y(week.targetMin)} className="target" />
    </svg>
  );
}

function DeficitLine({ week, sel, onSel }: { week: WeekSummary; sel: number | null; onSel: (i: number | null) => void }) {
  const H = 130;
  const max = Math.max(120, ...week.days.map((d) => d.cumulativeWithPlanDeficitMin));
  const top = Math.ceil(max / 60) * 60;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - 18;
  const slot = iw / 7;
  const x = (i: number) => PAD.l + slot * i + slot / 2;
  const y = (m: number) => PAD.t + ih - (m / top) * ih;
  const line = (f: (d: WeekDay) => number) => week.days.map((d, i) => `${x(i)},${y(f(d))}`).join(' ');
  const step = top / 60 <= 4 ? 60 : Math.ceil(top / 60 / 4) * 60;
  const ticks = [];
  for (let m = 0; m <= top; m += step) ticks.push(m);
  const last = week.days[6];
  const showPlanLabel = last.cumulativeWithPlanDeficitMin !== last.cumulativeRecordedDeficitMin;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="누적 수면 부족 선그래프(기록 기준, 계획 포함)">
      {ticks.map((m) => (
        <g key={m}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(m)} y2={y(m)} className="grid" />
          <text x={PAD.l - 6} y={y(m) + 3} className="tick" textAnchor="end">
            {m / 60}h
          </text>
        </g>
      ))}
      <polyline points={line((d) => d.cumulativeWithPlanDeficitMin)} className="debt-line-plan" />
      <polyline points={line((d) => d.cumulativeRecordedDeficitMin)} className="debt-line" />
      {week.days.map((d, i) => (
        <g key={d.date} onClick={() => onSel(sel === i ? null : i)} className={`dot-g ${sel === i ? 'sel' : ''}`}>
          <rect x={x(i) - slot / 2} y={PAD.t} width={slot} height={ih} className="hit" />
          <circle
            cx={x(i)}
            cy={y(d.cumulativeRecordedDeficitMin)}
            r={sel === i ? 5 : 4}
            className={d.source === 'log' ? 'debt-dot' : 'debt-dot hollow'}
          />
          <title>{describe(d, week.targetMin)}</title>
        </g>
      ))}
      <text x={x(6) + 4} y={Math.max(PAD.t + 8, y(last.cumulativeRecordedDeficitMin) + 14)} className="debt-label" textAnchor="end">
        {formatDuration(last.cumulativeRecordedDeficitMin)}
      </text>
      {showPlanLabel && (
        <text x={x(6) + 4} y={Math.max(PAD.t + 8, y(last.cumulativeWithPlanDeficitMin) - 8)} className="debt-label-plan" textAnchor="end">
          {formatDuration(last.cumulativeWithPlanDeficitMin)}
        </text>
      )}
    </svg>
  );
}

type Stage =
  | { k: 'idle' }
  | { k: 'preview'; payload: AiPayload }
  | { k: 'sending' }
  | { k: 'done'; text: string; demo: boolean }
  | { k: 'error'; msg: string };

function AiSummary({ week, consent, deviceId, onGoSettings }: { week: WeekSummary; consent: AiConsent; deviceId: string; onGoSettings: () => void }) {
  const [stage, setStage] = useState<Stage>({ k: 'idle' });

  if (!consent.enabled) {
    return (
      <section className="card ai off">
        <h2>AI 주간 요약 <span className="badge">꺼짐</span></h2>
        <p className="small muted">기본으로 꺼져 있습니다. 켜지 않아도 앱의 모든 기능이 동작합니다.</p>
        <button type="button" onClick={onGoSettings}>
          설정에서 켜기
        </button>
      </section>
    );
  }

  const send = async (payload: AiPayload) => {
    setStage({ k: 'sending' });
    try {
      const r = await requestSummary(payload, deviceId);
      setStage({ k: 'done', text: r.text, demo: r.demo });
    } catch (e) {
      setStage({ k: 'error', msg: (e as Error).message });
    }
  };

  return (
    <section className="card ai">
      <h2>AI 주간 요약 <span className="badge on">켜짐</span></h2>
      {stage.k === 'idle' && (
        <>
          <p className="small muted">보내기 전에 보낼 내용을 먼저 보여 드립니다.</p>
          <button type="button" className="primary" onClick={() => setStage({ k: 'preview', payload: buildAiPayload(week) })}>
            보낼 내용 확인
          </button>
        </>
      )}
      {stage.k === 'preview' && (
        <div className="preview">
          <p className="small">
            아래 <strong>실제로 기록한 날의 집계 수치만</strong> 서버로 보냅니다. 날짜, 근무·수면 시각, 메모, 추천 계획 값은
            보내지 않습니다.
          </p>
          <ul className="small">
            <li>하루 목표: {formatDuration(stage.payload.targetSleepMinutes)}</li>
            <li>
              기록한 날의 총 수면(1 = 6일 전 … 7 = 기준일):{' '}
              {stage.payload.recordedDays.length
                ? stage.payload.recordedDays.map((d) => `${d.dayIndex}일차 ${formatDuration(d.totalSleepMinutes)}`).join(', ')
                : '없음'}
            </li>
            <li>
              기록한 날의 낮잠 횟수: {stage.payload.recordedDays.map((d) => d.napCount).join(', ') || '없음'} (합계{' '}
              {stage.payload.totalNapCount})
            </li>
            <li>누적 수면 부족(기록 기준): {formatDuration(stage.payload.cumulativeDeficitMinutes)}</li>
            <li>
              기록한 날 {stage.payload.recordedDayCount}일 · 기록 없는 날 {stage.payload.unrecordedDayCount}일(값은 보내지 않음)
            </li>
          </ul>
          <details>
            <summary className="small">보낼 JSON 원문</summary>
            <pre>{JSON.stringify(stage.payload, null, 2)}</pre>
          </details>
          <div className="row">
            <button type="button" className="primary" onClick={() => send(stage.payload)}>
              이 내용 보내기
            </button>
            <button type="button" onClick={() => setStage({ k: 'idle' })}>
              취소
            </button>
          </div>
        </div>
      )}
      {stage.k === 'sending' && <p className="muted">요약을 만드는 중…</p>}
      {stage.k === 'done' && (
        <>
          {stage.demo && (
            <p className="demo-tag" role="note">
              데모 예시 — 이 배포에서는 AI 호출이 꺼져 있어 고정된 예시 문장을 보여 줍니다
            </p>
          )}
          <p className="ai-text">{stage.text}</p>
          <p className="small muted">{stage.demo ? '실제 기록을 분석한 결과가 아닙니다.' : 'AI가 만든 글입니다.'} 의료 조언이 아닙니다.</p>
          <button type="button" onClick={() => setStage({ k: 'idle' })}>
            닫기
          </button>
        </>
      )}
      {stage.k === 'error' && (
        <>
          <p className="warn-text small">{stage.msg}</p>
          <button type="button" onClick={() => setStage({ k: 'idle' })}>
            확인
          </button>
        </>
      )}
    </section>
  );
}
