/**
 * 취득세 계산기 엔진 — 세율 판정(중과 포함) + 취득세·지방교육세·농어촌특별세 세액
 *
 * 근거: 국세청 「2026 주택과 세금」 제1편 (책 27~59쪽) / 지방세법 §10~§13의3·§15·§151, 농어촌특별세법 §5
 *
 * 세율 요약 (책 31쪽 「다주택자 적용 세율」, 59쪽 「부가되는 세금의 세율」)
 *   유상(매매)  1주택 1~3% · 조정 2주택 8% · 조정 3주택↑ 12% · 비조정 3주택 8% · 비조정 4주택↑ 12% · 법인 12%
 *   증여        3.5% (조정지역 + 시가표준액 3억 이상 → 12%, 1세대1주택자의 배우자·직계존비속 증여는 제외)
 *   상속        2.8% (무주택 세대 1가구1주택 특례 0.8%)
 *   원시(신축)  2.8%
 *   고급주택    위 세율 + 8%p
 *   지방교육세  표준 1~3% → 세율의 1/10 · 8%/12% → 0.4% · 2.8% → 0.16% · 3.5% → 0.3%
 *   농특세      85㎡ 초과만: 표준·무상·원시 0.2% · 8% → 0.6% · 12% → 1.0% (고급주택 +0.8%p)
 *
 * 이 모듈은 calcTakingTax(시나리오 엔진용)와 별개다. 시나리오 계산 결과에는 영향을 주지 않는다.
 */

import {
  judgeAcquisitionHeavy, generalAcqRate,
  LOWCOST_ACQ_EXCLUDE, LOWCOST_ACQ_EXCLUDE_NONCAPITAL,
} from './heavy-tax-judge.js';

export const GIFT_HEAVY_OFFICIAL_PRICE = 300_000_000;  // 조정지역 무상취득 12% 기준: 시가표준액 3억 이상
export const LUXURY_ADD_RATE = 0.08;                   // 고급주택 가산: 중과기준세율 2% × 4배
export const TEMP_TWO_YEARS = 3;                       // 일시적 2주택 종전주택 처분기한 (2023.1.12~)

const CAUSE_LABEL = { buy: '매매(유상취득)', gift: '증여', inherit: '상속', build: '신축(원시취득)' };

/** 부동소수점 오차 제거용: 세율을 소수 6자리로 정리 */
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const pctText = (r) => `${(r * 100).toFixed(4).replace(/\.?0+$/, '')}%`;

/**
 * 세율 묶음 → 세액 계산
 * @param {number} base 과세표준 [원]
 * @param {{take:number, edu:number, ag:number}} rates 세율(소수)
 */
function amounts(base, rates) {
  const takeTax = Math.round(base * rates.take);
  const eduTax = Math.round(base * rates.edu);
  const agTax = Math.round(base * rates.ag);
  return { takeTax, eduTax, agTax, total: takeTax + eduTax + agTax };
}

/** 유상취득 표준세율(1~3%) 묶음 — 지방교육세는 세율의 1/10, 농특세 0.2% */
function standardBuyRates(fullPrice) {
  const g = generalAcqRate(fullPrice);
  return { take: g.rate, edu: r6(g.rate * 0.1), ag: 0.002, label: g.label };
}
/** 유상취득 중과세율 묶음 — 8%: 교육 0.4%·농특 0.6% / 12%: 교육 0.4%·농특 1.0% */
function heavyBuyRates(rate) {
  return rate >= 0.12 ? { take: 0.12, edu: 0.004, ag: 0.01 } : { take: 0.08, edu: 0.004, ag: 0.006 };
}

