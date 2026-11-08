import type { Block, BlockKind } from './types';
import { DEFAULT_SETTINGS, validateSettings, type Settings } from './settings';
import { validateBlockSet } from './overlap';
import { isLocalDateTime } from './time';

export const BACKUP_APP = 'shift-sleep-planner';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  settings: Settings;
  blocks: Block[];
}

export function makeBackup(blocks: Block[], settings: Settings, now: Date = new Date()): BackupFile {
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings,
    blocks: [...blocks].sort((a, b) => a.start.localeCompare(b.start)),
  };
}

const KINDS: BlockKind[] = ['shift', 'busy', 'sleep'];

export function parseBackup(text: string): { ok: true; value: BackupFile } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSON 파일이 아닙니다.'] };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, errors: ['형식이 잘못되었습니다.'] };
  const o = raw as Record<string, unknown>;
  if (o.app !== BACKUP_APP) return { ok: false, errors: ['이 앱의 백업 파일이 아닙니다.'] };
  if (o.schemaVersion !== BACKUP_VERSION) return { ok: false, errors: [`지원하지 않는 백업 버전: ${String(o.schemaVersion)}`] };
  if (!Array.isArray(o.blocks)) return { ok: false, errors: ['blocks 목록이 없습니다.'] };

  const errors: string[] = [];
  const blocks: Block[] = [];
  o.blocks.forEach((b, i) => {
    const x = b as Record<string, unknown>;
    if (
      typeof x !== 'object' || x === null ||
      typeof x.id !== 'string' || x.id.length === 0 || x.id.length > 64 ||
      !KINDS.includes(x.kind as BlockKind) ||
      !isLocalDateTime(x.start) || !isLocalDateTime(x.end) ||
      (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 200))
    ) {
      errors.push(`${i + 1}번째 블록 형식 오류`);
      return;
    }
    blocks.push({
      id: x.id,
      kind: x.kind as BlockKind,
      start: x.start as string,
      end: x.end as string,
      ...(typeof x.note === 'string' && x.note ? { note: x.note } : {}),
    });
  });
  if (errors.length) return { ok: false, errors };
  errors.push(...validateBlockSet(blocks));
  const settings = validateSettings(o.settings ?? DEFAULT_SETTINGS);
  if (!settings.ok) errors.push(...settings.errors);
  if (errors.length || !settings.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      app: BACKUP_APP,
      schemaVersion: BACKUP_VERSION,
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      settings: settings.value,
      blocks,
    },
  };
}
