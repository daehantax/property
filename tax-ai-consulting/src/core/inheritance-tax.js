/**
 * 상속세 계산 모듈 (상세)
 * 기준: 상속세 및 증여세법 — 2026.1.1 시행 개정(법률 제21219호) 반영 현행법
 *   ※ 자녀공제 5억·최고세율 40% 인하·유산취득세 전환안은 국회 미통과 → 미반영
 *
 * 계산 순서 (상증세법 구조 그대로)
 *  1. 총상속재산가액   = 본래 상속재산(부동산·금융·기타) + 간주상속재산(보험금·퇴직금·신탁)
 *                        + 추정상속재산(§15 사용처 불분명 인출·채무)
 *  2. 비과세·불산입    − 금양임야·묘토(2억 한도)·문화유산 등(§12), 공익법인 출연(§16)
 *  3. 과세가액 공제    − 공과금·장례비(§14: 500만~1,000만 + 봉안 500만)·채무
 *  4. 사전증여재산     + 상속인 10년 / 비상속인 5년 이내 증여재산가액(§13)
 *     = 상속세 과세가액
 *  5. 상속공제         − (기초 2억 + 인적공제) vs 일괄 5억 중 큰 것(§18·§20·§21)
 *                        − 배우자상속공제 5억~30억(§19) − 금융재산(§22) − 동거주택(§23의2)
 *                        − 가업·영농(§18의2·§18의3) — 공제적용 한도(§24) 이내
 *                      − 감정평가수수료(§25, 500만 한도)
 *     = 과세표준 (50만원 미만이면 과세 안 함)
 *  6. 산출세액         = 과세표준 × 10~50% 누진세율(§26)
 *  7. 세대생략 할증    + 손자녀 등 상속분 비율 × 30%(미성년 20억 초과 40%)(§27)
 *  8. 세액공제         − 증여세액공제(§28, 한도) − 단기재상속 세액공제(§30) − 신고세액공제 3%(§69)
 *     = 납부할 상속세 → 상속인별 안분(받은 재산 비율, §3의2 연대납부)
 */

export const INH_BASIC_DEDUCT = 200_000_000;        // 기초공제 (§18)
export const INH_LUMP_DEDUCT = 500_000_000;         // 일괄공제 (§21)
export const INH_CHILD_DEDUCT = 50_000_000;         // 자녀 1인당 (§20①2)
export const INH_MINOR_PER_YEAR = 10_000_000;       // 미성년자: 19세까지 연수 × 1,000만 (§20①3)
export const INH_ELDER_DEDUCT = 50_000_000;         // 연로자(65세 이상, 배우자 제외) (§20①4)
export const INH_DISABLED_PER_YEAR = 10_000_000;    // 장애인: 기대여명 연수 × 1,000만 (§20①5)
export const INH_SPOUSE_MIN = 500_000_000;          // 배우자공제 최소 (§19④)
export const INH_SPOUSE_MAX = 3_000_000_000;        // 배우자공제 최대 (§19①)
export const INH_FIN_MAX = 200_000_000;             // 금융재산공제 한도 (§22)
export const INH_COHABIT_MAX = 600_000_000;         // 동거주택공제 한도 (§23의2)
export const INH_FUNERAL_MIN = 5_000_000;           // 장례비 최소 인정 (시행령 §9②)
export const INH_FUNERAL_MAX = 10_000_000;          // 장례비 한도
export const INH_ENSHRINE_MAX = 5_000_000;          // 봉안시설·자연장지 추가 한도
export const INH_GRAVE_LAND_MAX = 200_000_000;      // 금양임야·묘토 비과세 한도 (§12)
export const INH_APPRAISAL_FEE_MAX = 5_000_000;     // 감정평가수수료 공제 한도 (부동산)
export const INH_MIN_TAX_BASE = 500_000;            // 과세최저한 (§25②)
export const INH_REPORT_CREDIT = 0.03;              // 신고세액공제 3% (§69)
export const INH_PRIOR_GIFT_YEARS = { heir: 10, other: 5 };

