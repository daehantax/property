/**
 * 1세대 1주택 비과세 판정기 페이지
 * 판정 엔진(src/core/single-house-exempt.js)을 브라우저에서 직접 실행.
 */

import {
  judgeSingleHouseExempt, judgeTempTwoExempt, judgeSaengsang,
} from '../../core/single-house-exempt.js';

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

let mode = 'single';

const YN = (name, def) => `<select class="${name}"><option value="1" ${def ? 'selected' : ''}>예 (조정대상지역)</option><option value="0" ${def ? '' : 'selected'}>아니오 (비조정)</option></select>`;
const money = (cls, val) => `<input class="${cls}" data-kind="money" inputmode="numeric" value="${fmt(val)}"><div class="money-hint"></div>`;
const date = (cls, val) => `<input type="date" class="${cls}" value="${val}">`;

const SAENGSANG_FORM = `
  <div class="sub" id="saengForm" style="display:none">
    <h5>상생임대주택 요건 (충족 시 2년 거주요건 면제)</h5>
    <div class="grid2">
      <div><label>직전 임대차 실제 임대(개월)</label><input class="s-prev" inputmode="numeric" value="18"></div>
      <div><label>상생 임대차 실제 임대(개월)</label><input class="s-sang" inputmode="numeric" value="24"></div>
      <div><label>임대료 인상률(%)</label><input class="s-inc" inputmode="decimal" value="5"></div>
      <div><label>상생 계약 체결일</label>${date('s-date', '2023-03-01')}</div>
    </div>
    <div class="req-note">요건: 직전 1년6개월↑ 임대 · 상생 2년↑ 임대 · 인상률 5% 이하 · 2021.12.20~2026.12.31 체결</div>
  </div>`;

