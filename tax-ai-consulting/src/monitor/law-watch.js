/**
 * 세법 개정 감시 (장치 4)
 *
 * 계산 엔진은 여러 세법 가정(공정시장가액비율 60%, 종부세 공제금액, 다주택 중과
 * 부활일, 증여재산공제 한도 등)을 상수로 박아두고 있다. 세법이 개정되면 이 가정이
 * 낡아 결과가 틀려진다. 이 모듈은 각 가정을 웹검색으로 대조해, 바뀐 항목과 고쳐야 할
 * 위치(상수)를 경고한다. 세무사가 "이 계산이 지금 법에 맞나?"를 매번 손으로 확인하지
 * 않아도 되게 하는 유지보수 장치다.
 *
 * 상수 대조 외에 「동향 감시」 4종을 함께 돌린다.
 *   - 대법원 판결·조세심판원 결정
 *   - 국세청 예규·서면질의·사전답변 및 국세상담센터 질의응답
 *   - 기획재정부 유권해석(세법해석 회신)
 *   - 정부 세법개정안·국회 의결·규제지역 지정
 * 동향 감시는 kind:'trend' 로 구분되며, AI가 최근 감시 기간(기본 31일) 안에 나온
 * 개별 예규·판결·회신을 items 배열로 돌려준다. 리포트는 이를 세법 동향 일지
 * (src/web/static/law-updates-data.js)에 바로 붙여 넣을 수 있는 등록 후보 블록으로 출력한다.
 */

import {
  DEFAULT_MODEL, createClient, createMessageWithResume, extractText,
} from '../ai/client.js';
import { ENGINE_LAW_BASE_DATE } from '../verify/index.js';
import {
  AGGR_FAIR_MARKET_RATE, AGGR_DEDUCT_SINGLE, AGGR_DEDUCT_OTHERS,
  SINGLE_HH_NONTAX_THRESHOLD, HEAVY_RESUME_DATE, GIVE_DEDUCT, INDEPENDENT_HH_AGE,
} from '../core/constants.js';

/** 세법 동향 일지 파일 경로 (동향 감시의 "고칠 위치") */
export const LAW_UPDATES_FILE = 'src/web/static/law-updates-data.js (세법 동향 일지)';

/** 엔진 판정 로직과 직결되는 주제 — 동향 감시 4종이 공통으로 추적한다 */
export const WATCH_TOPICS = [
  '1세대1주택 비과세(거주요건·상생임대·일시적 2주택·혼인·상속·재건축 대체주택)',
  '조정대상지역 다주택 양도세 중과·중과배제 주택',
  '종부세 1세대1주택 특례·합산배제·주택 수 산정',
  '취득세 중과(주택 수 산정·일시적 2주택·증여취득)',
  '증여세·부담부증여·이월과세·부당행위계산부인',
  '주택임대사업자 거주주택 비과세 특례',
];

const TOPICS_TEXT = WATCH_TOPICS.join(' / ');

/**
 * 엔진이 의존하는 핵심 세법 가정 매니페스트.
 * 상수가 바뀌면 여기 value도 함께 갱신하면 감시 대상도 자동으로 최신화된다.
 *
 * kind 가 없으면 상수 대조(constant), 'trend' 면 동향 감시다.
 * 동향 감시는 category(세법 동향 일지의 구분값)와 orgs(발행 기관 목록)를 가진다.
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

  // ── 동향 감시 4종 — 발견 내용은 세법 동향 일지(law-updates-data.js)에 기록한다 ──
  {
    id: 'court_rulings_watch',
    kind: 'trend',
    category: '판결·심판',
    orgs: ['대법원', '조세심판원'],
    label: `엔진 판정 로직 관련 신규 대법원 판결·조세심판원 결정 (${TOPICS_TEXT})`,
    value: '감시 기간 내 신규 판결·결정 유무 확인',
    where: LAW_UPDATES_FILE,
    law: '대법원 판례·조세심판원 결정례',
  },
  {
    id: 'nts_rulings_watch',
    kind: 'trend',
    category: '예규·해석',
    orgs: ['국세청'],
    label: `국세청 예규·서면질의(서면-·사전답변) 및 국세상담센터 질의응답 신규 회신 (${TOPICS_TEXT})`,
    value: '감시 기간 내 국세법령정보시스템(taxlaw.nts.go.kr)·국세상담센터(call.nts.go.kr) 신규 예규·질의응답 확인',
    where: LAW_UPDATES_FILE,
    law: '국세청 예규·서면질의 회신·상담사례',
  },
  {
    id: 'moef_rulings_watch',
    kind: 'trend',
    category: '예규·해석',
    orgs: ['기획재정부'],
    label: `기획재정부 유권해석(세법해석 회신 — 재산세제과·조세법령운용과 등) 신규 회신 (${TOPICS_TEXT})`,
    value: '감시 기간 내 기획재정부 세법해석(moef.go.kr 법령 > 세법해석) 신규 회신 확인',
    where: LAW_UPDATES_FILE,
    law: '기획재정부 유권해석(국세법령정보시스템 수록)',
  },
  {
    id: 'gov_reform_watch',
    kind: 'trend',
    category: '정부발표',
    orgs: ['기획재정부', '국회', '국토교통부'],
    label: '정부 세법개정안·국회 의결·규제지역 지정 동향 (부동산 세제)',
    value: '2026 세제개편안(2026.8.3 발표) 국회 심의 중 — 의결·수정·조정대상지역 변경 여부 확인',
    where: LAW_UPDATES_FILE,
    law: '연간 세법개정 절차(7~8월 정부안, 12월 국회 의결)',
  },
];

/** 동향 감시 항목만 */
export const TREND_WATCHES = ENGINE_ASSUMPTIONS.filter((a) => a.kind === 'trend');

