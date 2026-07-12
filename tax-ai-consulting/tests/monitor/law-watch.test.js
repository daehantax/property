/**
 * 세법 개정 감시 테스트 — mock 클라이언트 주입, 네트워크 없음
 */

import { describe, it, expect, vi } from 'vitest';
import {
  checkLawChanges, parseFindings, renderLawWatch, buildWatchPrompt,
  countActionable, ENGINE_ASSUMPTIONS,
} from '../../src/monitor/law-watch.js';

const WATCH_TEXT = `확인 결과입니다.

\`\`\`json
{
  "summary": "대체로 유효하나 공정시장가액비율 상향 예정",
  "findings": [
    { "id": "aggr_fair_market_rate", "status": "scheduled", "note": "60%→80% 상향 예정", "effectiveDate": "2027-01-01", "source": "기재부" },
    { "id": "heavy_resume", "status": "current", "note": "2026-05-10 시행 유지", "effectiveDate": "", "source": "국세청" }
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
});

describe('parseFindings', () => {
  it('findings 배열을 파싱한다', () => {
    const p = parseFindings(WATCH_TEXT);
    expect(p.findings).toHaveLength(2);
    expect(p.summary).toContain('공정시장가액비율');
  });
});

describe('buildWatchPrompt', () => {
  it('기준일과 가정 목록을 포함한다', () => {
    const p = buildWatchPrompt(ENGINE_ASSUMPTIONS, '2026-07-12');
    expect(p).toContain('2026-07-12');
    expect(p).toContain('aggr_fair_market_rate');
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
    // 웹검색 도구 포함, 기본 허용 횟수 10회 (독립 실행 기준)
    const tool = client.messages.create.mock.calls[0][0].tools[0];
    expect(tool.type).toBe('web_search_20260209');
    expect(tool.max_uses).toBe(10);
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
  });
});
