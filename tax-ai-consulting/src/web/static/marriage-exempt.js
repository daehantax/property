/**
 * 혼인 1세대1주택 비과세 판정기 페이지
 * 판정 엔진(src/core/marriage-exempt.js)을 브라우저에서 직접 실행.
 */

import { judgeMarriageExempt, HOLDINGS } from '../../core/marriage-exempt.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const KOREAN_UNIT = (n) => {
  n = Number(n);
  if (!isFinite(n) || n === 0) return '';
  const eok = Math.floor(n / 100000000);
  const man = Math.round((n % 100000000) / 10000);
  let s = '';
  if (eok) s += eok.toLocaleString('ko-KR') + '억';
  if (man) s += (s ? ' ' : '') + man.toLocaleString('ko-KR') + '만';
  return s ? s + '원' : n.toLocaleString('ko-KR') + '원';
};

const YN = (name, def) => `<select class="${name}"><option value="1" ${def ? 'selected' : ''}>예 (조정대상지역)</option><option value="0" ${def ? '' : 'selected'}>아니오 (비조정)</option></select>`;
const money = (cls, val) => `<input class="${cls}" data-kind="money" inputmode="numeric" value="${fmt(val)}"><div class="money-hint"></div>`;
const date = (cls, val) => `<input type="date" class="${cls}" value="${val}">`;
const holdingOptions = (sel) => HOLDINGS.map((h) => `<option value="${h.key}" ${h.key === sel ? 'selected' : ''}>${h.label}</option>`).join('');

function renderFields() {
  $('fields').innerHTML = `
    <div class="grid2">
      <div class="full"><label>배우자 A — 혼인 전 보유</label><select class="m-a">${holdingOptions('house')}</select></div>
      <div class="full"><label>배우자 B — 혼인 전 보유</label><select class="m-b">${holdingOptions('house-right')}</select></div>
      <div><label>혼인(신고)일</label>${date('m-marriage', '2020-06-01')}</div>
      <div><label>최초양도주택 양도(예정)일</label>${date('m-sale', '2026-03-01')}</div>
      <div class="full"><label>먼저 양도하는 주택(최초양도주택)</label>
        <select class="m-seller">
          <option value="A" selected>배우자 A가 보유하던 주택</option>
          <option value="B">배우자 B가 보유하던 주택</option>
        </select>
      </div>
      <div><label>양도주택 취득일</label>${date('m-acq', '2015-01-01')}</div>
      <div><label>취득 당시 조정대상지역</label>${YN('m-adj', false)}</div>
      <div><label>이 주택 실거주 기간(년)</label><input class="m-live" inputmode="numeric" value="0"></div>
      <div><label>양도가액</label>${money('m-price', 1_000_000_000)}</div>
    </div>
    <div id="branchBox"></div>
    <div class="chk"><input type="checkbox" class="m-first" checked> 혼인 후 세대가 <b>처음</b> 양도하는 주택입니다</div>`;
  bindMoney($('fields'));
  ['m-a', 'm-b', 'm-seller'].forEach((cls) => {
    $('fields').querySelector('.' + cls).addEventListener('change', renderBranch);
  });
  renderBranch();
  $('result').style.display = 'none';
  $('empty').style.display = 'block';
}

function sellerType() {
  const seller = val('m-seller');
  return seller === 'A' ? val('m-a') : val('m-b');
}

function renderBranch() {
  const t = sellerType();
  let html = '';
  if (t === 'house') {
    html = `<div class="req-note">가목(1주택만 보유)자의 혼인 전 주택 → <b>제2호</b>로 판정합니다. 추가 입력이 필요 없습니다.</div>`;
  } else if (t === 'house-right') {
    html = `
      <div class="sub-box">
        <h5>제3호 — 혼인 전 함께 보유하던 권리</h5>
        <div class="grid2">
          <div class="full"><label>권리 종류</label>
            <select class="m-rightkind">
              <option value="first" selected>원조합원(최초) 조합원입주권 — 가목</option>
              <option value="acquired">승계취득한 조합원입주권 — 나목</option>
              <option value="presale">분양권 — 다목</option>
            </select>
          </div>
          <div class="full" id="rightDate"></div>
        </div>
        <div class="req-note" id="rightNote"></div>
      </div>`;
  } else if (t === 'right') {
    html = `<div class="req-note">나목(입주권·분양권만 보유)자의 권리가 완공되어 <b>혼인일 이후 취득한 신축주택</b> → <b>제4호</b>로 판정합니다.
      위 「양도주택 취득일」에 신축주택 취득(보유기간 기산)일을 입력하세요 — 원조합원은 종전주택 취득일 통산, 승계취득·분양권은 완공(사용승인·잔금)일.</div>`;
  } else {
    html = `<div class="req-note" style="color:#b03a2e">제1호(가·나·다목)에 해당하지 않는 보유 유형은 혼인 특례를 적용할 수 없습니다.</div>`;
  }
  $('branchBox').innerHTML = html;
  const rk = $('branchBox').querySelector('.m-rightkind');
  if (rk) { rk.addEventListener('change', renderRightDate); renderRightDate(); }
}

