import { describe, it, expect } from 'vitest';
import { judgeMarriageExempt, HOLDINGS, MARRIAGE_10Y_START } from '../../src/core/marriage-exempt.js';

const get = (r, key) => r.checklist.find((c) => c.key === key);

/** 기본 사례: A 1주택(가목) + B 1입주권(나목), A의 혼인 전 주택을 양도 → 제2호 */
const base = {
  spouseA: 'house', spouseB: 'right', seller: 'A',
  marriageDate: '2020-06-01', saleDate: '2026-03-01', salePrice: 1_000_000_000,
  isFirstSale: true,
  houseAcquireDate: '2015-01-01', acquiredInAdjust: false, liveYears: 0,
};

describe('judgeMarriageExempt — 적용 대상·기본(제2호)', () => {
  it('가목+나목 혼인, 가목자의 혼인 전 주택 양도 → 제2호 비과세', () => {
    const r = judgeMarriageExempt(base);
    expect(get(r, 'combo').ok).toBe(true);
    expect(get(r, 'target').ok).toBe(true);
    expect(get(r, 'target').label).toContain('제2호');
    expect(r.regime).toBe('156-2-9');
    expect(r.verdict).toBe('exempt');
  });

  it('배우자가 제1호 미해당(2주택 등) → 특례 불가', () => {
    const r = judgeMarriageExempt({ ...base, spouseB: 'other' });
    expect(get(r, 'combo').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('먼저 양도하는 주택이 아니면 특례 불가', () => {
    const r = judgeMarriageExempt({ ...base, isFirstSale: false });
    expect(get(r, 'first').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('HOLDINGS 상수: 가·나·다·기타 4유형', () => {
    expect(HOLDINGS.map((h) => h.key)).toEqual(['house', 'right', 'house-right', 'other']);
  });
});

describe('양도 기한 — 10년(2024.11.12~) / 종전 5년', () => {
  it('혼인 후 10년 초과 양도 → 기한 미충족', () => {
    const r = judgeMarriageExempt({ ...base, marriageDate: '2014-01-01', saleDate: '2025-06-01' });
    expect(get(r, 'deadline').ok).toBe(false);
    expect(r.appliedYears).toBe(10);
    expect(r.verdict).toBe('taxable');
  });

  it('2024.11.12 이전 양도분은 5년 적용 → 6.4년 경과 시 미충족', () => {
    const r = judgeMarriageExempt({ ...base, marriageDate: '2018-01-01', saleDate: '2024-06-01' });
    expect(r.appliedYears).toBe(5);
    expect(get(r, 'deadline').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('같은 혼인이라도 2024.11.12 이후 양도하면 10년 적용 → 충족', () => {
    const r = judgeMarriageExempt({ ...base, marriageDate: '2018-01-01', saleDate: '2025-01-01' });
    expect(r.appliedYears).toBe(10);
    expect(get(r, 'deadline').ok).toBe(true);
    expect(r.verdict).toBe('exempt');
  });

  it('MARRIAGE_10Y_START 상수', () => {
    expect(MARRIAGE_10Y_START).toBe('2024-11-12');
  });
});

describe('제3호 — 다목자(주택+권리)의 혼인 전 주택', () => {
  const da = { ...base, spouseA: 'house-right', seller: 'A' };

  it('가목: 원조합원 입주권 + 인가일 이후 취득 + 1년 거주 → 충족', () => {
    const r = judgeMarriageExempt({
      ...da, rightKind: 'first', approvalDate: '2018-01-01',
      houseAcquireDate: '2019-01-01', liveYears: 2,
    });
    expect(get(r, 'target').ok).toBe(true);
    expect(get(r, 'target').label).toContain('가목');
    expect(r.verdict).toBe('exempt');
  });

  it('가목: 취득 후 거주 1년 미달 → 미충족', () => {
    const r = judgeMarriageExempt({
      ...da, rightKind: 'first', approvalDate: '2018-01-01',
      houseAcquireDate: '2019-01-01', liveYears: 0,
    });
    expect(get(r, 'target').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('가목: 사업시행인가일 전 취득 → 미충족', () => {
    const r = judgeMarriageExempt({
      ...da, rightKind: 'first', approvalDate: '2018-01-01',
      houseAcquireDate: '2017-01-01', liveYears: 2,
    });
    expect(get(r, 'target').ok).toBe(false);
  });

  it('나목: 승계취득 입주권 → 입주권 취득 전부터 소유한 주택이면 충족', () => {
    const r = judgeMarriageExempt({
      ...da, rightKind: 'acquired', rightAcquireDate: '2019-06-01',
      houseAcquireDate: '2015-01-01',
    });
    expect(get(r, 'target').ok).toBe(true);
    expect(get(r, 'target').label).toContain('나목');
    expect(r.verdict).toBe('exempt');
  });

  it('나목: 입주권 취득 후에 주택 취득 → 미충족', () => {
    const r = judgeMarriageExempt({
      ...da, rightKind: 'acquired', rightAcquireDate: '2016-01-01',
      houseAcquireDate: '2018-01-01', saleDate: '2026-03-01',
    });
    expect(get(r, 'target').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('다목: 분양권 취득 전부터 소유한 주택 → 충족', () => {
    const r = judgeMarriageExempt({
      ...da, rightKind: 'presale', rightAcquireDate: '2021-03-01',
      houseAcquireDate: '2015-01-01',
    });
    expect(get(r, 'target').ok).toBe(true);
    expect(get(r, 'target').label).toContain('다목');
    expect(r.verdict).toBe('exempt');
  });
});

describe('제4호 — 나목자의 권리가 혼인 후 완공된 신축주택', () => {
  const na = { ...base, spouseA: 'right', spouseB: 'house', seller: 'A' };

  it('혼인일 이후 완공 취득 + 보유 2년 → 충족', () => {
    const r = judgeMarriageExempt({
      ...na, marriageDate: '2021-06-01', houseAcquireDate: '2022-01-01', saleDate: '2026-03-01',
    });
    expect(get(r, 'target').ok).toBe(true);
    expect(get(r, 'target').label).toContain('제4호');
    expect(r.verdict).toBe('exempt');
  });

  it('혼인 전 완공 취득 → 제4호 미충족', () => {
    const r = judgeMarriageExempt({
      ...na, marriageDate: '2021-06-01', houseAcquireDate: '2020-01-01', saleDate: '2026-03-01',
    });
    expect(get(r, 'target').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('완공 후 보유 2년 미달 → §154① 보유요건 미충족', () => {
    const r = judgeMarriageExempt({
      ...na, marriageDate: '2023-01-01', houseAcquireDate: '2024-06-01', saleDate: '2025-12-01',
    });
    expect(get(r, 'target').ok).toBe(true);
    expect(get(r, 'hold').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });
});

describe('§155⑤(주택+주택) · §154① 거주 · 고가주택', () => {
  it('가목+가목(1주택+1주택) → §155⑤ 혼인 합가 특례로 판정', () => {
    const r = judgeMarriageExempt({ ...base, spouseA: 'house', spouseB: 'house' });
    expect(r.regime).toBe('155-5');
    expect(r.lawRef.join(' ')).toContain('155');
    expect(r.verdict).toBe('exempt');
  });

  it('조정지역 취득(2017.8.3 이후) + 거주 0 → 거주요건 미충족', () => {
    const r = judgeMarriageExempt({
      ...base, houseAcquireDate: '2019-01-01', acquiredInAdjust: true, liveYears: 0,
    });
    expect(get(r, 'live').ok).toBe(false);
    expect(r.verdict).toBe('taxable');
  });

  it('고가 15억 → 부분 비과세 (12억 초과분 과세)', () => {
    const r = judgeMarriageExempt({ ...base, salePrice: 1_500_000_000 });
    expect(r.isHigh).toBe(true);
    expect(r.threshold).toBe(1_200_000_000);
    expect(r.verdict).toBe('partial');
  });
});
