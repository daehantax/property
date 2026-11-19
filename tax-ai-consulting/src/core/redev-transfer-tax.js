/**
 * 재건축·재개발 양도소득세 계산 모듈
 *
 * 근거: 국세청 「2026 주택과 세금」 제4편 (책 쪽수는 각 항목에 표기)
 *  - 양도차익 산식      : 소득세법 시행령 §166①②④ (책 208~211쪽, 이미지로 검증)
 *  - 장기보유특별공제   : 소득세법 §95②, 시행령 §166⑤ (책 211~213쪽)
 *  - 세율               : 소득세법 §55·§104 (책 214~215쪽, 318쪽)
 *  - 고가주택 12억 안분 : 소득세법 시행령 §160 (책 206쪽)
 *  - 입주권 비과세      : 소득세법 §89①4 (책 254쪽)
 *  - 대체주택 특례      : 소득세법 시행령 §156의2⑤ (책 258~260쪽)
 *  - 다주택 중과        : 소득세법 §104⑦ — 2026.5.10 이후 양도분 (책 214, 294~295쪽)
 *
 * 다루는 5가지 상황 (mode × memberType)
 *  1. inway   + original  원조합원이 조합원입주권 상태에서 양도
 *  2. inway   + successor 승계조합원(입주권을 사서 들어온 사람)이 입주권 양도
 *  3. newhouse+ original  원조합원이 완공된 신축주택 양도 (청산금 납부/수령/없음)
 *  4. newhouse+ successor 승계조합원이 완공된 신축주택 양도 (취득시기 = 사용승인일)
 *  5. cash                지급받은 청산금 자체에 대한 양도세 (종전주택 일부 양도)
 *  6. replace             사업시행 기간 중 거주한 대체주택 양도 (§156의2⑤)
 *
 * [핵심 규칙 요약]
 *  A. 원조합원 양도차익은 「관리처분계획인가 전」과 「인가 후」로 나눈다.
 *       인가 전 = 평가액(권리가액) − 기존주택 취득가액 − 인가 전 필요경비
 *       인가 후 = 양도가액 − (평가액 ± 청산금) − 인가 후 필요경비·양도비
 *  B. 장기보유특별공제
 *       · 입주권(원조합원) : 인가 전 양도차익에만, 보유기간 = 기존주택 취득일~관리처분인가일
 *       · 입주권(승계)     : 공제 없음
 *       · 신축주택(원조합원, 청산금 납부)
 *            기존건물분   : 기존주택 취득일 ~ 신축주택 양도일
 *            청산금납부분 : 관리처분인가일 ~ 신축주택 양도일
 *       · 신축주택(원조합원, 청산금 수령/없음) : 기존주택 취득일 ~ 양도일
 *       · 신축주택(승계)   : 사용승인일(준공일) ~ 양도일
 *  C. 세율 적용 보유기간: 원조합원은 기존주택 취득일부터 통산, 승계조합원은
 *     입주권 양도 시 입주권 취득일부터 / 신축주택 양도 시 사용승인일부터.
 *     1년 미만 70%, 2년 미만 60%, 2년 이상 기본세율(주택·조합원입주권 공통).
 *  D. 조합원입주권은 「주택」이 아니므로 입주권 양도 자체에는 다주택 중과세율이 붙지 않는다.
 *     (단, 다른 주택의 중과 판정 때 주택 수에는 포함 — 책 294~295쪽)
 */

import { HEAVY_RESUME_DATE } from './constants.js';
import {
  RESIDENCE_REQ_START, HIGH_PRICE_12E_START, HIGH_PRICE_12E, HIGH_PRICE_9E,
} from './single-house-exempt.js';
import { judgeInwayExempt, judgeReplacementHouse } from './redev-exempt.js';

export const BASIC_DEDUCTION = 2_500_000;

/**
 * 필요경비 항목 정의 — 화면과 엔진이 같이 쓴다.
 * phase: 'pre'  = 관리처분인가 전(기존주택 취득·보유 단계) 귀속
 *        'post' = 관리처분인가 후(신축·입주 단계) 귀속
 *        'sale' = 양도 단계(양도비) — 인가 후 양도차익에서 차감
 */
