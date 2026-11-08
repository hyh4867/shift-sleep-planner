import { describe, expect, it } from 'vitest';
import { demoBlocks, type DemoId } from '../src/domain/demo';
import { validateBlockSet } from '../src/domain/overlap';
import { makeBackup, parseBackup } from '../src/domain/backup';
import { DEFAULT_SETTINGS } from '../src/domain/settings';
import { planSleep } from '../src/domain/planner';

const IDS: DemoId[] = ['day', 'night', 'mixed'];

describe('가상 일정', () => {
  for (const id of IDS) {
    it(`${id}: 블록끼리 겹치지 않고 추천이 블록과 겹치지 않는다`, () => {
      const blocks = demoBlocks(id, '2026-11-09');
      expect(validateBlockSet(blocks)).toEqual([]);
      const plan = planSleep(blocks, DEFAULT_SETTINGS, '2026-11-03', '2026-11-10');
      const iv = blocks.map((b) => [Date.parse(b.start + 'Z') / 60000, Date.parse(b.end + 'Z') / 60000]);
      for (const p of plan.sleeps) for (const [s, e] of iv) expect(p.end <= s || p.start >= e).toBe(true);
    });
  }
});

describe('JSON 백업', () => {
  it('내보낸 뒤 다시 가져오면 같다', () => {
    const blocks = demoBlocks('mixed', '2026-11-09');
    const file = makeBackup(blocks, { ...DEFAULT_SETTINGS, sleepTargetMin: 450 }, new Date('2026-11-09T00:00:00Z'));
    const back = parseBackup(JSON.stringify(file));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.value.blocks).toEqual(file.blocks);
      expect(back.value.settings.sleepTargetMin).toBe(450);
    }
  });

  it('겹치는 블록이나 다른 앱 파일은 거부', () => {
    const blocks = demoBlocks('day', '2026-11-09');
    const bad = makeBackup([...blocks, { ...blocks[0], id: 'dup-overlap' }], DEFAULT_SETTINGS);
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    expect(parseBackup('{"app":"other"}').ok).toBe(false);
    expect(parseBackup('not json').ok).toBe(false);
  });
});