function renderFields() {
  if (mode === 'single') {
    $('fields').innerHTML = `
      <div class="grid2">
        <div><label>취득일</label>${date('f-acq', '2019-03-01')}</div>
        <div><label>양도(예정)일</label>${date('f-sale', '2024-05-01')}</div>
        <div><label>취득 당시 조정대상지역</label>${YN('f-adj', false)}</div>
        <div><label>실거주 기간(년)</label><input class="f-live" inputmode="numeric" value="0"></div>
        <div><label>양도가액</label>${money('f-price', 1_000_000_000)}</div>
        <div><label>양도 시점 세대 주택수</label><select class="f-one"><option value="1" selected>1주택</option><option value="0">2주택 이상</option></select></div>
      </div>
      <div class="chk"><input type="checkbox" class="f-saeng"> 상생임대주택 (거주요건 면제 특례)</div>
      ${SAENGSANG_FORM}
      <div class="chk"><input type="checkbox" class="f-contract"> 무주택 세대가 조정지역 공고 전 매매계약+계약금 지급 (거주요건 배제)</div>
      <div class="chk"><input type="checkbox" class="f-final"> 과거 다주택 → 1주택으로 전환됨 (보유기간 기산 특례)</div>
      <div class="sub" id="finalBox" style="display:none">
        <h5>최종 1주택이 된 날</h5>
        ${date('f-finaldate', '2021-06-01')}
        <div class="req-note">2021.1.1~2022.5.9 양도분만 이 날부터 보유 2년 재기산 (2022.5.10 폐지)</div>
      </div>`;
  } else {
    $('fields').innerHTML = `
      <div class="grid2">
        <div><label>종전주택 취득일</label>${date('t-prevacq', '2019-01-01')}</div>
        <div><label>신규주택 취득일</label>${date('t-newacq', '2022-01-01')}</div>
        <div><label>종전주택 양도(예정)일</label>${date('t-sale', '2024-06-01')}</div>
        <div><label>종전 취득 당시 조정지역</label>${YN('t-adj', false)}</div>
        <div><label>종전주택 실거주(년)</label><input class="t-live" inputmode="numeric" value="0"></div>
        <div><label>종전주택 양도가액</label>${money('t-price', 900_000_000)}</div>
      </div>
      <div class="chk"><input type="checkbox" class="f-saeng"> 종전주택이 상생임대주택 (거주요건 면제)</div>
      ${SAENGSANG_FORM}`;
  }
  bindMoney($('fields'));
  const saeng = $('fields').querySelector('.f-saeng');
  if (saeng) saeng.addEventListener('change', () => { $('saengForm').style.display = saeng.checked ? 'block' : 'none'; });
  const fin = $('fields').querySelector('.f-final');
  if (fin) fin.addEventListener('change', () => { $('finalBox').style.display = fin.checked ? 'block' : 'none'; });
  $('result').style.display = 'none';
  $('empty').style.display = 'block';
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
const val = (cls) => $('fields').querySelector('.' + cls)?.value;
const checked = (cls) => $('fields').querySelector('.' + cls)?.checked || false;

function readSaengsang() {
  if (!checked('f-saeng')) return { on: false, ok: false, result: null };
  const result = judgeSaengsang({
    prevMonths: num($('fields').querySelector('.s-prev')),
    sangMonths: num($('fields').querySelector('.s-sang')),
    increasePct: num($('fields').querySelector('.s-inc')),
    contractDate: val('s-date'),
  });
  return { on: true, ok: result.ok, result };
}

function checkRow(c) {
  const cls = c.warn ? 'warn' : (c.ok ? 'ok' : 'no');
  const ic = c.warn ? '!' : (c.ok ? '✓' : '✕');
  return `<div class="check ${cls}"><div class="ic">${ic}</div><div><div class="lbl">${c.label}</div><div class="det">${c.detail}</div></div></div>`;
}

function render(r, saeng) {
  const badge = { exempt: '비과세', partial: '부분 비과세', taxable: '과세' }[r.verdict];
  const saengBlock = saeng.on ? `
    <div class="saeng-box">
      <h4>상생임대주택 요건 ${saeng.ok ? '✅ 충족' : '❌ 미충족'}</h4>
      ${saeng.result.checks.map(checkRow).join('')}
    </div>` : '';

  $('result').innerHTML = `
    <div class="verdict ${r.verdict}">
      <span class="tag">${badge}</span>
      <div class="head">${r.headline}</div>
    </div>
    <div>${r.checklist.map(checkRow).join('')}</div>
    ${saengBlock}
    ${r.reasons.length ? `<div class="reasons"><b style="font-size:12.5px;color:#7d6608">참고</b><ul style="padding-left:18px;margin:6px 0 0">${r.reasons.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : ''}
    <div class="lawref">${r.lawRef.join(' · ')}${saeng.on ? ' · ' + saeng.result.lawRef.join('') : ''}</div>
    <div class="muted">※ 참고용 판정입니다. 세대 판정·부득이한 사유·감면·재건축(조합원입주권) 등은 반영하지 않았습니다. 실제 신고 전 세무 전문가 확인이 필요합니다.</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

function judge() {
  const saeng = readSaengsang();
  if (mode === 'single') {
    const r = judgeSingleHouseExempt({
      acquireDate: val('f-acq'), saleDate: val('f-sale'),
      acquiredInAdjust: val('f-adj') === '1',
      liveYears: num($('fields').querySelector('.f-live')),
      isOneHousehold: val('f-one') === '1',
      salePrice: num($('fields').querySelector('.f-price')),
      saengsangOk: saeng.ok,
      contractBeforeAdjust: checked('f-contract'),
      finalOneReset: checked('f-final'),
      finalOneDate: val('f-finaldate'),
    });
    render(r, saeng);
  } else {
    const r = judgeTempTwoExempt({
      prevAcquireDate: val('t-prevacq'), newAcquireDate: val('t-newacq'), prevSaleDate: val('t-sale'),
      prevAcquiredInAdjust: val('t-adj') === '1',
      prevLiveYears: num($('fields').querySelector('.t-live')),
      salePrice: num($('fields').querySelector('.t-price')),
      saengsangOk: saeng.ok,
    });
    render(r, saeng);
  }
}

$('modeSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  mode = btn.dataset.mode;
  $('modeSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  renderFields();
});
$('judgeBtn').addEventListener('click', judge);

renderFields();
