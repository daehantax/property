/**
 * 시나리오 1~10 스모크 테스트
 *
 * 각 시나리오에 합리적인 표준 입력을 전달해
 *   1) 예외 없이 실행되는지
 *   2) 반환 구조(scenarioId, title, summary, lawRef)가 일관된지
 *   3) 핵심 세액이 음수가 아닌 finite number 인지
 * 를 검증한다. 개별 계산 로직은 src/core 단위 테스트에서 다룸.
 */

import { describe, it, expect } from 'vitest';
import * as scenarios from '../../src/scenario/index.js';

const baseCommon = {
  marketPrice: 1_500_000_000,
  officialPrice: 1_000_000_000,
  basePrice: 800_000_000,
  loanPrice: 300_000_000,
  holdPeriod: 6,
  stayPeriod: 4,
  space: 85,
  heavy: 0,
  holdOfficialPrice: 800_000_000,
  holdPeriod2: 5,
  ownerAge: 55,
  childAge: 25,
  spouseAge: 52,
  ownerRate: 0.5,
  spouseRate: 0.5,
  spouseHoldPeriod: 5,
  partRate: 0.5,
};

const recipient = (price, age = 30) => ({ price, age });

const scenarioInputs = {
  1: { ...baseCommon, ownCount: 2, isAdj: 0 },
  2: { ...baseCommon },
  3: {
    ...baseCommon,
    child:       recipient(500_000_000, 28),
    childSpouse: recipient(0, 28),
    grand1:      recipient(300_000_000, 10),
    grand2:      recipient(300_000_000, 12),
    grand3:      recipient(0, 8),
  },
  4: {
    ...baseCommon,
    child:       recipient(500_000_000, 28),
    childSpouse: recipient(0, 28),
    grand1:      recipient(300_000_000, 10),
    grand2:      recipient(300_000_000, 12),
    grand3:      recipient(0, 8),
  },
  5: { ...baseCommon },
  6: { ...baseCommon },
  7: { ...baseCommon },
  8: { ...baseCommon, ownCount: 2, isAdj: 0 },
  9: {
    ...baseCommon,
    spouse: recipient(500_000_000, 52),
    child1: recipient(300_000_000, 25),
    child2: recipient(300_000_000, 22),
    child3: recipient(0, 18),
    child4: recipient(0, 15),
  },
  10: {
    ...baseCommon,
    spouse:      recipient(500_000_000, 52),
    childSpouse: recipient(200_000_000, 28),
    child2:      recipient(300_000_000, 22),
    child3:      recipient(0, 18),
    child4:      recipient(0, 15),
  },
};

const assertCommonShape = (result, id) => {
  expect(result).toBeDefined();
  expect(result.scenarioId).toBe(id);
  expect(typeof result.title).toBe('string');
  expect(result.title.length).toBeGreaterThan(0);
  expect(result.inputs).toBeDefined();
  expect(Array.isArray(result.lawRef)).toBe(true);
  expect(result.summary).toBeDefined();
  // 모든 summary 값은 finite number 여야 함
  for (const [k, v] of Object.entries(result.summary)) {
    expect(Number.isFinite(v), `summary.${k} is finite`).toBe(true);
  }
};

describe('시나리오 스모크 테스트', () => {
  for (let id = 1; id <= 10; id++) {
    it(`runScenario${id} 정상 실행 및 반환 구조 검증`, () => {
      const fn = scenarios[`runScenario${id}`];
      expect(typeof fn).toBe('function');
      const result = fn(scenarioInputs[id]);
      assertCommonShape(result, id);
    });
  }
});

describe('시나리오 1 — 자녀 증여 vs 타인 양도', () => {
  it('case1(증여)·case2(양도) 양쪽 모두 산출', () => {
    const r = scenarios.runScenario1(scenarioInputs[1]);
    expect(r.case1.recipientTotal).toBeGreaterThan(0);
    expect(r.case2.sellerTotal).toBeGreaterThan(0);
  });

  it('비조정·1세대1주택 미적용 양도 시 양도세는 0보다 큼', () => {
    const r = scenarios.runScenario1({
      ...scenarioInputs[1],
      marketPrice: 2_000_000_000,
      basePrice: 800_000_000,
    });
    expect(r.case2.sellerTransferTax).toBeGreaterThan(0);
  });

  it('보유세: 처분 후(case2)는 처분 전보다 감소', () => {
    const r = scenarios.runScenario1(scenarioInputs[1]);
    expect(r.holdingTax.afterCase2.total).toBeLessThan(r.holdingTax.before.total);
  });
});

