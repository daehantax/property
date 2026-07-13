/**
 * 중과세율 판정기 — 주택수 산정 + 취득세·양도세 중과 판정
 * 기준: 2026.5.10 시행분
 *
 * 취득세 중과: 지방세법 §13의2, 시행령 §28의2~§28의6 (주택 유상취득 8%/12%)
 * 양도세 중과: 소득세법 §104⑦·§95②, 시행령 §167의3 (조정지역 다주택 +20/30%p, 장특공 배제)
 *   ※ 2026.5.10부터 조정대상지역 다주택 중과 부활
 * 종부세 중과: 2023년 개정으로 폐지(단일세율) — 판정 없음
 *
 * ─ 주택 객체 모델 ─────────────────────────────────
 *   {
 *     label:   표시 이름
 *     region:  'adjust'(조정대상지역) | 'nonadjust'(비조정지역)
 *     metro:   boolean  수도권·광역시·특별자치시(세종) 소재 여부 (양도세 3억 제외 판정)
 *     kind:    'house'(주택) | 'inway'(조합원입주권) | 'presale'(주택분양권) | 'officetel'(주거용 오피스텔)
 *     price:   시가표준액(취득세)·기준시가(양도세) [원]
 *     status:  'normal' | 'inherit'(상속개시 5년 이내) | 'rental'(장기임대 등록) | 'excluded'(기타 중과제외 특례)
 *     tempTwo: boolean  (거래 대상에만) 일시적 2주택 종전주택 여부
 *   }
 */

export const LOWCOST_ACQ_EXCLUDE = 100_000_000;   // 취득세 주택수 제외: 시가표준액 1억 이하
export const RURAL_TRANSFER_EXCLUDE = 300_000_000; // 양도세 주택수 제외: 비수도권 기준시가 3억 이하
export const INHERIT_EXCLUDE_YEARS = 5;

const KIND_LABEL = {
  house: '주택',
  inway: '조합원입주권',
  presale: '주택분양권',
  officetel: '주거용 오피스텔',
};

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;

/** 유상취득 일반세율(1~3%) — 6억↓1%, 6~9억 누진, 9억↑3% (지방세법 §11) */
export function generalAcqRate(price) {
  if (price <= 600_000_000) return { rate: 0.01, label: '1% (6억 이하)' };
  if (price <= 900_000_000) {
    const r = Math.round((price * (2 / 300_000_000) - 3) / 100 * 10000) / 10000;
    return { rate: r, label: `${(r * 100).toFixed(2)}% (6~9억 누진)` };
  }
  return { rate: 0.03, label: '3% (9억 초과)' };
}

/** 취득세 주택수 산정: 각 주택의 포함/제외 여부와 사유 */
export function acqCountable(p) {
  const name = `${p.label}(${KIND_LABEL[p.kind] ?? p.kind})`;
  if (p.status === 'excluded') {
    return { counted: false, reason: `${name}: 중과제외 특례주택(농어촌·문화재·노인복지주택 등) → 주택수 제외` };
  }
  if (p.status === 'inherit') {
    return { counted: false, reason: `${name}: 상속개시 5년 이내 상속주택 → 주택수 제외 (지방세법 시행령 §28의4④)` };
  }
  if ((p.kind === 'house' || p.kind === 'officetel') && p.price <= LOWCOST_ACQ_EXCLUDE) {
    return { counted: false, reason: `${name}: 시가표준액 1억원 이하 → 주택수 제외 (정비·사업시행구역 제외, 시행령 §28의4)` };
  }
  const dateNote = (p.kind === 'presale' || p.kind === 'officetel')
    ? ' (2020.8.12 이후 취득분만 산정)'
    : '';
  return { counted: true, reason: `${name}: 주택수 포함${dateNote}` };
}

