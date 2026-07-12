/**
 * 세법 개정 감시 (장치 4)
 *
 * 계산 엔진은 여러 세법 가정(공정시장가액비율 60%, 종부세 공제금액, 다주택 중과
 * 부활일, 증여재산공제 한도 등)을 상수로 박아두고 있다. 세법이 개정되면 이 가정이
 * 낡아 결과가 틀려진다. 이 모듈은 각 가정을 웹검색으로 대조해, 바뀐 항목과 고쳐야 할
 * 위치(상수)를 경고한다. 세무사가 "이 계산이 지금 법에 맞나?"를 매번 손으로 확인하지
 * 않아도 되게 하는 유지보수 장치다.
 */

import {
  DEFAULT_MODEL, createClient, createMessageWithResume, extractText,
} from '../ai/client.js';
import { ENGINE_LAW_BASE_DATE } from '../verify/index.js';
import {
  AGGR_FAIR_MARKET_RATE, AGGR_DEDUCT_SINGLE, AGGR_DEDUCT_OTHERS,
  SINGLE_HH_NONTAX_THRESHOLD, HEAVY_RESUME_DATE, GIVE_DEDUCT, INDEPENDENT_HH_AGE,
} from '../core/constants.js';

/**
 * 엔진이 의존하는 핵심 세법 가정 매니페스트.
 * 상수가 바뀌면 여기 value도 함께 갱신하면 감시 대상도 자동으로 최신화된다.
 */
export const ENGINE_ASSUMPTIONS = [
  { id: 'aggr_fair_market_rate', label: '종부세 공정시장가액비율', value: `${AGGR_FAIR_MARKET_RATE * 100}%`, where: 'constants.AGGR_FAIR_MARKET_RATE', law: '종합부동산세법 시행령 §2의4' },
  { id: 'aggr_deduct_single', label: '종부세 1세대1주택 공제금액', value: `${(AGGR_DEDUCT_SINGLE / 1e8).toFixed(0)}억원`, where: 'constants.AGGR_DEDUCT_SINGLE', law: '종합부동산세법 §8' },
  { id: 'aggr_deduct_others', label: '종부세 다주택·기타 공제금액', value: `${(AGGR_DEDUCT_OTHERS / 1e8).toFixed(0)}억원`, where: 'constants.AGGR_DEDUCT_OTHERS', law: '종합부동산세법 §8' },
  { id: 'single_hh_nontax', label: '1세대1주택 양도세 비과세 고가주택 기준', value: `${(SINGLE_HH_NONTAX_THRESHOLD / 1e8).toFixed(0)}억원`, where: 'constants.SINGLE_HH_NONTAX_THRESHOLD', law: '소득세법 §89①3, 시행령 §156' },
  { id: 'heavy_resume', label: '조정대상지역 다주택 양도세 중과 부활일', value: HEAVY_RESUME_DATE, where: 'constants.HEAVY_RESUME_DATE', law: '소득세법 §104⑦' },
  { id: 'give_deduct_spouse', label: '배우자 증여재산공제 한도', value: `${(GIVE_DEDUCT.SPOUSE / 1e8).toFixed(1)}억원`, where: 'constants.GIVE_DEDUCT.SPOUSE', law: '상증세법 §53' },
  { id: 'give_deduct_child_adult', label: '성년 자녀 증여재산공제 한도', value: `${(GIVE_DEDUCT.CHILD_ADULT / 1e4).toLocaleString('ko-KR')}만원`, where: 'constants.GIVE_DEDUCT.CHILD_ADULT', law: '상증세법 §53' },
  { id: 'independent_hh_age', label: '별도세대 인정 연령(시나리오 전제)', value: `${INDEPENDENT_HH_AGE}세`, where: 'constants.INDEPENDENT_HH_AGE', law: '소득세법 시행령 §152의3 등' },
];

const WATCH_SYSTEM = `당신은 한국 부동산 세법 개정 동향을 추적하는 세무 리서처입니다.
계산 엔진이 사용 중인 세법 가정 목록이 주어집니다. 각 항목이 기준일 현재에도 유효한지
웹검색으로 확인하고, 변경/폐지/예정된 개정이 있으면 지적하십시오.

응답 형식:
- 먼저 마크다운으로 확인 내용을 간단히 서술하십시오(검색 근거 포함).
- 반드시 응답 맨 마지막에 아래 형식의 json 코드블록 하나로 요약하십시오.

\`\`\`json
{
  "summary": "한 문장 총평",
  "findings": [
    {
      "id": "가정 id",
      "status": "current | changed | scheduled | uncertain",
      "note": "확인 결과(무엇이 그대로인지/무엇이 어떻게 바뀌는지)",
      "effectiveDate": "개정 시행일(있으면, 없으면 빈 문자열)",
      "source": "확인 출처(기관/보도/법령, 모르면 빈 문자열)"
    }
  ]
}
\`\`\`

원칙:
- status는 실제 웹검색으로 확인된 사실에 근거하십시오. 확인 못 하면 "uncertain".
- "changed"는 이미 시행된 개정, "scheduled"는 시행일이 정해진 예정 개정입니다.
- 추측·논의 단계는 note에만 적고 status는 uncertain으로 두십시오.
- 제공된 모든 항목(id)에 대해 하나씩 findings를 반환하십시오.`;

