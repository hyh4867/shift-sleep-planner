import type { ReactNode } from 'react';
import type { Block } from '../domain/types';
import type { Settings } from '../domain/settings';
import type { Plan, PlannedSleep, CaffeineAdvice } from '../domain/planner';
import type { RuleId } from '../domain/sources';
import { addDays, dayStart, formatDuration, MIN_PER_DAY, parseLocal } from '../domain/time';
import { SourceChips, dayLabel, timeLabel } from './common';

interface Props {
  plan: Plan;
  blocks: Block[];
  settings: Settings;
  refDate: string;
  onGoInput: () => void;
}

const SLEEP_LABEL: Record<PlannedSleep['kind'], string> = {
  main: '본 수면',
  nap: '낮잠',
  extra: '보충 수면',
};

export function TodayView({ plan, blocks, settings, refDate, onGoInput }: Props) {
  const dates = [refDate, addDays(refDate, 1)];
  const hasShift = blocks.some((b) => b.kind === 'shift');
  return (
    <div className="stack">
      {!hasShift && (
        <div className="card hint">
          <p>근무 블록이 없어 평소 취침 시각 기준으로만 계산했습니다.</p>
          <button type="button" className="primary" onClick={onGoInput}>
            근무 입력하기
          </button>
          <p className="muted small">설정 → 가상 일정에서 예시를 둘러볼 수 있습니다.</p>
        </div>
      )}
      {dates.map((d, i) => (
        <DayCard key={d} date={d} title={i === 0 ? '오늘' : '내일'} plan={plan} blocks={blocks} settings={settings} />
      ))}
    </div>
  );
}

function DayCard({
  date,
  title,
  plan,
  blocks,
  settings,
}: {
  date: string;
  title: string;
  plan: Plan;
  blocks: Block[];
  settings: Settings;
}) {
  const d0 = dayStart(date);
  const d1 = d0 + MIN_PER_DAY;
  const inDay = (t: number) => t >= d0 && t < d1;
  const summary = plan.days.find((x) => x.date === date);

  const items: { t: number; node: ReactNode; key: string }[] = [];
  for (const p of plan.sleeps.filter((x) => inDay(x.start))) {
    items.push({
      t: p.start,
      key: `s${p.start}`,
      node: (
        <RecItem
          tone={p.kind}
          title={`${SLEEP_LABEL[p.kind]} ${timeLabel(p.start, date)}–${timeLabel(p.end, date)}`}
          meta={formatDuration(p.end - p.start)}
          rule={p.rule}
        >
          {p.reason}
        </RecItem>
      ),
    });
  }
  for (const n of plan.naps.filter((x) => !x.nap && inDay(x.shiftStart))) {
    items.push({
      t: n.shiftStart - settings.napBufferMin - 1,
      key: `n${n.shiftStart}`,
      node: (
        <RecItem tone="muted" title={`야간 근무(${timeLabel(n.shiftStart, date)}) 전 낮잠 생략`} rule="nap">
          {n.skippedReason}
        </RecItem>
      ),
    });
  }
  for (const c of plan.caffeine.filter((x) => inDay(x.cutoff))) {
    items.push({ t: c.cutoff, key: `c${c.cutoff}`, node: <CaffeineItem c={c} date={date} settings={settings} /> });
  }
  for (const l of plan.light.filter((x) => inDay(x.from))) {
    items.push({
      t: l.from,
      key: `l${l.from}`,
      node: (
        <RecItem tone="light" title={`조명 낮추기 ${timeLabel(l.from, date)}부터`} meta={`늦어도 ${timeLabel(l.until, date)}`} rule="light">
          {timeLabel(l.sleepStart, date)} 본 수면 {formatDuration(settings.dimLightMaxLeadMin)}–
          {formatDuration(settings.dimLightMinLeadMin)} 전부터 실내 조명을 어둡게 하세요.
          {l.duringShift && ' 이 시간에 근무 중이면 근무지 여건이 허락하는 범위에서만 적용하세요.'}
        </RecItem>
      ),
    });
  }
  items.sort((a, b) => a.t - b.t);

  return (
    <section className="card day" aria-labelledby={`day-${date}`}>
      <header className="day-head">
        <h2 id={`day-${date}`}>
          {title} <span className="muted">{dayLabel(date)}</span>
        </h2>
        {summary && (
          <div className={`total ${summary.shortfallMin > 0 ? 'short' : 'ok'}`}>
            <strong>{formatDuration(summary.totalMin)}</strong>
            <span> / 목표 {formatDuration(summary.targetMin)}</span>
          </div>
        )}
      </header>
      {summary && (
        <p className="small muted">
          기상일 기준 합계: 기록 {formatDuration(summary.loggedMin)} + 추천 {formatDuration(summary.plannedMin)}
          {summary.shortfallMin > 0 && (
            <strong className="warn-text"> · 빈 시간이 부족해 {formatDuration(summary.shortfallMin)} 모자랍니다</strong>
          )}
        </p>
      )}
      <Timeline date={date} plan={plan} blocks={blocks} />
      <SourceChips rule="target" />
      <ol className="recs">
        {items.length === 0 && <li className="muted small">이 날 시작하는 추천 항목이 없습니다.</li>}
        {items.map((it) => (
          <li key={it.key}>{it.node}</li>
        ))}
      </ol>
    </section>
  );
}