/** 양도세 중과 주택수 산정: 각 주택의 포함/제외 여부와 사유 */
export function transferCountable(p) {
  const name = `${p.label}(${KIND_LABEL[p.kind] ?? p.kind})`;
  if (p.status === 'rental') {
    return { counted: false, reason: `${name}: 장기임대주택 등록(요건 충족 가정) → 중과 주택수 제외 (시행령 §167의3①)` };
  }
  if (p.status === 'excluded') {
    return { counted: false, reason: `${name}: 중과제외 주택(감면대상 신축·문화재 등) → 중과 주택수 제외` };
  }
  if (p.status === 'inherit') {
    return { counted: false, reason: `${name}: 상속주택 5년 이내 → 중과 주택수 제외 (시행령 §167의3①7)` };
  }
  if (!p.metro && p.price <= RURAL_TRANSFER_EXCLUDE) {
    return { counted: false, reason: `${name}: 수도권·광역시·특별자치시 외 지역이고 기준시가 3억원 이하 → 중과 주택수 제외 (시행령 §167의3①8의2)` };
  }
  const dateNote = p.kind === 'presale' ? ' (2021.1.1 이후 취득 분양권)' : '';
  return { counted: true, reason: `${name}: 중과 주택수 포함${dateNote}` };
}

/**
 * 취득세 중과 판정 — 취득 대상 주택 소재지 조정 여부 + 취득 후 세대 주택수
 * @param {object} p { target, others, isLegalEntity }
 * @returns {{ houseCount, included, excluded, region, isTemp, rate, rateLabel, heavy, reasons }}
 */
export function judgeAcquisitionHeavy({ target, others = [], isLegalEntity = false }) {
  const included = [];
  const excluded = [];
  for (const p of others) {
    const c = acqCountable(p);
    (c.counted ? included : excluded).push(c.reason);
  }
  // 취득 대상은 취득 후 세대 주택수에 포함
  const houseCount = included.length + 1;
  const region = target.region;
  const regionLabel = region === 'adjust' ? '조정대상지역' : '비조정지역';
  const reasons = [];

  let rate, rateLabel, heavy = false;

  if (isLegalEntity) {
    rate = 0.12; rateLabel = '법인 취득 12% 중과 (주택수 무관, 지방세법 §13의2①)';
    heavy = true;
    reasons.push('법인의 주택 유상취득은 주택수와 무관하게 12% 중과');
  } else if (houseCount <= 1) {
    const g = generalAcqRate(target.price);
    rate = g.rate; rateLabel = `1주택 일반세율 ${g.label}`;
    reasons.push(`취득 후 세대 주택수 1주택 → 일반세율 (${g.label})`);
  } else if (houseCount === 2) {
    if (target.tempTwo) {
      const g = generalAcqRate(target.price);
      rate = g.rate; rateLabel = `일시적 2주택 → 일반세율 ${g.label}`;
      reasons.push('일시적 2주택(종전주택 처분기한 내) → 중과 배제, 일반세율 적용');
    } else if (region === 'adjust') {
      rate = 0.08; rateLabel = '조정지역 2주택 8% 중과';
      heavy = true;
      reasons.push(`${regionLabel} 2주택 → 8% 중과 (지방세법 §13의2①)`);
    } else {
      const g = generalAcqRate(target.price);
      rate = g.rate; rateLabel = `비조정 2주택 일반세율 ${g.label}`;
      reasons.push('비조정지역 2주택 → 중과 없음, 일반세율');
    }
  } else if (houseCount === 3) {
    if (region === 'adjust') { rate = 0.12; rateLabel = '조정지역 3주택 12% 중과'; }
    else { rate = 0.08; rateLabel = '비조정 3주택 8% 중과'; }
    heavy = true;
    reasons.push(`${regionLabel} 3주택 → ${region === 'adjust' ? '12%' : '8%'} 중과`);
  } else {
    rate = 0.12; rateLabel = `${houseCount}주택 12% 중과`;
    heavy = true;
    reasons.push(`4주택 이상 → 12% 중과 (조정·비조정 공통)`);
  }

  return {
    tax: '취득세',
    houseCount, region, regionLabel, isTemp: !!target.tempTwo,
    included, excluded,
    rate, rateLabel, heavy,
    note: '지방교육세·농어촌특별세는 별도. 증여취득은 별도 기준(조정지역 공시 3억↑ → 12%).',
    reasons,
    lawRef: ['지방세법 §13의2(주택 유상취득 중과)', '지방세법 시행령 §28의2~§28의6(주택수 산정)'],
  };
}

