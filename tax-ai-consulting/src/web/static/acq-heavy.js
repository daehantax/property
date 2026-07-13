/**
 * 취득세 중과 판정기 — 취득 후 세대 주택수 × 조정지역 → 8%·12% 중과
 * 판정 엔진(src/core/heavy-tax-judge.js)의 judgeAcquisitionHeavy를 브라우저에서 실행.
 */

import { judgeAcquisitionHeavy } from '../../core/heavy-tax-judge.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const pct = (r) => `${(r * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

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

const REGION = [{ v: 'adjust', t: '조정대상지역' }, { v: 'nonadjust', t: '비조정지역' }];
const KIND = [
  { v: 'house', t: '주택' }, { v: 'inway', t: '조합원입주권' },
  { v: 'presale', t: '주택분양권' }, { v: 'officetel', t: '주거용 오피스텔' },
];
// 취득세 주택수 제외 사유 (임대주택은 취득세 주택수 제외 대상 아님 → 제외)
const OTHER_STATUS = [
  { v: 'normal', t: '일반 보유' },
  { v: 'inherit', t: '상속(5년 이내)' },
  { v: 'excluded', t: '기타 중과제외 특례' },
];

let others = [
  { label: '보유주택A', kind: 'house', price: 900_000_000, status: 'normal' },
];

const selHtml = (cls, options, cur) =>
  `<select class="${cls}">${options.map((o) => `<option value="${o.v}" ${o.v === cur ? 'selected' : ''}>${o.t}</option>`).join('')}</select>`;
const moneyHtml = (cls, val) =>
  `<input class="${cls}" data-kind="money" inputmode="numeric" value="${fmt(val)}"><div class="money-hint"></div>`;

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

function renderTarget() {
  $('targetFields').innerHTML = `
    <div class="grid2">
      <div><label>소재지</label>${selHtml('t-region', REGION, 'adjust')}</div>
      <div><label>유형</label>${selHtml('t-kind', KIND, 'house')}</div>
      <div><label>취득가액(시가)</label>${moneyHtml('t-price', 1_200_000_000)}</div>
      <div></div>
    </div>
    <div class="chk"><input type="checkbox" class="t-temp"> 일시적 2주택 (종전주택 처분기한 내)</div>
    <div class="chk"><input type="checkbox" class="t-legal"> 법인 취득</div>`;
  bindMoney($('targetFields'));
}

function otherRowHtml(o, i) {
  return `<div class="row-mini" data-i="${i}">
    <button class="del" title="삭제">×</button>
    <div class="grid2">
      <div><label>이름</label><input class="o-label" value="${o.label}"></div>
      <div><label>유형</label>${selHtml('o-kind', KIND, o.kind)}</div>
      <div><label>시가표준액</label>${moneyHtml('o-price', o.price)}</div>
      <div><label>상태</label>${selHtml('o-status', OTHER_STATUS, o.status)}</div>
    </div>
  </div>`;
}

function renderOthers() {
  $('others').innerHTML = others.map(otherRowHtml).join('') || '<p class="muted">보유한 다른 주택이 없으면 비워 두세요.</p>';
  bindMoney($('others'));
}

function readOthers() {
  return [...$('others').querySelectorAll('.row-mini')].map((row) => ({
    label: row.querySelector('.o-label').value || '주택',
    kind: row.querySelector('.o-kind').value,
    region: 'adjust', // 취득세 주택수는 소재지와 무관 (수만 셈)
    metro: true,
    price: Number(row.querySelector('.o-price').value.replace(/[^\d]/g, '')) || 0,
    status: row.querySelector('.o-status').value,
  }));
}

function readTarget() {
  const f = $('targetFields');
  return {
    label: '취득주택',
    region: f.querySelector('.t-region').value,
    metro: true,
    kind: f.querySelector('.t-kind').value,
    price: Number(f.querySelector('.t-price').value.replace(/[^\d]/g, '')) || 0,
    tempTwo: f.querySelector('.t-temp').checked,
  };
}

