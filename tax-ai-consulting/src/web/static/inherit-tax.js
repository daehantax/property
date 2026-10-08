/**
 * 상속세 계산기 (inherit-tax.html)
 *
 * calcInheritanceTax 기반. 신고서 순서대로 과세가액 → 상속공제 → 과세표준 → 산출세액 →
 * 할증·세액공제 → 납부세액을 표로 보여 주고, 상속인별 납부세액을 안분한다.
 * 밑줄 친 항목을 누르면 현재 값이 대입된 산식 팝업을 띄운다.
 */

import {
  calcInheritanceTax, HEIR_RELATIONS, INH_RATE_TABLE,
} from '../../core/inheritance-tax.js';
import { won, bindMoneyInputs, moneyVal, initFxDialog, bindFxButtons } from './notice-ui.js';

const $ = (id) => document.getElementById(id);
const showFx = initFxDialog();
let fxMap = {};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const pct = (r) => `${(r * 100).toFixed(1)}%`;

// ── 상속인 입력 행 ──
const DEFAULT_HEIRS = [
  { relation: 'spouse', name: '배우자', age: 68 },
  { relation: 'child', name: '자녀1', age: 40 },
  { relation: 'child', name: '자녀2', age: 37 },
];

function heirRowHtml(h = {}) {
  const opts = Object.entries(HEIR_RELATIONS)
    .map(([k, v]) => `<option value="${k}"${k === (h.relation ?? 'child') ? ' selected' : ''}>${v}</option>`).join('');
  return `
    <div class="heir-row">
      <div><label>관계</label><select class="h-rel">${opts}</select></div>
      <div><label>이름</label><input class="h-name" value="${esc(h.name ?? '')}"></div>
      <div><label>나이</label><input class="h-age" inputmode="numeric" value="${h.age ?? ''}"></div>
      <div><label>장애 기대여명(년)</label><input class="h-dis" inputmode="numeric" value="${h.disabledYears ?? ''}" placeholder="0"></div>
      <button class="heir-del" type="button" title="삭제">✕</button>
      <div class="money-row">
        <div><label>받을 상속재산 (비우면 법정지분)</label><input class="h-amt" data-kind="money" inputmode="numeric" value=""><div class="money-hint"></div></div>
        <div><label>본인 사전증여 (가산분)</label><input class="h-gift" data-kind="money" inputmode="numeric" value=""><div class="money-hint"></div></div>
      </div>
    </div>`;
}

function addHeir(h) {
  const wrap = document.createElement('div');
  wrap.innerHTML = heirRowHtml(h);
  const row = wrap.firstElementChild;
  $('heirs').appendChild(row);
  bindMoneyInputs(row);
}

$('heirs').addEventListener('click', (e) => {
  const del = e.target.closest('.heir-del');
  if (del && $('heirs').children.length > 1) del.closest('.heir-row').remove();
});
$('addHeir').addEventListener('click', () => addHeir({ relation: 'child', name: `자녀${$('heirs').children.length}` }));
DEFAULT_HEIRS.forEach(addHeir);
bindMoneyInputs($('itForm'));

const m = (id) => moneyVal($(id));

function readInput() {
  const heirs = [...$('heirs').querySelectorAll('.heir-row')].map((row) => ({
    relation: row.querySelector('.h-rel').value,
    name: row.querySelector('.h-name').value.trim(),
    age: Number(row.querySelector('.h-age').value) || 0,
    disabledYears: Number(row.querySelector('.h-dis').value) || 0,
    amount: moneyVal(row.querySelector('.h-amt')),
    priorGift: moneyVal(row.querySelector('.h-gift')),
  }));
  const reportType = $('reportType').value;
  const spouseActualRaw = $('spouseActual').value.trim();
  return {
    deathDate: $('deathDate').value,
    abroad: $('abroad').value === '1',
    assets: {
      realEstate: m('realEstate'), financial: m('financial'), other: m('other'),
      insurance: m('insurance'), retirement: m('retirement'), trust: m('trust'),
    },
    presumed: { y1: { withdrawn: m('w1'), unexplained: m('u1') }, y2: { withdrawn: m('w2'), unexplained: m('u2') } },
    exclusions: { graveLand: m('graveLand'), cultural: m('cultural'), publicDonation: m('publicDonation') },
    liabilities: {
      publicCharges: m('publicCharges'), funeral: m('funeral'), enshrine: m('enshrine'),
      debts: m('debts'), financialDebts: m('financialDebts'),
    },
    priorGifts: {
      toHeirs: m('toHeirs'), toOthers: m('toOthers'), heirGiftTaxBase: m('heirGiftTaxBase'),
      giftTaxPaid: m('giftTaxPaid'), spouseGiftTaxBase: m('spouseGiftTaxBase'),
    },
    heirs,
    options: {
      spouseActual: spouseActualRaw ? m('spouseActual') : null,
      cohabitHouse: m('cohabitHouse'), appraisalFee: m('appraisalFee'),
      businessDeduct: m('businessDeduct'), farmingDeduct: m('farmingDeduct'),
      bequestToOthers: m('bequestToOthers'), renouncedToNext: m('renouncedToNext'),
      shortReinheritCredit: m('shortReinheritCredit'), foreignTaxCredit: m('foreignTaxCredit'),
      reportOnTime: reportType === 'ontime',
      noReturn: reportType === 'none',
    },
  };
}