/** 상속세·증여세 누진세율 (§26) */
export const INH_RATE_TABLE = [
  { upTo: 100_000_000, rate: 0.10, acc: 0 },
  { upTo: 500_000_000, rate: 0.20, acc: 10_000_000 },
  { upTo: 1_000_000_000, rate: 0.30, acc: 60_000_000 },
  { upTo: 3_000_000_000, rate: 0.40, acc: 160_000_000 },
  { upTo: Infinity, rate: 0.50, acc: 460_000_000 },
];

export const HEIR_RELATIONS = {
  spouse: '배우자',
  child: '자녀',
  grandchild: '손자녀(세대생략)',
  parent: '부모(직계존속)',
  sibling: '형제자매',
  other: '기타(비상속인 수유자 등)',
};

const LAW_REF = [
  '상속세및증여세법 §8~§10(간주상속재산 — 보험금·신탁·퇴직금)',
  '상속세및증여세법 §12·§16(비과세·공익법인 출연 과세가액 불산입)',
  '상속세및증여세법 §13(사전증여재산 가산 — 상속인 10년·비상속인 5년)',
  '상속세및증여세법 §14(공과금·장례비용·채무 공제)',
  '상속세및증여세법 §15(추정상속재산 — 1년 2억·2년 5억)',
  '상속세및증여세법 §18~§21(기초·인적·일괄공제)',
  '상속세및증여세법 §19(배우자상속공제 5억~30억)',
  '상속세및증여세법 §22(금융재산 상속공제)·§23의2(동거주택 상속공제)',
  '상속세및증여세법 §24(공제적용의 한도)·§25(과세표준·감정평가수수료)',
  '상속세및증여세법 §26(세율)·§27(세대생략 할증)·§28(증여세액공제)·§30(단기재상속)',
  '상속세및증여세법 §67·§69(신고기한 6개월·신고세액공제 3%)',
  '상속세및증여세법 §71·§72(연부연납 10년)·국세징수법상 분납(1천만원 초과)',
];

const n = (v) => Math.max(Number(v) || 0, 0);
const floor = (v) => Math.floor(v);

/** 상속세 산출세액 (과세표준 → 세액) */
export function inheritRawTax(taxBase) {
  const b = n(taxBase);
  const row = INH_RATE_TABLE.find((r) => b <= r.upTo);
  return { tax: Math.max(floor(b * row.rate - row.acc), 0), rate: row.rate, acc: row.acc };
}

/**
 * 추정상속재산 (§15) — 사망 전 1년 2억 / 2년 5억 이상 인출(처분·채무부담) 중 용도 불분명액
 * 추정액 = 용도 불분명액 − min(인출액 × 20%, 2억)
 */
export function presumedAsset({ withdrawn = 0, unexplained = 0 }, threshold) {
  const w = n(withdrawn);
  const u = Math.min(n(unexplained), w);
  if (w < threshold) return { amount: 0, applies: false, exempt: 0 };
  const exempt = Math.min(w * 0.2, 200_000_000);
  return { amount: Math.max(u - exempt, 0), applies: true, exempt };
}

/** 장례비 공제 (§14①2, 시행령 §9②) */
export function funeralDeduct(funeral = 0, enshrine = 0) {
  const base = Math.min(Math.max(n(funeral), INH_FUNERAL_MIN), INH_FUNERAL_MAX);
  return base + Math.min(n(enshrine), INH_ENSHRINE_MAX);
}

/** 금융재산 상속공제 (§22) — 순금융재산 기준 */
export function financialDeduct(netFinancial) {
  const f = n(netFinancial);
  if (f <= 20_000_000) return f;
  if (f <= 100_000_000) return 20_000_000;
  return Math.min(f * 0.2, INH_FIN_MAX);
}

