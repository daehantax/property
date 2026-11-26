/**
 * 종합부동산세 계산기 (주택 목록형) — jongbu.html
 *
 * 계산 엔진(src/core/jongbu-calc.js)의 calcJongbu·classifyJongbuHouse 를 브라우저에서 실행한다.
 * 화면 구성은 대한세무법인 홈페이지 종부세 계산기와 같고(이 집 → 소유 형태 → 나이·보유기간),
 * 결과는 이 사이트의 고지서식 양식(항목을 누르면 산식 팝업)으로 보여 준다.
 */

import {
  calcJongbu, classifyJongbuHouse, priceFromPropertyTaxBase, priceFromPropertyTax, propertyTaxBaseFromTax, JONGBU_RULES,
} from '../../core/jongbu-calc.js';
import { SIGUNGU, SIDO_LABEL, classifyArea } from '../../core/regions-data.js';
import {
  won, fmt, bindMoneyInputs, moneyVal, initFxDialog, bindFxButtons, AGGR_RATE_TABLE_HTML,
} from './notice-ui.js';
import { PRICE_PRESETS } from './official-price-presets.js';

const $ = (id) => document.getElementById(id);
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const mode = () => document.querySelector('input[name="mode"]:checked').value;
const priceMode = () => document.querySelector('input[name="priceMode"]:checked').value;
const showFx = initFxDialog();
let fxMap = {};

// 집 종류 선택지
const PICKS = [
  ['normal', '일반 주택'], ['excl', '합산배제 주택 (등록임대 등)'],
  ['land', '다른 주택의 부속토지 — 건물 주인이 다른 땅 (§8④ 1호)'],
  ['temp', '이사용 새집 — 일시적 2주택 (§8④ 2호)'],
  ['inherit', '상속주택 (§8④ 3호)'],
  ['local', '지방 저가주택 · 인구감소지역 주택 (§8④ 4호)'],
];
const EXCL = [
  ['rent', '등록 임대주택', '임대사업자 등록 · 임대료 5% 이내 인상 · 의무임대기간 준수'],
  ['daycare', '가정어린이집', '인가를 받아 5년 이상 운영'],
  ['staff', '사원용 주택', '종업원에게 무상·저가 제공'],
  ['dorm', '기숙사', ''],
  ['unsold', '미분양 주택', '주택건설사업자 보유분'],
  ['demolish', '멸실 예정 주택', '주택건설사업자가 사업용으로 취득'],
  ['heritage', '등록문화유산 주택', ''],
  ['senior', '노인복지주택', ''],
  ['etc', '그 밖의 합산배제 주택', ''],
];