const RATE_TABLE_HTML = `
  <table>
    <tr><th class="num">과세표준</th><th class="num">세율</th><th class="num">누진공제</th></tr>
    ${INH_RATE_TABLE.map((r, i) => `<tr><td class="num">${r.upTo === Infinity ? '30억 초과' : `${(r.upTo / 1e8).toLocaleString('ko-KR')}억 이하`}</td>
      <td class="num">${r.rate * 100}%</td><td class="num">${i ? won(r.acc) : '—'}</td></tr>`).join('')}
  </table>`;

function tableRow(label, amount, opts = {}) {
  const cls = [opts.total ? 'total' : '', amount < 0 ? 'minus' : ''].join(' ').trim();
  const lab = opts.fx ? `<button class="fx-btn" data-fx="${opts.fx}">${label}</button>` : label;
  return `<tr class="${cls}">
    <td class="rowlabel">${lab}${opts.note ? `<div style="font-size:13px;color:#5f7180;font-weight:400">${opts.note}</div>` : ''}</td>
    <td class="num">${amount < 0 ? `− ${won(-amount)}` : won(amount)}</td>
    ${opts.law !== undefined ? `<td style="font-size:12.5px;color:#6f8496;white-space:nowrap">${opts.law ? `상증법 ${opts.law}` : ''}</td>` : ''}
  </tr>`;
}

