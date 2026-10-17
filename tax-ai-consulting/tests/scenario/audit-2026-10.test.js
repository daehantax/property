/**
 * 시나리오 1~10 세법 감사 테스트 (2026-10-17 시행 세법 기준, 수기 계산 대조)
 *
 * 폼 기본값(form-specs)과 변형 입력으로 각 시나리오의 핵심 세액을 손으로 계산해 고정한다.
 * 공통 기본값: 시가 18억 · 공시 12.6억 · 취득가 9억 · 채무 6억 · 계속보유주택 공시 10억
 *             보유 10년 · 거주 0년 · 85㎡ · 조정지역 · 소유자 62세 · 자녀 32세 · 배우자 58세
 *
 * 공통 수기 계산:
 *  [증여세] 18억 → 자녀: (18억−5천만)=17.5억 × 40% − 1.6억 = 5.4억 × 0.97 = 523,800,000
 *                배우자: (18억−6억)=12억 × 40% − 1.6억 = 3.2억 × 0.97 = 310,400,000
 *  [증여 취득세] 조정지역·공시 12.6억 ≥ 3억 → 12% + 교육세 0.4% (85㎡ 농특 면제) = 12.4% × 18억 = 223,200,000
 *  [양도세·타인 양도] 차익 9억, 조정 2주택 중과: 장특공 배제, 과표 9억−250만 = 897,500,000
 *                  42%+20%p = 62% → 556,450,000 − 누진공제 35,940,000 = 520,510,000, 지방소득세 52,051,000
 *  [양도세·부담부 채무 6억] 취득가 9억×6/18 = 3억, 차익 3억, 과표 297,500,000 → 38%+20%p = 58%
 *                  172,550,000 − 19,940,000 = 152,610,000, 지방소득세 15,261,000 → 167,871,000
 *  [부담부 취득세] 유상 6억 × (1% + 0.1%) = 6,600,000 + 무상 12억 × 12.4% = 148,800,000 → 155,400,000
 *  [재산세·다주택] 공시 12.6억 × 60% = 7.56억 → 570,000 + 4.56억×0.4% = 2,394,000
 *                  + 도시지역분 1,058,400 + 교육세 478,800 = 3,931,200
 *                  공시 10억 → 1,770,000 + 840,000 + 354,000 = 2,964,000
 *  [재산세·1세대1주택] 공시 12.6억 × 45% = 5.67억 (9억 초과 → 표준세율) → 1,638,000 + 793,800 + 327,600 = 2,759,400
 */

import { describe, it, expect } from 'vitest';
import * as S from '../../src/scenario/index.js';
import { buildDefaults } from '../../src/web/form-specs.js';

const near = (a, b, tol = 5) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const def = (id, over = {}) => ({ ...buildDefaults(id), ...over });

describe('시나리오 1 — 자녀 증여 vs 타인 양도', () => {
  it('기본값: 증여세 523,800,000 · 취득세 223,200,000 · 양도세(중과) 572,561,000', () => {
    const r = S.runScenario1(def(1));
    expect(r.case1.recipientGiftTax).toBe(523_800_000);
    expect(r.case1.recipientAcqTax).toBe(223_200_000);
    expect(r.case2.sellerTransferTax).toBe(520_510_000);
    expect(r.case2.sellerLocalTax).toBe(52_051_000);
    expect(r.summary.case2Total).toBe(572_561_000);
    // 보유세(처분 전): 재산세 3,931,200 + 2,964,000 = 6,895,200
    expect(r.holdingTax.before.ownerPropertyTax).toBe(6_895_200);
    // 종부세: (22.6억−9억)×60% = 8.16억 → 1.0%−240만 = 5,760,000; 재산세공제 ≈ 1,701,038 → 4,058,962 + 농특 20%
    near(r.holdingTax.before.ownerAggrTax, 4_870_754);
  });

  it('변형: 비조정지역 양도 → 장특공 표1 20%, 기본세율 42%: 265,410,000 + 26,541,000', () => {
    // 차익 9억 − 장특 1.8억 − 250만 = 717,500,000 × 42% − 35,940,000 = 265,410,000
    const r = S.runScenario1(def(1, { isAdj: 0 }));
    expect(r.case2.sellerTransferTax).toBe(265_410_000);
    expect(r.case2.sellerTotal).toBe(291_951_000);
  });

  it('변형: 미성년(만 15세) 자녀 → 공제 2천만: (18억−2천만)×40%−1.6억 = 5.52억 × 0.97 = 535,440,000', () => {
    const r = S.runScenario1(def(1, { childAge: 15 }));
    expect(r.case1.recipientGiftTax).toBe(535_440_000);
  });

  it('변형: 만 19세 자녀는 성년 → 5천만 공제 (민법 §4)', () => {
    const r = S.runScenario1(def(1, { childAge: 19 }));
    expect(r.case1.recipientGiftTax).toBe(523_800_000);
  });
});

