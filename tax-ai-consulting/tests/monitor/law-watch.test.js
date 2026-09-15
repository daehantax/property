/**
 * 세법 개정 감시 테스트 — mock 클라이언트 주입, 네트워크 없음
 */

import { describe, it, expect, vi } from 'vitest';
import {
  checkLawChanges, parseFindings, renderLawWatch, buildWatchPrompt,
  countActionable, countUpdateCandidates, renderUpdateCandidates, toLawUpdateEntry,
  daysBefore, ENGINE_ASSUMPTIONS, TREND_WATCHES, LAW_UPDATES_FILE,
} from '../../src/monitor/law-watch.js';

const WATCH_TEXT = `확인 결과입니다.

\`\`\`json
{
  "summary": "대체로 유효하나 공정시장가액비율 상향 예정",
  "findings": [
    { "id": "aggr_fair_market_rate", "status": "scheduled", "note": "60%→80% 상향 예정", "effectiveDate": "2027-01-01", "source": "기재부" },
    { "id": "heavy_resume", "status": "current", "note": "2026-05-10 시행 유지", "effectiveDate": "", "source": "국세청", "items": [] },
    { "id": "nts_rulings_watch", "status": "changed", "note": "신규 예규 1건", "effectiveDate": "", "source": "국세법령정보시스템",
      "items": [
        { "date": "2026-06-20", "org": "국세청", "docNo": "서면-2026-부동산-0412", "title": "상생임대주택 특례 거주요건 면제 범위",
          "summary": "임대차계약 갱신 시 임대료 5% 이내 인상이면 상생임대 인정. 2년 거주요건 면제.", "affects": ["양도세", "판정기"],
          "url": "https://taxlaw.nts.go.kr/example" }
      ] },
    { "id": "moef_rulings_watch", "status": "current", "note": "신규 회신 없음", "effectiveDate": "", "source": "", "items": [] }
  ]
}
\`\`\``;

const mockClient = (text) => ({
  messages: {
    create: vi.fn(async () => ({
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    })),
  },
});

describe('ENGINE_ASSUMPTIONS', () => {
  it('상수에서 현재 값을 읽어 매니페스트를 구성한다', () => {
    const rate = ENGINE_ASSUMPTIONS.find((a) => a.id === 'aggr_fair_market_rate');
    expect(rate.value).toBe('60%');
    const heavy = ENGINE_ASSUMPTIONS.find((a) => a.id === 'heavy_resume');
    expect(heavy.value).toBe('2026-05-10');
    // 모든 항목에 고칠 위치(where)가 있어야 함
    expect(ENGINE_ASSUMPTIONS.every((a) => a.where)).toBe(true);
  });

  it('동향 감시 4종(판결·심판 / 국세청 예규·질의응답 / 기재부 유권해석 / 정부안)을 포함한다', () => {
    const ids = TREND_WATCHES.map((a) => a.id);
    expect(ids).toEqual(['court_rulings_watch', 'nts_rulings_watch', 'moef_rulings_watch', 'gov_reform_watch']);
    // 동향 감시는 모두 세법 동향 일지를 고칠 위치로 가리키고, 일지 구분값(category)을 가진다
    expect(TREND_WATCHES.every((a) => a.where === LAW_UPDATES_FILE && a.category)).toBe(true);
    const nts = TREND_WATCHES.find((a) => a.id === 'nts_rulings_watch');
    expect(nts.category).toBe('예규·해석');
    expect(nts.label).toContain('국세청');
    expect(nts.label).toContain('질의응답');
    const moef = TREND_WATCHES.find((a) => a.id === 'moef_rulings_watch');
    expect(moef.label).toContain('기획재정부');
    expect(moef.orgs).toEqual(['기획재정부']);
  });
});

describe('daysBefore', () => {
  it('기준일에서 n일 전 날짜를 돌려준다 (월 경계 포함)', () => {
    expect(daysBefore('2026-10-01', 31)).toBe('2026-08-31');
    expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28');
  });
});