function calculate() {
  const input = readInput();
  const r = calcInheritanceTax(input);
  const b = r.breakdown;

  // ① 과세가액
  const valueRows = r.steps.map((s) => tableRow(s.label, s.amount, {
    total: s.total, law: s.law ?? '', note: s.detail,
    fx: s.label.startsWith('추정') ? 'presumed' : s.label.startsWith('장례') ? 'funeral' : s.label === '상속세 과세가액' ? 'value' : null,
  })).join('');

  // ② 상속공제
  const deductRows = b.deductItems.map((d) => tableRow(d.label, d.amount, {
    law: d.law, note: d.detail,
    fx: d.label.startsWith('기초') ? 'basic' : d.label.startsWith('배우자') ? 'spouse' : d.label.startsWith('금융') ? 'fin' : null,
  })).join('');

  // ③ 세액 계산
  const taxRows = [
    tableRow('상속세 과세가액', b.taxableValue, {}),
    tableRow('상속공제 (공제적용 한도 이내)', -b.deductApplied, { fx: 'limit', note: b.deductApplied < b.deductSum ? `공제 합계 ${won(b.deductSum)} → 한도 ${won(b.deductLimit)}` : `공제 합계 ${won(b.deductSum)} (한도 ${won(b.deductLimit)})` }),
    b.appraisal ? tableRow('감정평가수수료', -b.appraisal, {}) : '',
    tableRow('과세표준', b.taxBase, { total: true }),
    tableRow(`산출세액 (세율 ${b.rate * 100}% − 누진공제 ${won(b.accDeduct)})`, b.computedTax, { fx: 'rate' }),
    b.skipSurcharge ? tableRow('세대생략 할증세액', b.skipSurcharge, { fx: 'skip' }) : '',
    b.giftCredit ? tableRow('증여세액공제', -b.giftCredit, { fx: 'gift' }) : '',
    b.shortCredit ? tableRow('단기재상속 세액공제', -b.shortCredit, {}) : '',
    b.foreignCredit ? tableRow('외국납부세액공제', -b.foreignCredit, {}) : '',
    tableRow('신고세액공제 3%', -b.reportCredit, { note: b.reportCredit ? '' : '기한 내 신고가 아니어서 미적용' }),
    tableRow('납부할 상속세', r.tax, { total: true }),
  ].join('');

  // ④ 상속인별 안분
  const heirRows = r.heirs.map((h) => `
    <tr>
      <td class="rowlabel">${esc(h.name)} <span style="font-weight:400;color:#6f8496">(${esc(h.relationLabel)})</span></td>
      <td class="num">${won(h.received)}</td>
      <td class="num">${h.priorGift ? won(h.priorGift) : '—'}</td>
      <td class="num">${pct(h.ratio)}</td>
      <td class="num">${won(h.tax)}${h.skipSurcharge ? `<div style="font-size:12.5px;color:#943126">할증 ${won(h.skipSurcharge)} 포함</div>` : ''}</td>
    </tr>`).join('');

  fxMap = buildFx(r, input);

  $('result').innerHTML = `
    <div class="result-headline">
      <div class="label">납부할 상속세</div>
      <div class="amount">${won(r.tax)}</div>
      <div class="sub">과세가액 ${won(b.taxableValue)} − 상속공제 ${won(b.deductApplied)} = 과세표준 ${won(b.taxBase)}
        ${b.deadline ? ` · 신고기한 <b>${b.deadline}</b>` : ''}</div>
    </div>

    <h3 class="sec-title">1. 상속세 과세가액</h3>
    <div class="notice-wrap"><table class="notice">${valueRows}</table></div>

    <h3 class="sec-title">2. 상속공제</h3>
    <div class="notice-wrap"><table class="notice">${deductRows}
      ${tableRow('상속공제 합계', b.deductSum, { total: true, law: '' })}
      ${tableRow('공제적용 한도 (§24)', b.deductLimit, { law: '§24', fx: 'limit' })}
    </table></div>
    ${b.personal.length ? `<p class="opt-note">인적공제 내역: ${b.personal.map((x) => `${esc(x.who)} ${x.kind} ${won(x.amount)}`).join(' · ')}</p>` : ''}

    <h3 class="sec-title">3. 세액 계산</h3>
    <div class="notice-wrap"><table class="notice">${taxRows}</table></div>

    <h3 class="sec-title">4. 상속인별 납부세액 (받은 재산 + 본인 사전증여 비율로 안분 · 연대납부)</h3>
    <div class="notice-wrap"><table class="notice">
      <tr><th>상속인</th><th class="num">받는 상속재산</th><th class="num">사전증여</th><th class="num">비율</th><th class="num">납부세액</th></tr>
      ${heirRows}
    </table></div>

    ${r.notes.length ? `<h3 class="sec-title">유의사항</h3><ul class="notes">${r.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="lawref"><b>근거 법령</b><br>${r.lawRef.join('<br>')}</div>
    <div class="disclaimer">※ 참고용 계산입니다. 재산 평가(시가·보충적 평가), 가업·영농공제 요건, 가산세는 실제 신고 전 세무 전문가 확인이 필요합니다.</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

function buildFx(r, input) {
  const b = r.breakdown;
  const pr = input.presumed;
  return {
    presumed: {
      title: '추정상속재산 (§15)',
      html: `<p>사망 전 <b>1년 이내 2억</b> 또는 <b>2년 이내 5억</b> 이상 재산을 처분·인출하거나 채무를 부담했는데
        용도가 입증되지 않으면 상속재산으로 추정합니다.</p>
        <p>추정액 = 용도 불분명액 − min(인출액 × 20%, 2억)</p>
        <p>1년: ${won(pr.y1.unexplained)} − min(${won(pr.y1.withdrawn)} × 20%, 2억)<br>
        2년(누계): ${won(pr.y2.unexplained)} − min(${won(pr.y2.withdrawn)} × 20%, 2억)<br>
        → 큰 금액 <b>${won(b.presumedTotal)}</b> 가산</p>`,
    },
    funeral: {
      title: '장례비용 공제 (§14①2)',
      html: `<p>장례비 = max(500만, min(증빙액, 1,000만)) + min(봉안·자연장지 비용, 500만)</p>
        <p>= <b>${won(b.funeral)}</b></p>`,
    },
    value: {
      title: '상속세 과세가액',
      html: `<p>총상속재산 ${won(b.grossEstate)} − 비과세 ${won(b.nonTaxable)} − 공익출연 ${won(b.publicDonation)}
        − 공과금 ${won(b.publicCharges)} − 장례비 ${won(b.funeral)} − 채무 ${won(b.debts)}
        + 사전증여(상속인) ${won(b.priorHeirs)} + 사전증여(비상속인) ${won(b.priorOthers)}</p>
        <p>= <b>${won(b.taxableValue)}</b></p>`,
    },
    basic: {
      title: '기초·인적공제 vs 일괄공제 (§18·§20·§21)',
      html: `<p>기초공제 2억 + 인적공제(자녀 1인 5,000만 · 미성년 (19−나이)×1,000만 · 65세 이상 5,000만 · 장애인 기대여명×1,000만)</p>
        <p>= 2억 + ${won(b.personalSum)} = ${won(200_000_000 + b.personalSum)}</p>
        <p>일괄공제 5억과 비교해 큰 금액 적용 → <b>${won(b.basicDeduct)}</b></p>
        <p>${esc(b.lumpChoice)}</p>`,
    },
    spouse: {
      title: '배우자상속공제 (§19)',
      html: `<p>공제액 = max(5억, min(실제 상속액, 한도, 30억))</p>
        <p>한도 = (총상속재산 − 비상속인 유증 + 상속인 사전증여 − 비과세·불산입 − 공과금·채무) × 배우자 법정상속분 − 배우자 사전증여 과세표준
        = <b>${won(b.spouseLimit)}</b></p>
        <p>${esc(b.spouseDetail)}</p>
        <p>※ 5억 초과 공제는 신고기한 다음날부터 9개월 내 배우자 명의로 분할(등기)해야 인정됩니다.</p>`,
    },
    fin: {
      title: '금융재산 상속공제 (§22)',
      html: `<p>순금융재산 = 금융재산 − 금융채무 = ${won(b.netFinancial)}</p>
        <p>2천만 이하: 전액 · 2천만~1억: 2천만 · 1억 초과: 20% (한도 2억)</p>
        <p>= <b>${won(b.finDeduct)}</b></p>`,
    },
    limit: {
      title: '상속공제 적용 한도 (§24)',
      html: `<p>한도 = 과세가액 − 비상속인 유증·사인증여 − 상속포기로 후순위가 받은 재산 − 사전증여재산 과세표준(과세가액 5억 초과 시)</p>
        <p>= ${won(b.taxableValue)} − ${won(input.options.bequestToOthers)} − ${won(input.options.renouncedToNext)}
        − ${won(b.taxableValue > 500_000_000 ? input.priorGifts.heirGiftTaxBase : 0)} = <b>${won(b.deductLimit)}</b></p>
        <p>공제 합계 ${won(b.deductSum)} 중 <b>${won(b.deductApplied)}</b> 적용</p>`,
    },
    rate: {
      title: '산출세액 (§26)',
      html: `${RATE_TABLE_HTML}<p>${won(b.taxBase)} × ${b.rate * 100}% − ${won(b.accDeduct)} = <b>${won(b.computedTax)}</b></p>`,
    },
    skip: {
      title: '세대생략 할증 (§27)',
      html: `<p>할증세액 = 산출세액 × (손자녀 상속재산 ÷ 총 상속재산) × 30% (미성년자 20억 초과 40%)</p>
        ${b.skipRows.map((x) => `<p>${esc(x.who)}: ${won(b.computedTax)} × ${pct(x.ratio)} × ${x.rate * 100}% = <b>${won(x.add)}</b></p>`).join('')}`,
    },
    gift: {
      title: '증여세액공제 (§28)',
      html: `<p>가산한 사전증여재산의 증여세 산출세액을 공제(이중과세 조정).
        한도 = 상속세 산출세액 × (증여 과세표준 ÷ 상속 과세표준)</p>
        <p>입력 산출세액 ${won(input.priorGifts.giftTaxPaid)} → 공제 <b>${won(b.giftCredit)}</b></p>`,
    },
  };
}

bindFxButtons($('result'), () => fxMap, showFx);
$('calcBtn').addEventListener('click', calculate);