const WATCH_SYSTEM = `당신은 한국 부동산 세법 개정 동향을 추적하는 세무 리서처입니다.
계산 엔진이 사용 중인 세법 가정 목록이 주어집니다. 각 항목이 기준일 현재에도 유효한지
웹검색으로 확인하고, 변경/폐지/예정된 개정이 있으면 지적하십시오.

항목은 두 종류입니다.
- kind 가 없는 항목(상수 대조): 엔진 값이 지금도 맞는지 확인합니다.
- kind 가 "trend" 인 항목(동향 감시): 감시 기간 안에 새로 나온 판결·심판 결정·예규·
  질의응답 회신·정부 발표를 찾아 items 배열로 하나씩 돌려줍니다. 국세청 예규는
  국세법령정보시스템(taxlaw.nts.go.kr)의 서면·사전답변 문서번호(예: 서면-2026-부동산-1234,
  사전-2026-법규재산-0567)를, 기획재정부 해석은 회신 문서번호(예: 재산세제과-123)를
  title 이나 docNo 에 적으십시오.

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
      "source": "확인 출처(기관/보도/법령, 모르면 빈 문자열)",
      "items": [
        {
          "date": "YYYY-MM-DD (선고·결정·회신·발표일)",
          "org": "발행 기관(대법원/조세심판원/국세청/기획재정부/국회 등)",
          "docNo": "문서번호·사건번호(모르면 빈 문자열)",
          "title": "한 줄 제목",
          "summary": "2~3문장 요약 — 쟁점과 결론, 구체적 숫자·요건 포함",
          "affects": ["양도세" 등 영향 계산기 태그],
          "url": "원문 또는 보도 링크(모르면 빈 문자열)"
        }
      ]
    }
  ]
}
\`\`\`

원칙:
- status는 실제 웹검색으로 확인된 사실에 근거하십시오. 확인 못 하면 "uncertain".
- "changed"는 이미 시행된 개정, "scheduled"는 시행일이 정해진 예정 개정입니다.
- 동향 감시(trend) 항목은 감시 기간 내 신규 문서가 1건 이상 있으면 "changed",
  없으면 "current", 검색으로 확인이 안 되면 "uncertain" 으로 두십시오.
- items 는 동향 감시 항목에만 넣고, 상수 대조 항목은 빈 배열([])로 두십시오.
- items 에는 세율·공제·기한·판정 로직에 영향을 주는 것만 담고 단순 뉴스는 제외하십시오.
- affects 태그는 '양도세' '종부세' '취득세' '재산세' '증여세' '보유세' '임대' '시나리오' '판정기' 중에서 고르십시오.
- 추측·논의 단계는 note에만 적고 status는 uncertain으로 두십시오.
- 제공된 모든 항목(id)에 대해 하나씩 findings를 반환하십시오.`;