describe('parseFindings', () => {
  it('findings 배열을 파싱한다', () => {
    const p = parseFindings(WATCH_TEXT);
    expect(p.findings).toHaveLength(4);
    expect(p.summary).toContain('공정시장가액비율');
  });

  it('items 를 정규화한다 (없으면 빈 배열, 필드 누락은 빈 문자열)', () => {
    const p = parseFindings(WATCH_TEXT);
    expect(p.findings.find((f) => f.id === 'aggr_fair_market_rate').items).toEqual([]);
    const nts = p.findings.find((f) => f.id === 'nts_rulings_watch');
    expect(nts.items).toHaveLength(1);
    expect(nts.items[0].docNo).toBe('서면-2026-부동산-0412');
    const loose = parseFindings('```json\n{"findings":[{"id":"x","items":[{"title":"t"}, null]}]}\n```');
    expect(loose.findings[0].items).toEqual([
      { date: '', org: '', docNo: '', title: 't', summary: '', affects: [], url: '' },
    ]);
  });
});

describe('buildWatchPrompt', () => {
  it('기준일·감시 기간(기본 31일)과 가정 목록을 포함한다', () => {
    const p = buildWatchPrompt(ENGINE_ASSUMPTIONS, '2026-07-12');
    expect(p).toContain('2026-07-12');
    expect(p).toContain('2026-06-11 ~ 2026-07-12');
    expect(p).toContain('aggr_fair_market_rate');
    expect(p).toContain('nts_rulings_watch');
    expect(p).toContain('"kind": "trend"');
  });

  it('sinceDate 를 주면 그대로 쓴다', () => {
    const p = buildWatchPrompt(ENGINE_ASSUMPTIONS, '2026-07-12', { sinceDate: '2026-05-01' });
    expect(p).toContain('2026-05-01 ~ 2026-07-12');
  });
});

describe('checkLawChanges', () => {
  it('findings에 엔진 값과 고칠 위치(where)를 병합한다', async () => {
    const client = mockClient(WATCH_TEXT);
    const watch = await checkLawChanges({ client, asOfDate: '2026-07-12' });
    const rate = watch.findings.find((f) => f.id === 'aggr_fair_market_rate');
    expect(rate.where).toBe('constants.AGGR_FAIR_MARKET_RATE');
    expect(rate.engineValue).toBe('60%');
    expect(watch.asOfDate).toBe('2026-07-12');
    expect(watch.sinceDate).toBe('2026-06-11');
    // 웹검색 도구 포함, 기본 허용 횟수 14회 (상수 8종 + 동향 4종, 독립 실행 기준)
    const tool = client.messages.create.mock.calls[0][0].tools[0];
    expect(tool.type).toBe('web_search_20260209');
    expect(tool.max_uses).toBe(14);
  });

  it('동향 감시 항목에는 kind·category·items 를 붙이고, 상수 항목의 items 는 비운다', async () => {
    const client = mockClient(WATCH_TEXT);
    const watch = await checkLawChanges({ client, asOfDate: '2026-07-12' });
    const nts = watch.findings.find((f) => f.id === 'nts_rulings_watch');
    expect(nts.kind).toBe('trend');
    expect(nts.category).toBe('예규·해석');
    expect(nts.where).toBe(LAW_UPDATES_FILE);
    expect(nts.items).toHaveLength(1);
    const rate = watch.findings.find((f) => f.id === 'aggr_fair_market_rate');
    expect(rate.kind).toBe('constant');
    expect(rate.items).toEqual([]);
    expect(countUpdateCandidates(watch)).toBe(1);
  });

  it('lookbackDays 로 감시 기간을 조절한다', async () => {
    const client = mockClient(WATCH_TEXT);
    const watch = await checkLawChanges({ client, asOfDate: '2026-07-12', lookbackDays: 62 });
    expect(watch.sinceDate).toBe('2026-05-11');
    expect(client.messages.create.mock.calls[0][0].messages[0].content).toContain('2026-05-11 ~ 2026-07-12');
  });

  it('webSearchMaxUses 옵션으로 검색 횟수를 조절한다', async () => {
    const client = mockClient(WATCH_TEXT);
    await checkLawChanges({ client, asOfDate: '2026-07-12', webSearchMaxUses: 3 });
    expect(client.messages.create.mock.calls[0][0].tools[0].max_uses).toBe(3);
  });
});

describe('countActionable', () => {
  it('changed·scheduled 항목만 센다', () => {
    const watch = {
      findings: [
        { status: 'current' }, { status: 'changed' },
        { status: 'scheduled' }, { status: 'uncertain' },
      ],
    };
    expect(countActionable(watch)).toBe(2);
    expect(countActionable(null)).toBe(0);
    expect(countUpdateCandidates(null)).toBe(0);
  });
});