/* ── 1. 이 집: 단지 선택 · 재산세 과세표준 역산 ───────── */
function renderPresets() {
  $('inPreset').innerHTML = '<option value="">직접 입력</option>'
    + PRICE_PRESETS.map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.sub)})</option>`).join('');
}
function syncPreset() {
  const p = PRICE_PRESETS.find((x) => x.id === $('inPreset').value);
  const units = p ? p.units : [];
  $('unitBox').hidden = !units.length;
  $('inUnit').innerHTML = '<option value="">평형 선택</option>'
    + units.map((u, i) => `<option value="${i}">${esc(u.label)} — ${won(u.price)}</option>`).join('');
  if (!p) { $('presetNote').textContent = ''; return; }
  // 미공시 단지인데 등록된 가액도 없으면 「재산세 고지서로 환산」으로 바로 넘긴다
  if (!units.length) setPriceMode(p.unpublished ? 'convert' : 'public');
  $('presetNote').textContent = units.length
    ? `등록 가액 기준: ${p.year}년 · ${p.source || '출처 미기재'}`
    : (p.unpublished
      ? '공시가격이 아직 공시되지 않은 단지입니다 → 아래에서 재산세 고지서 금액으로 환산합니다.'
      : '공시가격이 공시된 단지입니다 → 공시가격알리미에서 조회한 금액을 넣어 주세요.');
}
function setPrice(n) {
  $('inPrice').value = n ? fmt(n) : '';
  $('inPrice').dispatchEvent(new Event('input'));
}
function setPriceMode(v) {
  document.querySelector(`input[name="priceMode"][value="${v}"]`).checked = true;
  syncPriceMode();
}
function syncPriceMode() {
  const conv = priceMode() === 'convert';
  $('publicBox').hidden = conv;
  $('convertBox').hidden = !conv;
  if (conv) convert();
}

/** 재산세 고지서 금액 → 이 집 가격 환산. 환산 결과를 돌려주고 화면에도 바로 보여 준다 */
function convert() {
  const kind = $('inConvKind').value;
  const amt = moneyVal($('inConvAmt'));
  const ratio = Number($('inConvRatio').value);
  $('convLabel').textContent = kind === 'base' ? '재산세 과세표준' : '재산세 본세 (7월분 + 9월분 합계)';
  $('inConvAmt').placeholder = kind === 'base' ? '예) 1,012,500,000' : '예) 3,420,000';
  $('convHint').textContent = kind === 'base'
    ? '고지서 「과세표준」 칸의 금액. 가장 정확합니다.'
    : '도시지역분·지방교육세·지역자원시설세는 빼고 「재산세」만. 7월분과 9월분을 더한 금액입니다.';
  const out = $('convOut');
  if (!amt) { out.hidden = true; return 0; }
  const base = kind === 'base' ? amt : propertyTaxBaseFromTax(amt);
  const price = kind === 'base' ? priceFromPropertyTaxBase(amt, ratio) : priceFromPropertyTax(amt, ratio);
  out.hidden = false;
  out.innerHTML = `환산한 이 집 가격 <b>${won(price)}</b><br>`
    + (kind === 'tax' ? `재산세 ${won(amt)} → 과세표준 ${won(base)} (표준세율 역산) ` : `과세표준 ${won(amt)} `)
    + `÷ ${Math.round(ratio * 100)}%`;
  return price;
}
/** 지금 계산에 쓸 이 집 가격과 출처 */
function currentPrice() {
  if (priceMode() === 'convert') return { price: convert(), src: 'est' };
  const p = PRICE_PRESETS.find((x) => x.id === $('inPreset').value);
  return { price: moneyVal($('inPrice')), src: p && p.unpublished ? 'local' : 'public' };
}

/* ── 2. 다른 집 목록 ───────── */
const selOpts = (list, cur = '') => list.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('');
let houseSeq = 0;
function addHouse() {
  const id = `h${++houseSeq}`;
  const d = document.createElement('div');
  d.className = 'row-mini';
  d.innerHTML = `
    <div class="no"></div><button type="button" class="del" title="삭제">×</button>
    <div class="grid2">
      <div class="wide"><label>공시가격 (집 전체)</label><input class="h-price" data-kind="money" inputmode="numeric" value=""><div class="money-hint"></div></div>
      <div><label>내 지분 (%)</label><input class="h-share" inputmode="decimal" value="100"></div>
      <div class="h-ownerBox"><label>명의</label><select class="h-owner"><option value="me">본인</option><option value="spouse">배우자</option></select></div>
      <div><label>시·도</label><select class="h-sido"><option value="">시·도</option>${selOpts(Object.keys(SIGUNGU).map((k) => [k, SIDO_LABEL[k] ?? k]))}</select></div>
      <div><label>시·군·구</label><select class="h-sgg"><option value="">시·군·구</option></select></div>
      <div class="wide"><label>집 종류</label><select class="h-pick">${selOpts(PICKS)}</select></div>
    </div>
    <div class="sub-opts s-excl" hidden><b>어떤 합산배제 주택인가요?</b>
      ${EXCL.map(([v, t, n]) => `<label><input type="radio" name="${id}-excl" value="${v}"><span>${t}${n ? ` <small>— ${n}</small>` : ''}</span></label>`).join('')}</div>
    <div class="sub-opts s-inherit" hidden><label><input type="checkbox" class="h-within5"><span>상속받은 지 <b>5년이 지나지 않았습니다</b> <small>(6월 1일 기준)</small></span></label></div>
    <div class="sub-opts s-local" hidden>
      <label style="display:block"><span>취득일 <small>(인구감소지역 주택은 2024.1.4 ~ 2026.12.31 취득분만 대상)</small></span>
        <input type="date" class="h-acq" style="margin-top:4px"></label>
      <label class="h-sejongBox" hidden><input type="checkbox" class="h-sejong"><span>세종시 <b>읍·면</b> 지역입니다</span></label>
    </div>
    <div class="area-tags" hidden></div>
    <p class="verdict-line" hidden></p>
    <ul class="req-list" hidden></ul>`;
  d.querySelector('.del').addEventListener('click', () => { d.remove(); renumber(); syncApplyBox(); });
  d.querySelector('.h-sido').addEventListener('change', (e) => {
    d.querySelector('.h-sgg').innerHTML = '<option value="">시·군·구</option>' + selOpts((SIGUNGU[e.target.value] || []).map((n) => [n, n]));
  });
  d.addEventListener('input', () => verdict(d));
  d.addEventListener('change', () => verdict(d));
  $('houses').appendChild(d);
  bindMoneyInputs(d);
  renumber();
  syncOwnerBoxes();
}
function renumber() {
  document.querySelectorAll('#houses .no').forEach((n, i) => { n.textContent = `다른 집 ${i + 1}`; });
}
function syncOwnerBoxes() {
  const couple = mode() === 'couple';
  document.querySelectorAll('#houses .h-ownerBox').forEach((b) => { b.style.visibility = couple ? 'visible' : 'hidden'; });
}
function readHouse(d, i) {
  const ex = d.querySelector('.s-excl input:checked');
  return {
    label: `다른 집 ${i + 1}`,
    price: moneyVal(d.querySelector('.h-price')),
    share: Math.min(100, Math.max(0, Number(d.querySelector('.h-share').value) || 0)) / 100,
    owner: mode() === 'couple' ? d.querySelector('.h-owner').value : 'me',
    pick: d.querySelector('.h-pick').value,
    sido: d.querySelector('.h-sido').value, name: d.querySelector('.h-sgg').value,
    exclType: ex ? ex.value : '',
    within5: d.querySelector('.h-within5').checked,
    acquireDate: d.querySelector('.h-acq').value,
    sejongRural: d.querySelector('.h-sejong').checked,
  };
}
// 주소를 고르면 인구감소지역·접경지역 여부를 배지로 보여 준다
function areaTags(h) {
  if (!h.sido || !h.name) return '';
  const a = classifyArea(h.sido, h.name);
  const tag = (on, text, cls) => `<span class="atag ${on ? cls : 'off'}">${text} ${on ? '○' : '×'}</span>`;
  return `<b>${esc(a.label)}</b>`
    + tag(a.depop === 'depop', '인구감소지역', 'depop')
    + (a.depop === 'interest' ? '<span class="atag int">인구감소관심지역 ○</span>' : '')
    + (a.vitalPlus ? '<span class="atag vital">인구활력+지역</span>' : '')
    + tag(a.border, '접경지역', 'border')
    + `<span class="atag ${a.capital ? 'cap' : 'off'}">${a.capital ? '수도권' : '수도권 밖'}</span>`
    + (a.metroCity ? `<span class="atag cap">광역시 ${a.gun ? '군' : '구'}</span>` : '');
}
// 요건 판정 결과를 카드 아래에 바로 보여 준다
function verdict(d, i = 0) {
  const h = readHouse(d, i);
  for (const k of ['excl', 'inherit', 'local']) d.querySelector(`.s-${k}`).hidden = h.pick !== k;
  d.querySelector('.h-sejongBox').hidden = h.sido !== '세종';
  const c = classifyJongbuHouse(h);
  const tags = d.querySelector('.area-tags');
  const tagHtml = areaTags(h);
  tags.hidden = !tagHtml;
  tags.innerHTML = tagHtml;
  const v = d.querySelector('.verdict-line');
  v.hidden = !c.msg || !h.price;
  v.className = `verdict-line ${c.ok ? 'ok' : 'no'}`;
  v.textContent = `${c.ok ? '✓ ' : '※ '}${c.msg}`;
  // 지방 주택: 요건별 점검표 (공시가격 · 소재지 · 인구감소지역 · 접경지역 · 시행규칙 지정)
  const list = d.querySelector('.req-list');
  list.hidden = !(c.checks && h.price);
  list.innerHTML = (c.checks || []).map((x) => `<li class="${x.ok === null ? 'info' : x.ok ? 'ok' : 'no'}">
    <i>${x.ok === null ? '·' : x.ok ? '✓' : '✗'}</i><span><b>${esc(x.label)}</b><small>${esc(x.detail)}</small></span></li>`).join('');
  syncApplyBox();
  return c;
}
/** §8⑤ 신청 체크 칸 — 신청이 필요한 집(2~4호)이 하나라도 있을 때만 보인다 */
function syncApplyBox() {
  const box = $('applyBox');
  if (!box) return;
  const need = mode() === 'multi' && [...document.querySelectorAll('#houses .row-mini')].some((d) => {
    const h = readHouse(d, 0);
    if (!h.price) return false;
    const k = classifyJongbuHouse(h).kind;
    return k === 'temp' || k === 'inherit' || k === 'rural';
  });
  box.hidden = !need;
}
function readHouses() {
  const list = [...document.querySelectorAll('#houses .row-mini')].map((d, i) => {
    const h = readHouse(d, i);
    const c = verdict(d, i);
    h.kind = c.kind;
    h.basis = c.basis || '';
    h.card = d;
    return h;
  }).filter((h) => h.price > 0);
  // 지방 저가주택·인구감소지역 주택은 1채만 인정된다. 2채 이상이면 모두 일반 주택으로 계산한다.
  const rural = list.filter((h) => h.kind === 'rural');
  if (rural.length > 1) {
    for (const h of rural) {
      h.kind = 'normal';
      const v = h.card.querySelector('.verdict-line');
      v.hidden = false; v.className = 'verdict-line no';
      v.textContent = '※ 지방 주택 특례는 1채만 인정됩니다. 2채 이상이라 일반 주택으로 계산합니다.';
    }
  }
  return list;
}

/* ── 소유 형태에 따라 입력칸 보이기 ───────── */
function syncMode() {
  const m = mode();
  $('shareBox').hidden = m === 'single';
  $('multiBox').hidden = m === 'single';
  $('optCard').style.display = m === 'couple' ? 'none' : '';
  // 재산세 공정시장가액비율 기본값: 이 집 한 채뿐(단독·부부)이면 45%, 다른 집이 더 있으면 60%
  // 이미 고지서 금액을 넣었다면 건드리지 않는다 — 비율이 바뀌면 환산 가격이 크게 달라지기 때문
  if (!moneyVal($('inConvAmt'))) $('inConvRatio').value = m === 'multi' ? '0.6' : '0.45';
  if (priceMode() === 'convert') convert();
  $('housesLabel').textContent = m === 'couple' ? '부부에게 다른 집이 있으면 넣어 주세요 (없으면 비워 두세요)' : '내 명의로 된 다른 집을 모두 넣어 주세요';
  $('housesHint').innerHTML = m === 'couple'
    ? '상속주택·이사용 새집·지방 주택은 <b>그 집을 가진 분을 납세의무자로 정하면</b> 1주택 특례가 유지됩니다. 일반 주택이 있으면 특례를 받을 수 없습니다.'
    : '종부세는 <b>사람별</b>로 계산합니다. 배우자 명의 집은 넣지 마세요.';
  if (m === 'multi' && !document.querySelector('#houses .row-mini')) addHouse();
  if (m === 'multi' && $('inShare').value === '50') $('inShare').value = '100';
  if (m === 'couple' && $('inShare').value === '100') $('inShare').value = '50';
  $('creditHint').textContent = m === 'couple'
    ? '특례를 신청할 때 납세의무자(지분과 관계없이 부부가 정한 한 분)의 나이·보유기간입니다. 상속주택 등이 있으면 그 집을 가진 분이 납세의무자가 됩니다.'
    : m === 'multi' ? '다른 집이 모두 합산배제·상속주택 등이어서 1주택자로 계산될 때만 적용됩니다. 재건축 주택은 옛집을 산 날부터 셉니다.'
      : '합산 최대 80%. 재건축 주택은 없어진 옛집을 취득한 날부터, 배우자에게 상속받은 집은 배우자가 취득한 날부터 셉니다.';
  syncOwnerBoxes();
  syncApplyBox();
}

/* ── 결과: 고지서식 표 + 산식 팝업 ───────── */
const rateRow = (r) => {
  const b = r.three ? JONGBU_RULES.brackets3 : JONGBU_RULES.brackets2;
  const i = b.findIndex(([cap]) => r.base <= cap);
  return `과세표준 ${won(r.base)} → 최고 적용세율 ${pct(b[i][1])} (${r.three ? '3주택 이상' : '2주택 이하'} 세율표, 구간별 누진 합계)`;
};
const HEAVY_TABLE_HTML = `
  <table>
    <tr><th class="num">과세표준</th><th class="num">세율</th><th class="num">누진공제</th></tr>
    <tr><td class="num">12억 이하</td><td class="num">0.5~1.0%</td><td class="num">2주택 이하와 같음</td></tr>
    <tr><td class="num">25억 이하</td><td class="num">2.0%</td><td class="num">1,440만</td></tr>
    <tr><td class="num">50억 이하</td><td class="num">3.0%</td><td class="num">3,940만</td></tr>
    <tr><td class="num">94억 이하</td><td class="num">4.0%</td><td class="num">8,940만</td></tr>
    <tr><td class="num">94억 초과</td><td class="num">5.0%</td><td class="num">1억 8,340만</td></tr>
  </table>`;

/** 한 사람의 계산 결과를 고지서식 표로. key 는 산식 팝업 구분용 접두어 */
function noticeTable(r, key, { withCredit }) {
  const rows = [];
  const row = (label, amount, o = {}) => rows.push(`
    <tr class="${o.minus ? 'minus' : ''} ${o.total ? 'total' : ''}">
      <td class="rowlabel">${o.fx ? `<button class="fx-btn" data-fx="${key}-${o.fx}">${label}</button>` : label}
        ${o.note ? `<div style="font-size:13px;color:#5f7180;font-weight:400">${o.note}</div>` : ''}</td>
      <td class="num">${o.minus && amount > 0 ? '△' : ''}${won(amount)}</td>
    </tr>`);
  const itemNote = r.items.length > 1 || r.items[0].share < 1
    ? r.items.map((it) => `${esc(it.label)} ${won(it.full)}${it.share < 1 ? ` × ${pct(it.share)}` : ''}`).join(' + ') : '';
  row('공시가격 합계 (내 몫)', r.pub, { note: itemNote });
  row(`기본공제 (${r.deduct === JONGBU_RULES.deductOneHouse ? '1세대 1주택자 12억' : '개인 9억'})`, Math.min(r.deduct, r.pub), { minus: true });
  row(`과세표준 = (공시가격 − 공제) × 공정시장가액비율 ${pct(r.fairRatio)}`, r.base);
  if (r.base > 0) {
    row(`산출세액 (${r.three ? '3주택 이상 세율' : '2주택 이하 세율'})`, r.gross, { fx: 'chulse' });
    row('공제할 재산세액 (이중과세 조정)', r.propCredit, { fx: 'jaesan', minus: true });
    if (withCredit) row(`세액공제 (연령 ${pct(r.ageRate)} + 장기보유 ${pct(r.holdRate)})`, r.credit, {
      fx: 'gongje', minus: true,
      note: r.creditShare < 1 ? `이 집 몫(${pct(r.creditShare)})의 세액에만 적용` : '',
    });
    if (r.prevYearTotal > 0) row('세부담상한 초과 차감', r.capReduction, { fx: 'sanghan', minus: true, note: `전년도 보유세 ${won(r.prevYearTotal)} × 150% 한도` });
  }
  row('종합부동산세 (결정세액)', r.jongbu);
  row('농어촌특별세 (종부세 × 20%)', r.rural);
  row('합계 (농특세 포함, 연간)', r.total, { total: true });

  fxMap[`${key}-chulse`] = {
    title: '산출세액 — 누진세율 (종부세법 §9)',
    html: `<p><b>산식</b>: 과세표준 × 세율 − 누진공제 (속산표)</p>${AGGR_RATE_TABLE_HTML}
      ${r.three ? `<p style="margin-top:8px"><b>3주택 이상</b>은 과세표준 12억 초과분부터 아래 세율입니다.</p>${HEAVY_TABLE_HTML}` : ''}
      <div class="fx-now">이번 계산: ${rateRow(r)} = <b>${won(r.gross)}</b></div>
      <p style="font-size:13px;color:#5f7180">※ 세율 적용 주택 수에는 합산배제 주택, 상속주택, 일시적 2주택의 신규주택, 지방 저가주택을 세지 않습니다 (국세청 「2026 주택과 세금」 110~111쪽).</p>`,
  };
  fxMap[`${key}-jaesan`] = {
    title: '공제할 재산세액 — 이중과세 조정 (종부령 §4의3)',
    html: `<p>같은 주택에 재산세와 종부세가 겹치는 부분을 종부세에서 빼 줍니다.</p>
      <div class="fx-formula">공제할 재산세액 = 재산세 부과세액
  × (종부세 과세표준 × 재산세 공정시장가액비율 × 재산세 표준세율 0.4%)
  ÷ (주택을 합산하여 재산세 표준세율로 계산한 재산세 상당액)</div>
      <div class="fx-now">이번 계산: 재산세 부과세액 ${won(r.propTax)}${r.propTaxEntered ? ' (직접 입력)' : ' (공시가격으로 계산)'}
