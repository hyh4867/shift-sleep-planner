import { useEffect, useRef, useState } from 'react';
import type { Block } from '../domain/types';
import { DEFAULT_SETTINGS, validateSettings, type Settings } from '../domain/settings';
import { RULES, type RuleId } from '../domain/sources';
import { makeBackup, parseBackup } from '../domain/backup';
import { DEMO_LABEL, type DemoId } from '../domain/demo';
import { minutesToHHMM, parseHHMM, todayKey } from '../domain/time';
import type { AiConsent } from '../App';
import { SourceChips } from './common';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => Promise<void>;
  consent: AiConsent;
  onConsent: (c: AiConsent) => Promise<void>;
  storedBlocks: Block[];
  onReplaceAll: (b: Block[], s: Settings) => Promise<void>;
  demoActive: DemoId | null;
  onDemo: (id: DemoId) => void;
}

type Field = { key: keyof Settings; label: string; unit: 'min' | 'hour' | 'clock' };

const GROUPS: { rule: RuleId; fields: Field[] }[] = [
  { rule: 'target', fields: [{ key: 'sleepTargetMin', label: '하루 수면 목표', unit: 'hour' }] },
  { rule: 'attribution', fields: [] },
  {
    rule: 'nap',
    fields: [
      { key: 'nightWindowStartMin', label: '야간 판정 시작', unit: 'clock' },
      { key: 'nightWindowEndMin', label: '야간 판정 끝', unit: 'clock' },
      { key: 'napLongThresholdMin', label: '긴 낮잠 기준(근무 전 빈 시간 ≥)', unit: 'min' },
      { key: 'napLongMin', label: '긴 낮잠 길이', unit: 'min' },
      { key: 'napShortThresholdMin', label: '짧은 낮잠 기준(근무 전 빈 시간 ≥)', unit: 'min' },
      { key: 'napShortMin', label: '짧은 낮잠 길이', unit: 'min' },
      { key: 'napBufferMin', label: '낮잠 종료 ~ 근무 시작 여유', unit: 'min' },
    ],
  },
  {
    rule: 'main',
    fields: [
      { key: 'preferredBedtimeMin', label: '평소 취침 시각', unit: 'clock' },
      { key: 'postShiftBufferMin', label: '근무 종료 ~ 취침 여유', unit: 'min' },
      { key: 'wakeBufferMin', label: '본 수면 기상 ~ 근무 시작 여유', unit: 'min' },
      { key: 'minSleepChunkMin', label: '보충 수면 최소 길이', unit: 'min' },
    ],
  },
  {
    rule: 'caffeine',
    fields: [
      { key: 'caffeineCutoffHours', label: '카페인 마감(수면 시작 몇 시간 전)', unit: 'hour' },
      { key: 'caffeineEarlyWindowMin', label: '“근무 초반” 길이', unit: 'min' },
    ],
  },
  {
    rule: 'light',
    fields: [
      { key: 'dimLightMaxLeadMin', label: '조명 낮추기 시작(수면 몇 분 전)', unit: 'min' },
      { key: 'dimLightMinLeadMin', label: '늦어도(수면 몇 분 전)', unit: 'min' },
    ],
  },
  { rule: 'deficit', fields: [{ key: 'napCountMaxMin', label: '기록 중 낮잠으로 셀 길이(미만)', unit: 'min' }] },
];

