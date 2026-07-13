import { describe, it, expect } from 'vitest';
import {
  judgeAcquisitionHeavy, judgeTransferHeavy, acqCountable, transferCountable,
  generalAcqRate, judgeHeavyTax,
} from '../../src/core/heavy-tax-judge.js';

const house = (label, o = {}) => ({
  label, region: 'adjust', metro: true, kind: 'house', price: 800_000_000, status: 'normal', ...o,
});

describe('generalAcqRate', () => {
  it('6억 이하 1%, 9억 초과 3%', () => {
    expect(generalAcqRate(500_000_000).rate).toBe(0.01);
    expect(generalAcqRate(1_000_000_000).rate).toBe(0.03);
  });
});

describe('취득세 주택수 산정', () => {
  it('시가표준액 1억 이하 주택은 주택수 제외', () => {
    expect(acqCountable(house('저가', { price: 90_000_000 })).counted).toBe(false);
  });
  it('상속 5년 이내 주택은 제외', () => {
    expect(acqCountable(house('상속', { status: 'inherit' })).counted).toBe(false);
  });
  it('일반 주택은 포함', () => {
    expect(acqCountable(house('일반')).counted).toBe(true);
  });
});

describe('judgeAcquisitionHeavy — 취득세 중과', () => {
  it('1주택 취득: 일반세율(중과 아님)', () => {
    const r = judgeAcquisitionHeavy({ target: house('신규', { price: 500_000_000 }), others: [] });
    expect(r.houseCount).toBe(1);
    expect(r.heavy).toBe(false);
    expect(r.rate).toBe(0.01);
  });

  it('조정지역 2주택: 8% 중과', () => {
    const r = judgeAcquisitionHeavy({ target: house('신규'), others: [house('기존')] });
    expect(r.houseCount).toBe(2);
    expect(r.rate).toBe(0.08);
    expect(r.heavy).toBe(true);
  });

  it('일시적 2주택: 중과 배제(일반세율)', () => {
    const r = judgeAcquisitionHeavy({ target: house('신규', { price: 500_000_000, tempTwo: true }), others: [house('종전')] });
    expect(r.rate).toBe(0.01);
    expect(r.heavy).toBe(false);
  });

  it('비조정 2주택: 중과 없음', () => {
    const r = judgeAcquisitionHeavy({
      target: house('신규', { region: 'nonadjust', price: 500_000_000 }),
      others: [house('기존', { region: 'nonadjust' })],
    });
    expect(r.rate).toBe(0.01);
    expect(r.heavy).toBe(false);
  });

  it('조정 3주택: 12% / 비조정 3주택: 8%', () => {
    const adj = judgeAcquisitionHeavy({ target: house('신규'), others: [house('a'), house('b')] });
    expect(adj.rate).toBe(0.12);
    const non = judgeAcquisitionHeavy({
      target: house('신규', { region: 'nonadjust' }),
      others: [house('a', { region: 'nonadjust' }), house('b', { region: 'nonadjust' })],
    });
    expect(non.rate).toBe(0.08);
  });

  it('4주택 이상: 12%', () => {
    const r = judgeAcquisitionHeavy({
      target: house('신규', { region: 'nonadjust' }),
      others: [house('a'), house('b'), house('c')],
    });
    expect(r.houseCount).toBe(4);
    expect(r.rate).toBe(0.12);
  });

  it('저가·상속주택은 주택수에서 빠져 세율이 낮아진다', () => {
    const r = judgeAcquisitionHeavy({
      target: house('신규'),
      others: [house('저가', { price: 80_000_000 }), house('상속', { status: 'inherit' })],
    });
    expect(r.houseCount).toBe(1); // 기존 2채가 모두 제외 → 취득 대상만
    expect(r.heavy).toBe(false);
    expect(r.excluded).toHaveLength(2);
  });

  it('법인은 주택수 무관 12%', () => {
    const r = judgeAcquisitionHeavy({ target: house('신규', { price: 500_000_000 }), others: [], isLegalEntity: true });
    expect(r.rate).toBe(0.12);
    expect(r.heavy).toBe(true);
  });
});

describe('양도세 중과 주택수 산정', () => {
  it('비수도권 3억 이하는 중과 주택수 제외', () => {
    expect(transferCountable(house('지방', { metro: false, price: 250_000_000 })).counted).toBe(false);
  });
  it('수도권은 3억 이하라도 포함', () => {
    expect(transferCountable(house('수도권', { metro: true, price: 250_000_000 })).counted).toBe(true);
  });
  it('임대등록 주택은 제외', () => {
    expect(transferCountable(house('임대', { status: 'rental' })).counted).toBe(false);
  });
});

describe('judgeTransferHeavy — 양도세 중과', () => {
  it('조정지역 2주택: +20%p 중과, 장특공 배제, heavyType=2주택 중과', () => {
    const r = judgeTransferHeavy({ target: house('양도'), others: [house('기존')] });
    expect(r.houseCount).toBe(2);
    expect(r.isHeavy).toBe(true);
    expect(r.surcharge).toBe(0.20);
    expect(r.ltdExcluded).toBe(true);
    expect(r.heavyType).toBe('2주택 중과');
  });

  it('조정지역 3주택: +30%p 중과, heavyType=3주택 이상 중과', () => {
    const r = judgeTransferHeavy({ target: house('양도'), others: [house('a'), house('b')] });
    expect(r.surcharge).toBe(0.30);
    expect(r.isHeavy).toBe(true);
    expect(r.heavyType).toBe('3주택 이상 중과');
  });

  it('비조정지역 양도: 중과 없음', () => {
    const r = judgeTransferHeavy({ target: house('양도', { region: 'nonadjust' }), others: [house('기존')] });
    expect(r.isHeavy).toBe(false);
    expect(r.surcharge).toBe(0);
  });

  it('일시적 2주택 종전주택 양도: 중과 배제', () => {
    const r = judgeTransferHeavy({ target: house('종전', { tempTwo: true }), others: [house('신규')] });
    expect(r.isHeavy).toBe(false);
  });

  it('지방 3억 이하 주택은 주택수에서 빠져 2주택→1주택으로 중과 해소', () => {
    const r = judgeTransferHeavy({
      target: house('양도'),
      others: [house('지방', { metro: false, price: 200_000_000 })],
    });
    expect(r.houseCount).toBe(1); // 양도 대상만 포함
    expect(r.isHeavy).toBe(false);
  });

  it('양도 대상이 임대주택이면 중과 배제', () => {
    const r = judgeTransferHeavy({ target: house('양도', { status: 'rental' }), others: [house('a'), house('b')] });
    expect(r.isHeavy).toBe(false);
  });
});

describe('judgeHeavyTax 통합', () => {
  it('취득/양도 유형에 맞는 판정 + 종부세 안내를 반환', () => {
    const acq = judgeHeavyTax({ txType: 'acquire', target: house('t'), others: [house('a')] });
    expect(acq.primary.tax).toBe('취득세');
    expect(acq.jongbu.heavy).toBe(false);
    const tr = judgeHeavyTax({ txType: 'transfer', target: house('t'), others: [house('a')] });
    expect(tr.primary.tax).toBe('양도소득세');
  });
});