export const EXPENSE_ITEMS = [
  { key: 'acqTax', phase: 'pre', label: '취득세', hint: '기존주택(승계: 입주권 토지분) 취득 시 납부액. 영수증이 없어도 공제(감면분 제외)' },
  { key: 'regTax', phase: 'pre', label: '등록세·지방교육세·농어촌특별세', hint: '2010년 이전 취득분의 등록세, 취득세에 붙는 교육세·농특세' },
  { key: 'legalFee', phase: 'pre', label: '법무사 수수료 (취득 등기)', hint: '법무사 영수증 금액(보수+등기 대행 실비)' },
  { key: 'acqBrokerFee', phase: 'pre', label: '취득 시 중개수수료', hint: '취득 당시 중개보수 영수증' },
  { key: 'bondLoss', phase: 'pre', label: '국민주택채권 매각차손', hint: '등기 때 산 채권을 만기 전에 팔아 생긴 손실' },
  { key: 'etcAcq', phase: 'pre', label: '기타 취득 부대비용', hint: '인지대, 소유권 확보 소송·화해비용, 명도비용 등' },
  { key: 'capexPre', phase: 'pre', label: '자본적지출 합계 — 인가 전', hint: '기존주택 샷시·보일러 교체, 확장 공사 등(도배·장판 같은 수익적 지출 제외)' },
  { key: 'newAcqTax', phase: 'post', label: '신축주택 취득세·등기비용', hint: '준공 시 건물분(청산금·분담금분) 취득세와 보존등기 법무사 비용' },
  { key: 'capexPost', phase: 'post', label: '자본적지출 합계 — 인가 후', hint: '발코니 확장, 시스템에어컨 등 분양 옵션, 입주 후 자본적지출' },
  { key: 'redevCharge', phase: 'post', label: '재건축부담금·개발부담금', hint: '재건축초과이익 환수법에 따른 부담금' },
  { key: 'saleBrokerFee', phase: 'sale', label: '양도 시 중개수수료', hint: '양도 당시 중개보수 영수증' },
  { key: 'filingFee', phase: 'sale', label: '양도세 신고서·계약서 작성비용', hint: '세무사 신고 수수료, 계약서 작성비, 공증비용' },
  { key: 'etcSale', phase: 'sale', label: '기타 양도비', hint: '매매계약상 인도의무 이행을 위한 명도비용 등' },
];

export const MODE_LABEL = {
  inway: '조합원입주권 양도',
  newhouse: '완공 신축주택 양도',
  cash: '청산금 수령분 양도',
  replace: '대체주택 양도',
};

// ── 날짜 유틸 ('YYYY-MM-DD', UTC) ─────────────────────────────────────
const toD = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toS = (d) => d.toISOString().slice(0, 10);
const valid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
function addYearsS(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y + n, m - 1, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return toS(t);
}
/** 만 보유연수: 시작일 + n년 ≤ 종료일 인 최대 n (종료일이 빠르면 0) */
export function fullYears(startISO, endISO) {
  if (!valid(startISO) || !valid(endISO) || endISO < startISO) return 0;
  let n = Number(endISO.slice(0, 4)) - Number(startISO.slice(0, 4));
  while (n > 0 && addYearsS(startISO, n) > endISO) n -= 1;
  return Math.max(n, 0);
}
/** 예정신고·납부기한: 양도일이 속하는 달의 말일부터 2개월 */
export function filingDueDate(saleISO) {
  if (!valid(saleISO)) return '';
  const [y, m] = saleISO.split('-').map(Number);
  return toS(new Date(Date.UTC(y, m + 2, 0)));
}

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const pct = (r) => `${Math.round(r * 1000) / 10}%`;
const fmtDate = (s) => (valid(s) ? s.replace(/-/g, '.') : '-');

// ── 세율 ─────────────────────────────────────────────────────────────
/** 기본세율·누진공제 (소득세법 §55, 2023년 이후 — 책 214쪽) */
export function baseBracket(base) {
  if (base <= 14_000_000) return { rate: 0.06, dc: 0 };
  if (base <= 50_000_000) return { rate: 0.15, dc: 1_260_000 };
  if (base <= 88_000_000) return { rate: 0.24, dc: 5_760_000 };
  if (base <= 150_000_000) return { rate: 0.35, dc: 15_440_000 };
  if (base <= 300_000_000) return { rate: 0.38, dc: 19_940_000 };
  if (base <= 500_000_000) return { rate: 0.40, dc: 25_940_000 };
  if (base <= 1_000_000_000) return { rate: 0.42, dc: 35_940_000 };
  return { rate: 0.45, dc: 65_940_000 };
}

// ── 장기보유특별공제율 (소득세법 §95② — 책 212~213쪽) ───────────────
/** 표1(일반): 3년 이상 연 2%, 최대 30%(15년) */
export function ltdTable1(holdYears) {
  if (holdYears < 3) return 0;
  return Math.min(Math.floor(holdYears) * 2, 30) / 100;
}
/**
 * 표2(1세대1주택·거주 2년 이상): 보유 연 4%(최대 40%) + 거주 연 4%(최대 40%)
 * 보유 3년 이상이어야 하고, 거주 2년 이상 3년 미만은 8%.
 */
export function ltdTable2(holdYears, stayYears) {
  if (holdYears < 3) return { hold: 0, stay: 0, total: 0 };
  const hold = Math.min(Math.floor(holdYears) * 4, 40) / 100;
  const stay = stayYears >= 2 ? Math.min(Math.floor(stayYears) * 4, 40) / 100 : 0;
  return { hold, stay, total: hold + stay };
}

function highPrice(saleDate, basePrice) {
  const threshold = saleDate >= HIGH_PRICE_12E_START ? HIGH_PRICE_12E : HIGH_PRICE_9E;
  return { threshold, isHigh: basePrice > threshold };
}

