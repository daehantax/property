/**
 * 중과세율 판정기 페이지 — 주택수 산정 + 취득세·양도세 중과 판정
 * 판정 엔진(src/core/heavy-tax-judge.js)을 브라우저에서 직접 실행한다.
 */

import { judgeHeavyTax } from '../../core/heavy-tax-judge.js';

const $ = (id) => document.getElementById(id);
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const pct = (r) => `${(r * 100).toFixed(2).replace(/\.00$/, '')}%`;

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
const STATUS = [
  { v: 'normal', t: '일반 보유' },
  { v: 'inherit', t: '상속(5년 이내)' },
  { v: 'rental', t: '장기임대 등록' },
  { v: 'excluded', t: '기타 중과제외 특례' },
];

let txType = 'acquire';
let others = [
  { label: '보유주택A', region: 'adjust', metro: 'metro', kind: 'house', price: 900_000_000, status: 'normal' },
];

function selHtml(cls, options, cur) {
  return `<select class="${cls}">` +
    options.map((o) => `<option value="${o.v}" ${o.v === cur ? 'selected' : ''}>${o.t}</option>`).join('') +
    '</select>';
}
function moneyHtml(cls, val) {
  return `<input class="${cls}" data-kind="money" inputmode="numeric" value="${fmt(val)}"><div class="money-hint"></div>`;
}

function renderTarget() {
  $('targetTitle').textContent = txType === 'acquire' ? '이번에 취득하는 주택' : '이번에 양도하는 주택';
  $('targetFields').innerHTML = `
    <div class="grid2">
      <div><label>소재지</label>${selHtml('t-region', REGION, 'adjust')}</div>
      <div><label>권역(양도세 3억 판정)</label>${selHtml('t-metro', METRO, 'metro')}</div>
      <div><label>유형</label>${selHtml('t-kind', KIND, 'house')}</div>
      <div><label>${txType === 'acquire' ? '취득가액(시가)' : '기준시가'}</label>${moneyHtml('t-price', 1_200_000_000)}</div>
    </div>
    <div class="chk"><input type="checkbox" class="t-temp"> 일시적 2주택 (${txType === 'acquire' ? '종전주택 처분기한 내' : '종전주택 양도'})</div>
    ${txType === 'acquire' ? '<div class="chk"><input type="checkbox" class="t-legal"> 법인 취득</div>' : ''}
  `;
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
      <div><label>공시·기준시가</label>${moneyHtml('o-price', o.price)}</div>
      <div><label>상태</label>${selHtml('o-status', STATUS, o.status)}</div>
    </div>
  </div>`;
}

function renderOthers() {
  $('others').innerHTML = others.map(otherRowHtml).join('') || '<p class="muted">보유한 다른 주택이 없으면 비워 두세요.</p>';
  bindMoney($('others'));
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

function readOthersFromDom() {
  const rows = [...$('others').querySelectorAll('.row-mini')];
  return rows.map((row) => ({
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
  return {
    label: '대상주택',
    region: f.querySelector('.t-region').value,
    metro: f.querySelector('.t-metro').value === 'metro',
    kind: f.querySelector('.t-kind').value,
    price: Number(f.querySelector('.t-price').value.replace(/[^\d]/g, '')) || 0,
    tempTwo: f.querySelector('.t-temp')?.checked || false,
  };
}

function listBlock(title, items, cls) {
  if (!items.length) return '';
  return `<div style="margin-top:8px"><b style="font-size:12.5px;color:#47606f">${title}</b>
    <ul class="lst ${cls}">${items.map((r) => `<li>${r}</li>`).join('')}</ul></div>`;
}

function renderResult() {
  // 상태 반영을 위해 others 배열 최신화
  others = readOthersFromDom();
  const target = readTarget();
  const isLegalEntity = txType === 'acquire' && ($('targetFields').querySelector('.t-legal')?.checked || false);

  const { primary, jongbu } = judgeHeavyTax({ txType, target, others, isLegalEntity });
  const heavy = txType === 'acquire' ? primary.heavy : primary.isHeavy;

  let verdictBody;
  if (txType === 'acquire') {
    verdictBody = `
      <span class="tag">${heavy ? '중과 대상' : '일반세율'}</span>
      <div class="rate">취득세율 ${pct(primary.rate)}</div>
      <div class="sub">${primary.rateLabel}</div>`;
  } else {
    verdictBody = `
      <span class="tag">${heavy ? '중과 대상' : '중과 없음'}</span>
      <div class="rate">${heavy ? `기본세율 +${(primary.surcharge * 100).toFixed(0)}%p` : '기본세율 적용'}</div>
      <div class="sub">${heavy ? '장기보유특별공제 배제' : '장기보유특별공제 적용 가능'} · ${primary.regionLabel}</div>`;
  }

  $('result').innerHTML = `
    <div class="verdict ${heavy ? 'heavy' : 'light'}">
      <div style="font-size:13px;font-weight:800;color:#34495e;margin-bottom:2px">${primary.tax} 중과 판정</div>
      ${verdictBody}
    </div>

    <div class="count-badge"><span>${txType === 'acquire' ? '취득 후 세대 주택수' : '1세대 중과 주택수'}</span> <b>${primary.houseCount}</b> <span>주택</span></div>

    <div>
      ${listBlock('주택수 포함', primary.included, 'inc')}
      ${listBlock('주택수 제외', primary.excluded, 'exc')}
    </div>

    <div class="reasons">
      <b style="font-size:12.5px;color:#7d6608">판정 근거</b>
      <ul class="lst" style="padding-left:18px;margin:6px 0 0">${primary.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>
    </div>

    <div class="muted"><b>${jongbu.tax}</b>: ${jongbu.note}</div>
    <div class="muted">${primary.note}</div>
    <div class="lawref">${[...primary.lawRef, ...jongbu.lawRef].join(' · ')}</div>
    <div class="muted">※ 참고용 판정입니다. 정비구역·감면·임대등록 요건 등 세부 사실관계에 따라 결과가 달라질 수 있으니 실제 적용 전 세무 전문가 확인이 필요합니다.</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

// ── 이벤트 ─────────────────────────────────────
$('txSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  txType = btn.dataset.tx;
  $('txSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  $('txHint').textContent = txType === 'acquire'
    ? '취득 후 세대 주택수와 취득 주택 소재지(조정/비조정)로 8%·12% 중과를 판정합니다.'
    : '양도 주택이 조정대상지역이고 1세대 중과 주택수가 2 이상이면 +20/30%p 중과·장특공 배제입니다.';
  renderTarget();
});

$('addBtn').addEventListener('click', () => {
  others = readOthersFromDom();
  others.push({ label: `보유주택${String.fromCharCode(65 + others.length)}`, region: 'adjust', metro: 'metro', kind: 'house', price: 500_000_000, status: 'normal' });
  renderOthers();
});

$('others').addEventListener('click', (e) => {
  if (!e.target.classList.contains('del')) return;
  others = readOthersFromDom();
  others.splice(Number(e.target.closest('.row-mini').dataset.i), 1);
  renderOthers();
});

$('judgeBtn').addEventListener('click', renderResult);

// 초기화
$('txHint').textContent = '취득 후 세대 주택수와 취득 주택 소재지(조정/비조정)로 8%·12% 중과를 판정합니다.';
renderTarget();
renderOthers();