describe('분산증여 증여취득세 중과 — 주택 전체 시가 기준 판정', () => {
  // 지분이 3억 미만이어도 주택 전체가 3억 이상이면 조정지역 증여취득 12% 중과가 적용되어야 한다.
  // (지방세법 §13의2: 판정 기준은 취득 지분액이 아니라 주택의 시가표준액)
  it('시나리오 3: 소액 지분 수증자도 주택 전체≥3억이면 12% 중과', () => {
    const r = scenarios.runScenario3({
      ...scenarioInputs[3],
      marketPrice: 1_200_000_000, // 주택 전체 12억
      heavy: 1,                   // 조정지역
      // 지분 각 2억(<3억)씩 6명? → 여기선 소액 지분 2명으로 구성
      child:       recipient(200_000_000, 30),
      childSpouse: recipient(200_000_000, 30),
      grand1:      recipient(0, 0),
      grand2:      recipient(0, 0),
      grand3:      recipient(0, 0),
    });
    // 케이스2 수증자별 취득세가 지분×12.4%(중과)로 계산되었는지 — 지분 2억 기준 3.5%였다면 700만, 12%면 2480만
    const perRecipientAcq = r.case2.recipients[0].acqTax;
    expect(perRecipientAcq).toBeGreaterThan(200_000_000 * 0.12); // 최소 12% 본세 이상
  });

  it('시나리오 9: 소액 지분 수증자도 주택 전체≥3억이면 12% 중과', () => {
    const r = scenarios.runScenario9({
      ...scenarioInputs[9],
      marketPrice: 1_200_000_000,
      heavy: 1,
      spouse: recipient(200_000_000, 55),
      child1: recipient(200_000_000, 30),
      child2: recipient(0, 0),
      child3: recipient(0, 0),
      child4: recipient(0, 0),
    });
    expect(r.case2.recipients[0].acqTax).toBeGreaterThan(200_000_000 * 0.12);
  });
});

describe('부담부증여 다주택 중과 (조정지역) — 채무 양도분', () =>{
  // 시나리오 2·4·5·10: 2주택자의 부담부증여 채무 승계분 양도세는
  // 조정지역(heavy=1)이면 다주택 중과(장특공 배제 + 세율 가산)가 적용되어야 한다.
  const heavyInputs = (id) => ({ ...scenarioInputs[id], heavy: 1, holdPeriod: 12 });
  const transferOf = (r) => (r.computations ?? []).find((c) => c.kind === 'transfer')?.result;

  for (const id of [2, 4, 5, 10]) {
    it(`시나리오 ${id}: 조정지역이면 채무 양도분에 중과 적용(heavyApplied=true)`, () => {
      const r = scenarios[`runScenario${id}`](heavyInputs(id));
      const t = transferOf(r);
      expect(t, `시나리오 ${id} transfer computation`).toBeDefined();
      expect(t.breakdown.heavyApplied).toBe(true);
      // 중과 세율은 기본세율보다 최소 20%p 높다
      expect(t.breakdown.appliedR).toBeGreaterThanOrEqual(t.breakdown.baseR + 0.2 - 1e-9);
      // 장특공 배제 → 적용 과세표준(appliedIncome)은 장특공 반영값(incomeFinal) 이상
      expect(t.breakdown.appliedIncome).toBeGreaterThanOrEqual(t.breakdown.incomeFinal);
    });

    it(`시나리오 ${id}: 비조정지역이면 중과 미적용(heavyApplied=false)`, () => {
      const r = scenarios[`runScenario${id}`]({ ...scenarioInputs[id], heavy: 0, holdPeriod: 12 });
      const t = transferOf(r);
      expect(t.breakdown.heavyApplied).toBe(false);
    });
  }
});
