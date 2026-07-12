/**
 * 계산 내역 결정적 포매터
 *
 * 계산 엔진이 반환한 결과 객체(세액 + breakdown)를 사람이 읽는
 * 단계별 계산 내역(마크다운)으로 변환한다. AI가 숫자를 새로 만들지 않고
 * 엔진 산출값을 그대로 제시하도록, 이 텍스트를 보고서에 근거로 전달한다.
 *
 * 시나리오는 결과 객체에 computations 배열을 담는다:
 *   computations: [{ caseNo, label, kind, result }, ...]
 *     kind: 'gift'      → calcGiveTax 반환값
 *           'acq'       → calcTakingTax / calcGiveTakingEtcTax 반환값
 *           'burdenAcq' → calcBurdenedGiveTakingTax 반환값
 *           'transfer'  → calcSaleIncomeTax 반환값
 */

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const pct = (r) => `${+(r * 100).toFixed(2)}%`;

/** 증여세 단계 */
function giftSteps(result) {
  const b = result.breakdown;
  const lines = [
    `- 증여재산가액: ${won(b.giftPrice)}`,
    `- 증여재산공제: △${won(b.deduct)}`,
    `- 과세표준: ${won(b.taxBase)}`,
    `- 산출세액: ${won(b.taxBase)} × ${pct(b.taxRate)} − ${won(b.accDeduct)}(누진공제) = ${won(b.rawTax)}`,
  ];
  if (b.skipRate > 0) {
    lines.push(`- 세대생략 할증(${pct(b.skipRate)}) 가산`);
  }
  lines.push(`- 신고세액공제(3%) 반영 → **납부세액: ${won(result.tax)}**`);
  return lines;
}

/** 취득세 단계 (일반 증여취득) */
function acqSteps(result) {
  const b = result.breakdown;
  const lines = [
    `- 과세표준: ${won(b.price)}`,
    `- 취득세율 ${pct(b.takeRate)} → ${won(result.takeTax)}`,
    `- 지방교육세 ${pct(b.eduRate)} → ${won(result.eduTax)}`,
  ];
  if (result.agTax > 0) {
    lines.push(`- 농어촌특별세 ${pct(b.agRate)} → ${won(result.agTax)}`);
  } else {
    lines.push('- 농어촌특별세: 비과세 (국민주택규모 85㎡ 이하)');
  }
  lines.push(`- **취득세 합계: ${won(result.total)}**`);
  return lines;
}

/** 부담부증여 취득세 단계 (유상분·무상분 구분) */
function burdenAcqSteps(result) {
  const on = result.breakdown.onerous;
  const gr = result.breakdown.gratuitous;
  return [
    `- 유상분(승계채무, 매매세율): 과세표준 ${won(on.price)} × ${pct(on.takeRate)} (+지방교육세)`,
    `- 무상분(시가−채무, 증여세율): 과세표준 ${won(gr.price)} × ${pct(gr.takeRate)} (+지방교육세)`,
    `- **취득세 합계: ${won(result.total)}** (유상·무상 구분 과세, 지방세법 §7⑪·⑫)`,
  ];
}

/** 양도소득세 단계 */
function transferSteps(result) {
  const b = result.breakdown;
  const lines = [
    `- 양도가액: ${won(b.marketPrice)}`,
    `- 취득가액(필요경비): △${won(b.basePrice)}`,
    `- 양도차익: ${won(b.transferIncome)}`,
  ];
  const heavyApplied = b.r2 > 0 && b.appliedR === b.r2;
  if (heavyApplied) {
    lines.push('- 장기보유특별공제: **배제** (조정대상지역 다주택 중과 대상, 소득세법 §95②)');
    lines.push(`- 과세표준: ${won(b.heavyIncome)} (양도차익 − 기본공제 250만원)`);
    lines.push(`- 적용세율: 기본세율 + 중과 가산 = ${pct(b.appliedR)}`);
  } else {
    if (b.totalDeductRate > 0) {
      lines.push(`- 장기보유특별공제: ${b.totalDeductRate}% 적용`);
    }
    lines.push(`- 과세표준: ${won(b.incomeFinal)} (양도차익 − 장특공제 − 기본공제 250만원)`);
    lines.push(`- 적용세율: ${pct(b.appliedR)}`);
  }
  lines.push(`- **양도소득세: ${won(result.transferTax)}**, 지방소득세(10%): ${won(result.localTax)}`);
  lines.push(`- **합계: ${won(result.total)}**`);
  return lines;
}

const STEP_FN = {
  gift: giftSteps,
  acq: acqSteps,
  burdenAcq: burdenAcqSteps,
  transfer: transferSteps,
};

const KIND_TITLE = {
  gift: '증여세',
  acq: '취득세',
  burdenAcq: '취득세(부담부증여)',
  transfer: '양도소득세',
};

/**
 * computations 배열을 "세금 계산 내역" 마크다운으로 렌더링.
 * @returns {string} 마크다운 (computations가 없으면 빈 문자열)
 */
export function renderCalcSteps(computations) {
  if (!Array.isArray(computations) || computations.length === 0) return '';

  // caseNo별 그룹화 (등장 순서 유지)
  const groups = new Map();
  for (const comp of computations) {
    const key = comp.caseNo ?? 0;
    if (!groups.has(key)) groups.set(key, { label: comp.caseLabel, items: [] });
    groups.get(key).items.push(comp);
  }

  const out = ['### 세금 계산 내역'];
  for (const [, group] of groups) {
    if (group.label) out.push('', `#### ${group.label}`);
    for (const comp of group.items) {
      const fn = STEP_FN[comp.kind];
      if (!fn) continue;
      out.push('', `**${comp.label ?? KIND_TITLE[comp.kind] ?? comp.kind}**`, ...fn(comp.result));
    }
  }
  return out.join('\n');
}
