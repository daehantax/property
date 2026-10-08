/**
 * 상속세 계산기 (inherit-tax.html)
 *
 * calcInheritanceTax 기반. 신고서 순서대로 과세가액 → 상속공제 → 과세표준 → 산출세액 →
 * 할증·세액공제 → 납부세액을 표로 보여 주고, 상속인별 납부세액을 안분한다.
 * 밑줄 친 항목을 누르면 현재 값이 대입된 산식 팝업을 띄운다.
 */

import {
  calcInheritanceTax, aggregateEstateItems, ESTATE_ITEM_TYPES, HEIR_RELATIONS, INH_RATE_TABLE,
} from '../../core/inheritance-tax.js';
import { won, bindMoneyInputs, moneyVal, initFxDialog, bindFxButtons } from './notice-ui.js';

const $ = (id) => document.getElementById(id);
const showFx = initFxDialog();
let fxMap = {};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const pct = (r) => `${(r * 100).toFixed(1)}%`;

// ── 상속인 입력 행 ── (각 행에 고정 id 를 붙여, 재산 명세의 「취득 상속인」 선택이 행 삭제에도 어긋나지 않게 한다)
const DEFAULT_HEIRS = [
  { relation: 'spouse', name: '배우자', age: 68 },
  { relation: 'child', name: '자녀1', age: 40 },
  { relation: 'child', name: '자녀2', age: 37 },
];
let heirSeq = 0;

function heirRowHtml(h = {}) {
  const opts = Object.entries(HEIR_RELATIONS)
    .map(([k, v]) => `<option value="${k}"${k === (h.relation ?? 'child') ? ' selected' : ''}>${v}</option>`).join('');
  return `
    <div class="heir-row" data-hid="${++heirSeq}">
      <div><label>관계</label><select class="h-rel">${opts}</select></div>
      <div><label>이름</label><input class="h-name" value="${esc(h.name ?? '')}"></div>
      <div><label>나이</label><input class="h-age" inputmode="numeric" value="${h.age ?? ''}"></div>
      <div><label>장애 기대여명(년)</label><input class="h-dis" inputmode="numeric" value="${h.disabledYears ?? ''}" placeholder="0"></div>
      <button class="heir-del" type="button" title="삭제">✕</button>
    </div>`;
}

function addHeir(h) {
  const wrap = document.createElement('div');
  wrap.innerHTML = heirRowHtml(h);
  $('heirs').appendChild(wrap.firstElementChild);
  refreshHeirSelects();
}

const heirRows = () => [...$('heirs').querySelectorAll('.heir-row')];
const heirLabel = (row, i) => {
  const name = row.querySelector('.h-name').value.trim();
  return name || `${HEIR_RELATIONS[row.querySelector('.h-rel').value]} ${i + 1}`;
};

$('heirs').addEventListener('click', (e) => {
  const del = e.target.closest('.heir-del');
  if (del && heirRows().length > 1) { del.closest('.heir-row').remove(); refreshHeirSelects(); }
});
$('heirs').addEventListener('input', refreshHeirSelects);
$('heirs').addEventListener('change', refreshHeirSelects);
$('addHeir').addEventListener('click', () => addHeir({ relation: 'child', name: `자녀${heirRows().length}` }));

// ── 재산·부채 명세 ──
const TYPE_BY_KEY = new Map(ESTATE_ITEM_TYPES.map((t) => [t.key, t]));
const DEFAULT_ITEMS = [
  { type: 'realEstate', name: '거주 아파트', amount: 1_200_000_000, heir: 'spouse' },
  { type: 'realEstate', name: '상가', amount: 300_000_000, heir: '' },
  { type: 'financial', name: '예금·주식', amount: 500_000_000, heir: '' },
];

function itemRowHtml(it = {}) {
  const typeOpts = ESTATE_ITEM_TYPES
    .map((t) => `<option value="${t.key}"${t.key === (it.type ?? 'realEstate') ? ' selected' : ''}>${t.label}</option>`).join('');
  return `
    <div class="item-row">
      <div><label>구분</label><select class="i-type">${typeOpts}</select></div>
      <div><label>명칭·내역</label><input class="i-name" value="${esc(it.name ?? '')}" placeholder="예: ○○아파트"></div>
      <div><label>금액 (사망일 시가)</label><input class="i-amt" data-kind="money" inputmode="numeric" value="${it.amount ? it.amount.toLocaleString('ko-KR') : ''}"><div class="money-hint"></div></div>
      <div><label class="i-heir-label">취득 상속인</label><select class="i-heir" data-want="${esc(it.heir ?? '')}"></select></div>
      <button class="heir-del i-del" type="button" title="삭제">✕</button>
    </div>`;
}

