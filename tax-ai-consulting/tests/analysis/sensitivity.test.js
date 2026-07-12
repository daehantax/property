import { describe, it, expect } from 'vitest';
import {
  sweep, findBreakEven, renderSensitivity, defaultCompare,
} from '../../src/analysis/sensitivity.js';

const BASE = {
  marketPrice: 1800000000, officialPrice: 1260000000, basePrice: 900000000,
  loanPrice: 0, holdPeriod: 10, stayPeriod: 5, space: 85, heavy: 1,
  holdOfficialPrice: 1000000000, holdPeriod2: 8, ownerAge: 62, childAge: 32,
};

describe('sweep', () => {
  it('변수 값마다 시나리오를 실행해 두 선택지 총액을 비교한다', () => {
    const r = sweep({
      scenarioId: 2,
      baseInputs: BASE,
      variable: { path: 'loanPrice', label: '승계 대출액', values: [0, 600000000, 1200000000], unit: '원' },
    });
    expect(r.points).toHaveLength(3);
    // 대출이 커질수록 부담부증여(b)가 유리 → diff(a-b) 증가
    expect(r.points[0].diff).toBeLessThanOrEqual(r.points[1].diff);
    expect(r.points[1].diff).toBeLessThan(r.points[2].diff);
    expect(r.points[2].winner).toBe('b');
  });

  it('원본 baseInputs를 변형하지 않는다', () => {
    const snapshot = JSON.stringify(BASE);
    sweep({
      scenarioId: 2,
      baseInputs: BASE,
      variable: { path: 'loanPrice', label: '대출', values: [500000000] },
    });
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });

  it('중첩 경로(dot path)에 값을 설정한다', () => {
    const base = { ...BASE, spouse: { price: 900000000, age: 55 }, child1: { price: 0, age: 0 }, child2: { price: 0, age: 0 }, child3: { price: 0, age: 0 }, child4: { price: 0, age: 0 } };
    const r = sweep({
      scenarioId: 9,
      baseInputs: base,
      variable: { path: 'spouse.age', label: '배우자 나이', values: [50, 60], unit: '세' },
    });
    expect(r.points).toHaveLength(2);
  });

  it('알 수 없는 시나리오 ID는 오류', () => {
    expect(() => sweep({ scenarioId: 99, baseInputs: BASE, variable: { path: 'loanPrice', values: [0] } }))
      .toThrow(/알 수 없는 시나리오/);
  });
});

describe('findBreakEven', () => {
  it('diff 부호가 바뀌는 지점을 선형보간으로 찾는다', () => {
    const points = [
      { value: 0, diff: -100 },
      { value: 10, diff: -50 },
      { value: 20, diff: 50 },  // 여기서 역전
      { value: 30, diff: 100 },
    ];
    const cross = findBreakEven({ points });
    expect(cross).toHaveLength(1);
    // -50 → +50 사이, 정확히 중간(value 15)에서 교차
    expect(cross[0].crossValue).toBeCloseTo(15, 5);
    expect(cross[0].beforeWinner).toBeUndefined(); // winner 필드 없이도 동작
  });

  it('부호 변화가 없으면 빈 배열', () => {
    const points = [{ value: 0, diff: 10 }, { value: 1, diff: 20 }];
    expect(findBreakEven({ points })).toEqual([]);
  });
});

describe('defaultCompare', () => {
  it('GrandTotal/Total 두 형식의 summary를 모두 흡수한다', () => {
    const withGrand = { summary: { case1GrandTotal: 100, case2GrandTotal: 200 }, case1: { label: 'A' }, case2: { label: 'B' } };
    const withTotal = { summary: { case1Total: 300, case2Total: 150 }, case1: { label: 'C' }, case2: { label: 'D' } };
    expect(defaultCompare(withGrand)).toEqual({ a: { label: 'A', total: 100 }, b: { label: 'B', total: 200 } });
    expect(defaultCompare(withTotal)).toEqual({ a: { label: 'C', total: 300 }, b: { label: 'D', total: 150 } });
  });
});

describe('renderSensitivity', () => {
  it('표와 손익분기 설명을 마크다운으로 렌더링한다', () => {
    const r = sweep({
      scenarioId: 2,
      baseInputs: BASE,
      variable: { path: 'loanPrice', label: '승계 대출액', values: [0, 600000000], unit: '원' },
    });
    const md = renderSensitivity(r);
    expect(md).toContain('### 민감도 분석');
    expect(md).toContain('승계 대출액');
    expect(md).toContain('일반증여');
    expect(md).toContain('부담부증여');
  });
});