/** 필요경비를 단계(pre/post/sale)별로 합산 */
export function sumExpenses(expenses = {}, capexList = []) {
  const rows = [];
  const tot = { pre: 0, post: 0, sale: 0 };
  for (const it of EXPENSE_ITEMS) {
    const amount = Math.max(Number(expenses[it.key]) || 0, 0);
    if (amount > 0) rows.push({ key: it.key, label: it.label, phase: it.phase, amount });
    tot[it.phase] += amount;
  }
  for (const c of capexList || []) {
    const amount = Math.max(Number(c?.amount) || 0, 0);
    if (!amount) continue;
    const phase = ['pre', 'post', 'sale'].includes(c.phase) ? c.phase : 'post';
    rows.push({ key: 'custom', label: c.name || '추가 필요경비', phase, amount });
    tot[phase] += amount;
  }
  return { rows, pre: tot.pre, post: tot.post, sale: tot.sale, total: tot.pre + tot.post + tot.sale };
}

const LAW = {
  gain: '소득세법 시행령 §166①②④ (재개발·재건축 양도차익 — 책 208~211쪽)',
  ltd: '소득세법 §95②, 시행령 §166⑤ (장기보유특별공제 — 책 211~213쪽)',
  rate: '소득세법 §55·§104① (기본세율, 2년 미만 60%·1년 미만 70% — 책 214~215·318쪽)',
  high: '소득세법 §89①3·시행령 §160 (고가주택 12억 초과분 안분 — 책 206쪽)',
  inway: '소득세법 §89①4 (조합원입주권 양도 비과세 — 책 254쪽)',
  single: '소득세법 §89①3, 시행령 §154 (1세대1주택 비과세 — 책 220~229쪽)',
  replace: '소득세법 시행령 §156의2⑤ (대체주택 비과세 특례 — 책 258~260쪽)',
  heavy: '소득세법 §104⑦, §95② (조정대상지역 다주택 중과·장특공 배제 — 책 214, 294~295쪽)',
  expense: '소득세법 §97, 시행령 §163 (필요경비: 취득가액·자본적지출·양도비 — 책 198~202쪽)',
  due: '소득세법 §105 (예정신고: 양도일이 속하는 달의 말일부터 2개월 — 책 216쪽)',
};

/**
 * 재건축·재개발 양도소득세 계산
 *
 * @param {object} input
 * @param {'inway'|'newhouse'|'cash'|'replace'} input.mode
 * @param {'original'|'successor'} [input.memberType='original']
 * @param {'none'|'paid'|'received'} [input.settle='none']  청산금 구분(납부/수령)
 * @param {number} [input.settleAmount=0]   청산금(납부액 또는 수령액). 승계조합원은 본인이 낸 분담금
 * @param {string} input.acquireDate        기존주택 취득일 (승계: 입주권 취득일 / 대체주택: 그 주택 취득일)
 * @param {string} [input.approvalDate]     관리처분계획인가일
 * @param {string} [input.completionDate]   신축주택 사용승인일(준공일)
 * @param {string} input.saleDate           양도일 (청산금: 소유권이전고시일의 다음 날)
 * @param {number} input.salePrice          양도가액 (cash 모드는 미사용 — 청산금이 양도가액)
 * @param {number} [input.appraisal]        기존건물과 부수토지의 평가액(권리가액)
 * @param {number} input.acquirePrice       취득가액 (승계: 입주권 매입가액, 프리미엄 포함)
 * @param {object} [input.expenses]         EXPENSE_ITEMS 의 key → 금액
 * @param {Array}  [input.capexList]        추가 필요경비 [{name, amount, phase}]
 * @param {'single'|'temp'|'two'|'three'} [input.houseStatus='single']
 *        양도일 현재 세대의 주택 보유 상태. temp = 일시적 2주택 등 특례 요건 충족
 * @param {string} [input.otherHouseAcquireDate]  (입주권·temp) 보유 중인 다른 1주택의 취득일 — §89①4 나목 3년 판정
 * @param {boolean} [input.adjAtAcquire=false]    취득 당시 조정대상지역(거주요건 판정)
 * @param {number} [input.livePrevYears=0]  기존주택 거주기간(년)
 * @param {number} [input.liveNewYears=0]   신축주택 거주기간(년)
 * @param {boolean} [input.saleInAdj=false] 양도 당시 조정대상지역 소재(중과 판정)
 * @param {boolean} [input.heavyExcluded=false] 중과 제외 주택 해당
 * @param {boolean} [input.basicDeductAvailable=true] 올해 기본공제 250만 사용 가능
 * @param {object} [input.replace]          대체주택 특례 요건 (judgeReplacementHouse 입력)
 */