function renderRightDate() {
  const kind = $('branchBox').querySelector('.m-rightkind')?.value;
  const box = $('rightDate');
  const note = $('rightNote');
  if (!box) return;
  if (kind === 'first') {
    box.innerHTML = `<label>사업시행계획 인가일</label>${date('m-approval', '2018-01-01')}`;
    note.textContent = '가목 요건: 이 주택이 사업시행인가일 이후 거주 목적으로 취득 + 취득 후 1년 이상 거주(위 실거주 기간 입력).';
  } else {
    box.innerHTML = `<label>${kind === 'presale' ? '분양권' : '입주권'} 취득일</label>${date('m-rightacq', '2019-06-01')}`;
    note.textContent = kind === 'presale'
      ? '다목 요건: 분양권 취득 전부터 이 주택을 소유하고 있었을 것.'
      : '나목 요건: 승계 입주권 취득 전부터 이 주택을 소유하고 있었을 것.';
  }
}

function bindMoney(scope) {
  scope.querySelectorAll('[data-kind="money"]').forEach((inp) => {
    const hint = inp.nextElementSibling?.classList?.contains('money-hint') ? inp.nextElementSibling : null;
    const update = () => {
      const raw = inp.value.replace(/[^\d]/g, '');
      inp.value = raw ? fmt(raw) : '';
      if (hint) hint.textContent = raw ? KOREAN_UNIT(raw) : '';
    };
    inp.addEventListener('input', update);
    update();
  });
}

const num = (el) => Number(String(el?.value ?? '').replace(/[^\d.-]/g, '')) || 0;
const val = (cls) => document.querySelector('.' + cls)?.value;
const checked = (cls) => document.querySelector('.' + cls)?.checked || false;

function checkRow(c) {
  const cls = c.warn ? 'warn' : (c.ok ? 'ok' : 'no');
  const ic = c.warn ? '!' : (c.ok ? '✓' : '✕');
  return `<div class="check ${cls}"><div class="ic">${ic}</div><div><div class="lbl">${c.label}</div><div class="det">${c.detail}</div></div></div>`;
}

function render(r) {
  const badge = { exempt: '비과세', partial: '부분 비과세', taxable: '과세' }[r.verdict];
  $('result').innerHTML = `
    <div class="verdict ${r.verdict}">
      <span class="tag">${badge}</span>
      <div class="head">${r.headline}</div>
    </div>
    <div>${r.checklist.map(checkRow).join('')}</div>
    ${r.reasons.length ? `<div class="reasons"><b style="font-size:12.5px;color:#7d6608">참고</b><ul style="padding-left:18px;margin:6px 0 0">${r.reasons.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : ''}
    <div class="lawref">${r.lawRef.join(' · ')}</div>
    <div class="muted">※ 참고용 판정입니다. 세대 판정·다른 특례와의 중복·동거봉양 합가 등 개별 사실관계는 반영되지 않을 수 있어, 실제 신고 전 세무 전문가 확인이 필요합니다.</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

function judge() {
  const r = judgeMarriageExempt({
    spouseA: val('m-a'), spouseB: val('m-b'), seller: val('m-seller'),
    marriageDate: val('m-marriage'), saleDate: val('m-sale'),
    salePrice: num(document.querySelector('.m-price')),
    isFirstSale: checked('m-first'),
    houseAcquireDate: val('m-acq'),
    acquiredInAdjust: val('m-adj') === '1',
    liveYears: num(document.querySelector('.m-live')),
    rightKind: val('m-rightkind') || 'first',
    approvalDate: val('m-approval') || null,
    rightAcquireDate: val('m-rightacq') || null,
  });
  render(r);
}

$('judgeBtn').addEventListener('click', judge);
renderFields();