const listBlock = (title, items, cls) => items.length
  ? `<div style="margin-top:8px"><b style="font-size:12.5px;color:#47606f">${title}</b><ul class="lst ${cls}">${items.map((r) => `<li>${r}</li>`).join('')}</ul></div>`
  : '';

/** 취득세 유상취득 세율 매트릭스 (해당 칸 강조) */
function matrix(count, region, isLegal, isTemp) {
  const rows = [
    ['1주택', '1~3%', '1~3%'],
    ['2주택', '8%', '1~3%'],
    ['3주택', '12%', '8%'],
    ['4주택 이상', '12%', '12%'],
  ];
  const col = region === 'adjust' ? 0 : 1; // 표시상 조정=1열, 비조정=2열
  // 강조 위치: 법인·일시적2주택은 매트릭스로 표현 못 하므로 강조 안 함(주석으로 안내)
  const rowIdx = (isLegal || isTemp) ? -1 : Math.min(count, 4) - 1;
  const heavy = !(isLegal || isTemp) && ((region === 'adjust' && count >= 2) || (region === 'nonadjust' && count >= 3));
  const body = rows.map((r, ri) => {
    const cells = [`<th>${r[0]}</th>`];
    [r[1], r[2]].forEach((v, ci) => {
      const on = ri === rowIdx && ci === col;
      const cls = on ? (heavy ? 'on' : 'on-light') : '';
      cells.push(`<td class="${cls}">${v}</td>`);
    });
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  const note = isLegal ? '법인 취득 → 주택수 무관 12% (아래)' : isTemp ? '일시적 2주택 → 일반세율(1~3%) 적용' : '';
  return `<table class="matrix"><caption>유상취득 세율표 (강조 = 이번 취득)${note ? ' · ' + note : ''}</caption>
    <tr><th>주택수 \\ 소재지</th><th>조정대상지역</th><th>비조정지역</th></tr>${body}</table>`;
}

function judge() {
  others = readOthers();
  const target = readTarget();
  const isLegalEntity = $('targetFields').querySelector('.t-legal').checked;
  const r = judgeAcquisitionHeavy({ target, others, isLegalEntity });

  $('result').innerHTML = `
    <div class="verdict ${r.heavy ? 'heavy' : 'light'}">
      <span class="tag">${r.heavy ? '중과 대상' : '일반세율'}</span>
      <div class="head">취득세율 ${pct(r.rate)}</div>
      <div class="sub">${r.rateLabel}</div>
    </div>
    <div class="count-badge"><span>취득 후 세대 주택수</span> <b>${r.houseCount}</b> <span>주택</span></div>
    ${matrix(r.houseCount, r.region, isLegalEntity, r.isTemp)}
    ${listBlock('주택수 포함', r.included, 'inc')}
    ${listBlock('주택수 제외', r.excluded, 'exc')}
    <div class="reasons">
      <b style="font-size:12.5px;color:#7d6608">판정 근거</b>
      <ul class="lst" style="padding-left:18px;margin:6px 0 0">${r.reasons.map((x) => `<li>${x}</li>`).join('')}</ul>
    </div>
    <div class="muted">${r.note}</div>
    <div class="lawref">${r.lawRef.join(' · ')}</div>
    <div class="muted">※ 참고용 판정입니다. 정비·사업시행구역 여부, 감면·특례 요건, 분양권·오피스텔 취득시점 등 세부 사실관계에 따라 결과가 달라질 수 있으니 실제 취득 전 세무 전문가 확인이 필요합니다.</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

$('addBtn').addEventListener('click', () => {
  others = readOthers();
  others.push({ label: `보유주택${String.fromCharCode(65 + others.length)}`, kind: 'house', price: 500_000_000, status: 'normal' });
  renderOthers();
});
$('others').addEventListener('click', (e) => {
  if (!e.target.classList.contains('del')) return;
  others = readOthers();
  others.splice(Number(e.target.closest('.row-mini').dataset.i), 1);
  renderOthers();
});
$('judgeBtn').addEventListener('click', judge);

renderTarget();
renderOthers();