export function buildWatchPrompt(assumptions, asOfDate) {
  return [
    `확인 기준일(오늘): ${asOfDate}`,
    `계산 엔진의 세법 기준일: ${ENGINE_LAW_BASE_DATE} 시행분`,
    '',
    '아래는 계산 엔진이 현재 사용 중인 세법 가정입니다. 각 항목이 기준일 현재에도',
    '유효한지 확인하고, 바뀌었거나 바뀔 예정인 것을 알려주세요.',
    '',
    '```json',
    JSON.stringify(assumptions.map(({ id, label, value, law }) => ({ id, label, value, law })), null, 2),
    '```',
  ].join('\n');
}

export function parseFindings(text) {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length > 0) {
    try {
      const parsed = JSON.parse(matches[matches.length - 1][1]);
      return {
        summary: parsed.summary ?? '',
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      };
    } catch {
      // fall through
    }
  }
  return { summary: '개정 감시 요약 블록을 파싱하지 못했습니다.', findings: [] };
}

/**
 * 엔진 세법 가정을 웹검색으로 대조해 개정 여부를 점검한다.
 *
 * @param {object} [options]
 * @param {string} [options.asOfDate]     확인 기준일 (기본: 오늘). Date.now 미사용 위해 주입 권장.
 * @param {Array}  [options.assumptions]  점검 대상 (기본: ENGINE_ASSUMPTIONS)
 * @param {object} [options.client] { model, maxTokens }
 * @returns {Promise<{asOfDate, summary, findings, reportText, usage}>}
 */
export async function checkLawChanges(options = {}) {
  const {
    client = createClient(),
    model = DEFAULT_MODEL,
    maxTokens = 16000,
    assumptions = ENGINE_ASSUMPTIONS,
    asOfDate = new Date().toISOString().slice(0, 10),
  } = options;

  const request = {
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: WATCH_SYSTEM,
    messages: [{ role: 'user', content: buildWatchPrompt(assumptions, asOfDate) }],
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
  };

  const response = await createMessageWithResume(client, request);
  const reportText = extractText(response);
  const parsed = parseFindings(reportText);

  // 엔진 매니페스트의 where(고쳐야 할 상수 위치)를 findings에 병합
  const byId = new Map(assumptions.map((a) => [a.id, a]));
  const findings = parsed.findings.map((f) => ({
    ...f,
    label: byId.get(f.id)?.label ?? f.id,
    engineValue: byId.get(f.id)?.value ?? '',
    where: byId.get(f.id)?.where ?? '',
  }));

  return { asOfDate, summary: parsed.summary, findings, reportText, usage: response.usage };
}

const STATUS_LABEL = {
  current: '✅ 유효',
  changed: '⚠️ 개정됨',
  scheduled: '🗓️ 개정예정',
  uncertain: '❔ 미확인',
};
const STATUS_ORDER = { changed: 0, scheduled: 1, uncertain: 2, current: 3 };

/** 개정 감시 결과를 마크다운으로 렌더링 (조치 필요 항목 우선) */
export function renderLawWatch(watch, { heading = '## 세법 개정 감시' } = {}) {
  if (!watch || !Array.isArray(watch.findings) || watch.findings.length === 0) {
    return `${heading}\n\n확인된 항목이 없습니다.`;
  }
  const sorted = [...watch.findings].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9),
  );
  const out = [heading, '', `_기준일 ${watch.asOfDate} — ${watch.summary}_`, ''];
  const actionable = sorted.filter((f) => f.status === 'changed' || f.status === 'scheduled');
  if (actionable.length > 0) {
    out.push(`> ⚠️ **조치 필요 ${actionable.length}건** — 아래 항목의 상수를 검토·갱신하세요.`, '');
  }
  out.push('| 상태 | 가정 | 엔진 값 | 확인 결과 | 시행일 | 고칠 위치 |', '|:--:|---|---|---|---|---|');
  for (const f of sorted) {
    const status = STATUS_LABEL[f.status] ?? f.status;
    const note = (f.note ?? '').replace(/\|/g, '\\|');
    out.push(`| ${status} | ${f.label} | ${f.engineValue} | ${note} | ${f.effectiveDate || '—'} | ${f.status === 'current' ? '—' : `\`${f.where}\``} |`);
  }
  return out.join('\n');
}
