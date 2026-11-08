/** 기기 안 IndexedDB 저장소. 서버로 보내지 않는다. */
import { openDB, type IDBPDatabase } from 'idb';
import type { Block } from '../domain/types';
import { DEFAULT_SETTINGS, validateSettings, type Settings } from '../domain/settings';

const DB_NAME = 'shift-sleep-planner';
const DB_VERSION = 1;

interface Meta {
  settings: Settings;
  aiConsent: { enabled: boolean; consentedAt: string | null };
  deviceId: string;
}

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      d.createObjectStore('blocks', { keyPath: 'id' });
      d.createObjectStore('meta');
    },
  });
  return dbp;
}

export async function loadBlocks(): Promise<Block[]> {
  return (await (await db()).getAll('blocks')) as Block[];
}

export async function putBlock(b: Block): Promise<void> {
  await (await db()).put('blocks', b);
}

export async function deleteBlock(id: string): Promise<void> {
  await (await db()).delete('blocks', id);
}

export async function replaceAll(blocks: Block[], settings: Settings): Promise<void> {
  const d = await db();
  const tx = d.transaction(['blocks', 'meta'], 'readwrite');
  await tx.objectStore('blocks').clear();
  for (const b of blocks) await tx.objectStore('blocks').put(b);
  await tx.objectStore('meta').put(settings, 'settings');
  await tx.done;
}

async function getMeta<K extends keyof Meta>(key: K): Promise<Meta[K] | undefined> {
  return (await (await db()).get('meta', key)) as Meta[K] | undefined;
}
async function setMeta<K extends keyof Meta>(key: K, value: Meta[K]): Promise<void> {
  await (await db()).put('meta', value, key);
}

export async function loadSettings(): Promise<Settings> {
  const v = validateSettings((await getMeta('settings')) ?? DEFAULT_SETTINGS);
  return v.ok ? v.value : DEFAULT_SETTINGS;
}
export const saveSettings = (s: Settings) => setMeta('settings', s);

export async function loadAiConsent(): Promise<Meta['aiConsent']> {
  return (await getMeta('aiConsent')) ?? { enabled: false, consentedAt: null };
}
export const saveAiConsent = (c: Meta['aiConsent']) => setMeta('aiConsent', c);

export async function getDeviceId(): Promise<string> {
  const cur = await getMeta('deviceId');
  if (cur) return cur;
  const id = crypto.randomUUID();
  await setMeta('deviceId', id);
  return id;
}