/**
 * 법정상속분 (민법 §1009) — 배우자 1.5 : 직계비속 각 1
 * 직계비속이 없으면 직계존속과 공동(배우자 1.5 : 존속 각 1), 둘 다 없으면 배우자 단독.
 * 배우자도 없으면 그 순위 상속인끼리 균분. 손자녀(세대생략)·기타 수유자는 법정지분 계산 제외.
 * @returns {Map<number, number>} heir index → 지분(0~1)
 */
export function legalShares(heirs) {
  const idx = (rel) => heirs.map((h, i) => (h.relation === rel ? i : -1)).filter((i) => i >= 0);
  const spouse = idx('spouse');
  let order = idx('child');
  if (!order.length) order = idx('parent');
  if (!order.length) order = idx('sibling');
  const out = new Map();
  const units = (spouse.length ? 1.5 : 0) + order.length;
  if (!units) return out;
  for (const i of spouse) out.set(i, 1.5 / units);
  for (const i of order) out.set(i, 1 / units);
  return out;
}

/**
 * 상속세 계산
 *
 * @param {object} p
 * @param {string} [p.deathDate]        상속개시일(사망일) YYYY-MM-DD — 신고기한 계산
 * @param {boolean} [p.abroad]          피상속인·상속인 전원 국외 거주 (신고기한 9개월)
 * @param {object} p.assets             { realEstate, financial, other, insurance, retirement, trust }
 * @param {object} [p.presumed]         { y1: { withdrawn, unexplained }, y2: { withdrawn, unexplained } }
 *    - y2 는 사망 전 2년 누계(1년분 포함). 추정액 = max(1년 기준, 2년 기준)
 * @param {object} [p.exclusions]       { graveLand, cultural, publicDonation }
 * @param {object} [p.liabilities]      { publicCharges, funeral, enshrine, debts, financialDebts }
 * @param {object} [p.priorGifts]       { toHeirs, toOthers, heirGiftTaxBase, giftTaxPaid,
 *                                        spouseGiftTaxBase }
 *    - toHeirs/toOthers   : 사전증여재산가액 (상속인 10년 / 비상속인 5년)
 *    - heirGiftTaxBase    : 가산한 사전증여의 증여세 과세표준 합계 (공제한도·증여세액공제 한도용)
 *    - giftTaxPaid        : 가산한 사전증여의 증여세 산출세액 합계 (증여세액공제)
 *    - spouseGiftTaxBase  : 배우자 사전증여 과세표준 (배우자공제 한도 차감)
 * @param {Array}  p.heirs              [{ name, relation, age, disabledYears, amount, priorGift }]
 *    - amount: 실제 상속받는 재산가액(사전증여 제외, 채무 승계 차감 후). 비우면(0) 법정상속분으로 배분
 *    - priorGift: 그 상속인이 받은 사전증여재산(가산분) — 상속인별 세액 안분에만 사용
 * @param {object} [p.options]          {
 *      spouseActual          배우자 실제 상속액 (비우면 heirs 의 배우자 amount → 없으면 법정한도)
 *      cohabitHouse          동거주택 가액(담보채무 차감 후) — 요건 충족 시만 입력
 *      businessDeduct        가업상속공제액 (직접 입력, §18의2)
 *      farmingDeduct         영농상속공제액 (직접 입력, §18의3)
 *      appraisalFee          부동산 감정평가수수료
 *      bequestToOthers       상속인 아닌 자에게 유증·사인증여한 재산 (§24 한도 차감)
 *      renouncedToNext       선순위 상속인 상속포기로 후순위가 받은 재산 (§24 한도 차감)
 *      shortReinheritCredit  단기재상속 세액공제액 (직접 입력, §30)
 *      foreignTaxCredit      외국납부세액공제 (직접 입력, §29)
 *      reportOnTime          기한 내 신고 (신고세액공제 3%) — 기본 true
 *      noReturn              무신고 (기초+인적 대신 일괄공제 5억만 적용, §21①단서)
 *    }
 */