export function calcRedevTransferTax(input) {
  const {
    mode, memberType: memberTypeIn = 'original',
    settle: settleIn = 'none', settleAmount: settleAmountIn = 0,
    acquireDate, approvalDate = '', completionDate = '', saleDate,
    salePrice: salePriceIn = 0, appraisal = 0, acquirePrice = 0,
    expenses = {}, capexList = [],
    houseStatus = 'single', otherHouseAcquireDate = '',
    adjAtAcquire = false, livePrevYears = 0, liveNewYears = 0,
    saleInAdj = false, heavyExcluded = false, basicDeductAvailable = true,
    replace = {},
  } = input;

  const memberType = (mode === 'cash' || mode === 'replace') ? 'original' : memberTypeIn;
  const isOriginal = memberType === 'original';
  const split = isOriginal && (mode === 'inway' || mode === 'newhouse');   // 인가 전/후 구분 계산
  let settle = settleIn;
  let settleAmount = Math.max(Number(settleAmountIn) || 0, 0);
  if (mode === 'cash') settle = 'received';
  if (mode === 'replace') { settle = 'none'; settleAmount = 0; }
  if (!isOriginal && settle === 'received') settle = 'none';
  if (settle === 'none') settleAmount = mode === 'cash' ? settleAmount : 0;
  if (settleAmount === 0 && settle !== 'received') settle = 'none';

  const errors = [];
  if (!MODE_LABEL[mode]) errors.push('양도 유형(mode)을 선택하세요.');
  if (!valid(acquireDate)) errors.push('취득일을 입력하세요.');
  if (!valid(saleDate)) errors.push('양도일을 입력하세요.');
  if (valid(acquireDate) && valid(saleDate) && saleDate < acquireDate) errors.push('양도일이 취득일보다 빠릅니다.');
  if ((split || mode === 'cash')) {
    if (!valid(approvalDate)) errors.push('관리처분계획인가일을 입력하세요.');
    if (!(appraisal > 0)) errors.push('기존건물과 부수토지의 평가액(권리가액)을 입력하세요.');
    if (valid(approvalDate) && valid(acquireDate) && approvalDate < acquireDate) errors.push('원조합원은 기존주택 취득일이 관리처분계획인가일보다 앞서야 합니다. 인가일 이후 취득했다면 「승계조합원」을 선택하세요.');
  }
  if (isOriginal && (mode === 'inway' || mode === 'cash') && valid(approvalDate) && valid(saleDate) && saleDate < approvalDate) {
    errors.push(mode === 'inway'
      ? '양도일이 관리처분계획인가일보다 빠릅니다. 인가 전 양도는 입주권이 아니라 일반 주택 양도이므로 「양도소득세 계산기」를 사용하세요.'
      : '청산금의 양도일(소유권이전고시일의 다음 날)은 관리처분계획인가일 이후여야 합니다.');
  }
  if (mode === 'newhouse' && !valid(completionDate)) errors.push('신축주택 사용승인일(준공일)을 입력하세요.');
  if (mode === 'newhouse' && valid(completionDate) && valid(saleDate) && saleDate < completionDate) errors.push('양도일이 준공일보다 빠릅니다. 준공 전 양도라면 「조합원입주권 양도」를 선택하세요.');
  if (mode === 'inway' && valid(completionDate) && valid(saleDate) && saleDate >= completionDate) errors.push('준공일 이후 양도는 「완공 신축주택 양도」로 계산해야 합니다.');
  if (settle === 'received' && appraisal > 0 && settleAmount > appraisal) errors.push('지급받은 청산금이 평가액보다 클 수 없습니다.');
  if (mode === 'cash' && !(settleAmount > 0)) errors.push('지급받은 청산금을 입력하세요.');
  if (mode !== 'cash' && !(salePriceIn > 0)) errors.push('양도가액을 입력하세요.');
  if (errors.length) return { ok: false, errors };

  const salePrice = mode === 'cash' ? settleAmount : salePriceIn;
  const exp = sumExpenses(expenses, capexList);
  const notes = [];
  const lawRef = [LAW.gain, LAW.expense];

  // ── 1. 양도차익 ───────────────────────────────────────────────────
  // segments: 장특공 보유기간이 서로 다른 덩어리 단위
  const segments = [];
  const gainSteps = [];
  const A = appraisal;
  if (mode === 'replace' || !isOriginal) {
    const paid = settleAmount;
    const gain = salePrice - acquirePrice - paid - exp.total;
    gainSteps.push({ label: '양도가액', amount: salePrice });
    gainSteps.push({ label: mode === 'replace' ? '(−) 취득가액' : '(−) 입주권 취득가액(매입가·프리미엄 포함)', amount: -acquirePrice });
    if (paid > 0) gainSteps.push({ label: '(−) 승계 후 납부한 분담금(청산금)', amount: -paid });
    gainSteps.push({ label: '(−) 필요경비 합계', amount: -exp.total });
    segments.push({ key: 'all', label: '양도차익', gain });
  } else if (mode === 'cash') {
    const ratio = settleAmount / A;
    const whole = A - acquirePrice - exp.pre;
    const gain = whole * ratio - exp.sale;
    gainSteps.push({ label: '기존건물·부수토지 평가액(권리가액)', amount: A });
    gainSteps.push({ label: '(−) 기존주택 취득가액', amount: -acquirePrice });
    gainSteps.push({ label: '(−) 인가 전 필요경비', amount: -exp.pre });
    gainSteps.push({ label: '= 관리처분인가 전 전체 양도차익', amount: whole, sub: true });
    gainSteps.push({ label: `× 청산금 비율 (청산금 ${won(settleAmount)} ÷ 평가액 ${won(A)} = ${pct(ratio)})`, amount: whole * ratio, sub: true });
    if (exp.sale > 0) gainSteps.push({ label: '(−) 양도비(신고서 작성비용 등)', amount: -exp.sale });
    if (exp.post > 0) notes.push(`인가 후 필요경비 ${won(exp.post)}은 신축주택 취득 관련 비용이라 청산금 수령분 계산에서는 빼지 않았습니다(신축주택 양도 때 공제).`);
    segments.push({ key: 'cash', label: '청산금 수령분 양도차익', gain });
  } else if (settle === 'received') {
    const R = settleAmount;
    const ratio = (A - R) / A;
    const preWhole = A - acquirePrice - exp.pre;
    const pre = preWhole * ratio;
    const post = salePrice - (A - R) - (exp.post + exp.sale);
    gainSteps.push({ label: 'ⓐ 관리처분인가 전 양도차익', head: true });
    gainSteps.push({ label: '평가액(권리가액)', amount: A });
    gainSteps.push({ label: '(−) 기존주택 취득가액', amount: -acquirePrice });
    gainSteps.push({ label: '(−) 인가 전 필요경비', amount: -exp.pre });
    gainSteps.push({ label: `× (평가액 − 지급받은 청산금) ÷ 평가액 = ${pct(ratio)}`, amount: pre, sub: true });
    gainSteps.push({ label: 'ⓑ 관리처분인가 후 양도차익', head: true });
    gainSteps.push({ label: '양도가액', amount: salePrice });
    gainSteps.push({ label: '(−) 평가액 − 지급받은 청산금', amount: -(A - R) });
    gainSteps.push({ label: '(−) 인가 후 필요경비·양도비', amount: -(exp.post + exp.sale) });
    gainSteps.push({ label: '= 인가 후 양도차익', amount: post, sub: true });
    segments.push({ key: 'pre', label: 'ⓐ 인가 전 양도차익', gain: pre });
    segments.push({ key: 'post', label: 'ⓑ 인가 후 양도차익', gain: post });
    notes.push(`지급받은 청산금 ${won(R)}은 이 계산에 들어 있지 않습니다. 종전주택의 일부 양도로 보아 따로 신고해야 하므로 「청산금 수령분 양도」 유형으로 별도 계산하세요(양도시기: 소유권이전고시일의 다음 날).`);
  } else {
    // 청산금 납부(또는 청산금 없음 = 납부 0원)
    const P = settleAmount;
    const preWhole = A - acquirePrice - exp.pre;
    const postWhole = salePrice - (A + P) - (exp.post + exp.sale);
    gainSteps.push({ label: 'ⓐ 관리처분인가 전 양도차익', head: true });
    gainSteps.push({ label: '평가액(권리가액)', amount: A });
    gainSteps.push({ label: '(−) 기존주택 취득가액', amount: -acquirePrice });
    gainSteps.push({ label: '(−) 인가 전 필요경비', amount: -exp.pre });
    gainSteps.push({ label: '= 인가 전 양도차익', amount: preWhole, sub: true });
    gainSteps.push({ label: 'ⓑ 관리처분인가 후 양도차익', head: true });
    gainSteps.push({ label: '양도가액', amount: salePrice });
    gainSteps.push({ label: P > 0 ? '(−) 평가액 + 납부한 청산금' : '(−) 평가액', amount: -(A + P) });
    gainSteps.push({ label: '(−) 인가 후 필요경비·양도비', amount: -(exp.post + exp.sale) });
    gainSteps.push({ label: '= 인가 후 양도차익', amount: postWhole, sub: true });
    if (mode === 'inway') {
      segments.push({ key: 'pre', label: 'ⓐ 인가 전 양도차익', gain: preWhole });
      segments.push({ key: 'post', label: 'ⓑ 인가 후 양도차익', gain: postWhole });
    } else if (P > 0) {
      // 신축주택 + 청산금 납부: 인가 후 차익을 기존건물분과 청산금납부분으로 안분 (책 210쪽)
      const rOld = A / (A + P);
      const oldPart = postWhole * rOld + preWhole;
      const paidPart = postWhole * (P / (A + P));
      gainSteps.push({ label: '장기보유특별공제용 안분 (§166②1호)', head: true });
      gainSteps.push({ label: `기존건물분 = 인가 후 차익 × 평가액 ÷ (평가액+청산금) ${pct(rOld)} + 인가 전 차익`, amount: oldPart, sub: true });
      gainSteps.push({ label: `청산금납부분 = 인가 후 차익 × 청산금 ÷ (평가액+청산금) ${pct(1 - rOld)}`, amount: paidPart, sub: true });
      segments.push({ key: 'old', label: '기존건물분 양도차익', gain: oldPart });
      segments.push({ key: 'paid', label: '청산금납부분 양도차익', gain: paidPart });
    } else {
      segments.push({ key: 'old', label: '양도차익 (인가 전 + 인가 후)', gain: preWhole + postWhole });
    }
  }
  const totalGain = segments.reduce((s, x) => s + x.gain, 0);

  // ── 2. 보유·거주기간 ──────────────────────────────────────────────
  const livePrev = Math.max(Number(livePrevYears) || 0, 0);
  const liveNew = Math.max(Number(liveNewYears) || 0, 0);
  let rateStart = acquireDate;           // 세율·비과세 판정용 보유기간 기산일
  let liveTotal;
  if (mode === 'newhouse' && !isOriginal) { rateStart = completionDate; liveTotal = liveNew; }
  else if (mode === 'newhouse') liveTotal = livePrev + liveNew;
  else if (mode === 'replace') liveTotal = Math.max(Number(replace.replacementLiveYears) || 0, 0);
  else liveTotal = livePrev;
  const holdYearsRate = fullYears(rateStart, saleDate);

  // ── 3. 1세대1주택 비과세 판정 ─────────────────────────────────────
  const checklist = [];
  let exemptOk = false;
  const oneHouse = houseStatus === 'single' || houseStatus === 'temp';
  const needLive = adjAtAcquire && rateStart >= RESIDENCE_REQ_START;
  const statusLabel = {
    single: '양도일 현재 다른 주택·입주권·분양권 없음',
    temp: '일시적 2주택 등 특례 요건 충족(1세대1주택으로 봄)',
    two: '2주택 세대(주택+입주권+분양권 합계)',
    three: '3주택 이상 세대(주택+입주권+분양권 합계)',
  }[houseStatus] || houseStatus;

  if (mode === 'inway' && isOriginal) {
    const j = judgeInwayExempt({
      prevAcquireDate: acquireDate, prevAcquiredInAdjust: adjAtAcquire, prevLiveYears: livePrev,
      approvalDate, inwaySaleDate: saleDate,
      otherHouse: houseStatus === 'single' ? 'none' : houseStatus === 'temp' ? 'one-temp' : 'multi',
      newHouseAcquireDate: valid(otherHouseAcquireDate) ? otherHouseAcquireDate : null,
      salePrice,
    });
    checklist.push(...j.checklist.filter((c) => c.key !== 'high'));
    exemptOk = j.verdict !== 'taxable';
    lawRef.push(LAW.inway);
  } else if (mode === 'inway') {
    checklist.push({ key: 'successor', label: '승계취득 조합원입주권', ok: false, detail: '조합원으로부터 취득한 입주권은 §89①4 비과세 대상이 아닙니다(관리처분인가일 현재 기존주택을 보유한 세대만 해당).' });
  } else if (mode === 'replace') {
    const j = judgeReplacementHouse({ ...replace, salePrice, saleDate });
    for (const c of j.checklist.filter((x) => x.key !== 'high')) {
      if (c.key === 'one') {
        // 기획재정부 재산세제과-1270(2025.10.23): 1주택 여부는 「대체주택 취득일」 기준 (책 259쪽)
        checklist.push({ ...c, label: '대체주택 취득일 현재 1주택 세대(재건축 대상 주택만 보유)', detail: c.ok ? '대체주택 취득일 현재 1주택' : '대체주택 취득일 현재 2주택 이상 → 특례 대상 아님' });
      } else checklist.push(c);
    }
    exemptOk = j.verdict !== 'taxable';
    lawRef.push(LAW.replace);
  } else {
    // 신축주택·청산금: 일반 1세대1주택 비과세 (보유기간 통산)
    const holdOk = holdYearsRate >= 2;
    const liveOk = !needLive || liveTotal >= 2;
    checklist.push({ key: 'house', label: '1세대 1주택(또는 1주택으로 보는 특례)', ok: oneHouse, detail: statusLabel });
    checklist.push({
      key: 'hold', label: '보유기간 2년 이상', ok: holdOk,
      detail: isOriginal
        ? `기존주택 취득일(${fmtDate(acquireDate)})부터 통산 → 만 ${holdYearsRate}년 (기존주택 + 공사기간 + 신축주택)`
        : `사용승인일(${fmtDate(completionDate)})부터 → 만 ${holdYearsRate}년 (승계조합원은 준공일이 취득일)`,
    });
    checklist.push({
      key: 'live', label: needLive ? '거주기간 2년 이상 (조정대상지역 취득)' : '거주요건 (해당 없음)', ok: liveOk,
      detail: needLive
        ? `거주 ${liveTotal}년 (${isOriginal && mode === 'newhouse' ? '기존주택 + 신축주택 거주 통산, 공사기간 제외' : '실거주 기간'})`
        : (adjAtAcquire ? '2017.8.2 이전 취득 → 거주요건 없음' : '취득 당시 비조정대상지역 → 거주요건 없음'),
    });
    exemptOk = oneHouse && holdOk && liveOk;
    lawRef.push(LAW.single);
  }

  // 고가주택 판정: 신축주택·입주권·대체주택은 양도가액, 청산금은 기존주택 평가액 전체 기준
  const highBase = mode === 'cash' ? A : salePrice;
  const hp = highPrice(saleDate, highBase);
  let taxableRatio = 1;
  let verdict = 'taxable';
  if (exemptOk) {
    taxableRatio = hp.isHigh ? (highBase - hp.threshold) / highBase : 0;
    verdict = hp.isHigh ? 'partial' : 'exempt';
    lawRef.push(LAW.high);
    checklist.push({
      key: 'high', label: `고가주택 기준 ${won(hp.threshold)}`, ok: !hp.isHigh, warn: hp.isHigh,
      detail: hp.isHigh
        ? `${mode === 'cash' ? '기존주택 평가액' : '양도가액'} ${won(highBase)} > ${won(hp.threshold)} → 초과분 비율 ${pct(taxableRatio)}만 과세`
        : `${mode === 'cash' ? '기존주택 평가액' : '양도가액'} ${won(highBase)} ≤ ${won(hp.threshold)} → 전액 비과세`,
    });
    if (mode === 'cash') notes.push('청산금 수령분의 고가주택 여부는 받은 청산금이 아니라 기존주택 전체 평가액(권리가액)으로 판정했습니다.');
  }

  // ── 4. 다주택 중과 ────────────────────────────────────────────────
  const isHouseSale = mode !== 'inway';
  const multiCount = houseStatus === 'two' ? 2 : houseStatus === 'three' ? 3 : 0;
  const heavy = isHouseSale && !exemptOk && multiCount >= 2 && saleInAdj && !heavyExcluded && saleDate >= HEAVY_RESUME_DATE;
  const heavyAdd = heavy ? (multiCount === 2 ? 0.20 : 0.30) : 0;
  const heavyInfo = { applied: heavy, add: heavyAdd, reason: '' };
  if (mode === 'inway') {
    heavyInfo.reason = '조합원입주권은 주택이 아니므로 입주권 양도에는 다주택 중과세율이 적용되지 않습니다(장특공도 배제되지 않음). 다만 다른 주택을 팔 때 주택 수에는 포함됩니다.';
  } else if (heavy) {
    heavyInfo.reason = `조정대상지역 ${multiCount === 2 ? '2주택' : '3주택 이상'} → 기본세율 + ${pct(heavyAdd)}p, 장기보유특별공제 배제 (2026.5.10 이후 양도분)`;
    lawRef.push(LAW.heavy);
    if (mode === 'cash') notes.push('청산금 수령분은 종전주택의 일부 양도로 보아 다주택 중과를 적용했습니다. 주택 멸실 후 수령분의 중과 여부는 사실관계에 따라 다툼이 있으므로 신고 전 확인이 필요합니다.');
  } else if (multiCount >= 2 && !exemptOk) {
    if (!saleInAdj) heavyInfo.reason = '양도주택이 조정대상지역 밖 → 중과 없음(기본세율)';
    else if (heavyExcluded) heavyInfo.reason = '중과 제외 주택 해당 → 기본세율';
    else if (saleDate < HEAVY_RESUME_DATE) heavyInfo.reason = '2026.5.9 이전 양도 → 중과 한시 배제(보유 2년 이상) 기간';
  }

  // ── 5. 과세대상 양도차익·장기보유특별공제 ─────────────────────────
  const table2 = oneHouse && !heavy;   // 표2 후보(실제 적용은 덩어리별 거주 2년 이상)
  const ltdRows = [];
  for (const seg of segments) {
    const taxable = seg.gain * taxableRatio;
    seg.taxable = taxable;
    let start = rateStart; let end = saleDate; let stay = liveTotal; let allowed = true; let why = '';
    if (heavy) { allowed = false; why = '다주택 중과 대상 → 장기보유특별공제 배제'; }
    else if (!isOriginal && mode === 'inway') { allowed = false; why = '승계취득 조합원입주권 → 공제 대상 아님 (책 212쪽)'; }
    else if (mode === 'inway') {
      if (seg.key === 'post') { allowed = false; why = '인가 후 양도차익 → 공제 없음 (입주권은 인가 전 차익만 공제)'; }
      else { start = acquireDate; end = approvalDate; stay = livePrev; }
    } else if (mode === 'newhouse' && isOriginal) {
      if (seg.key === 'paid') { start = approvalDate; end = saleDate; stay = liveNew; }
      else { start = acquireDate; end = saleDate; stay = livePrev + liveNew; }
    } else if (mode === 'cash') { start = acquireDate; end = saleDate; stay = livePrev; }

    let rate = 0; let table = '-'; let hold = 0; let detail = why;
    if (allowed) {
      hold = fullYears(start, end);
      // 표2 적용 여부는 주택 전체 기준(1세대1주택 + 전체 거주 2년 이상)
      const wholeStay = (mode === 'newhouse' && isOriginal) ? livePrev + liveNew : stay;
      if (table2 && wholeStay >= 2) {
        const t = ltdTable2(hold, stay);
        rate = t.total; table = '표2';
        detail = hold < 3 ? `보유 만 ${hold}년 → 3년 미만 공제 없음`
          : `보유 만 ${hold}년 ${pct(t.hold)} + 거주 ${Math.floor(stay)}년 ${pct(t.stay)}`;
      } else {
        rate = ltdTable1(hold); table = '표1';
        detail = hold < 3 ? `보유 만 ${hold}년 → 3년 미만 공제 없음` : `보유 만 ${hold}년 × 2% (최대 30%)`;
      }
    }
    const amount = taxable > 0 ? Math.floor(taxable * rate) : 0;
    seg.ltd = amount;
    ltdRows.push({
      key: seg.key, label: seg.label, gain: seg.gain, taxable, allowed,
      period: allowed ? `${fmtDate(start)} ~ ${fmtDate(end)}` : '-', holdYears: hold, stayYears: allowed ? stay : 0,
      table, rate, amount, detail,
    });
  }
  if (!heavy && (mode !== 'inway' || isOriginal)) lawRef.push(LAW.ltd);
  const taxableGain = segments.reduce((s, x) => s + x.taxable, 0);
  const ltdTotal = ltdRows.reduce((s, x) => s + x.amount, 0);

  if (mode === 'newhouse' && isOriginal && segments.some((s) => s.key === 'paid')) {
    notes.push('청산금납부분의 보유기간은 관리처분계획인가일부터, 거주기간은 신축주택 거주기간으로 계산했습니다(표2 적용 시 청산금납부분 거주 2년 미만이면 거주공제 0%). 인가일 이후 기존주택에 계속 거주한 기간이 있으면 「신축주택 거주기간」에 더해 입력하세요.');
  }
  if (mode === 'inway' && isOriginal && table2) {
    notes.push('1세대1주택 요건을 갖춘 고가 조합원입주권은 인가 전 양도차익에 표2(최대 80%)를 적용했습니다. 보유·거주기간은 관리처분계획인가일까지만 셉니다.');
  }

  // ── 6. 과세표준·세액 ──────────────────────────────────────────────
  const income = Math.max(taxableGain - ltdTotal, 0);
  const basicDeduct = basicDeductAvailable ? Math.min(BASIC_DEDUCTION, income) : 0;
  const taxBase = Math.max(income - basicDeduct, 0);

  const b = baseBracket(taxBase);
  const basicTax = Math.max(taxBase * b.rate - b.dc, 0);
  const shortRate = holdYearsRate < 1 ? 0.70 : holdYearsRate < 2 ? 0.60 : 0;
  const shortTax = taxBase * shortRate;
  const heavyTax = heavy ? Math.max(taxBase * (b.rate + heavyAdd) - b.dc, 0) : 0;

  let rateInfo = { type: 'basic', label: `기본세율 ${pct(b.rate)} (누진공제 ${won(b.dc)})`, rate: b.rate, dc: b.dc };
  let chosen = basicTax;
  if (heavy && heavyTax >= chosen) {
    chosen = heavyTax;
    rateInfo = { type: 'heavy', label: `중과세율 ${pct(b.rate + heavyAdd)} = 기본 ${pct(b.rate)} + ${pct(heavyAdd)}p (누진공제 ${won(b.dc)})`, rate: b.rate + heavyAdd, dc: b.dc };
  }
  if (shortRate > 0 && shortTax > chosen) {
    chosen = shortTax;
    rateInfo = { type: 'short', label: `단기양도 ${pct(shortRate)} (보유 ${holdYearsRate < 1 ? '1년 미만' : '1년 이상 2년 미만'})`, rate: shortRate, dc: 0 };
  }
  lawRef.push(LAW.rate, LAW.due);
  const transferTax = Math.floor(chosen);
  const localTax = Math.floor(transferTax * 0.1);

  if (saleDate < '2023-01-01') notes.push('세율은 2023년 이후 기본세율표 기준입니다. 2022년 이전 양도분은 세율 구간·단기세율이 달라 실제 세액과 차이가 납니다.');
  if (mode === 'cash') notes.push('청산금의 양도시기는 소유권이전고시일의 다음 날입니다. 청산금을 여러 번 나눠 받더라도 양도시기는 같으며, 같은 해의 다른 양도소득과 합산해 누진세율을 적용합니다.');
  if (!isOriginal && mode === 'newhouse') notes.push('승계조합원은 신축주택 사용승인일(사용승인 전 사실상 사용·임시사용승인을 받았다면 그중 빠른 날)이 취득일입니다. 입주권 보유기간은 주택 보유기간에 포함되지 않습니다.');
  if (isOriginal && mode === 'newhouse') notes.push('원조합원의 신축주택은 기존주택 취득일부터 보유기간을 통산합니다(공사기간 포함). 거주기간은 실제 거주한 기존주택·신축주택 기간만 더합니다.');
  if (totalGain < 0) notes.push('양도차손이 발생했습니다. 같은 해 다른 부동산 양도차익과 통산할 수 있습니다.');

  const headline = {
    exempt: '1세대 1주택 비과세 — 납부세액 없음',
    partial: `고가주택 ${won(hp.threshold)} 초과분만 과세`,
    taxable: heavy ? '과세 — 다주택 중과세율 적용' : (rateInfo.type === 'short' ? '과세 — 단기양도 세율 적용' : '과세 — 기본세율 적용'),
  }[verdict];

  return {
    ok: true,
    mode, modeLabel: MODE_LABEL[mode], memberType, settle, settleAmount,
    verdict, headline, checklist,
    expenses: exp,
    gainSteps, segments, totalGain,
    highPrice: { ...hp, base: highBase, taxableRatio },
    taxableGain, ltdRows, ltdTotal,
    income, basicDeduct, taxBase,
    holdYearsRate, rateStart, rateInfo,
    compare: { basicTax: Math.floor(basicTax), shortTax: Math.floor(shortTax), heavyTax: Math.floor(heavyTax), shortRate },
    heavy: heavyInfo,
    transferTax, localTax, total: transferTax + localTax,
    filingDue: filingDueDate(saleDate),
    notes, lawRef: [...new Set(lawRef)],
  };
}

export { won, pct };
