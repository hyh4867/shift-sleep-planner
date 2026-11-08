export type BlockKind = 'shift' | 'busy' | 'sleep';

/** 근무(shift), 잘 수 없는 시간(busy), 실제 잔 시간 기록(sleep) */
export interface Block {
  id: string;
  kind: BlockKind;
  /** "YYYY-MM-DDTHH:mm" 현지 벽시계 */
  start: string;
  end: string;
  note?: string;
}

export const KIND_LABEL: Record<BlockKind, string> = {
  shift: '근무',
  busy: '잘 수 없는 시간',
  sleep: '실제 수면',
};
