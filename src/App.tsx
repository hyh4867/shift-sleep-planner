import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Block } from './domain/types';
import { DEFAULT_SETTINGS, type Settings } from './domain/settings';
import { planSleep } from './domain/planner';
import { summarizeWeek } from './domain/weekly';
import { addDays, isDateKey, todayKey } from './domain/time';
import { demoBlocks, isDemoId, DEMO_LABEL, type DemoId } from './domain/demo';
import * as db from './storage/db';
import { TodayView } from './ui/TodayView';
import { WeekView } from './ui/WeekView';
import { InputView } from './ui/InputView';
import { SettingsView } from './ui/SettingsView';
import { Disclaimer, dayLabel } from './ui/common';

export type Tab = 'today' | 'week' | 'input' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: '오늘·내일' },
  { id: 'week', label: '주간' },
  { id: 'input', label: '입력' },
  { id: 'settings', label: '설정' },
];

export interface AiConsent {
  enabled: boolean;
  consentedAt: string | null;
}

function readUrl() {
  const q = new URLSearchParams(window.location.search);
  const demo = q.get('demo');
  const date = q.get('date');
  const tab = q.get('tab');
  return {
    demo: isDemoId(demo) ? demo : null,
    date: isDateKey(date) ? date : null,
    tab: (TABS.some((t) => t.id === tab) ? tab : null) as Tab | null,
  };
}

export default function App() {
  const url = useMemo(readUrl, []);
  const [tab, setTab] = useState<Tab>(url.tab ?? 'today');
  const [refDate, setRefDate] = useState(url.date ?? todayKey());
  const [stored, setStored] = useState<Block[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [consent, setConsent] = useState<AiConsent>({ enabled: false, consentedAt: null });
  const [deviceId, setDeviceId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 가상 일정 데모: 기기에 저장하지 않는다 */
  const [demo, setDemo] = useState<{ id: DemoId; blocks: Block[] } | null>(
    url.demo ? { id: url.demo, blocks: demoBlocks(url.demo, url.date ?? todayKey()) } : null,
  );

  useEffect(() => {
    (async () => {
      try {
        const [b, s, c, d] = await Promise.all([db.loadBlocks(), db.loadSettings(), db.loadAiConsent(), db.getDeviceId()]);
        setStored(b);
        setSettings(s);
        setConsent(c);
        setDeviceId(d);
      } catch (e) {
        setLoadError(`기기 저장소를 열 수 없습니다: ${(e as Error).message}`);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const blocks = demo ? demo.blocks : stored;

  const plan = useMemo(
    // 주간 그래프(R−6…R) + 오늘·내일 타임라인. 내일 밤에 시작하는 수면은 모레(R+2)로 합산되므로 R+2까지 계획한다.
    () => planSleep(blocks, settings, addDays(refDate, -6), addDays(refDate, 2)),
    [blocks, settings, refDate],
  );
  const week = useMemo(() => summarizeWeek(plan.days.slice(0, 7), settings.sleepTargetMin), [plan, settings]);

  const saveBlock = useCallback(
    async (b: Block) => {
      if (demo) {
        setDemo({ ...demo, blocks: [...demo.blocks.filter((x) => x.id !== b.id), b] });
        return;
      }
      await db.putBlock(b);
      setStored((cur) => [...cur.filter((x) => x.id !== b.id), b]);
    },
    [demo],
  );
  const removeBlock = useCallback(
    async (id: string) => {
      if (demo) {
        setDemo({ ...demo, blocks: demo.blocks.filter((x) => x.id !== id) });
        return;
      }
      await db.deleteBlock(id);
      setStored((cur) => cur.filter((x) => x.id !== id));
    },
    [demo],
  );
  const updateSettings = useCallback(async (s: Settings) => {
    setSettings(s);
    await db.saveSettings(s);
  }, []);
  const replaceAll = useCallback(async (b: Block[], s: Settings) => {
    await db.replaceAll(b, s);
    setStored(b);
    setSettings(s);
  }, []);
  const updateConsent = useCallback(async (c: AiConsent) => {
    setConsent(c);
    await db.saveAiConsent(c);
  }, []);

  const startDemo = (id: DemoId) => {
    setDemo({ id, blocks: demoBlocks(id, refDate) });
    setTab('today');
  };
  const endDemo = () => {
    setDemo(null);
    const u = new URL(window.location.href);
    u.searchParams.delete('demo');
    window.history.replaceState(null, '', u);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            ☾
          </span>
          <h1>교대 근무 수면 플래너</h1>
        </div>
        <div className="date-nav" aria-label="기준일">
          <button type="button" aria-label="하루 전" onClick={() => setRefDate(addDays(refDate, -1))}>
            ‹
          </button>
          <label>
            <span className="sr">기준일</span>
            <input type="date" value={refDate} onChange={(e) => isDateKey(e.target.value) && setRefDate(e.target.value)} />
            <span className="date-text">{dayLabel(refDate)}</span>
          </label>
          <button type="button" aria-label="하루 뒤" onClick={() => setRefDate(addDays(refDate, 1))}>
            ›
          </button>
          {refDate !== todayKey() && (
            <button type="button" className="link" onClick={() => setRefDate(todayKey())}>
              오늘
            </button>
          )}
        </div>
      </header>

      {demo && (
        <div className="banner demo">
          <span>
            가상 일정 데모 · <strong>{DEMO_LABEL[demo.id]}</strong> — 기기에 저장되지 않습니다
          </span>
          <button type="button" onClick={endDemo}>
            데모 끝내기
          </button>
        </div>
      )}
      {loadError && <div className="banner error">{loadError}</div>}

      <main>
        {!loaded ? (
          <p className="muted">불러오는 중…</p>
        ) : tab === 'today' ? (
          <TodayView plan={plan} blocks={blocks} settings={settings} refDate={refDate} onGoInput={() => setTab('input')} />
        ) : tab === 'week' ? (
          <WeekView
            week={week}
            refDate={refDate}
            consent={consent}
            deviceId={deviceId}
            onGoSettings={() => setTab('settings')}
          />
        ) : tab === 'input' ? (
          <InputView blocks={blocks} refDate={refDate} onSave={saveBlock} onDelete={removeBlock} />
        ) : (
          <SettingsView
            settings={settings}
            onSettings={updateSettings}
            consent={consent}
            onConsent={updateConsent}
            storedBlocks={stored}
            onReplaceAll={replaceAll}
            demoActive={demo?.id ?? null}
            onDemo={startDemo}
          />
        )}
        <Disclaimer compact={tab !== 'settings'} />
      </main>

      <nav className="tabs" aria-label="화면">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
