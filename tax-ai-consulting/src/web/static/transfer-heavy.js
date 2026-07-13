/**
 * 양도소득세 중과 판정기 — 2주택 중과(+20%p) vs 3주택 이상 중과(+30%p)
 * 판정 엔진(src/core/heavy-tax-judge.js)의 judgeTransferHeavy를 브라우저에서 실행.
 */

import { judgeTransferHeavy } from '../../core/heavy-tax-judge.js';

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

const REGION = [{ v: 'adjust', t: '조정대상지역' }, { v: 'nonadjust', t: '비조정지역' }];
const METRO = [{ v: 'metro', t: '수도권·광역시·세종' }, { v: 'local', t: '그 외 지방' }];
const KIND = [
  { v: 'house', t: '주택' }, { v: 'inway', t: '조합원입주권' },
  { v: 'presale', t: '주택분양권' }, { v: 'officetel', t: '주거용 오피스텔' },
];
// 양도 대상 주택의 상태 (중과 배제 사유 판정)
const TARGET_STATUS = [
  { v: 'normal', t: '일반 보유' },
  { v: 'temp', t: '일시적 2주택(종전주택 양도)' },
  { v: 'rental', t: '장기임대 등록 주택' },
  { v: 'inherit', t: '상속주택(5년 이내)' },
  { v: 'excluded', t: '기타 중과제외 주택' },
];
// 보유 다른 주택의 상태
const OTHER_STATUS = [
  { v: 'normal', t: '일반 보유' },
  { v: 'inherit', t: '상속(5년 이내)' },
  { v: 'rental', t: '장기임대 등록' },
  { v: 'excluded', t: '기타 중과제외' },
];

let others = [
  { label: '보유주택A', region: 'adjust', metro: 'metro', kind: 'house', price: 900_000_000, status: 'normal' },
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
      <div><label>권역(3억 제외 판정)</label>${selHtml('t-metro', METRO, 'metro')}</div>
      <div><label>유형</label>${selHtml('t-kind', KIND, 'house')}</div>
      <div><label>기준시가</label>${moneyHtml('t-price', 1_200_000_000)}</div>
    </div>
    <div style="margin-top:8px"><label>양도 주택 상태</label>${selHtml('t-status', TARGET_STATUS, 'normal')}</div>`;
  bindMoney($('targetFields'));
}

function otherRowHtml(o, i) {
  return `<div class="row-mini" data-i="${i}">
    <button class="del" title="삭제">×</button>
    <div class="grid2">
      <div><label>이름</label><input class="o-label" value="${o.label}"></div>
      <div><label>유형</label>${selHtml('o-kind', KIND, o.kind)}</div>
      <div><label>소재지</label>${selHtml('o-region', REGION, o.region)}</div>
      <div><label>권역</label>${selHtml('o-metro', METRO, o.metro)}</div>
      <div><label>기준시가</label>${moneyHtml('o-price', o.price)}</div>
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
    region: row.querySelector('.o-region').value,
    metro: row.querySelector('.o-metro').value === 'metro',
    price: Number(row.querySelector('.o-price').value.replace(/[^\d]/g, '')) || 0,
    status: row.querySelector('.o-status').value,
  }));
}

function readTarget() {
  const f = $('targetFields');
  const st = f.querySelector('.t-status').value;
  return {
    label: '양도주택',
    region: f.querySelector('.t-region').value,
    metro: f.querySelector('.t-metro').value === 'metro',
    kind: f.querySelector('.t-kind').value,
    price: Number(f.querySelector('.t-price').value.replace(/[^\d]/g, '')) || 0,
    tempTwo: st === 'temp',
    status: st === 'temp' ? 'normal' : st,
  };
}

const listBlock = (title, items, cls) => items.length
  ? `<div style="margin-top:8px"><b style="font-size:12.5px;color:#47606f">${title}</b><ul class="lst ${cls}">${items.map((r) => `<li>${r}</li>`).join('')}</ul></div>`
  : '';

function legend(activeIdx) {
  const cells = [
    { b: '1주택', t: '중과 없음' },
    { b: '2주택', t: '+20%p 중과' },
    { b: '3주택 이상', t: '+30%p 중과' },
  ];
  return `<div class="legend">${cells.map((c, i) =>
    `<div class="${i === activeIdx ? 'on' : ''}"><b>${c.b}</b>${c.t}</div>`).join('')}</div>`;
}

function judge() {
  others = readOthers();
  const target = readTarget();
  const r = judgeTransferHeavy({ target, others });

  const activeIdx = r.isHeavy ? (r.surcharge === 0.30 ? 2 : 1) : 0;
  const head = r.isHeavy
    ? `${r.heavyType} · 기본세율 +${(r.surcharge * 100).toFixed(0)}%p`
    : '중과 없음 (기본세율)';
  const sub = r.isHeavy
    ? '장기보유특별공제 <b>배제</b> · 양도차익 전액 과세표준'
    : (r.exemptReason ? `${r.exemptReason} · 장기보유특별공제 적용 가능` : '장기보유특별공제 적용 가능');

  $('result').innerHTML = `
    <div class="verdict ${r.isHeavy ? 'heavy' : 'light'}">
      <span class="tag">${r.isHeavy ? '중과 대상' : '중과 없음'}</span>
      <div class="head">${head}</div>
      <div class="sub">${sub}</div>
    </div>
    ${legend(activeIdx)}
    <div class="count-badge"><span>1세대 중과 주택수</span> <b>${r.houseCount}</b> <span>주택</span></div>
    ${listBlock('주택수 포함', r.included, 'inc')}
    ${listBlock('주택수 제외', r.excluded, 'exc')}
    <div class="reasons">
      <b style="font-size:12.5px;color:#7d6608">판정 근거</b>
      <ul class="lst" style="padding-left:18px;margin:6px 0 0">${r.reasons.map((x) => `<li>${x}</li>`).join('')}</ul>
    </div>
    <div class="muted">${r.note}</div>
    <div class="lawref">${r.lawRef.join(' · ')}</div>
    <div class="muted">※ 참고용 판정입니다. 임대등록 요건·상속 특례·분양권 취득시점 등 세부 사실관계에 따라 결과가 달라질 수 있으니 실제 신고 전 세무 전문가 확인이 필요합니다.</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

$('addBtn').addEventListener('click', () => {
  others = readOthers();
  others.push({ label: `보유주택${String.fromCharCode(65 + others.length)}`, region: 'adjust', metro: 'metro', kind: 'house', price: 500_000_000, status: 'normal' });
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