describe('시나리오 2 — 자녀 일반증여 vs 부담부증여', () => {
  it('기본값: 부담부 증여세 291,000,000 · 취득세 155,400,000 · 양도세 167,871,000 → 총 614,271,000', () => {
    // 증여세: (12억−5천만)=11.5억 × 40% − 1.6억 = 3억 × 0.97 = 291,000,000
    const r = S.runScenario2(def(2));
    expect(r.case1.grandTotal).toBe(747_000_000);
    expect(r.case2.recipientGiftTax).toBe(291_000_000);
    expect(r.case2.recipientAcqTax).toBe(155_400_000);
    expect(r.case2.sellerTotal).toBe(167_871_000);
    expect(r.summary.case2GrandTotal).toBe(614_271_000);
  });

  it('변형: 비조정지역 → 증여취득 3.8%, 채무분 양도세 중과 없음(장특공 20%)', () => {
    // 취득세: 18억 × 3.8% = 68,400,000 / 부담부: 6,600,000 + 12억×3.8% 45,600,000 = 52,200,000
    // 양도세: 차익 3억 − 장특 6천만 − 250만 = 237,500,000 × 38% − 19,940,000 = 70,310,000 (+10%)
    const r = S.runScenario2(def(2, { heavy: 0 }));
    expect(r.case1.recipientAcqTax).toBe(68_400_000);
    expect(r.case2.recipientAcqTax).toBe(52_200_000);
    expect(r.case2.sellerTransferTax).toBe(70_310_000);
    expect(r.case2.sellerTotal).toBe(77_341_000);
  });

  it('변형: 조정지역이라도 공시가격(시가표준액) 3억 미만이면 증여취득 12% 중과 아님 (지방세법 §13의2②)', () => {
    // 시가 3.5억 · 공시 2.5억 → 3.5% + 0.3% = 3.8% × 3.5억 = 13,300,000
    const r = S.runScenario2(def(2, { marketPrice: 350_000_000, officialPrice: 250_000_000, basePrice: 200_000_000, loanPrice: 100_000_000 }));
    expect(r.case1.recipientAcqTax).toBe(13_300_000);
    expect(r.case2.recipientAcqTax).toBe(100_000_000 * 0.011 + 250_000_000 * 0.038);
  });
});

describe('시나리오 3 — 자녀 단독 증여 vs 분산증여', () => {
  it('기본값: 자녀 101,850,000 · 자녀배우자 113,490,000 · 손자녀(5세) 세대생략 30% 143,754,000', () => {
    // 자녀 6억: (6억−5천만)=5.5억×30%−6천만 = 1.05억×0.97 = 101,850,000
    // 자녀배우자(기타친족 1천만): 5.9억×30%−6천만 = 1.17억×0.97 = 113,490,000
    // 손자녀(미성년 2천만): 5.8억×30%−6천만 = 1.14억 × 1.3 = 148,200,000 × 0.97 = 143,754,000
    // 취득세(지분 6억, 주택 전체 공시 12.6억 ≥ 3억 → 12.4%): 74,400,000
    const r = S.runScenario3(def(3));
    const [c, cs, g] = r.case2.recipients;
    expect(c.giftTax).toBe(101_850_000);
    expect(cs.giftTax).toBe(113_490_000);
    expect(g.giftTax).toBe(143_754_000);
    expect(c.acqTax).toBe(74_400_000);
    expect(r.case2.giftTax).toBe(359_094_000);
    expect(r.summary.saving).toBe(747_000_000 - 582_294_000);
    // 분산 후 재산세: 주택 전체(다주택) 3,931,200을 지분 안분 → 합계 동일, 종부세는 지분 4.2억 < 9억 → 0
    near(r.holdingTax.afterCase2.recipientTotal, 3_931_200, 1);
  });

  it('변형: 성년 손자녀가 20억 초과 수증 → 세대생략 할증 30% (40%는 미성년만, 상증세법 §57①)', () => {
    // (25억−5천만)=24.5억×40%−1.6억 = 8.2억 × 1.3 = 10.66억 × 0.97 = 1,034,020,000
    const r = S.runScenario3(def(3, {
      marketPrice: 2_500_000_000, officialPrice: 1_800_000_000,
      child: { price: 0, age: 0 }, childSpouse: { price: 0, age: 0 },
      grand1: { price: 2_500_000_000, age: 25 },
    }));
    expect(r.case2.recipients[0].giftTax).toBe(1_034_020_000);
  });
});