/**
 * 취득세 계산 (중과 판정 포함)
 *
 * @param {object} input
 * @param {'buy'|'gift'|'inherit'|'build'} input.cause 취득 원인
 * @param {'house'|'officetel'} [input.kind='house'] 취득 물건 (오피스텔은 매매만, 4%)
 * @param {number} input.fullPrice 주택 전체의 취득 당시 가액 [원]
 *        (매매=실거래가, 증여=시가인정액, 상속=시가표준액, 신축=공사비 등)
 * @param {number} [input.share=1] 취득 지분 (0~1). 과세표준 = fullPrice × share.
 *        6~9억 구간 세율은 지분이 아닌 주택 전체 가액으로 정한다 (지방세법 §11②).
 * @param {number} [input.officialPrice=fullPrice] 주택 전체 시가표준액(공시가격) [원]
 *        — 저가주택 중과제외(1억/2억)와 증여 12% 중과(3억) 판정에 쓴다.
 * @param {boolean} [input.over85=false] 전용면적 85㎡ 초과 여부 (초과 시 농특세 과세)
 * @param {'adjust'|'nonadjust'} [input.region='nonadjust'] 취득일 현재 조정대상지역 여부
 * @param {boolean} [input.capital=true] 수도권(서울·인천·경기) 소재 여부 — 저가주택 기준 1억/2억
 * @param {boolean} [input.contractBeforeDesignation=false] 조정대상지역 지정고시일 이전 매매계약(계약금 증빙) → 비조정으로 적용
 * @param {boolean} [input.isLegalEntity=false] 법인 취득
 * @param {boolean} [input.tempTwo=false] 일시적 2주택 (종전주택 3년 내 처분 조건)
 * @param {boolean} [input.inRedevZone=false] 정비구역·사업시행구역 소재 (저가주택 중과제외 불가)
 * @param {boolean} [input.otherExempt=false] 그 밖의 중과제외주택(농어촌주택·가정어린이집·지방 미분양 아파트 등)
 * @param {boolean} [input.luxury=false] 고급주택 (+8%p)
 * @param {boolean} [input.donorOneHouseFamily=false] (증여) 1세대1주택자인 배우자·직계존비속으로부터 취득
 * @param {boolean} [input.heirHouseless=false] (상속) 상속인 세대 전원 무주택 → 0.8% 특례
 * @param {object[]} [input.others=[]] 세대가 보유한 다른 주택 (heavy-tax-judge 주택 객체)
 */