function CaffeineItem({ c, date, settings }: { c: CaffeineAdvice; date: string; settings: Settings }) {
  const h = settings.caffeineCutoffHours;
  let body: ReactNode;
  let flag: string | null = null;
  if (c.status === 'during-shift') {
    flag = `근무 중 마감: ${timeLabel(c.cutoff, date)} 이후 카페인 금지`;
    body = (
      <>
        근무({timeLabel(c.shift!.start, date)}–{timeLabel(c.shift!.end, date)}) 도중에 마감 시각이 걸립니다. 카페인은 근무 초반{' '}
        {timeLabel(c.earlyWindow!.start, date)}–{timeLabel(c.earlyWindow!.end, date)}에만 드세요.
      </>
    );
  } else if (c.status === 'before-shift') {
    flag = '이번 근무 중에는 카페인 금지';
    body = <>근무 시작({timeLabel(c.shift!.start, date)}) 전에 이미 마감입니다.</>;
  } else if (c.status === 'after-shift') {
    body = (
      <>
        마감은 근무가 끝난 뒤입니다. 그래도 카페인은 근무 초반 {timeLabel(c.earlyWindow!.start, date)}–
        {timeLabel(c.earlyWindow!.end, date)}에 드는 것을 권합니다.
      </>
    );
  } else {
    body = <>이 시각 이후에는 커피·에너지음료를 피하세요.</>;
  }
  return (
    <RecItem tone="caffeine" title={`카페인 마감 ${timeLabel(c.cutoff, date)}`} meta={`${timeLabel(c.sleepStart, date)} 본 수면 ${h}시간 전`} rule="caffeine" flag={flag}>
      {body}
    </RecItem>
  );
}

function RecItem({
  tone,
  title,
  meta,
  rule,
  flag,
  children,
}: {
  tone: string;
  title: string;
  meta?: string;
  rule: RuleId;
  flag?: string | null;
  children: ReactNode;
}) {
  return (
    <article className={`rec tone-${tone}`}>
      <div className="rec-head">
        <span className="dot" aria-hidden />
        <h3>{title}</h3>
        {meta && <span className="rec-meta">{meta}</span>}
      </div>
      {flag && (
        <p className="flag" role="status">
          ⚠ {flag}
        </p>
      )}
      <p className="rec-body">{children}</p>
      <SourceChips rule={rule} />
    </article>
  );
}