function addItem(it) {
  const wrap = document.createElement('div');
  wrap.innerHTML = itemRowHtml(it);
  const row = wrap.firstElementChild;
  $('items').appendChild(row);
  bindMoneyInputs(row);
  refreshHeirSelects();
  return row;
}

/** 명세 각 행의 「취득 상속인」 선택지를 현재 상속인 목록으로 다시 그린다 (선택값은 상속인 고정 id 로 유지) */
function refreshHeirSelects() {
  const rows = heirRows();
  for (const sel of $('items').querySelectorAll('.i-heir')) {
    const itemRow = sel.closest('.item-row');
    const t = TYPE_BY_KEY.get(itemRow.querySelector('.i-type').value);
    let want = sel.value || sel.dataset.want || '';
    if (want === 'spouse') want = rows.find((r) => r.querySelector('.h-rel').value === 'spouse')?.dataset.hid ?? '';
    sel.dataset.want = '';
    if (t.kind === 'giftOther') {
      sel.innerHTML = '<option value="">비상속인 (해당 없음)</option>';
      sel.disabled = true;
      continue;
    }
    sel.disabled = false;
    const first = t.kind === 'gift' ? '' : '<option value="">법정상속분대로 (미정)</option>';
    sel.innerHTML = first + rows.map((r, i) => `<option value="${r.dataset.hid}">${esc(heirLabel(r, i))}</option>`).join('');
    if (want && rows.some((r) => r.dataset.hid === want)) sel.value = want;
    itemRow.querySelector('.i-heir-label').textContent = t.kind === 'gift' ? '증여받은 상속인' : t.kind === 'debt' ? '승계 상속인' : '취득 상속인';
  }
  renderItemSummary();
}

$('items').addEventListener('click', (e) => {
  const del = e.target.closest('.i-del');
  if (del) { del.closest('.item-row').remove(); renderItemSummary(); }
});
$('items').addEventListener('change', (e) => { if (e.target.matches('.i-type')) refreshHeirSelects(); else renderItemSummary(); });
$('items').addEventListener('input', renderItemSummary);
document.querySelector('.item-add-row').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (b) addItem({ type: b.dataset.add }).querySelector('.i-amt').focus();
});

function readItems() {
  const ids = heirRows().map((r) => r.dataset.hid);
  return [...$('items').querySelectorAll('.item-row')].map((row) => {
    const hid = row.querySelector('.i-heir').value;
    return {
      type: row.querySelector('.i-type').value,
      name: row.querySelector('.i-name').value.trim(),
      amount: moneyVal(row.querySelector('.i-amt')),
      heir: hid ? ids.indexOf(hid) : '',
    };
  });
}

function readHeirs() {
  return heirRows().map((row, i) => ({
    relation: row.querySelector('.h-rel').value,
    name: heirLabel(row, i),
    age: Number(row.querySelector('.h-age').value) || 0,
    disabledYears: Number(row.querySelector('.h-dis').value) || 0,
  }));
}

/** 명세 합계 요약 (입력 중 실시간) */
function renderItemSummary() {
  const el = $('itemSummary');
  if (!el) return;
  const agg = aggregateEstateItems(readItems(), readHeirs());
  const a = agg.assets, l = agg.liabilities;
  const assetSum = Object.values(a).reduce((x, y) => x + y, 0);
  const debtSum = Object.values(l).reduce((x, y) => x + y, 0);
  el.innerHTML = `재산 합계 <b>${won(assetSum)}</b> · 채무·공과금 <b>${won(debtSum)}</b>
    · 사전증여 <b>${won(agg.priorGifts.toHeirs + agg.priorGifts.toOthers)}</b>
    ${agg.unassigned ? `<br>법정상속분대로 나눌 순재산 ${won(agg.unassigned)}` : ''}`;
}

const m = (id) => moneyVal($(id));

