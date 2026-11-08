import { useMemo, useState, type FormEvent } from 'react';
import { KIND_LABEL, type Block, type BlockKind } from '../domain/types';
import { validateBlock } from '../domain/overlap';
import { addDays, formatDuration, parseLocal, resolveRange } from '../domain/time';
import { dayLabel } from './common';

interface Props {
  blocks: Block[];
  refDate: string;
  onSave: (b: Block) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const KINDS: BlockKind[] = ['shift', 'busy', 'sleep'];
const KIND_HELP: Record<BlockKind, string> = {
  shift: '근무 시간. 자정을 넘으면 종료를 다음 날 시각으로 적으면 됩니다.',
  busy: '일과·교육·식사처럼 잘 수 없는 시간.',
  sleep: '실제로 잔 시간(낮잠 포함). 주간 그래프에 계획 대신 쓰입니다.',
};

interface Form {
  id: string | null;
  kind: BlockKind;
  date: string;
  start: string;
  end: string;
  note: string;
}

const empty = (date: string, kind: BlockKind = 'shift'): Form => ({ id: null, kind, date, start: '', end: '', note: '' });

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `b-${Date.now()}-${Math.random()}`;
}

export function InputView({ blocks, refDate, onSave, onDelete }: Props) {
  const [form, setForm] = useState<Form>(empty(refDate));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const preview = useMemo(() => {
    if (!form.date || !form.start || !form.end) return null;
    try {
      return resolveRange(form.date, form.start, form.end);
    } catch {
      return null;
    }
  }, [form.date, form.start, form.end]);

  const set = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setErrors([]);
    setSaved(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!preview) {
      setErrors(['날짜와 시작·종료 시각을 입력하세요.']);
      return;
    }
    const note = form.note.trim().slice(0, 200);
    const block: Block = { id: form.id ?? newId(), kind: form.kind, start: preview.start, end: preview.end, ...(note ? { note } : {}) };
    const errs = validateBlock(block, blocks);
    if (errs.length) {
      setErrors(errs);
      return;
    }
    await onSave(block);
    setSaved(`${KIND_LABEL[block.kind]}을(를) 저장했습니다.`);
    setForm({ ...empty(form.date, form.kind) });
  };

  const edit = (b: Block) => {
    setForm({ id: b.id, kind: b.kind, date: b.start.slice(0, 10), start: b.start.slice(11), end: b.end.slice(11), note: b.note ?? '' });
    setErrors([]);
    setSaved(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const lo = addDays(refDate, -7);
  const hi = addDays(refDate, 8);
  const list = [...blocks]
    .filter((b) => showAll || (b.end.slice(0, 10) >= lo && b.start.slice(0, 10) < hi))
    .sort((a, b) => b.start.localeCompare(a.start));
  const groups = new Map<string, Block[]>();
  for (const b of list) {
    const k = b.start.slice(0, 10);
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }

  return (
    <div className="stack">
      <form className="card form" onSubmit={submit} noValidate>
        <h2>{form.id ? '블록 수정' : '블록 추가'}</h2>
        <div className="seg-control" role="radiogroup" aria-label="종류">
          {KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={form.kind === k} className={form.kind === k ? 'on' : ''} onClick={() => set({ kind: k })}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="small muted">{KIND_HELP[form.kind]}</p>
        <label>
          시작 날짜
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} required />
        </label>
        <div className="row two">
          <label>
            시작
            <input type="time" value={form.start} onChange={(e) => set({ start: e.target.value })} required />
          </label>
          <label>
            종료
            <input type="time" value={form.end} onChange={(e) => set({ end: e.target.value })} required />
          </label>
        </div>
        {preview && (
          <p className="small preview-line">
            {dayLabel(preview.start.slice(0, 10))} {preview.start.slice(11)} → {preview.crossesMidnight && <strong>다음 날 </strong>}
            {dayLabel(preview.end.slice(0, 10))} {preview.end.slice(11)} · {formatDuration(parseLocal(preview.end) - parseLocal(preview.start))}
            {preview.crossesMidnight && ' (자정 넘김)'}
          </p>
        )}
        <label>
          메모 (선택, 기기에만 저장)
          <input type="text" value={form.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} placeholder="예: 교육" />
        </label>
        {errors.length > 0 && (
          <div className="errors" role="alert">
            <strong>저장하지 않았습니다</strong>
            <ul>
              {errors.map((er) => (
                <li key={er}>{er}</li>
              ))}
            </ul>
          </div>
        )}
        {saved && (
          <p className="ok-text small" role="status">
            {saved}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary">
            {form.id ? '수정 저장' : '저장'}
          </button>
          {form.id && (
            <button type="button" onClick={() => set(empty(form.date, form.kind))}>
              취소
            </button>
          )}
        </div>
      </form>

      <section className="card">
        <div className="row spread">
          <h2>입력한 블록</h2>
          <label className="small inline">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 전체 기간
          </label>
        </div>
        {!showAll && <p className="small muted">기준일 앞뒤 1주</p>}
        {groups.size === 0 && <p className="muted">블록이 없습니다.</p>}
        {[...groups.entries()].map(([date, bs]) => (
          <div key={date} className="group">
            <h3>{dayLabel(date)}</h3>
            <ul className="block-list">
              {bs.map((b) => (
                <li key={b.id} className={`kind-${b.kind}`}>
                  <span className="sw-inline" aria-hidden />
                  <div className="bl-main">
                    <strong>{KIND_LABEL[b.kind]}</strong> {b.start.slice(11)}–{b.end.slice(0, 10) !== b.start.slice(0, 10) ? '다음 날 ' : ''}
                    {b.end.slice(11)}
                    {b.note && <span className="muted"> · {b.note}</span>}
                  </div>
                  <button type="button" className="small-btn" onClick={() => edit(b)}>
                    수정
                  </button>
                  <button
                    type="button"
                    className="small-btn danger"
                    onClick={() => window.confirm('이 블록을 삭제할까요?') && onDelete(b.id)}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