/** asOfDate 에서 days 일 전 날짜 (YYYY-MM-DD) */
export function daysBefore(asOfDate, days) {
  const d = new Date(`${asOfDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildWatchPrompt(assumptions, asOfDate, { sinceDate } = {}) {
  const since = sinceDate ?? daysBefore(asOfDate, 31);
  return [
    `확인 기준일(오늘): ${asOfDate}`,
    `동향 감시 기간: ${since} ~ ${asOfDate} (이 기간에 나온 판결·예규·질의응답·발표만 items 에 담을 것)`,
    `계산 엔진의 세법 기준일: ${ENGINE_LAW_BASE_DATE} 시행분`,
    '',
    '아래는 계산 엔진이 현재 사용 중인 세법 가정입니다. 각 항목이 기준일 현재에도',
    '유효한지 확인하고, 바뀌었거나 바뀔 예정인 것을 알려주세요.',
    'kind 가 "trend" 인 항목은 감시 기간 내 신규 문서를 items 로 나열해 주세요.',
    '',
    '```json',
    JSON.stringify(assumptions.map(({ id, kind, label, value, law, orgs }) => ({ id, kind, label, value, law, orgs })), null, 2),
    '```',
  ].join('\n');
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    date: String(item.date ?? ''),
    org: String(item.org ?? ''),
    docNo: String(item.docNo ?? ''),
    title: String(item.title ?? ''),
    summary: String(item.summary ?? ''),
    affects: Array.isArray(item.affects) ? item.affects.map(String) : [],
    url: String(item.url ?? ''),
  };
}