function readInput() {
  const items = readItems();
  const agg = aggregateEstateItems(items, readHeirs());
  const reportType = $('reportType').value;
  const spouse = agg.heirs.find((h) => h.relation === 'spouse');
  return {
    deathDate: $('deathDate').value,
    abroad: $('abroad').value === '1',
    assets: agg.assets,
    presumed: { y1: { withdrawn: m('w1'), unexplained: m('u1') }, y2: { withdrawn: m('w2'), unexplained: m('u2') } },
    exclusions: { graveLand: m('graveLand'), cultural: m('cultural'), publicDonation: m('publicDonation') },
    liabilities: { ...agg.liabilities, funeral: m('funeral'), enshrine: m('enshrine') },
    priorGifts: {
      ...agg.priorGifts, heirGiftTaxBase: m('heirGiftTaxBase'),
      giftTaxPaid: m('giftTaxPaid'), spouseGiftTaxBase: m('spouseGiftTaxBase'),
    },
    heirs: agg.heirs,
    options: {
      // 명세에서 상속인을 지정했으면 배우자 순취득액이 곧 실제 상속액 (0원이어도 최소 5억 공제)
      spouseActual: spouse && agg.anyAssigned ? spouse.amount : null,
      cohabitHouse: m('cohabitHouse'), appraisalFee: m('appraisalFee'),
      businessDeduct: m('businessDeduct'), farmingDeduct: m('farmingDeduct'),
      bequestToOthers: m('bequestToOthers'), renouncedToNext: m('renouncedToNext'),
      shortReinheritCredit: m('shortReinheritCredit'), foreignTaxCredit: m('foreignTaxCredit'),
      reportOnTime: reportType === 'ontime',
      noReturn: reportType === 'none',
    },
    _items: items,
    _agg: agg,
  };
}

