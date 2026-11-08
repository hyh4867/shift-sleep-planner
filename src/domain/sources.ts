/** 추천 규칙의 출처. 화면의 규칙 카드와 각 추천 항목에 그대로 표시한다. */
export interface Source {
  id: SourceId;
  short: string;
  citation: string;
  url?: string;
}

export type SourceId = 'aasm-srs-2015' | 'niosh-m7' | 'niosh-m6' | 'drake-2013' | 'app';

export const SOURCES: Record<SourceId, Source> = {
  'aasm-srs-2015': {
    id: 'aasm-srs-2015',
    short: 'AASM·SRS 2015 합의문',
    citation:
      'Watson NF, et al. Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the American Academy of Sleep Medicine and Sleep Research Society. Sleep. 2015;38(6):843–844 / J Clin Sleep Med. 2015;11(6):591–592.',
    url: 'https://doi.org/10.5664/jcsm.4758',
  },
  'niosh-m7': {
    id: 'niosh-m7',
    short: 'NIOSH Module 7 (Before Nights, Nap Duration)',
    citation:
      'NIOSH. Training for Nurses on Shift Work and Long Work Hours. DHHS (NIOSH) Publication No. 2015-115. Module 7 — “Before Nights”, “Nap Duration”.',
    url: 'https://www.cdc.gov/niosh/docs/2015-115/',
  },
  'niosh-m6': {
    id: 'niosh-m6',
    short: 'NIOSH Module 6',
    citation:
      'NIOSH. Training for Nurses on Shift Work and Long Work Hours. DHHS (NIOSH) Publication No. 2015-115. Module 6.',
    url: 'https://www.cdc.gov/niosh/docs/2015-115/',
  },
  'drake-2013': {
    id: 'drake-2013',
    short: 'Drake et al. 2013',
    citation:
      'Drake C, Roehrs T, Shambroom J, Roth T. Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. J Clin Sleep Med. 2013;9(11):1195–1200.',
    url: 'https://doi.org/10.5664/jcsm.3170',
  },
  app: {
    id: 'app',
    short: '앱 운영 정의',
    citation:
      '외부 출처가 아니라 이 앱이 계산을 위해 정한 규칙입니다. 설정에서 바꿀 수 있습니다.',
  },
};

export type RuleId = 'target' | 'nap' | 'main' | 'caffeine' | 'light' | 'attribution' | 'deficit';

export interface RuleInfo {
  id: RuleId;
  title: string;
  sources: SourceId[];
  /** 앱이 정한 운영 정의 부분에 대한 설명 */
  operational?: string;
}

export const RULES: Record<RuleId, RuleInfo> = {
  target: {
    id: 'target',
    title: '수면 목표: 하루 7시간 이상',
    sources: ['aasm-srs-2015', 'app'],
    operational:
      '합의문은 성인에게 “규칙적으로 하룻밤 7시간 이상”을 권고합니다. 교대 근무에 맞춰 “24시간(하루) 합계에 본 수면·낮잠을 모두 더한 값”으로 적용하는 것은 이 앱의 운영 정의입니다.',
  },
  attribution: {
    id: 'attribution',
    title: '수면을 어느 날에 셀지',
    sources: ['app'],
    operational:
      '수면 한 번은 끝난 시각(기상 시각)이 속한 날짜(00:00–24:00)에 전부 더합니다. 자정을 넘는 수면을 둘로 쪼개지 않기 위한 운영 정의입니다.',
  },
  nap: {
    id: 'nap',
    title: '야간 근무 전 낮잠',
    sources: ['niosh-m7', 'app'],
    operational:
      '야간 근무는 00:00–06:00과 조금이라도 겹치는 근무로 정의합니다(앱 운영 정의). 근무 직전 빈 시간이 2시간 이상이면 90분, 45분 이상이면 20분 낮잠을 근무 시작 30분 전에 끝나도록 둡니다. 30분 여유까지 넣을 수 없으면 낮잠을 생략합니다.',
  },
  main: {
    id: 'main',
    title: '본 수면 배치',
    sources: ['app'],
    operational:
      '빈 시간 중 가장 긴 구간에, 가능하면 평소 취침 시각에 맞춰 둡니다. 야간 근무 뒤에는 근무 종료 직후의 빈 구간을 먼저 씁니다. 근무가 끝난 뒤 취침 전 여유(기본 30분)와 근무 직전 기상 후 여유(기본 30분)를 남깁니다. 한 구간으로 목표를 못 채우면 다른 빈 구간에 보충 수면을 둡니다.',
  },
  caffeine: {
    id: 'caffeine',
    title: '카페인 마감: 수면 6시간 전',
    sources: ['drake-2013', 'niosh-m6'],
    operational:
      '본 수면 시작 6시간 전을 마감으로 계산합니다(본 수면 시작은 근무 종료 후 취침 전 여유를 반영한 시각). 카페인은 근무 초반에 드세요. 마감 시각이 근무 시간 안에 걸리면 따로 표시합니다.',
  },
  light: {
    id: 'light',
    title: '자기 전 조명 낮추기',
    sources: ['niosh-m6'],
    operational: '본 수면 1–2시간 전부터 조명을 낮추라는 안내를 띄웁니다.',
  },
  deficit: {
    id: 'deficit',
    title: '누적 수면 부족',
    sources: ['app'],
    operational:
      '실제로 수면을 기록한 날마다 목표보다 모자란 만큼을 더합니다. 목표를 넘긴 날의 초과분으로 상쇄하지 않습니다. 기록이 없는 날은 기준 수치에서 빼고, 추천 계획을 따랐다고 가정한 “계획 포함” 값을 참고로 따로 보여 줍니다(그래프에서 빗금·점선).',
  },
};