describe('시나리오 4 — 자녀 단독 부담부증여 vs 분산 부담부증여', () => {
  it('기본값: 지분 6억·채무 2억씩 → 자녀 58,200,000 · 자녀배우자 65,960,000 · 손자녀 83,226,000, 취득세 각 51,800,000', () => {
    // 자녀: 순증여 4억−5천만 = 3.5억×20%−1천만 = 6천만×0.97 = 58,200,000
    // 자녀배우자: 3.9억×20%−1천만 = 6,800만×0.97 = 65,960,000
    // 손자녀(5세): 3.8억×20%−1천만 = 6,600만×1.3 = 85,800,000×0.97 = 83,226,000
    // 취득세: 유상 2억×1.1% = 2,200,000 + 무상 4억×12.4% = 49,600,000
    const r = S.runScenario4(def(4));
    expect(r.case1.grandTotal).toBe(614_271_000);
    const [c, cs, g] = r.case2.recipients;
    expect(c.giftTax).toBe(58_200_000);
    expect(cs.giftTax).toBe(65_960_000);
    expect(g.giftTax).toBe(83_226_000);
    expect(c.acqTax).toBe(51_800_000);
    expect(r.case2.grandTotal).toBe(167_871_000 + 207_386_000 + 155_400_000);
  });

  it('변형: 비조정지역 → 무상분 3.8%: 수증자별 취득세 17,400,000', () => {
    const r = S.runScenario4(def(4, { heavy: 0 }));
    expect(r.case2.recipients[0].acqTax).toBe(17_400_000);
    expect(r.case2.recipientAcqTax).toBe(52_200_000);
  });
});

describe('시나리오 5 — 배우자 일반증여 vs 부담부증여', () => {
  it('기본값: 일반 310,400,000 / 부담부 증여세 116,400,000 (12억−6억 = 6억 × 30% − 6천만 = 1.2억 × 0.97)', () => {
    const r = S.runScenario5(def(5));
    expect(r.case1.recipientGiftTax).toBe(310_400_000);
    expect(r.case2.recipientGiftTax).toBe(116_400_000);
    expect(r.case2.recipientAcqTax).toBe(155_400_000);
    expect(r.case2.sellerTotal).toBe(167_871_000);
    expect(r.summary.case2GrandTotal).toBe(439_671_000);
  });

  it('변형: 채무 12억 → 증여세 0, 유상분 취득세 3%(9억 초과), 양도차익 6억 중과 62%', () => {
    // 취득세: 유상 12억×3.3% = 39,600,000 + 무상 6억×12.4% = 74,400,000 → 114,000,000
    // 양도세: 취득가 9억×12/18 = 6억, 차익 6억 − 250만 = 597,500,000 × 62% − 35,940,000 = 334,510,000
    const r = S.runScenario5(def(5, { loanPrice: 1_200_000_000 }));
    expect(r.case2.recipientGiftTax).toBe(0);
    expect(r.case2.recipientAcqTax).toBe(114_000_000);
    expect(r.case2.sellerTransferTax).toBe(334_510_000);
    expect(r.case2.sellerTotal).toBe(367_961_000);
  });
});