/** 0–24시 가로 타임라인: 일정 / 수면 두 줄 + 카페인·조명 표시 */
function Timeline({ date, plan, blocks }: { date: string; plan: Plan; blocks: Block[] }) {
  const d0 = dayStart(date);
  const d1 = d0 + MIN_PER_DAY;
  const pos = (s: number, e: number) => {
    const a = Math.max(s, d0);
    const b = Math.min(e, d1);
    return { left: `${((a - d0) / MIN_PER_DAY) * 100}%`, width: `${((b - a) / MIN_PER_DAY) * 100}%` };
  };
  const clipped = <T extends { s: number; e: number }>(xs: T[]) => xs.filter((x) => x.e > d0 && x.s < d1);
  const sched = clipped(
    blocks.filter((b) => b.kind !== 'sleep').map((b) => ({ s: parseLocal(b.start), e: parseLocal(b.end), b })),
  );
  const logs = clipped(blocks.filter((b) => b.kind === 'sleep').map((b) => ({ s: parseLocal(b.start), e: parseLocal(b.end) })));
  const recs = clipped(plan.sleeps.map((p) => ({ s: p.start, e: p.end, p })));
  const cutoffs = plan.caffeine.filter((c) => c.cutoff >= d0 && c.cutoff < d1);
  const lights = clipped(plan.light.map((l) => ({ s: l.from, e: l.until })));
  const label = (s: number, e: number, text: string) => (Math.min(e, d1) - Math.max(s, d0) >= 150 ? text : '');

  return (
    <figure className="timeline" aria-label={`${dayLabel(date)} 타임라인`}>
      <div className="lane">
        <span className="lane-name">일정</span>
        <div className="track">
          {sched.map(({ s, e, b }) => (
            <div
              key={b.id}
              className={`seg seg-${b.kind}`}
              style={pos(s, e)}
              title={`${b.kind === 'shift' ? '근무' : '잘 수 없는 시간'} ${timeLabel(s, date)}–${timeLabel(e, date)}${b.note ? ` ${b.note}` : ''}`}
            >
              {label(s, e, b.kind === 'shift' ? '근무' : b.note?.replace('(가상)', '') ?? '일과')}
            </div>
          ))}
          {cutoffs.map((c) => (
            <div key={c.cutoff} className="mark mark-caffeine" style={{ left: pos(c.cutoff, c.cutoff + 1).left }} title={`카페인 마감 ${timeLabel(c.cutoff, date)}`}>
              <span>☕ {timeLabel(c.cutoff, date)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="lane">
        <span className="lane-name">수면</span>
        <div className="track">
          {lights.map(({ s, e }) => (
            <div key={`l${s}`} className="seg seg-light" style={pos(s, e)} title={`조명 낮추기 ${timeLabel(s, date)}–${timeLabel(e, date)}`} />
          ))}
          {logs.map(({ s, e }) => (
            <div key={`g${s}`} className="seg seg-log" style={pos(s, e)} title={`실제 수면 ${timeLabel(s, date)}–${timeLabel(e, date)}`}>
              {label(s, e, '기록')}
            </div>
          ))}
          {recs.map(({ s, e, p }) => (
            <div
              key={`r${s}`}
              className={`seg seg-${p.kind}`}
              style={pos(s, e)}
              title={`${SLEEP_LABEL[p.kind]} ${timeLabel(s, date)}–${timeLabel(e, date)}`}
            >
              {label(s, e, SLEEP_LABEL[p.kind])}
            </div>
          ))}
        </div>
      </div>
      <div className="axis" aria-hidden>
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
      <figcaption className="legend">
        <span><i className="sw seg-shift" />근무</span>
        <span><i className="sw seg-busy" />잘 수 없는 시간</span>
        <span><i className="sw seg-log" />실제 수면</span>
        <span><i className="sw seg-main" />추천 본 수면</span>
        <span><i className="sw seg-nap" />낮잠</span>
        <span><i className="sw seg-extra" />보충</span>
        <span><i className="sw seg-light" />조명 낮추기</span>
        <span><i className="sw sw-caffeine" />카페인 마감</span>
      </figcaption>
    </figure>
  );
}
