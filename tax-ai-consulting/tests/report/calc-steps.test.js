/**
 * 계산 내역 결정적 포매터 테스트
 */
import { describe, it, expect } from 'vitest';
import { renderCalcSteps } from '../../src/report/calc-steps.js';
import { runScenario1 } from '../../src/scenario/index.js';

const INPUTS = {
  marketPrice: 1_800_000_000, officialPrice: 1_260_000_000, basePrice: 900_000_000,
  holdPeriod: 10, stayPeriod: 0, space: 85, heavy: 1,
  holdOfficialPrice: 1_000_000_000, holdPeriod2: 8, ownerAge: 62, childAge: 32,
  ownCount: 2, isAdj: 1,
};

describe('renderCalcSteps', () => {
  it('computations가 없으면 빈 문자열', () => {
    expect(renderCalcSteps(undefined)).toBe('');
    expect(renderCalcSteps([])).toBe('');
  });

  it('시나리오1의 세목별 계산 내역을 엔진값 그대로 렌더링', () => {
    const md = renderCalcSteps(runScenario1(INPUTS).computations);
    // 증여세: 과세표준·납부세액
    expect(md).toContain('1,750,000,000원');       // 과세표준
    expect(md).toContain('523,800,000원');          // 증여세 납부세액
    // 취득세: 12% 중과
    expect(md).toContain('12%');
    expect(md).toContain('223,200,000원');
    // 양도세: 장특공 배제 + 과세표준 + 세액
    expect(md).toContain('장기보유특별공제: **배제**');
    expect(md).toContain('897,500,000원');          // 과세표준
    expect(md).toContain('520,510,000원');          // 양도세
    expect(md).toContain('52,051,000원');           // 지방소득세
  });

  it('케이스별로 소제목이 붙는다', () => {
    const md = renderCalcSteps(runScenario1(INPUTS).computations);
    expect(md).toContain('#### 케이스1 — 자녀에게 증여');
    expect(md).toContain('#### 케이스2 — 타인에게 양도');
  });
});

describe('보유세 계산 내역 (재산세·종부세)', () => {
  it('holdingComputations를 재산세·종부세 단계로 렌더링', () => {
    const md = renderCalcSteps(runScenario1(INPUTS).holdingComputations, { heading: '### 보유세 계산 내역' });
    // 재산세: 공정시장가액비율·합계
    expect(md).toContain('공정시장가액비율');
    expect(md).toContain('3,931,200원');       // 대상주택 재산세 합계
    // 종부세: 공제·과세표준·합계
    expect(md).toContain('공제금액: △900,000,000원');
    expect(md).toContain('4,870,753원');        // 2주택 합산 종부세 합계
    expect(md).toContain('673,920원');          // 자녀 종부세 합계
  });
});