describe('시나리오 6 — 1주택 지분 배우자 일반증여 vs 부담부증여', () => {
  it('기본값: 지분 9억 증여세 48,500,000 · 취득세(1세대1주택 증여 3.8%) 34,200,000', () => {
    // (9억−6억)=3억×20%−1천만 = 5천만×0.97 = 48,500,000 / 9억×3.8% = 34,200,000
    const r = S.runScenario6(def(6));
    expect(r.case1.recipientGiftTax).toBe(48_500_000);
    expect(r.case1.recipientAcqTax).toBe(34_200_000);
  });

  it('기본값 부담부: 고가주택 판정은 주택 전체 18억 → 채무 3억 양도분 과세 4,365,000 (+지방 436,500)', () => {
    // 양도가액 3억, 취득가 4.5억×3/9 = 1.5억, 차익 1.5억 × (18억−12억)/18억 = 5천만
    // 거주 0년 → 장특공 표1(보유 10년 20%) 1천만, 과표 5천만−1천만−250만 = 3,750만 × 15% − 126만 = 4,365,000
    // 취득세: 유상 3억×1.1% = 3,300,000 + 무상 6억×3.8% = 22,800,000 → 26,100,000
    const r = S.runScenario6(def(6));
    expect(r.case2.recipientGiftTax).toBe(0);
    near(r.case2.recipientAcqTax, 26_100_000, 1);
    expect(r.case2.sellerTransferTax).toBe(4_365_000);
    expect(r.case2.sellerLocalTax).toBe(436_500);
  });

  it('기본값 보유세: 재산세는 주택 전체 2,759,400 그대로(지분 안분) · 종부세 12억 공제분만 사라짐', () => {
    const r = S.runScenario6(def(6));
    near(r.holdingTax.before.ownerTotal, 2_759_400 + 55_296);
    near(r.holdingTax.after.grandTotal, 2_759_400, 1);
    near(r.holdingTax.after.ownerTotal, 1_379_700, 1);
    near(r.holdingTax.change, -55_296);
  });

  it('변형: 주택 전체 10억(12억 이하) → 채무 양도분 전액 비과세, 취득세 13,600,000', () => {
    // 지분 5억·채무 2억: 증여세 (3억−6억) → 0 / 취득세 2억×1.1% + 3억×3.8% = 2,200,000 + 11,400,000
    const r = S.runScenario6(def(6, { marketPrice: 1_000_000_000, officialPrice: 700_000_000, basePrice: 500_000_000, loanPrice: 400_000_000 }));
    expect(r.case2.sellerTotal).toBe(0);
    expect(r.case2.recipientGiftTax).toBe(0);
    near(r.case2.recipientAcqTax, 13_600_000, 1);
  });
});

describe('시나리오 7 — 공동명의 1주택 → 배우자 단독명의', () => {
  it('기본값(각 50%): 증여세 48,500,000 · 취득세 34,200,000 / 부담부 양도세 4,801,500', () => {
    const r = S.runScenario7(def(7));
    expect(r.case1.grandTotal).toBe(82_700_000);
    expect(r.case2.sellerTotal).toBe(4_801_500);
    near(r.case2.grandTotal, 30_901_500, 1);
  });

  it('기본값 보유세: 공동명의(각 6.3억 < 9억 → 종부세 0) 2,759,400 → 단독 1세대1주택 2,842,344 (+82,944)', () => {
    // 단독 종부세: 3,600만×0.5% = 180,000 − 재산세공제 64,800 = 115,200, 세액공제 보유 10년 40% → 69,120 + 농특 13,824 = 82,944
    const r = S.runScenario7(def(7));
    expect(r.holdingTax.before.grandTotal).toBe(2_759_400);
    near(r.holdingTax.after.grandTotal, 2_842_344);
    near(r.holdingTax.change, 82_944);
  });

  it('변형: 소유자 60%·공시 10억 → 증여세 83,420,000, 취득세 41,040,000, 종부세 변화 없음(12억 이하)', () => {
    // 지분 10.8억 − 6억 = 4.8억 × 20% − 1천만 = 8,600만 × 0.97 = 83,420,000 / 10.8억 × 3.8% = 41,040,000
    const r = S.runScenario7(def(7, { ownerRate: 0.6, spouseRate: 0.4, officialPrice: 1_000_000_000 }));
    expect(r.case1.recipientGiftTax).toBe(83_420_000);
    near(r.case1.recipientAcqTax, 41_040_000, 1);
    expect(r.holdingTax.change).toBe(0);
    expect(r.holdingTax.after.grandTotal).toBe(2_034_000);
  });
});