export function SettingsView(p: Props) {
  return (
    <div className="stack">
      <RulesEditor settings={p.settings} onSettings={p.onSettings} />
      <AiToggle consent={p.consent} onConsent={p.onConsent} />
      <Backup settings={p.settings} blocks={p.storedBlocks} onReplaceAll={p.onReplaceAll} demoActive={p.demoActive} />
      <section className="card">
        <h2>가상 일정 둘러보기</h2>
        <p className="small muted">기준일 주변에 가상의 일정을 만들어 보여 줍니다. 실제 근무표가 아니며 기기에 저장되지 않습니다.</p>
        <div className="row wrap">
          {(Object.keys(DEMO_LABEL) as DemoId[]).map((id) => (
            <button key={id} type="button" className={p.demoActive === id ? 'primary' : ''} onClick={() => p.onDemo(id)}>
              {DEMO_LABEL[id]}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>데이터 저장</h2>
        <p className="small">
          입력한 근무·수면 기록과 설정은 이 기기의 브라우저 저장소(IndexedDB)에만 저장됩니다. 브라우저 데이터를 지우면 함께
          지워지니 JSON 내보내기로 백업하세요.
        </p>
      </section>
    </div>
  );
}

function RulesEditor({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => Promise<void> }) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const save = async (next: Settings) => {
    const v = validateSettings(next);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    await onSettings(v.value);
    setMsg('저장했습니다. 추천이 다시 계산됩니다.');
  };

  const input = (f: Field) => {
    const v = draft[f.key];
    const common = { id: `set-${f.key}` };
    const setV = (n: number) => {
      setDraft({ ...draft, [f.key]: n });
      setMsg(null);
    };
    if (f.unit === 'clock') {
      return (
        <input
          {...common}
          type="time"
          value={minutesToHHMM(v)}
          onChange={(e) => {
            try {
              const m = parseHHMM(e.target.value);
              setV(f.key === 'nightWindowEndMin' && m === 0 ? 1440 : m);
            } catch {
              /* 입력 중 */
            }
          }}
        />
      );
    }
    if (f.unit === 'hour') {
      const isMin = f.key === 'sleepTargetMin';
      return (
        <span className="unit-input">
          <input
            {...common}
            type="number"
            inputMode="decimal"
            step={0.5}
            value={isMin ? v / 60 : v}
            onChange={(e) => setV(isMin ? Math.round(Number(e.target.value) * 60) : Number(e.target.value))}
          />
          <span>시간</span>
        </span>
      );
    }
    return (
      <span className="unit-input">
        <input {...common} type="number" inputMode="numeric" step={5} value={v} onChange={(e) => setV(Number(e.target.value))} />
        <span>분</span>
      </span>
    );
  };

  return (
    <section className="card">
      <h2>추천 규칙과 출처</h2>
      <p className="small muted">모든 기본값은 바꿀 수 있습니다. 출처 칩을 누르면 인용 전체가 보입니다.</p>
      {GROUPS.map((g) => (
        <div key={g.rule} className="rule" id={`rule-${g.rule}`}>
          <h3>{RULES[g.rule].title}</h3>
          <SourceChips rule={g.rule} />
          {g.fields.map((f) => (
            <div key={f.key} className="field">
              <label htmlFor={`set-${f.key}`}>{f.label}</label>
              {input(f)}
            </div>
          ))}
        </div>
      ))}
      {errors.length > 0 && (
        <div className="errors" role="alert">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {msg && <p className="ok-text small">{msg}</p>}
      <div className="row sticky-actions">
        <button type="button" className="primary" disabled={!dirty} onClick={() => save(draft)}>
          설정 저장
        </button>
        <button type="button" onClick={() => window.confirm('모든 규칙을 기본값으로 되돌릴까요?') && save(DEFAULT_SETTINGS)}>
          기본값으로
        </button>
      </div>
    </section>
  );
}

function AiToggle({ consent, onConsent }: { consent: AiConsent; onConsent: (c: AiConsent) => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  return (
    <section className="card">
      <div className="row spread">
        <h2>AI 주간 요약</h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={consent.enabled}
            onChange={(e) => {
              if (e.target.checked) setAsking(true);
              else void onConsent({ enabled: false, consentedAt: null });
            }}
          />
          <span>{consent.enabled ? '켜짐' : '꺼짐'}</span>
        </label>
      </div>
      <p className="small muted">기본은 꺼짐입니다. 꺼 두어도 추천·그래프·백업은 모두 동작합니다.</p>
      {asking && !consent.enabled && (
        <div className="consent" role="dialog" aria-label="AI 요약 동의">
          <h3>켜기 전에 확인해 주세요</h3>
          <ul className="small">
            <li>
              <strong>보내는 것</strong>: 최근 7일 중 실제로 기록한 날의 총 수면 시간(분)과 낮잠 횟수, 기록한 날만의 누적 수면 부족, 하루 목표, 기록 없는 일수.
            </li>
            <li>
              <strong>보내지 않는 것</strong>: 날짜, 근무·수면의 시작·종료 시각, 메모, 기록 없는 날의 추천 계획 값, 기기에 저장된 원본 기록.
            </li>
            <li>요약을 요청할 때마다 보낼 내용을 먼저 보여 주고, 확인을 누를 때만 보냅니다.</li>
            <li>이 앱의 서버 함수를 거쳐 Anthropic의 Claude API로 전달됩니다. 공개 데모에서는 기기당 하루 호출 횟수가 제한됩니다.</li>
            <li>AI 요약은 의료 조언이 아닙니다. 언제든 다시 끌 수 있습니다.</li>
          </ul>
          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={async () => {
                await onConsent({ enabled: true, consentedAt: new Date().toISOString() });
                setAsking(false);
              }}
            >
              동의하고 켜기
            </button>
            <button type="button" onClick={() => setAsking(false)}>
              취소
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Backup({
  settings,
  blocks,
  onReplaceAll,
  demoActive,
}: {
  settings: Settings;
  blocks: Block[];
  onReplaceAll: (b: Block[], s: Settings) => Promise<void>;
  demoActive: DemoId | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);

  const exportJson = () => {
    const file = makeBackup(blocks, settings);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shift-sleep-backup-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg({ ok: true, text: `블록 ${blocks.length}개와 설정을 내보냈습니다.` });
  };

  const importJson = async (f: File) => {
    const r = parseBackup(await f.text());
    if (!r.ok) {
      setMsg({ ok: false, text: '가져오지 않았습니다.', details: r.errors.slice(0, 10) });
      return;
    }
    if (!window.confirm(`지금 기기의 기록을 지우고 백업의 블록 ${r.value.blocks.length}개와 설정으로 바꿀까요?`)) return;
    await onReplaceAll(r.value.blocks, r.value.settings);
    setMsg({ ok: true, text: `블록 ${r.value.blocks.length}개를 가져왔습니다.` });
  };

  return (
    <section className="card">
      <h2>백업</h2>
      {demoActive && <p className="small warn-text">데모 일정은 백업에 들어가지 않습니다. 기기에 저장된 기록만 내보냅니다.</p>}
      <div className="row wrap">
        <button type="button" onClick={exportJson}>
          JSON 내보내기
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          JSON 가져오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = '';
          }}
        />
      </div>
      {msg && (
        <div className={msg.ok ? 'ok-text small' : 'errors'} role="status">
          {msg.text}
          {msg.details && (
            <ul>
              {msg.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