export function calcInheritanceTax(p) {
  const a = p.assets ?? {};
  const pr = p.presumed ?? {};
  const ex = p.exclusions ?? {};
  const li = p.liabilities ?? {};
  const pg = p.priorGifts ?? {};
  const o = p.options ?? {};
  const heirs = (p.heirs ?? []).map((h, i) => ({
    name: h.name || `${HEIR_RELATIONS[h.relation] ?? '상속인'} ${i + 1}`,
    relation: h.relation ?? 'child',
    age: n(h.age),
    disabledYears: n(h.disabledYears),
    amount: n(h.amount),
    priorGift: n(h.priorGift),
  }));
  const reportOnTime = o.reportOnTime !== false;
  const notes = [];
  const steps = [];

  // ── 1. 총상속재산가액 ──
  const ownAssets = n(a.realEstate) + n(a.financial) + n(a.other);
  const deemed = n(a.insurance) + n(a.retirement) + n(a.trust);
  const p1 = presumedAsset(pr.y1 ?? {}, 200_000_000);
  const p2 = presumedAsset(pr.y2 ?? {}, 500_000_000);
  // 2년 기준은 1년분을 포함한 누계 — 두 기준 중 큰 금액을 추정액으로 본다(중복 가산 방지)
  const presumedTotal = Math.max(p1.amount, p2.amount);
  const grossEstate = ownAssets + deemed + presumedTotal;
  // 항목별로 보여 준 뒤 소계 — 입력값과 대조할 수 있게
  const assetRows = [
    ['부동산', a.realEstate, '§7'], ['금융재산 (예금·주식·채권 등)', a.financial, '§7'], ['기타 재산', a.other, '§7'],
  ].filter(([, v]) => n(v) > 0);
  for (const [label, v, law] of assetRows) steps.push({ group: '상속재산', label: `　${label}`, amount: n(v), law });
  steps.push({ group: '상속재산', label: '본래 상속재산 소계', amount: ownAssets, law: '§7', subtotal: true });
  const deemedRows = [
    ['간주 — 보험금', a.insurance, '§8'], ['간주 — 신탁재산', a.trust, '§9'], ['간주 — 퇴직금·퇴직수당', a.retirement, '§10'],
  ].filter(([, v]) => n(v) > 0);
  for (const [label, v, law] of deemedRows) steps.push({ group: '상속재산', label: `　${label}`, amount: n(v), law });
  if (deemedRows.length > 1) steps.push({ group: '상속재산', label: '간주상속재산 소계', amount: deemed, law: '§8~§10', subtotal: true });
  if (presumedTotal) {
    steps.push({ group: '상속재산', label: '추정상속재산 (용도 불분명 인출)', amount: presumedTotal, law: '§15',
      detail: [p1.applies ? `1년 내 ${won(p1.amount)}` : null, p2.applies ? `2년 내 ${won(p2.amount)}` : null].filter(Boolean).join(' · ') });
  }
  if ((n(pr.y1?.withdrawn) && !p1.applies) || (n(pr.y2?.withdrawn) && !p2.applies)) {
    notes.push('사망 전 인출액이 1년 2억·2년 5억 미만인 구간은 추정상속재산 대상이 아닙니다(단, 과세관청이 상속재산임을 입증하면 과세).');
  }
  steps.push({ group: '상속재산', label: '총상속재산가액', amount: grossEstate, total: true });

  // ── 2. 비과세·과세가액 불산입 ──
  const graveLand = Math.min(n(ex.graveLand), INH_GRAVE_LAND_MAX);
  const nonTaxable = graveLand + n(ex.cultural);
  const publicDonation = n(ex.publicDonation);
  if (nonTaxable) steps.push({ group: '차감', label: '비과세 (금양임야·묘토 2억 한도·문화유산 등)', amount: -nonTaxable, law: '§12' });
  if (publicDonation) steps.push({ group: '차감', label: '공익법인 출연재산 (과세가액 불산입)', amount: -publicDonation, law: '§16' });

  // ── 3. 공과금·장례비·채무 ──
  const publicCharges = n(li.publicCharges);
  const funeral = funeralDeduct(li.funeral, li.enshrine);
  const debts = n(li.debts) + n(li.financialDebts);
  steps.push({ group: '차감', label: '공과금', amount: -publicCharges, law: '§14①1', hide: !publicCharges });
  steps.push({ group: '차감', label: '장례비용 (최소 500만·한도 1,000만 + 봉안 500만)', amount: -funeral, law: '§14①2' });
  steps.push({ group: '차감', label: '채무 (금융채무 포함)', amount: -debts, law: '§14①3', hide: !debts });

  // ── 4. 사전증여재산 가산 ──
  const priorHeirs = n(pg.toHeirs);
  const priorOthers = n(pg.toOthers);
  if (priorHeirs) steps.push({ group: '가산', label: '사전증여재산 — 상속인 (10년 이내)', amount: priorHeirs, law: '§13①1' });
  if (priorOthers) steps.push({ group: '가산', label: '사전증여재산 — 비상속인 (5년 이내)', amount: priorOthers, law: '§13①2' });

  const taxableValue = Math.max(grossEstate - nonTaxable - publicDonation - publicCharges - funeral - debts, 0) + priorHeirs + priorOthers;
  steps.push({ group: '과세가액', label: '상속세 과세가액', amount: taxableValue, total: true });
  if (grossEstate - nonTaxable - publicDonation - publicCharges - funeral - debts < 0) {
    notes.push('채무 등이 상속재산을 초과합니다 — 초과분은 사전증여재산에서 차감되지 않습니다(과세가액 0원 하한 후 사전증여 가산). 상속포기·한정승인을 검토하세요.');
  }

  // ── 5. 상속공제 ──
  const hasSpouse = heirs.some((h) => h.relation === 'spouse');
  const nonSpouseHeirs = heirs.filter((h) => !['spouse', 'other'].includes(h.relation));
  const spouseOnly = hasSpouse && nonSpouseHeirs.length === 0;

  // 5-1. 인적공제 (§20) — 자녀·미성년·연로·장애
  const personal = [];
  for (const h of heirs) {
    if (h.relation === 'other') continue;
    if (h.relation === 'child') personal.push({ who: h.name, kind: '자녀공제', amount: INH_CHILD_DEDUCT });
    if (h.relation !== 'spouse' && h.age > 0 && h.age < 19) {
      personal.push({ who: h.name, kind: `미성년자공제 (${19 - h.age}년 × 1,000만)`, amount: (19 - h.age) * INH_MINOR_PER_YEAR });
    }
    if (h.relation !== 'spouse' && h.age >= 65) personal.push({ who: h.name, kind: '연로자공제 (65세 이상)', amount: INH_ELDER_DEDUCT });
    if (h.disabledYears > 0) {
      personal.push({ who: h.name, kind: `장애인공제 (기대여명 ${h.disabledYears}년 × 1,000만)`, amount: h.disabledYears * INH_DISABLED_PER_YEAR });
    }
  }
  const personalSum = personal.reduce((s, x) => s + x.amount, 0);
  const basicPlusPersonal = INH_BASIC_DEDUCT + personalSum;
  let lumpChoice;
  let basicDeduct;
  if (spouseOnly) {
    basicDeduct = basicPlusPersonal;
    lumpChoice = '배우자 단독상속 → 일괄공제 불가, 기초공제 + 인적공제 적용 (§21②)';
  } else if (basicPlusPersonal >= INH_LUMP_DEDUCT) {
    basicDeduct = basicPlusPersonal;
    lumpChoice = `기초 2억 + 인적공제 ${won(personalSum)} = ${won(basicPlusPersonal)} ≥ 일괄공제 5억 → 기초+인적 선택`;
  } else {
    basicDeduct = INH_LUMP_DEDUCT;
    lumpChoice = `기초 2억 + 인적공제 ${won(personalSum)} = ${won(basicPlusPersonal)} < 5억 → 일괄공제 5억 선택`;
  }
  if (o.noReturn && !spouseOnly && basicDeduct !== INH_LUMP_DEDUCT) {
    // 무신고 시 일괄공제 5억만 적용 (§21①단서)
    basicDeduct = INH_LUMP_DEDUCT;
    lumpChoice = '무신고 → 일괄공제 5억만 적용 (§21①단서)';
  }

  // 5-2. 배우자상속공제 (§19)
  const shares = legalShares(heirs);
  const spouseIdx = heirs.findIndex((h) => h.relation === 'spouse');
  let spouseDeduct = 0;
  let spouseDetail = '';
  let spouseLimit = 0;
  if (hasSpouse) {
    const legal = shares.get(spouseIdx) ?? 1;
    // 한도 = (총상속재산 − 비상속인 유증 + 상속인 사전증여 − 비과세·불산입 − 공과금·채무) × 법정상속분 − 배우자 사전증여 과세표준
    const limitBase = grossEstate - n(o.bequestToOthers) + priorHeirs - nonTaxable - publicDonation - publicCharges - debts;
    spouseLimit = Math.max(floor(limitBase * legal) - n(pg.spouseGiftTaxBase), 0);
    const actualInput = o.spouseActual != null && o.spouseActual !== '' ? n(o.spouseActual) : heirs[spouseIdx].amount;
    if (!actualInput) {
      spouseDeduct = Math.max(INH_SPOUSE_MIN, Math.min(spouseLimit, INH_SPOUSE_MAX));
      spouseDetail = `실제 상속액 미입력 → 법정상속분(${(legal * 100).toFixed(1)}%)만큼 상속받는 것으로 가정: 한도 ${won(spouseLimit)} (최소 5억·최대 30억)`;
    } else if (actualInput < INH_SPOUSE_MIN) {
      spouseDeduct = INH_SPOUSE_MIN;
      spouseDetail = `실제 상속액 ${won(actualInput)} < 5억 → 최소 5억 공제`;
    } else {
      spouseDeduct = Math.max(INH_SPOUSE_MIN, Math.min(actualInput, spouseLimit, INH_SPOUSE_MAX));
      spouseDetail = `min(실제 상속액 ${won(actualInput)}, 법정상속분 한도 ${won(spouseLimit)}, 30억) = ${won(spouseDeduct)}`;
    }
    notes.push('배우자상속공제(5억 초과분)는 상속세 신고기한 다음날부터 9개월 내 배우자 명의 등기·이전 등 재산분할을 마쳐야 합니다(§19②). 2026년부터 신청절차가 간소화되었습니다.');
  }

  // 5-3. 금융재산 (§22) — 금융회사 취급 예금·주식·채권 + 보험금·신탁재산 포함 (퇴직금은 제외)
  const financialAssets = n(a.financial) + n(a.insurance) + n(a.trust);
  const netFinancial = Math.max(financialAssets - n(li.financialDebts), 0);
  const finDeduct = financialDeduct(netFinancial);

  // 5-4. 동거주택 (§23의2)
  const cohabit = Math.min(n(o.cohabitHouse), INH_COHABIT_MAX);
  if (cohabit) notes.push('동거주택 상속공제 요건: 피상속인과 10년 이상 계속 동거 + 그 기간 1세대1주택 + 상속인이 무주택 직계비속(또는 직계비속의 배우자, 2022~)이어야 합니다.');

  // 5-5. 가업·영농 (직접 입력)
  const business = n(o.businessDeduct);
  const farming = n(o.farmingDeduct);
  if (business || farming) notes.push('가업·영농상속공제는 사후관리(가업 5년·영농 5년 유지, 고용·자산 처분 제한) 위반 시 추징됩니다. 2026.1.1 시행 개정으로 가업상속 대상 중견기업 매출 기준(4천억 미만)과 영농상속공제 한도가 확대되었으니 한도는 법령 원문으로 확인하세요.');

  const deductItems = [
    { label: '기초공제 + 인적공제 / 일괄공제', amount: basicDeduct, detail: lumpChoice, law: '§18·§20·§21' },
    { label: '배우자상속공제', amount: spouseDeduct, detail: spouseDetail, law: '§19', hide: !hasSpouse },
    { label: '금융재산 상속공제', amount: finDeduct, detail: `순금융재산 ${won(netFinancial)} = 금융재산·보험금·신탁 ${won(financialAssets)} − 금융채무 ${won(n(li.financialDebts))} (2천만 이하 전액 / 1억 이하 2천만 / 초과 20%·한도 2억)`, law: '§22', hide: !finDeduct },
    { label: '동거주택 상속공제', amount: cohabit, detail: '주택가액(담보채무 차감) 100%, 한도 6억', law: '§23의2', hide: !cohabit },
    { label: '가업상속공제', amount: business, law: '§18의2', hide: !business },
    { label: '영농상속공제', amount: farming, law: '§18의3', hide: !farming },
  ];
  const deductSum = deductItems.reduce((s, x) => s + x.amount, 0);

  // 5-6. 공제적용 한도 (§24)
  const priorGiftBaseForLimit = taxableValue > INH_LUMP_DEDUCT ? n(pg.heirGiftTaxBase) : 0;
  const deductLimit = Math.max(taxableValue - n(o.bequestToOthers) - n(o.renouncedToNext) - priorGiftBaseForLimit, 0);
  const deductApplied = Math.min(deductSum, deductLimit);
  if (deductApplied < deductSum) {
    notes.push(`상속공제 합계 ${won(deductSum)}가 공제적용 한도 ${won(deductLimit)}를 넘어 한도만큼만 공제됩니다 — 사전증여·유증·상속포기가 클수록 공제가 줄어듭니다(§24).`);
  }
  const appraisal = Math.min(n(o.appraisalFee), INH_APPRAISAL_FEE_MAX);

  // ── 6. 과세표준·산출세액 ──
  let taxBase = Math.max(taxableValue - deductApplied - appraisal, 0);
  if (taxBase < INH_MIN_TAX_BASE) taxBase = 0;
  const raw = inheritRawTax(taxBase);
  const computedTax = raw.tax;

  // 상속인별 배분액 (amount 미입력 시 법정상속분으로 순상속재산 배분)
  const netEstate = Math.max(taxableValue - priorHeirs - priorOthers, 0);
  const anyAmount = heirs.some((h) => h.amount > 0);
  const allocated = heirs.map((h, i) => {
    const share = anyAmount ? h.amount : floor(netEstate * (shares.get(i) ?? 0));
    return { ...h, received: share };
  });
  const receivedTotal = allocated.reduce((s, h) => s + h.received, 0) + priorHeirs + priorOthers;
  const allocBase = allocated.reduce((s, h) => s + h.received + h.priorGift, 0);

  // ── 7. 세대생략 할증 (§27) ──
  let skipSurcharge = 0;
  const skipRows = [];
  for (const h of allocated.filter((x) => x.relation === 'grandchild' && x.received > 0)) {
    const ratio = receivedTotal ? h.received / receivedTotal : 0;
    const rate = h.age > 0 && h.age < 19 && h.received > 2_000_000_000 ? 0.4 : 0.3;
    const add = floor(computedTax * ratio * rate);
    skipSurcharge += add;
    skipRows.push({ who: h.name, ratio, rate, add });
  }
  if (skipRows.length) notes.push('세대생략 할증: 자녀가 생존해 있는데 손자녀가 상속(유증)받으면 그 비율만큼 30%(미성년자가 20억 초과 수령 시 40%) 가산합니다. 대습상속(자녀 사망)은 할증 제외입니다.');

  // ── 8. 세액공제 ──
  const giftTaxPaid = n(pg.giftTaxPaid);
  let giftCredit = 0;
  if (giftTaxPaid && taxBase > 0) {
    const giftBase = n(pg.heirGiftTaxBase);
    const limit = giftBase ? floor(computedTax * Math.min(giftBase / taxBase, 1)) : computedTax;
    giftCredit = Math.min(giftTaxPaid, limit);
    if (giftCredit < giftTaxPaid) notes.push(`증여세액공제는 산출세액 × (증여 과세표준 ÷ 상속 과세표준) 한도 ${won(limit)}까지만 공제됩니다(§28).`);
  }
  const shortCredit = n(o.shortReinheritCredit);
  const foreignCredit = n(o.foreignTaxCredit);
  const beforeReport = Math.max(computedTax + skipSurcharge - giftCredit - shortCredit - foreignCredit, 0);
  const reportCredit = reportOnTime ? floor(beforeReport * INH_REPORT_CREDIT) : 0;
  const payable = Math.max(beforeReport - reportCredit, 0);

  // 상속인별 안분 (받은 재산 + 본인 사전증여는 총액 비율로 근사)
  // 세대생략 할증분은 해당 손자녀에게, 나머지는 (상속받은 재산 + 본인 사전증여) 비율로 안분 (§3의2)
  const keep = payable && (computedTax + skipSurcharge) ? payable / (computedTax + skipSurcharge) : 0;
  const skipPayable = floor(skipSurcharge * keep);
  const heirRows = allocated.map((h) => {
    const ratio = allocBase ? (h.received + h.priorGift) / allocBase : 0;
    const skip = floor((skipRows.find((x) => x.who === h.name)?.add ?? 0) * keep);
    const tax = Math.max(floor((payable - skipPayable) * ratio) + skip, 0);
    return {
      name: h.name, relation: h.relation, relationLabel: HEIR_RELATIONS[h.relation] ?? h.relation,
      received: h.received, priorGift: h.priorGift, ratio, skipSurcharge: skip, tax,
    };
  });

  // ── 신고·납부 ──
  const deadline = p.deathDate ? reportDeadline(p.deathDate, !!p.abroad) : '';
  const installment = payable > 20_000_000;
  const split = payable > 10_000_000;
  if (installment) notes.push('납부세액 2천만원 초과 → 연부연납(담보 제공, 최대 10년, 가업상속은 최대 20년) 신청 가능(§71).');
  else if (split) notes.push('납부세액 1천만원 초과 → 2개월 내 분납 가능.');
  if (deadline) notes.push(`신고·납부기한: ${deadline} (상속개시일이 속하는 달의 말일부터 ${p.abroad ? 9 : 6}개월, §67)`);

  return {
    tax: payable,
    breakdown: {
      grossEstate, ownAssets, deemed, presumedTotal, nonTaxable, publicDonation,
      publicCharges, funeral, debts, priorHeirs, priorOthers, taxableValue,
      personal, personalSum, basicDeduct, lumpChoice, spouseDeduct, spouseLimit, spouseDetail,
      finDeduct, financialAssets, netFinancial, cohabit, business, farming,
      deductItems: deductItems.filter((x) => !x.hide),
      deductSum, deductLimit, deductApplied, appraisal,
      taxBase, rate: raw.rate, accDeduct: raw.acc, computedTax,
      skipSurcharge, skipRows, giftCredit, shortCredit, foreignCredit,
      reportCredit, payable, deadline, installment, split,
    },
    steps: steps.filter((s) => !s.hide),
    heirs: heirRows,
    notes,
    lawRef: LAW_REF,
  };
}

/** 신고기한 — 상속개시일이 속하는 달의 말일부터 6개월(국외 9개월) */
export function reportDeadline(deathDate, abroad = false) {
  const d = new Date(`${deathDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const months = abroad ? 9 : 6;
  // 달의 말일 + N개월 → 그 달의 말일
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1 + months, 0));
  return end.toISOString().slice(0, 10);
}

function won(v) { return `${Math.round(v).toLocaleString('ko-KR')}원`; }