describe('toLawUpdateEntry / renderUpdateCandidates', () => {
  const item = {
    date: '2026-06-20', org: '국세청', docNo: '서면-2026-부동산-0412',
    title: "상생임대주택 특례 '거주요건' 면제 범위", summary: '임대료 5% 이내 인상이면 인정.',
    affects: ['양도세', '판정기'], url: 'https://taxlaw.nts.go.kr/example',
  };
  const finding = { id: 'nts_rulings_watch', kind: 'trend', category: '예규·해석', label: '국세청 예규 (주제)', status: 'changed', items: [item] };

  it('세법 동향 일지에 붙여 넣을 JS 블록을 만든다 (따옴표 이스케이프, 검토중 상태)', () => {
    const js = toLawUpdateEntry(item, { ...finding, asOfDate: '2026-07-01' });
    expect(js).toContain("date: '2026-06-20',");
    expect(js).toContain("category: '예규·해석',");
    expect(js).toContain("title: '상생임대주택 특례 \\'거주요건\\' 면제 범위 (국세청 서면-2026-부동산-0412)',");
    expect(js).toContain("affects: ['양도세', '판정기'],");
    expect(js).toContain("engineStatus: '검토중',");
    expect(js).toContain('law-watch 2026-07-01 감시에서 발견');
    expect(js).toContain("url: 'https://taxlaw.nts.go.kr/example'");
    // 실제 JS 로 평가 가능해야 한다 (붙여 넣기 검증)
    const obj = new Function(`return [${js}][0];`)();
    expect(obj.title).toContain("'거주요건'");
    expect(obj.sources[0].url).toBe(item.url);
  });

  it('후보가 있으면 건수·항목·코드 블록을, 없으면 "발견되지 않았습니다"를 출력한다', () => {
    const watch = { asOfDate: '2026-07-01', sinceDate: '2026-05-31', findings: [finding, { id: 'heavy_resume', kind: 'constant', items: [] }] };
    const md = renderUpdateCandidates(watch);
    expect(md).toContain('등록 후보 1건');
    expect(md).toContain('2026-05-31 ~ 2026-07-01');
    expect(md).toContain('서면-2026-부동산-0412');
    expect(md).toContain('```js');
    const none = renderUpdateCandidates({ asOfDate: '2026-07-01', findings: [{ ...finding, status: 'current', items: [] }] });
    expect(none).toContain('발견되지 않았습니다');
    expect(renderUpdateCandidates({ asOfDate: '2026-07-01', findings: [{ kind: 'constant' }] })).toBe('');
  });
});

describe('renderLawWatch', () => {
  it('조치 필요 항목을 우선 표기하고 표를 만든다', () => {
    const watch = {
      asOfDate: '2026-07-12',
      summary: 's',
      findings: [
        { id: 'heavy_resume', label: '중과 부활일', status: 'current', note: '유지', effectiveDate: '', where: 'constants.HEAVY_RESUME_DATE', engineValue: '2026-05-10' },
        { id: 'aggr_fair_market_rate', label: '공정시장가액비율', status: 'scheduled', note: '상향 예정', effectiveDate: '2027-01-01', where: 'constants.AGGR_FAIR_MARKET_RATE', engineValue: '60%' },
      ],
    };
    const md = renderLawWatch(watch);
    expect(md).toContain('조치 필요 1건');
    expect(md).toContain('constants.AGGR_FAIR_MARKET_RATE');
    // scheduled가 current보다 위에 오도록 정렬
    expect(md.indexOf('공정시장가액비율')).toBeLessThan(md.indexOf('중과 부활일'));
    // 동향 항목이 없으면 등록 후보 절은 붙지 않는다
    expect(md).not.toContain('등록 후보');
  });

  it('동향 감시 결과가 있으면 표 아래에 일지 등록 후보 절을 붙인다', async () => {
    const watch = await checkLawChanges({ client: mockClient(WATCH_TEXT), asOfDate: '2026-07-01' });
    const md = renderLawWatch(watch, { heading: '# 세법 개정 감시 리포트' });
    expect(md).toContain('# 세법 동향 일지 등록 후보');
    expect(md).toContain('등록 후보 1건');
    expect(md).toContain('서면-2026-부동산-0412');
    // 표의 동향 항목 라벨은 주제 괄호를 떼고 짧게
    expect(md).toContain('| 국세청 예규·서면질의(서면-·사전답변) 및 국세상담센터 질의응답 신규 회신 |');
  });
});