export function calcAcquisitionTax(input) {
  const {
    cause, kind = 'house', fullPrice, share = 1, over85 = false,
    region: regionIn = 'nonadjust', capital = true, contractBeforeDesignation = false,
    isLegalEntity = false, tempTwo = false, inRedevZone = false, otherExempt = false,
    luxury = false, donorOneHouseFamily = false, heirHouseless = false, others = [],
  } = input;
  const officialPrice = input.officialPrice ?? fullPrice;
  const base = Math.round(fullPrice * share);
  const reasons = [];
  const warnings = [];
  const lawRef = new Set(['지방세법 §10~§10의5(과세표준)', '지방세법 §11(세율)', '지방세법 §151(지방교육세)', '농어촌특별세법 §5(농어촌특별세)']);

  let region = regionIn;
  let rates;                 // { take, edu, ag }
  let rateLabel = '';
  let heavy = false;
  let judge = null;          // 유상취득 주택수 판정 결과
  let tempTwoRisk = null;    // 일시적 2주택 추징 위험액
  let standardRates = null;  // 중과가 없었다면 적용될 세율 (추가 부담액 비교용)

  if (share < 1) {
    reasons.push(`지분 ${pctText(share)} 취득 → 과세표준은 지분가액, 주택수 판정은 1주택 취득으로 봄 (책 38쪽)`);
  }

  if (cause === 'buy' && kind === 'officetel') {
    // 오피스텔 자체의 취득은 주택 유상거래 세율이 아닌 4% (책 41쪽). 주택수·조정지역과 무관.
    rates = { take: 0.04, edu: 0.004, ag: 0.002 };
    rateLabel = '오피스텔 취득 4%';
    reasons.push('오피스텔 취득은 주택 유상거래 세율(1~3%)·다주택 중과 대상이 아니며 4% 적용 (책 41쪽)');
    reasons.push('오피스텔은 국민주택이 아니므로 면적과 무관하게 농어촌특별세 0.2% 과세');
    warnings.push('취득 후 주택분 재산세가 과세되는 주거용 오피스텔(시가표준액 1억 초과)은 이후 다른 주택을 살 때 주택수에 포함됩니다.');
  } else if (cause === 'buy') {
    lawRef.add('지방세법 §13의2(다주택·법인 중과)').add('지방세법 시행령 §28의2~§28의5(중과제외·주택수·일시적 2주택)');
    if (region === 'adjust' && contractBeforeDesignation) {
      region = 'nonadjust';
      reasons.push('조정대상지역 지정고시일 이전에 매매계약 체결(계약금 지급 증빙) → 비조정지역 취득으로 보아 세율 적용 (책 32쪽)');
    }
    const std = standardBuyRates(fullPrice);
    standardRates = std;
    const lowLimit = capital ? LOWCOST_ACQ_EXCLUDE : LOWCOST_ACQ_EXCLUDE_NONCAPITAL;
    const lowCost = officialPrice <= lowLimit;

    judge = judgeAcquisitionHeavy({
      target: { label: '취득주택', region, metro: capital, kind: 'house', price: fullPrice, tempTwo },
      others, isLegalEntity,
    });

    if (lowCost && !inRedevZone) {
      rates = std; rateLabel = `중과제외주택(저가) → 표준세율 ${std.label}`;
      reasons.push(`시가표준액 ${capital ? '1억원' : '2억원(수도권 외 지역)'} 이하 주택 → 중과제외주택, 주택수·법인 여부와 무관하게 표준세율 (책 33쪽)`);
      if (isLegalEntity) warnings.push('대도시(수도권 과밀억제권역)에 설립 5년 이내인 법인은 저가주택이라도 12%가 적용됩니다 (책 47쪽).');
    } else if (otherExempt) {
      rates = std; rateLabel = `중과제외주택 → 표준세율 ${std.label}`;
      reasons.push('그 밖의 중과제외주택(농어촌주택·가정어린이집·지방 준공 후 미분양 아파트 등) → 표준세율 (책 34~35쪽)');
      warnings.push('중과제외주택은 유형별 요건(면적·가액·취득기간·사후관리)을 충족해야 합니다. 요건을 반드시 확인하세요.');
    } else {
      if (lowCost && inRedevZone) reasons.push('시가표준액은 저가 기준 이하이나 정비구역·사업시행구역 소재 → 중과제외 불가 (책 33쪽)');
      reasons.push(...judge.reasons);
      if (judge.heavy) {
        heavy = true;
        rates = heavyBuyRates(judge.rate);
        rateLabel = judge.rateLabel;
      } else {
        rates = std; rateLabel = judge.rateLabel;
        // 일시적 2주택으로 표준세율을 적용받은 경우: 3년 내 종전주택 미처분 시 8% 추징
        if (tempTwo && judge.houseCount === 2 && region === 'adjust' && !isLegalEntity) {
          const hv = heavyBuyRates(0.08);
          const hvRates = { take: hv.take + (luxury ? LUXURY_ADD_RATE : 0), edu: hv.edu, ag: over85 ? hv.ag + (luxury ? 0.008 : 0) : 0 };
          tempTwoRisk = { years: TEMP_TWO_YEARS, heavyAmounts: amounts(base, hvRates) };
          warnings.push(`일시적 2주택: 신규주택 취득일부터 ${TEMP_TWO_YEARS}년 이내에 종전주택을 처분해야 합니다. 못 하면 8% 중과세율로 추징되며, 사유 발생일부터 60일 이내 신고·납부하면 가산세가 없습니다 (책 46쪽).`);
        }
      }
    }
    if (tempTwo && !tempTwoRisk && !(lowCost && !inRedevZone) && !otherExempt) {
      if (isLegalEntity) reasons.push('법인은 일시적 2주택 특례 대상이 아님');
      else if (judge.houseCount !== 2) reasons.push(`일시적 2주택 특례는 취득 후 2주택일 때만 적용 (현재 ${judge.houseCount}주택)`);
      else if (region !== 'adjust') reasons.push('비조정지역 2주택은 원래 표준세율이므로 일시적 2주택 특례가 필요 없음');
    }
  } else if (cause === 'gift') {
    lawRef.add('지방세법 §13의2②(조정대상지역 무상취득 중과)');
    const giftHeavy = region === 'adjust' && officialPrice >= GIFT_HEAVY_OFFICIAL_PRICE && !donorOneHouseFamily;
    standardRates = { take: 0.035, edu: 0.003, ag: 0.002 };
    if (giftHeavy) {
      heavy = true;
      rates = { take: 0.12, edu: 0.004, ag: 0.01 };
      rateLabel = '조정대상지역 증여취득 12% 중과';
      reasons.push('조정대상지역 + 주택 전체 시가표준액 3억원 이상 증여취득 → 12% 중과 (책 48쪽)');
      reasons.push('증여 중과는 받는 사람(수증자)의 주택수와 무관하며, 주는 사람(증여자) 세대의 주택수로 판단');
    } else {
      rates = standardRates;
      rateLabel = '증여취득 3.5%';
      if (region !== 'adjust') reasons.push('비조정지역 증여취득 → 3.5%');
      else if (donorOneHouseFamily) reasons.push('1세대1주택자가 소유한 주택을 배우자·직계존비속이 증여받는 경우 → 중과 제외, 3.5% (책 48쪽)');
      else reasons.push('조정대상지역이나 주택 전체 시가표준액 3억원 미만 → 3.5% (책 49쪽)');
    }
    if (region === 'adjust' && donorOneHouseFamily) {
      warnings.push('증여자 세대의 1세대1주택 판단에는 오피스텔·입주권·분양권과 시가표준액 1억 이하 주택도 주택수에 포함됩니다 (책 48쪽).');
    }
    warnings.push('증여취득의 과세표준은 시가인정액(매매사례가액·감정가액 등)입니다. 시가표준액 1억원 이하 주택은 시가인정액과 시가표준액 중 선택할 수 있습니다 (책 27~28쪽).');
  } else if (cause === 'inherit') {
    lawRef.add('지방세법 §15①2(상속 1가구 1주택 특례)');
    if (heirHouseless) {
      rates = { take: 0.008, edu: 0.0016, ag: 0 };
      rateLabel = '상속 1가구 1주택 특례 0.8%';
      reasons.push('무주택 세대가 주택을 상속 → 2.8%가 아닌 0.8% 특례 (책 30쪽), 농어촌특별세 없음');
      warnings.push('무주택 여부는 피상속인 사망일 기준이며, 상속인과 세대별 주민등록표에 함께 기재된 가족 모두가 무주택이어야 합니다.');
    } else {
      rates = { take: 0.028, edu: 0.0016, ag: 0.002 };
      rateLabel = '상속취득 2.8%';
      reasons.push('상속취득 → 2.8% (다주택 중과·조정지역 무상취득 중과 대상 아님)');
    }
    warnings.push('상속취득의 과세표준은 시가표준액(주택공시가격)입니다 (책 28쪽).');
  } else if (cause === 'build') {
    rates = { take: 0.028, edu: 0.0016, ag: 0.002 };
    rateLabel = '원시취득(신축) 2.8%';
    reasons.push('신축 등 원시취득 → 2.8%. 조합원입주권으로 준공 주택을 취득하는 경우도 원시취득으로 주택수와 무관하게 2.8% (책 46쪽)');
  } else {
    throw new Error(`알 수 없는 취득 원인: ${cause}`);
  }

  // 고급주택 가산 (+8%p) — 오피스텔 제외. 농특세는 가산분 8%의 10% = 0.8%p 추가.
  const withLuxury = (r) => (luxury && kind !== 'officetel'
    ? { take: r6(r.take + LUXURY_ADD_RATE), edu: r.edu, ag: r6(r.ag + 0.008) }
    : { take: r.take, edu: r.edu, ag: r.ag });
  if (luxury && kind !== 'officetel') {
    lawRef.add('지방세법 §13⑤(고급주택 중과)');
    reasons.push(`고급주택 → 취득세율에 8%p 가산 (${pctText(rates.take)} → ${pctText(rates.take + LUXURY_ADD_RATE)}) (책 49쪽)`);
    warnings.push('고급주택의 농어촌특별세(가산분 8% × 10% = 0.8%p 추가)는 법정 산식으로 계산한 값입니다. 신고 전 관할 지자체에 확인하세요.');
  }

  // 농특세: 국민주택규모(85㎡) 이하는 비과세. 오피스텔은 항상 과세.
  const applyArea = (r) => ({ take: r.take, edu: r.edu, ag: (over85 || kind === 'officetel') ? r.ag : 0 });
  const finalRates = applyArea(withLuxury(rates));
  const amt = amounts(base, finalRates);
  if (!over85 && kind !== 'officetel' && rates.ag > 0) reasons.push('전용면적 85㎡ 이하(국민주택규모) → 농어촌특별세 비과세');

  // 중과가 없었을 때와의 차이
  let heavyExtra = null;
  if (heavy && standardRates) {
    const stdAmt = amounts(base, applyArea(withLuxury(standardRates)));
    heavyExtra = { standardTotal: stdAmt.total, extra: amt.total - stdAmt.total };
  }
  if (tempTwoRisk) tempTwoRisk.extra = tempTwoRisk.heavyAmounts.total - amt.total;

  return {
    cause, causeLabel: CAUSE_LABEL[cause], kind, region,
    base, fullPrice, share, officialPrice, over85,
    rates: finalRates, rateLabel, heavy,
    totalRate: r6(finalRates.take + finalRates.edu + finalRates.ag),
    ...amt,
    heavyExtra, tempTwoRisk,
    houseCount: judge ? judge.houseCount : null,
    included: judge ? judge.included : [],
    excluded: judge ? judge.excluded : [],
    reasons, warnings,
    lawRef: [...lawRef],
  };
}