describe('시나리오 8 — 배우자 증여 vs 타인 양도', () => {
  it('기본값: 증여 533,600,000 vs 양도 572,561,000', () => {
    const r = S.runScenario8(def(8));
    expect(r.summary.case1Total).toBe(533_600_000);
    expect(r.summary.case2Total).toBe(572_561_000);
  });

  it('변형: 3주택 → +30%p (72%): 897,500,000×72% − 35,940,000 = 610,260,000', () => {
    const r = S.runScenario8(def(8, { ownCount: 3 }));
    expect(r.case2.sellerTransferTax).toBe(610_260_000);
    expect(r.case2.sellerTotal).toBe(671_286_000);
  });
});

describe('시나리오 9 — 배우자 단독 증여 vs 배우자+자녀 분산증여', () => {
  it('기본값: 배우자 9억 48,500,000 · 자녀 9억 189,150,000, 취득세 각 111,600,000', () => {
    // 자녀: (9억−5천만)=8.5억×30%−6천만 = 1.95억×0.97 = 189,150,000
    const r = S.runScenario9(def(9));
    expect(r.case2.recipients[0].giftTax).toBe(48_500_000);
    expect(r.case2.recipients[1].giftTax).toBe(189_150_000);
    expect(r.case2.recipients[1].acqTax).toBe(111_600_000);
    expect(r.summary.saving).toBe(533_600_000 - 460_850_000);
  });

  it('기본값 보유세: 배우자 지분은 다주택(3,931,200×50%) · 32세 자녀 지분은 별도세대 1세대1주택(2,759,400×50%)', () => {
    const r = S.runScenario9(def(9));
    near(r.holdingTax.afterCase2.recipientTotal, 1_965_600 + 1_379_700, 1);
  });

  it('변형: 자녀 25세(동일세대) → 자녀 지분도 다주택 재산세 → 3,931,200', () => {
    const r = S.runScenario9(def(9, { child1: { price: 900_000_000, age: 25 } }));
    near(r.holdingTax.afterCase2.recipientTotal, 3_931_200, 1);
  });
});

describe('시나리오 10 — 배우자 단독 부담부증여 vs 분산 부담부증여', () => {
  it('기본값: 배우자(9억·채무 3억) 증여세 0, 자녀배우자 46,560,000, 자녀2(30세) 38,800,000', () => {
    // 자녀배우자: 순증여 3억−1천만 = 2.9억×20%−1천만 = 4,800만×0.97 = 46,560,000
    // 자녀2: 3억−5천만 = 2.5억×20%−1천만 = 4,000만×0.97 = 38,800,000
    // 취득세 배우자: 3억×1.1% + 6억×12.4% = 77,700,000 / 자녀배우자: 1.5억×1.1% + 3억×12.4% = 38,850,000
    const r = S.runScenario10(def(10));
    const [sp, cs, c2] = r.case2.recipients;
    expect(sp.giftTax).toBe(0);
    expect(cs.giftTax).toBe(46_560_000);
    expect(c2.giftTax).toBe(38_800_000);
    expect(sp.acqTax).toBe(77_700_000);
    expect(cs.acqTax).toBe(38_850_000);
    expect(r.summary.case1GrandTotal).toBe(439_671_000);
    expect(r.summary.case2GrandTotal).toBe(167_871_000 + 85_360_000 + 155_400_000);
    // 보유세: 배우자 50% 다주택 안분 1,965,600 + 별도세대 자녀측 25%×2 × 2,759,400 = 1,379,700
    near(r.holdingTax.afterCase2.recipientTotal, 3_345_300, 1);
  });

  it('변형: 비조정지역 → 취득세 배우자 26,100,000 · 자녀측 각 13,050,000', () => {
    const r = S.runScenario10(def(10, { heavy: 0 }));
    expect(r.case2.recipients[0].acqTax).toBe(26_100_000);
    expect(r.case2.recipients[1].acqTax).toBe(13_050_000);
    expect(r.case2.recipientAcqTax).toBe(52_200_000);
  });
});