export function parseFindings(text) {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length > 0) {
    try {
      const parsed = JSON.parse(matches[matches.length - 1][1]);
      const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
      return {
        summary: parsed.summary ?? '',
        findings: findings.map((f) => ({
          ...f,
          items: Array.isArray(f.items) ? f.items.map(normalizeItem).filter(Boolean) : [],
        })),
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
 * @param {number} [options.lookbackDays] 동향 감시 기간(일). 기본 31 — 매월 1일 실행 기준 한 달치.
 * @param {Array}  [options.assumptions]  점검 대상 (기본: ENGINE_ASSUMPTIONS)
 * @param {number} [options.webSearchMaxUses] 웹검색 허용 횟수 (기본 14 — 상수 8종 + 동향 4종을 근거 있게 확인하려면 넉넉해야 함)
 * @param {object} [options.client] { model, maxTokens }
 * @returns {Promise<{asOfDate, sinceDate, summary, findings, reportText, usage}>}
 */
export async function checkLawChanges(options = {}) {
  const {
    client = createClient(),
    model = DEFAULT_MODEL,
    maxTokens = 16000,
    assumptions = ENGINE_ASSUMPTIONS,
    asOfDate = new Date().toISOString().slice(0, 10),
    lookbackDays = 31,
    webSearchMaxUses = 14,
  } = options;
  const sinceDate = daysBefore(asOfDate, lookbackDays);

  const request = {
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: WATCH_SYSTEM,
    messages: [{ role: 'user', content: buildWatchPrompt(assumptions, asOfDate, { sinceDate }) }],
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: webSearchMaxUses }],
  };

  const response = await createMessageWithResume(client, request);
  const reportText = extractText(response);
  const parsed = parseFindings(reportText);

  // 엔진 매니페스트의 where(고쳐야 할 상수 위치)·kind·category 를 findings에 병합
  const byId = new Map(assumptions.map((a) => [a.id, a]));
  const findings = parsed.findings.map((f) => {
    const a = byId.get(f.id);
    return {
      ...f,
      label: a?.label ?? f.id,
      engineValue: a?.value ?? '',
      where: a?.where ?? '',
      kind: a?.kind ?? 'constant',
      category: a?.category ?? '',
      items: a?.kind === 'trend' ? f.items : [],
    };
  });

  return { asOfDate, sinceDate, summary: parsed.summary, findings, reportText, usage: response.usage };
}

/** 조치가 필요한(이미 개정됐거나 시행 예정인) 항목 수 */
export function countActionable(watch) {
  if (!watch || !Array.isArray(watch.findings)) return 0;
  return watch.findings.filter((f) => f.status === 'changed' || f.status === 'scheduled').length;
}

/** 동향 감시에서 발견된 개별 문서(예규·판결·회신) 수 */
export function countUpdateCandidates(watch) {
  if (!watch || !Array.isArray(watch.findings)) return 0;
  return watch.findings.reduce((n, f) => n + (Array.isArray(f.items) ? f.items.length : 0), 0);
}

const STATUS_LABEL = {
  current: '✅ 유효',
  changed: '⚠️ 개정됨',
  scheduled: '🗓️ 개정예정',
  uncertain: '❔ 미확인',
};
const STATUS_ORDER = { changed: 0, scheduled: 1, uncertain: 2, current: 3 };

const jsStr = (s) => `'${String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * 동향 감시 items 를 세법 동향 일지(law-updates-data.js)에 붙여 넣을 수 있는
 * JS 객체 블록으로 만든다. engineStatus 는 사람이 검토해 채우도록 '검토중'으로 둔다.
 */
export function toLawUpdateEntry(item, finding) {
  const org = item.org || (finding.category === '예규·해석' ? '국세청' : '');
  const title = item.docNo ? `${item.title} (${org ? `${org} ` : ''}${item.docNo})` : item.title;
  const sources = item.url ? [{ label: `${org || '원문'} — ${item.docNo || item.title}`, url: item.url }] : [];
  return [
    '  {',
    `    date: ${jsStr(item.date)},`,
    `    category: ${jsStr(finding.category || '예규·해석')},`,
    `    title: ${jsStr(title)},`,
    `    summary: ${jsStr(item.summary)},`,
    `    affects: [${item.affects.map(jsStr).join(', ')}],`,
    "    engineStatus: '검토중',",
    `    engineNote: ${jsStr(`law-watch ${finding.asOfDate ?? ''} 감시에서 발견 — 엔진 영향 검토 필요`)},`,
    `    sources: [${sources.map((s) => `{ label: ${jsStr(s.label)}, url: ${jsStr(s.url)} }`).join(', ')}],`,
    '  },',
  ].join('\n');
}

/**
 * 동향 감시 결과(예규·판결·회신 목록)를 마크다운으로 렌더링.
 * 각 항목 아래에 세법 동향 일지 등록용 코드 블록을 함께 내놓는다.
 */
export function renderUpdateCandidates(watch, { heading = '## 세법 동향 일지 등록 후보 (예규·판결·질의응답)' } = {}) {
  const trend = (watch?.findings ?? []).filter((f) => f.kind === 'trend');
  if (trend.length === 0) return '';
  const out = [heading, '', `_감시 기간 ${watch.sinceDate ?? '—'} ~ ${watch.asOfDate}_`, ''];
  const total = countUpdateCandidates({ findings: trend });
  if (total === 0) {
    out.push('감시 기간 내 엔진 판정 로직에 영향을 주는 신규 예규·판결·질의응답은 발견되지 않았습니다.');
    return out.join('\n');
  }
  out.push(`> 📌 **등록 후보 ${total}건** — 검토 후 \`${LAW_UPDATES_FILE}\` 의 LAW_UPDATES 배열 맨 앞에 추가하세요.`, '');
  for (const f of trend) {
    const items = f.items ?? [];
    out.push(`### ${f.label.split(' (')[0]} — ${items.length}건`, '');
    if (items.length === 0) {
      out.push('신규 문서 없음.', '');
      continue;
    }
    for (const it of items) {
      const head = [it.date || '날짜 미상', it.org, it.docNo].filter(Boolean).join(' · ');
      out.push(`- **${it.title}** (${head})`);
      if (it.summary) out.push(`  - ${it.summary}`);
      if (it.affects.length) out.push(`  - 영향: ${it.affects.join(', ')}`);
      if (it.url) out.push(`  - 출처: ${it.url}`);
      out.push('', '```js', toLawUpdateEntry(it, { ...f, asOfDate: watch.asOfDate }), '```', '');
    }
  }
  return out.join('\n');
}

/** 개정 감시 결과를 마크다운으로 렌더링 (조치 필요 항목 우선 + 동향 일지 등록 후보) */
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
    out.push(`> ⚠️ **조치 필요 ${actionable.length}건** — 아래 항목의 상수(또는 세법 동향 일지)를 검토·갱신하세요.`, '');
  }
  out.push('| 상태 | 가정 | 엔진 값 | 확인 결과 | 시행일 | 고칠 위치 |', '|:--:|---|---|---|---|---|');
  for (const f of sorted) {
    const status = STATUS_LABEL[f.status] ?? f.status;
    const note = (f.note ?? '').replace(/\|/g, '\\|');
    const label = f.kind === 'trend' ? f.label.split(' (')[0] : f.label;
    out.push(`| ${status} | ${label} | ${f.engineValue} | ${note} | ${f.effectiveDate || '—'} | ${f.status === 'current' ? '—' : `\`${f.where}\``} |`);
  }
  const candidates = renderUpdateCandidates(watch, { heading: `${heading.replace(/^(#+).*/, '$1')} 세법 동향 일지 등록 후보 (예규·판결·질의응답)` });
  if (candidates) out.push('', candidates);
  return out.join('\n');
}