× (${won(r.base)} × ${pct(r.propRatio)} × 0.4% = ${won(r.propNumerator)})
÷ (${won(r.pub)} × ${pct(r.propRatio)} 에 표준세율 = ${won(r.propDenominator)})
= <b>${won(r.propCredit)}</b> (10원 미만 절사)</div>
      <p style="font-size:13px;color:#5f7180">※ 국세청 「2026 주택과 세금」 114쪽 산식. 주택이 여러 채면 재산세는 주택마다 따로 누진되지만 분모는 합산해 한 번만 누진하므로, 공제액이 실제 낸 재산세보다 작아집니다.
      재산세 공정시장가액비율은 1세대 1주택 43~45%, 그 외 60%이며 섞여 있으면 공시가격 가중평균을 썼습니다. 도시지역분·지방교육세는 공제 대상이 아닙니다.</p>`,
  };
  fxMap[`${key}-gongje`] = {
    title: '세액공제 — 연령·장기보유 (종부세법 §9)',
    html: `<p>1세대 1주택자만 적용. 두 공제는 <b>합산 80% 한도</b>입니다.</p>
      <table><tr><th>장기보유</th><th class="num">공제율</th><th>연령</th><th class="num">공제율</th></tr>
      <tr><td>5년 이상</td><td class="num">20%</td><td>만 60세 이상</td><td class="num">20%</td></tr>
      <tr><td>10년 이상</td><td class="num">40%</td><td>만 65세 이상</td><td class="num">30%</td></tr>
      <tr><td>15년 이상</td><td class="num">50%</td><td>만 70세 이상</td><td class="num">40%</td></tr></table>
      <div class="fx-formula">세액공제 = (산출세액 − 공제할 재산세액) × 이 집 몫 비율 × min(연령 + 장기보유, 80%)</div>
      <div class="fx-now">이번 계산: (${won(r.gross)} − ${won(r.propCredit)}) × ${pct(r.creditShare)} × ${pct(r.creditRate)} = <b>${won(r.credit)}</b></div>
      <p style="font-size:13px;color:#5f7180">※ 상속주택·신규주택·지방 저가주택 때문에 1주택자로 보는 경우, 그 주택분 세액은 세액공제 대상에서 빠집니다 (책 122쪽).</p>`,
  };
  fxMap[`${key}-sanghan`] = {
    title: '세부담상한 — 전년 대비 150% (종부세법 §10)',
    html: `<p>올해 보유세(재산세 + 종부세)가 <b>전년도 보유세 상당액의 150%</b>를 넘으면 초과분은 종부세로 부과하지 않습니다.</p>
      <div class="fx-formula">상한액 = 전년도 (재산세 + 종부세) 상당액 × 150%