/**
 * 양도세 중과 판정 — 양도 대상 조정지역 여부 + 1세대 중과 주택수
 * @param {object} p { target, others }
 * @returns {{ houseCount, included, excluded, isHeavy, surcharge, ltdExcluded, reasons }}
 */
export function judgeTransferHeavy({ target, others = [] }) {
  const included = [];
  const excluded = [];
  const all = [{ ...target, label: `${target.label} [양도 대상]` }, ...others];
  for (const p of all) {
    const c = transferCountable(p);
    (c.counted ? included : excluded).push(c.reason);
  }
  const houseCount = included.length;
  const region = target.region;
  const regionLabel = region === 'adjust' ? '조정대상지역' : '비조정지역';
  const reasons = [];

  // 중과 배제 사유 (양도 대상 자체가 특례)
  let excludedByTarget = null;
  if (target.tempTwo) excludedByTarget = '일시적 2주택 종전주택 양도 → 중과 배제(및 비과세 검토 대상)';
  else if (target.status === 'rental') excludedByTarget = '양도 대상이 장기임대주택 → 중과 배제';
  else if (target.status === 'inherit') excludedByTarget = '양도 대상이 상속주택(5년 이내) → 중과 배제';
  else if (target.status === 'excluded') excludedByTarget = '양도 대상이 중과제외 주택 → 중과 배제';

  let isHeavy = false;
  let surcharge = 0;
  let ltdExcluded = false;

  if (region !== 'adjust') {
    reasons.push(`${regionLabel} 소재 주택 양도 → 다주택 중과 없음 (기본세율 + 장기보유특별공제 적용)`);
  } else if (excludedByTarget) {
    reasons.push(`조정대상지역이나 ${excludedByTarget}`);
  } else if (houseCount >= 3) {
    isHeavy = true; surcharge = 0.30; ltdExcluded = true;
    reasons.push(`조정대상지역 + 1세대 ${houseCount}주택(3주택 이상) → 기본세율 +30%p 중과, 장기보유특별공제 배제 (소득세법 §104⑦·§95②)`);
  } else if (houseCount === 2) {
    isHeavy = true; surcharge = 0.20; ltdExcluded = true;
    reasons.push(`조정대상지역 + 1세대 2주택 → 기본세율 +20%p 중과, 장기보유특별공제 배제`);
  } else {
    reasons.push(`1세대 1주택(중과 주택수 기준) → 중과 없음 (비과세·장특공 별도 판정)`);
  }

  return {
    tax: '양도소득세',
    houseCount, region, regionLabel,
    included, excluded,
    isHeavy, surcharge, ltdExcluded,
    note: '2026.5.10부터 조정대상지역 다주택 중과 부활. 중과 시 장기보유특별공제 배제.',
    reasons,
    lawRef: ['소득세법 §104⑦(다주택 중과세율)', '소득세법 §95②(장특공 배제)', '소득세법 시행령 §167의3(중과 주택수·제외)'],
  };
}

/** 종부세 중과 안내 (현행 폐지) */
export function jongbuNote() {
  return {
    tax: '종합부동산세',
    heavy: false,
    note: '2023년 개정으로 다주택 중과세율(1.2~6.0%)이 폐지되어 현재는 조정지역·주택수와 무관하게 단일 기본세율(0.5~2.7%)이 적용됩니다. 별도 중과 판정이 없습니다.',
    lawRef: ['종합부동산세법 §9(세율, 2023년 중과 폐지)'],
  };
}

/**
 * 통합 판정: 거래 유형에 맞춰 취득세 또는 양도세 중과를 판정한다.
 * @param {object} input { txType:'acquire'|'transfer', target, others, isLegalEntity }
 */
export function judgeHeavyTax({ txType, target, others = [], isLegalEntity = false }) {
  if (txType === 'acquire') {
    return { primary: judgeAcquisitionHeavy({ target, others, isLegalEntity }), jongbu: jongbuNote() };
  }
  return { primary: judgeTransferHeavy({ target, others }), jongbu: jongbuNote() };
}

export { KIND_LABEL, won };