DEFAULT_HEIRS.forEach(addHeir);
DEFAULT_ITEMS.forEach(addItem);
bindMoneyInputs($('itForm'));

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
    total: s.total || s.subtotal, law: s.law ?? '', note: s.detail,
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
      <td class="rowlabel">${esc(h.name)}${h.name === h.relationLabel ? '' : ` <span style="font-weight:400;color:#6f8496">(${esc(h.relationLabel)})</span>`}</td>
      <td class="num">${won(h.received)}</td>
      <td class="num">${h.priorGift ? won(h.priorGift) : '—'}</td>
      <td class="num">${pct(h.ratio)}</td>
      <td class="num">${won(h.tax)}${h.skipSurcharge ? `<div style="font-size:12.5px;color:#943126">할증 ${won(h.skipSurcharge)} 포함</div>` : ''}</td>
    </tr>`).join('');

  // 상속재산·부채 명세 + 상속인별 배분
  const heirNames = input.heirs.map((h) => h.name);
  const kindOf = (t) => ESTATE_ITEM_TYPES.find((x) => x.key === t);
  const itemRows = input._items.filter((it) => it.amount > 0).map((it) => {
    const t = kindOf(it.type);
    const who = t.kind === 'giftOther' ? '비상속인' : it.heir === '' ? '법정상속분대로' : heirNames[it.heir];
    const debt = t.kind === 'debt';
    return `<tr class="${debt ? 'minus' : ''}"><td>${esc(t.label)}</td><td>${esc(it.name || '—')}</td>
      <td class="num">${debt ? `− ${won(it.amount)}` : won(it.amount)}</td><td>${esc(who)}</td></tr>`;
  }).join('');
  const al = input._agg.allocation;
  const allocRows = input.heirs.map((h, i) => `<tr>
      <td class="rowlabel">${esc(h.name)}${h.name === HEIR_RELATIONS[h.relation] ? '' : ` <span style="font-weight:400;color:#6f8496">(${esc(HEIR_RELATIONS[h.relation])})</span>`}</td>
      <td class="num">${won(al[i].assets)}</td><td class="num">${al[i].debts ? `− ${won(al[i].debts)}` : '—'}</td>
      <td class="num">${al[i].legalPart ? won(al[i].legalPart) : '—'}</td><td class="num"><b>${won(al[i].net)}</b></td>
      <td class="num">${al[i].gifts ? won(al[i].gifts) : '—'}</td></tr>`).join('');
  const sum = (k) => al.reduce((x, y) => x + y[k], 0);

  // 인쇄용 보고서 머리말
  const today = new Date().toISOString().slice(0, 10);
  $('reportHead').innerHTML = `
    <h1>상속세 계산 보고서</h1>
    <table>
      <tr><td>피상속인</td><td><b>${esc($('decedent').value.trim() || '—')}</b></td><td>상속개시일</td><td>${esc(input.deathDate || '—')}</td></tr>
      <tr><td>신고·납부기한</td><td>${esc(b.deadline || '—')}</td><td>작성일</td><td>${today}</td></tr>
      <tr><td>상속인</td><td colspan="3">${input.heirs.map((h) => `${esc(h.name)}(${esc(HEIR_RELATIONS[h.relation])}${h.age ? `, ${h.age}세` : ''})`).join(' · ')}</td></tr>
      ${$('preparer').value.trim() ? `<tr><td>작성자</td><td colspan="3">${esc($('preparer').value.trim())}</td></tr>` : ''}
    </table>`;
  $('reportActions').style.display = 'flex';

  fxMap = buildFx(r, input);

  $('result').innerHTML = `
    <div class="result-headline">
      <div class="label">납부할 상속세</div>
      <div class="amount">${won(r.tax)}</div>
      <div class="sub">과세가액 ${won(b.taxableValue)} − 상속공제 ${won(b.deductApplied)} = 과세표준 ${won(b.taxBase)}
        ${b.deadline ? ` · 신고기한 <b>${b.deadline}</b>` : ''}</div>
    </div>

    <h3 class="sec-title">1. 상속재산·부채 명세</h3>
    <div class="notice-wrap"><table class="notice">
      <tr><th>구분</th><th>명칭·내역</th><th class="num">금액</th><th>취득(승계) 상속인</th></tr>
      ${itemRows || '<tr><td colspan="4">입력된 항목 없음</td></tr>'}
    </table></div>

    <h3 class="sec-title">2. 상속인별 재산 배분</h3>
    <div class="notice-wrap"><table class="notice heir-tbl">
      <tr><th>상속인</th><th class="num">지정 재산</th><th class="num">승계 채무</th><th class="num">법정지분 배분</th><th class="num">순취득액</th><th class="num">사전증여</th></tr>
      ${allocRows}
      <tr class="total"><td class="rowlabel">합계</td><td class="num">${won(sum('assets'))}</td><td class="num">${sum('debts') ? `− ${won(sum('debts'))}` : '—'}</td>
        <td class="num">${won(sum('legalPart'))}</td><td class="num">${won(sum('net'))}</td><td class="num">${won(sum('gifts'))}</td></tr>
    </table></div>
    <p class="opt-note">법정지분 배분 = 「법정상속분대로」로 둔 재산 − 채무를 배우자 1.5 : 자녀 각 1로 나눈 금액. 배우자 순취득액이 배우자상속공제의 실제 상속액이 됩니다.
      ${input._agg.anyAssigned ? '' : '취득 상속인을 지정한 항목이 없어 전부 법정상속분으로 배분했습니다(배우자공제는 법정상속분 한도 가정).'}</p>

    <h3 class="sec-title">3. 상속세 과세가액</h3>
    <div class="notice-wrap"><table class="notice">${valueRows}</table></div>

    <h3 class="sec-title">4. 상속공제</h3>
    <div class="notice-wrap"><table class="notice">${deductRows}
      ${tableRow('상속공제 합계', b.deductSum, { total: true, law: '' })}
      ${tableRow('공제적용 한도 (§24)', b.deductLimit, { law: '§24', fx: 'limit' })}
    </table></div>
    ${b.personal.length ? `<p class="opt-note">인적공제 내역: ${b.personal.map((x) => `${esc(x.who)} ${x.kind} ${won(x.amount)}`).join(' · ')}</p>` : ''}

    <h3 class="sec-title">5. 세액 계산</h3>
    <div class="notice-wrap"><table class="notice">${taxRows}</table></div>

    <h3 class="sec-title">6. 상속인별 납부세액 (받은 재산 + 본인 사전증여 비율로 안분 · 연대납부)</h3>
    <div class="notice-wrap"><table class="notice heir-tbl">
      <tr><th>상속인</th><th class="num">받는 순상속재산</th><th class="num">사전증여</th><th class="num">비율</th><th class="num">납부세액</th></tr>
      ${heirRows}
      <tr class="total"><td class="rowlabel">합계</td>
        <td class="num">${won(r.heirs.reduce((s, h) => s + h.received, 0))}</td>
        <td class="num">${won(r.heirs.reduce((s, h) => s + h.priorGift, 0))}</td><td class="num">100%</td>
        <td class="num">${won(r.heirs.reduce((s, h) => s + h.tax, 0))}</td></tr>
    </table></div>
    <p class="opt-note">받는 순상속재산은 2번 배분표의 순취득액입니다(취득 상속인 미지정 시 장례비 등 차감 후 순재산을 법정상속분으로 배분).
      원 단위 절사로 합계가 납부세액과 몇 원 다를 수 있습니다.</p>

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
      html: `<p>순금융재산 = (금융재산 + 간주 보험금·신탁재산) − 금융채무 = ${won(b.financialAssets)} − ${won(input.liabilities.financialDebts)} = ${won(b.netFinancial)}</p>
        <p>※ 퇴직금은 금융재산공제 대상에서 제외(금융회사 예치 전 채권)</p>
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
$('printBtn').addEventListener('click', () => {
  // 접힌 산식 등은 인쇄 CSS 가 정리 — 파일 이름은 브라우저가 문서 제목으로 정한다
  const prev = document.title;
  const who = $('decedent').value.trim();
  document.title = `상속세계산보고서${who ? `-${who}` : ''}-${new Date().toISOString().slice(0, 10)}`;
  window.print();
  document.title = prev;
});
$('calcBtn').addEventListener('click', calculate);