차감액 = max(올해 재산세 + 종부세 − 상한액, 0)</div>
      <div class="fx-now">이번 계산: 상한액 = ${won(r.prevYearTotal)} × 150% = ${won(r.capLimit)}
올해 보유세 = 재산세 ${won(r.propTax)} + 종부세 ${won(r.jongbu + r.capReduction)}
→ 차감액 <b>${won(r.capReduction)}</b></div>`,
  };
  return `<div class="notice-wrap"><table class="notice">
    <tr><th>구분 <span style="font-weight:400;font-size:13px;color:#5f7180">(밑줄 항목 클릭 = 산식 보기)</span></th><th class="num">금액</th></tr>
    ${rows.join('')}</table></div>`;
}

const headline = (label, total, sub) => `
  <div class="result-headline"><div class="label">${label}</div><div class="amount">${won(total)}</div><div class="sub">${sub}</div></div>`;
const cmpCard = (title, total, small, win) => `
  <div class="${win ? 'win' : ''}"><h5>${title}${win ? '<span class="tag">유리</span>' : ''}</h5><p>${won(total)}</p><small>${small}</small></div>`;
const summary = (r) => `내 명의 ${r.total}채 중 세율 적용 주택 수 ${r.counted}채${r.excl ? ` · 합산배제 ${r.excl}채 제외` : ''}${r.special ? ` · 상속 등 특례 ${r.special}채` : ''}`;

/** 1세대 1주택자 판정표 — 종부세법 §8④(1~4호)·⑤(신청) */
function judgeBox(r) {
  const j = r.judge;
  if (!j || !j.rows.length) return '';
  const state = j.oneHouseHolder ? 'ok' : j.notApplied ? 'warn' : 'no';
  const title = j.oneHouseHolder ? '1세대 1주택자로 봅니다' : j.notApplied ? '요건은 갖췄지만 신청하지 않았습니다' : '1세대 1주택자가 아닙니다';
  const applyCell = (x) => !x.needApply ? '<span class="jb-pill gray">신청 불필요</span>'
    : j.applied ? '<span class="jb-pill green">신청함</span>' : '<span class="jb-pill red">미신청</span>';
  return `<div class="judge-box ${state}">
    <h4>${state === 'ok' ? '✅' : state === 'warn' ? '⚠️' : '✗'} 1세대 1주택자 판정 — ${title}</h4>
    <p>${esc(j.reason)}</p>
    <div class="notice-wrap"><table class="notice">
      <tr><th>집</th><th>종류</th><th>근거</th><th>1주택 판정 주택 수</th><th>신청 (§8⑤)</th></tr>
      <tr><td class="rowlabel">이 집</td><td>본인 주택</td><td>—</td><td>포함</td><td>—</td></tr>
      ${j.rows.map((x) => `<tr><td class="rowlabel">${esc(x.label)}</td><td>${esc(x.name)}</td><td>${esc(x.clause)}</td>
        <td>${x.counts ? '<b>포함</b>' : '제외'}</td><td>${x.kind === 'normal' ? '—' : applyCell(x)}</td></tr>`).join('')}
    </table></div>
    ${j.needApply ? `<p class="apply-note"><b>신청 (종부세법 §8⑤)</b> — 일시적 2주택·상속주택·지방 저가주택은 <b>해당 연도 ${JONGBU_RULES.applyFrom}~${JONGBU_RULES.applyTo}</b>에
      관할세무서장에게 신청해야 1세대 1주택자로 봅니다(홈택스 가능). 한 번 신청하면 변동이 없는 한 다음 해에도 유지됩니다.
      놓쳤다면 <b>12월 1일~15일</b> 납부기간에 신고·납부로 바로잡을 수 있습니다.</p>` : ''}
  </div>`;
}

const MISS_HTML = `
  <div class="miss"><b style="color:#1a5276">꼭 확인하세요 · 놓치기 쉬운 6가지</b>
    <details><summary>① 부부 공동명의 — 「1주택 특례」가 더 쌀 수 있습니다</summary>
      <p>부부 공동명의 1주택은 <em>각자 9억씩 공제</em>받는 방법과, 한 사람이 <em>12억 공제 + 고령·장기보유 공제(최대 80%)</em>를 받는 특례 중 유리한 쪽을 고를 수 있습니다. 납세의무자는 <em>지분과 관계없이 부부가 정할 수 있어</em>(2026년 2월 시행령 개정), 나이가 많고 오래 보유한 분으로 정하면 유리합니다.</p></details>
    <details><summary>② 재건축 아파트 — 보유기간은 옛집을 산 날부터</summary>
      <p>장기보유 공제의 보유기간은 새 아파트 입주일이 아니라 <em>재건축으로 없어진 옛 주택을 취득한 날</em>부터 계산합니다. 배우자에게 상속받은 집은 <em>배우자가 취득한 날</em>부터 셉니다 (보유기간 특례 신청 9.16~9.30).</p></details>
    <details><summary>③ 상속받은 집이 있어도 1주택 혜택을 받을 수 있습니다</summary>
      <p><em>상속 후 5년 이내</em>이거나 <em>상속 지분 40% 이하</em> 또는 <em>지분 공시가격 6억(수도권 밖 3억) 이하</em>이면 신청에 따라 1세대 1주택자로 계산합니다. 상속주택 공시가격은 과세표준에는 더해집니다.</p></details>
    <details><summary>④ 이사 가려고 잠깐 2주택 · 지방 저가주택</summary>
      <p>새집을 사고 <em>3년 안에 옛집을 파는</em> 일시적 2주택, <em>지방 저가주택 1채</em>(공시가격 4억 이하 — 수도권은 가평·연천·강화·옹진군만)나 <em>인구감소지역 주택</em>을 더 가진 경우에도 <em>9.16~9.30에 신청하면</em> 1세대 1주택자 방식으로 계산합니다(종부세법 §8④·⑤). 신청하지 않으면 9억 공제·세액공제 없음으로 고지됩니다. 다른 주택의 <em>부속토지만</em> 더 가진 경우는 신청 없이 적용됩니다.</p></details>
    <details><summary>⑤ 임대주택 — 등록이 말소되면 합산배제도 끝납니다</summary>
      <p>합산배제 신고한 등록임대주택은 종부세 계산에서 빠지지만, <em>임대등록이 말소</em>되거나 임대료 5% 상한 등 요건을 어기면 그 뒤로는 과세 대상입니다.</p></details>
    <details><summary>⑥ 고지서가 틀렸다면 — 12월 15일까지 바로잡을 수 있습니다</summary>
      <p>특례 신청(9.16~9.30)을 놓쳤거나 고지 내용이 사실과 다르면 <em>12월 1일~15일 납부기간 안에 신고·납부</em>로 바로잡을 수 있습니다. 지난 연도분도 <em>5년 이내 경정청구</em>를 검토할 수 있습니다.</p></details>
  </div>`;

function render(r, src) {
  fxMap = {};
  let h = '';
  if (r.mode === 'single') {
    const t = r.main;
    h += headline('종합부동산세 + 농특세 (연간)', t.total, t.base <= 0
      ? '공시가격이 기본공제 12억 이하 → 종부세 없음'
      : `1세대 1주택 · 12억 공제 · 종부세 ${won(t.jongbu)} + 농특세 ${won(t.rural)} · 세액공제 ${pct(t.creditRate)}`);
    h += noticeTable(t, 'main', { withCredit: true });
  } else if (r.mode === 'couple') {
    const eachSub = `부부 합계 (본인 ${won(r.me.total)} + 배우자 ${won(r.spouse.total)})`;
    if (!r.eligible) {
      h += headline('부부 공동명의 + 다른 집 — 각자 계산 (연간)', r.eachTotal, '1주택 특례 불가 → 각자 9억 공제');
      h += `<p class="advice">${r.reason === 'split'
        ? '상속주택 등이 <b>부부 양쪽에 나뉘어</b> 있으면 1주택 특례를 받을 수 없습니다. 특례는 납세의무자 한 사람이 그 집들을 모두 가진 경우에만 유지됩니다.'
        : '부부 중 한 분이라도 <b>일반 주택</b>을 더 갖고 있으면 1주택 특례를 받을 수 없습니다. 그 집이 상속주택·이사용 새집·등록임대주택에 해당하면 「집 종류」를 바꿔 다시 계산해 보세요.'}</p>`;
    } else {
      const sp = r.special;
      h += headline('부부 공동명의 — 유리한 방법 기준 (연간)', Math.min(r.eachTotal, sp.total),
        r.better === 'special' ? '1주택 특례 신청이 유리' : r.better === 'each' ? '각자 9억 공제가 유리' : '두 방법의 세액이 같음');
      h += `<div class="cmp">${cmpCard('각자 9억씩 공제', r.eachTotal, eachSub, r.better === 'each')}
        ${cmpCard('1주택 특례 신청', sp.total, `12억 공제 + 세액공제 ${pct(sp.creditRate)}${r.specialN ? ' (공동명의 집 몫에만)' : ''}`, r.better === 'special')}</div>`;
      if (r.specialN) h += `<p class="advice">특례는 상속주택 등을 가진 <b>${sp.payer === 'spouse' ? '배우자' : '본인'}</b>을(를) 납세의무자로 정해야 유지됩니다. 3번의 나이·보유기간도 그분 기준으로 넣어 주세요.</p>`;
      if (r.better === 'special') h += `<p class="advice">특례를 신청하면 <b>${won(r.diff)}</b> 덜 냅니다. 고지서가 「각자 계산」으로 나왔다면 12월 15일까지 바로잡을 수 있습니다.</p>`;
      else if (r.better === 'each') h += `<p class="advice">각자 내는 쪽이 <b>${won(r.diff)}</b> 유리합니다. 특례를 이미 신청했다면 다시 검토해 보세요.</p>`;
    }
    h += `<p class="tbl-title">각자 계산 — 본인 (지분 ${pct(r.share)})</p>${noticeTable(r.me, 'me', { withCredit: false })}`;
    h += `<p class="tbl-title">각자 계산 — 배우자 (지분 ${pct(1 - r.share)})</p>${noticeTable(r.spouse, 'sp', { withCredit: false })}`;
    if (r.eligible) h += `<p class="tbl-title">1주택 특례 — 납세의무자 한 사람이 합산</p>${noticeTable(r.special.taxpayer, 'tp', { withCredit: true })}`;
  } else if (r.eligible) {
    const win = r.diff > 0;
    h += headline('종합부동산세 + 농특세 — 1세대 1주택자 방식 (연간)', r.oneHouse.total, summary(r));
    h += judgeBox(r);
    h += `<div class="cmp">${cmpCard(r.judge.needApply ? '1주택자 방식 (신청함)' : '1주택자 방식', r.oneHouse.total, `12억 공제 + 세액공제 ${pct(r.oneHouse.creditRate)} (이 집 몫에만)`, win)}
      ${cmpCard(r.judge.needApply ? '신청하지 않았다면' : '일반 방식이었다면', r.main.total, '9억 공제 · 세액공제 없음', false)}</div>`;
    if (win) h += `<p class="advice">1세대 1주택자 방식으로 <b>${won(r.diff)}</b> 덜 냅니다. 세대원에게 다른 집이 없어야 하며, 합산배제 임대주택만 더 가진 경우에는 이 집에 주민등록이 되어 있고 실제로 살아야 합니다.</p>`;
    h += `<p class="tbl-title">1주택자 방식</p>${noticeTable(r.oneHouse, 'one', { withCredit: true })}`;
    h += `<p class="tbl-title">${r.judge.needApply ? '신청하지 않았을 때' : '일반 방식'}</p>${noticeTable(r.main, 'main', { withCredit: false })}`;
  } else if (r.judge && r.judge.notApplied) {
    // 요건은 갖췄지만 §8⑤ 신청을 하지 않음 → 9억 방식이 실제 세액
    h += headline('종합부동산세 + 농특세 — 신청하지 않아 일반 방식 (연간)', r.main.total, `${summary(r)} · 9억 공제 · 세액공제 없음`);
    h += judgeBox(r);
    h += `<div class="cmp">${cmpCard('지금 (미신청)', r.main.total, '9억 공제 · 세액공제 없음', false)}
      ${cmpCard('신청하면', r.ifApplied.total, `12억 공제 + 세액공제 ${pct(r.ifApplied.creditRate)} (이 집 몫에만)`, r.diff > 0)}</div>`;
    if (r.diff > 0) h += `<p class="advice">신청하면 <b>${won(r.diff)}</b> 덜 냅니다. 2번의 「신청했습니다」를 체크하면 신청 기준으로 다시 계산합니다.</p>`;
    h += `<p class="tbl-title">지금 — 일반 방식</p>${noticeTable(r.main, 'main', { withCredit: false })}`;
    h += `<p class="tbl-title">신청했을 때 — 1주택자 방식</p>${noticeTable(r.ifApplied, 'one', { withCredit: true })}`;
  } else {
    const t = r.main;
    h += headline('종합부동산세 + 농특세 (연간)', t.total, t.base <= 0
      ? `${summary(r)} · 공시가격 합계가 기본공제 9억 이하 → 종부세 없음`
      : `${summary(r)} · 9억 공제 · ${r.three ? '3주택 이상 세율' : '2주택 이하 세율'}`);
    h += judgeBox(r);
    if (r.total === r.counted) h += '<p class="advice">다른 집 중에 상속주택·이사용 새집·등록임대주택·지방 저가주택이 있다면 「집 종류」를 바꿔 다시 계산해 보세요. 세금이 크게 줄 수 있습니다.</p>';
    h += noticeTable(t, 'main', { withCredit: false });
  }
  if (src === 'local') h += '<p style="font-size:13.5px;color:#7d6608;margin:8px 0 0">※ 이 집은 <b>공시가격 미공시 — 지자체 산정가액 기준</b>으로 계산했습니다. 종부세의 주택 공시가격은 공시된 가액이 없으면 지방자치단체장이 산정한 가액입니다 (국세청 「2026 주택과 세금」 107쪽).</p>';
  if (src === 'est') h += '<p style="font-size:13.5px;color:#7d6608;margin:8px 0 0">※ 이 집의 가액은 <b>재산세 과세표준으로 역산한 추정값</b>입니다. 실제 고지액과 차이가 날 수 있습니다.</p>';
  h += MISS_HTML;
  h += `<div class="lawref"><b>근거 법령</b><br>${r.lawRef.join('<br>')}</div>
    <div class="disclaimer">※ 2026년 귀속 현행 세법 기준 참고용 계산입니다. 법인, 재산세 감면·과세표준상한, 준공 후 미분양·소형 신축주택 특례는 반영하지 않았고,
      합산배제·특례주택은 고른 대로 요건을 갖춘 것으로 보고 계산하므로 실제 고지서와 다를 수 있습니다. 2027년 이후 개편안은 「2026 개편안 비교」 탭에서 확인하세요.</div>`;
  $('result').innerHTML = h;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

function calculate() {
  const m = mode();
  const { price, src } = currentPrice();
  if (!price) { (priceMode() === 'convert' ? $('inConvAmt') : $('inPrice')).focus(); return; }
  const share = Math.min(100, Math.max(0, Number($('inShare').value) || 0)) / 100;
  // 1번에서 재산세 본세로 환산했고 집이 이 집 한 채뿐(단독명의)이면, 그 금액이 곧 실제 재산세다
  let assessed = m === 'couple' ? 0 : moneyVal($('inPropTax'));
  if (!assessed && m === 'single' && priceMode() === 'convert' && $('inConvKind').value === 'tax') assessed = moneyVal($('inConvAmt'));
  render(calcJongbu({
    mode: m, price,
    share: m === 'single' ? 1 : share,
    houses: m === 'single' ? [] : readHouses(),
    age: Number($('inAge').value) || 0,
    holdYears: Number($('inHold').value) || 0,
    assessedPropertyTax: assessed,
    prevYearTotal: m === 'couple' ? 0 : moneyVal($('inPrev')),
    applied: $('inApplied').checked,
  }), src);
}

/* ── 이벤트 연결 ───────── */
renderPresets();
bindMoneyInputs(document);
bindFxButtons($('jbResult'), () => fxMap, showFx);
$('inPreset').addEventListener('change', syncPreset);
$('inUnit').addEventListener('change', () => {
  const p = PRICE_PRESETS.find((x) => x.id === $('inPreset').value);
  const u = p && p.units[Number($('inUnit').value)];
  if (u && $('inUnit').value !== '') setPrice(u.price);
});
document.querySelectorAll('input[name="priceMode"]').forEach((r) => r.addEventListener('change', syncPriceMode));
for (const id of ['inConvKind', 'inConvAmt', 'inConvRatio']) {
  $(id).addEventListener('input', convert);
  $(id).addEventListener('change', convert);
}
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => { syncMode(); syncApplyBox(); }));
$('addHouse').addEventListener('click', addHouse);
$('calcBtn').addEventListener('click', calculate);
syncMode();
syncPriceMode();
