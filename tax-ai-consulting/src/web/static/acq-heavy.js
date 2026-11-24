/**
 * 취득세 계산기 — 매매·증여·상속·신축 취득세 + 중과(8%·12%) 판정
 * 계산 엔진(src/core/acquisition-calc.js)의 calcAcquisitionTax 를 브라우저에서 실행한다.
 * 기준: 국세청 「2026 주택과 세금」 제1편 (책 27~59쪽)
 */

import { calcAcquisitionTax } from '../../core/acquisition-calc.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const won = (n) => `${fmt(Math.round(n))}원`;
const pct = (r) => `${(r * 100).toFixed(4).replace(/\.?0+$/, '')}%`;
const num = (el) => Number(String(el.value).replace(/[^\d]/g, '')) || 0;

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

const CAUSE = [
  { v: 'buy', t: '매매 (유상취득)' }, { v: 'gift', t: '증여' },
  { v: 'inherit', t: '상속' }, { v: 'build', t: '신축 (원시취득)' },
];
const TARGET_KIND = [{ v: 'house', t: '주택' }, { v: 'officetel', t: '오피스텔' }];
const REGION = [{ v: 'adjust', t: '조정대상지역' }, { v: 'nonadjust', t: '비조정지역' }];
const CAPITAL = [{ v: '1', t: '수도권 (서울·인천·경기)' }, { v: '0', t: '수도권 외 지역' }];
const AREA = [{ v: '0', t: '85㎡ 이하 (국민주택규모)' }, { v: '1', t: '85㎡ 초과' }];
const KIND = [
  { v: 'house', t: '주택' }, { v: 'inway', t: '조합원입주권' },
  { v: 'presale', t: '주택분양권' }, { v: 'officetel', t: '주거용 오피스텔' },
];
// 보유 주택의 주택수 산정 상태
const OTHER_STATUS = [
  { v: 'normal', t: '일반 보유' },
  { v: 'inherit', t: '상속(5년 이내)' },
  { v: 'redev', t: '정비구역·사업시행구역 소재' },
  { v: 'excluded', t: '기타 중과제외 특례' },
];
const LOW_LIMIT = [
  { v: '100000000', t: '1억 (수도권 또는 2025.1.1 이전 취득)' },
  { v: '200000000', t: '2억 (수도권 외 · 2025.1.2 이후 취득)' },
];
// 취득 원인별 가액 입력 안내
const PRICE_LABEL = {
  buy: ['주택 전체 취득가액 (실거래가)', '지분만 사더라도 주택 전체 가액을 넣으세요.'],
  gift: ['주택 전체 시가인정액', '매매사례가액·감정가액 등. 없으면 시가표준액.'],
  inherit: ['주택 전체 시가표준액 (과세표준)', '상속은 주택공시가격이 과세표준입니다.'],
  build: ['취득가액 (공사비 등 사실상 취득가격)', '신축에 들어간 비용 합계.'],
};

let others = [];

const selHtml = (cls, options, cur) =>
  `<select class="${cls}">${options.map((o) => `<option value="${o.v}" ${o.v === cur ? 'selected' : ''}>${o.t}</option>`).join('')}</select>`;
const moneyHtml = (cls, val) =>
  `<input class="${cls}" data-kind="money" inputmode="numeric" value="${fmt(val)}"><div class="money-hint"></div>`;
const chkHtml = (cls, text, hint = '') =>
  `<label class="chk"><input type="checkbox" class="${cls}"> <span>${text}</span></label>${hint ? `<div class="fld-hint" style="margin-left:22px">${hint}</div>` : ''}`;

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

// 입력값을 보존하면서 취득 원인에 맞는 항목만 다시 그린다
let state = {
  cause: 'buy', kind: 'house', fullPrice: 1_200_000_000, share: 100, officialPrice: 800_000_000,
  over85: '0', region: 'adjust', capital: '1',
};

function renderTarget() {
  const s = state;
  const isBuy = s.cause === 'buy';
  const isOfficetel = isBuy && s.kind === 'officetel';
  const [priceLabel, priceHint] = PRICE_LABEL[s.cause];
  const showOfficial = !isOfficetel && (isBuy || s.cause === 'gift');   // 저가주택(1억/2억)·증여 3억 판정에 사용
  const showRegion = !isOfficetel && (isBuy || s.cause === 'gift');

  const checks = [];
  if (isBuy && !isOfficetel) {
    checks.push(chkHtml('t-temp', '일시적 2주택', '종전주택을 신규주택 취득일부터 3년 안에 처분할 예정'));
    checks.push(chkHtml('t-legal', '법인 취득'));
    checks.push(chkHtml('t-before', '조정대상지역 지정고시일 이전에 매매계약 체결', '계약금 지급 증빙이 있어야 하며, 비조정지역 세율이 적용됩니다.'));
    checks.push(chkHtml('t-redev', '정비구역·사업시행구역 소재', '저가주택(1억/2억 이하)이라도 중과제외가 안 됩니다.'));
    checks.push(chkHtml('t-exempt', '그 밖의 중과제외주택', '농어촌주택, 가정어린이집, 지방 준공 후 미분양 아파트 등'));
  }
  if (s.cause === 'gift') checks.push(chkHtml('t-donor1', '1세대 1주택자인 배우자·직계존비속에게서 증여받음', '증여자 세대가 1주택이면 조정지역이라도 12% 중과에서 제외됩니다.'));
  if (s.cause === 'inherit') checks.push(chkHtml('t-heir', '상속인 세대 전원이 무주택 (1가구 1주택 특례)', '2.8% 대신 0.8%가 적용됩니다.'));
  if (!isOfficetel) checks.push(chkHtml('t-luxury', '고급주택', '시가표준액 9억 초과 + 연면적 331㎡ 초과(공동주택 245㎡ 초과) 등. 세율에 8%p 가산.'));

  $('targetFields').innerHTML = `
    <div class="grid2">
      <div><label>취득 원인</label>${selHtml('t-cause', CAUSE, s.cause)}</div>
      ${isBuy ? `<div><label>물건 종류</label>${selHtml('t-kind', TARGET_KIND, s.kind)}</div>` : '<div></div>'}
      <div class="wide"><label>${priceLabel}</label>${moneyHtml('t-price', s.fullPrice)}<div class="fld-hint">${priceHint}</div></div>
      <div><label>취득 지분 (%)</label><input class="t-share" inputmode="decimal" value="${s.share}"><div class="fld-hint">단독 취득은 100</div></div>
      <div><label>전용면적</label>${selHtml('t-area', AREA, s.over85)}</div>
      ${showOfficial ? `<div class="wide"><label>주택 전체 시가표준액 (공시가격)</label>${moneyHtml('t-official', s.officialPrice)}
        <div class="fld-hint">${isBuy ? '저가주택 중과제외(수도권 1억·수도권 외 2억 이하) 판정에 씁니다.' : '조정대상지역 증여 12% 중과(3억 이상) 판정에 씁니다.'}</div></div>` : ''}
      ${showRegion ? `<div><label>소재지 (취득일 현재)</label>${selHtml('t-region', REGION, s.region)}
        <div class="fld-hint"><a href="regulated-areas.html" target="_blank" rel="noopener noreferrer">규제지역 연혁에서 확인 ↗</a></div></div>` : ''}
      ${isBuy && !isOfficetel ? `<div><label>수도권 여부</label>${selHtml('t-capital', CAPITAL, s.capital)}</div>` : ''}
    </div>
    ${checks.join('')}`;
  bindMoney($('targetFields'));
  $('othersCard').style.display = isBuy && !isOfficetel ? '' : 'none';
}

/** 화면의 현재 입력값을 state 로 옮긴다 (다시 그리기 전에 호출) */
function saveTarget() {
  const f = $('targetFields');
  const q = (c) => f.querySelector(c);
  if (!q('.t-cause')) return;
  state.cause = q('.t-cause').value;
  if (q('.t-kind')) state.kind = q('.t-kind').value;
  state.fullPrice = num(q('.t-price'));
  state.share = Number(q('.t-share').value) || 100;
  state.over85 = q('.t-area').value;
  if (q('.t-official')) state.officialPrice = num(q('.t-official'));
  if (q('.t-region')) state.region = q('.t-region').value;
  if (q('.t-capital')) state.capital = q('.t-capital').value;
}

function otherRowHtml(o, i) {
  return `<div class="row-mini" data-i="${i}">
    <button class="del" title="삭제">×</button>
    <div class="grid2">
      <div><label>이름</label><input class="o-label" value="${o.label}"></div>
      <div><label>유형</label>${selHtml('o-kind', KIND, o.kind)}</div>
      <div><label>시가표준액</label>${moneyHtml('o-price', o.price)}</div>
      <div><label>상태</label>${selHtml('o-status', OTHER_STATUS, o.status)}</div>
      <div class="wide"><label>저가주택 기준 (주택수 제외)</label>${selHtml('o-low', LOW_LIMIT, String(o.lowLimit))}</div>
    </div>
  </div>`;
}

function renderOthers() {
  $('others').innerHTML = others.map(otherRowHtml).join('') || '<p class="muted">보유한 다른 주택이 없으면 비워 두세요. (무주택 세대의 첫 취득)</p>';
  bindMoney($('others'));
}

function readOthersRaw() {
  return [...$('others').querySelectorAll('.row-mini')].map((row) => ({
    label: row.querySelector('.o-label').value || '주택',
    kind: row.querySelector('.o-kind').value,
    price: num(row.querySelector('.o-price')),
    status: row.querySelector('.o-status').value,
    lowLimit: Number(row.querySelector('.o-low').value),
  }));
}
/** 엔진에 넘길 형태로 변환 — 'redev' 상태는 정비구역 플래그로 바꾼다 */
const toEngineOther = (o) => ({
  label: o.label, kind: o.kind, price: o.price, region: 'adjust', metro: true,
  status: o.status === 'redev' ? 'normal' : o.status,
  inRedevZone: o.status === 'redev', lowLimit: o.lowLimit,
});

const listBlock = (title, items, cls) => items.length
  ? `<div style="margin-top:8px"><b style="font-size:14px;color:#47606f">${title}</b><ul class="lst ${cls}">${items.map((r) => `<li>${r}</li>`).join('')}</ul></div>`
  : '';

/** 유상취득 세율표 (책 31쪽) — 이번 취득에 해당하는 칸을 강조 */
function matrix(r, isLegal, isTemp) {
  const rows = [['1주택', '1~3%', '1~3%'], ['2주택', '8%', '1~3%'], ['3주택', '12%', '8%'], ['4주택 이상', '12%', '12%']];
  const col = r.region === 'adjust' ? 0 : 1;
  const rowIdx = isLegal ? -1 : Math.min(r.houseCount, 4) - 1;
  const body = rows.map((row, ri) => `<tr><th>${row[0]}</th>${[row[1], row[2]].map((v, ci) => {
    const on = ri === rowIdx && ci === col;
    return `<td class="${on ? (r.heavy ? 'on' : 'on-light') : ''}">${v}</td>`;
  }).join('')}</tr>`).join('');
  const note = isLegal ? '법인은 주택수와 무관하게 12%' : isTemp && !r.heavy && r.houseCount === 2 ? '일시적 2주택 → 표준세율 적용' : '';
  return `<table class="matrix"><caption>유상취득 세율표 (강조 = 취득 후 주택수 기준 칸)${note ? ' · ' + note : ''}</caption>
    <tr><th>주택수 \\ 소재지</th><th>조정대상지역</th><th>비조정지역</th></tr>${body}</table>`;
}

function calc() {
  saveTarget();
  others = readOthersRaw();
  const f = $('targetFields');
  const on = (c) => !!f.querySelector(c)?.checked;
  const s = state;
  const isHouseBuy = s.cause === 'buy' && s.kind === 'house';
  const share = Math.min(Math.max(s.share, 0), 100) / 100;

  const r = calcAcquisitionTax({
    cause: s.cause,
    kind: s.cause === 'buy' ? s.kind : 'house',
    fullPrice: s.fullPrice,
    share,
    // 상속은 과세표준 자체가 시가표준액. 신축·오피스텔은 시가표준액 판정이 없다.
    officialPrice: (isHouseBuy || s.cause === 'gift') ? s.officialPrice : s.fullPrice,
    over85: s.over85 === '1',
    region: s.region,
    capital: s.capital === '1',
    contractBeforeDesignation: on('.t-before'),
    isLegalEntity: on('.t-legal'),
    tempTwo: on('.t-temp'),
    inRedevZone: on('.t-redev'),
    otherExempt: on('.t-exempt'),
    luxury: on('.t-luxury'),
    donorOneHouseFamily: on('.t-donor1'),
    heirHouseless: on('.t-heir'),
    others: isHouseBuy ? others.map(toEngineOther) : [],
  });

  const row = (name, rate, amount) => `<tr><td>${name}</td><td>${rate}</td><td>${won(amount)}</td></tr>`;
  const extra = r.heavyExtra
    ? `<div class="notice red"><b>중과로 늘어난 세금 ${won(r.heavyExtra.extra)}</b><br>중과가 없었다면 ${won(r.heavyExtra.standardTotal)} → 중과 적용 ${won(r.total)}</div>` : '';
  const temp = r.tempTwoRisk
    ? `<div class="notice blue"><b>일시적 2주택으로 표준세율 적용</b><br>${r.tempTwoRisk.years}년 안에 종전주택을 처분하지 못하면 8% 중과로 다시 계산되어
       총 ${won(r.tempTwoRisk.heavyAmounts.total)} (추가 납부 ${won(r.tempTwoRisk.extra)} + 미신고 시 가산세)</div>` : '';

  $('result').innerHTML = `
    <div class="verdict ${r.heavy ? 'heavy' : 'light'}">
      <span class="tag">${r.heavy ? '중과 대상' : '중과 아님'}</span>
      <div class="head">납부할 세금 ${won(r.total)}</div>
      <div class="sub">${r.causeLabel} · ${r.rateLabel} · 합계세율 ${pct(r.totalRate)}</div>
    </div>
    <table class="taxtbl">
      <thead><tr><th>세목</th><th>세율</th><th>세액</th></tr></thead>
      <tbody>
        <tr><td>과세표준${r.share < 1 ? ` (지분 ${pct(r.share)})` : ''}</td><td></td><td>${won(r.base)}</td></tr>
        ${row('취득세', pct(r.rates.take), r.takeTax)}
        ${row('지방교육세', pct(r.rates.edu), r.eduTax)}
        ${row('농어촌특별세', r.rates.ag ? pct(r.rates.ag) : '비과세', r.agTax)}
        <tr class="sum"><td>합계</td><td>${pct(r.totalRate)}</td><td>${won(r.total)}</td></tr>
      </tbody>
    </table>
    ${extra}${temp}
    ${r.houseCount != null ? `<div class="count-badge"><span>취득 후 세대 주택수</span> <b>${r.houseCount}</b> <span>주택</span></div>
      ${matrix(r, on('.t-legal'), on('.t-temp'))}
      ${listBlock('주택수 포함', r.included, 'inc')}
      ${listBlock('주택수 제외', r.excluded, 'exc')}` : ''}
    <div class="reasons">
      <b style="font-size:14px;color:#7d6608">판정 근거</b>
      <ul class="lst" style="padding-left:18px;margin:6px 0 0">${r.reasons.map((x) => `<li>${x}</li>`).join('')}</ul>
      ${r.warnings.length ? `<b style="font-size:14px;color:#7d6608;display:block;margin-top:10px">확인할 점</b><ul class="warns">${r.warnings.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="lawref">${r.lawRef.join(' · ')}</div>
    <div class="muted">※ 참고용 계산입니다. 생애최초·출산·임대주택 등 취득세 감면과 부담부증여(유상·무상 구분 과세)는 반영하지 않았습니다.
      1세대 범위, 분양권·입주권 취득시점, 중과제외 요건 등 사실관계에 따라 결과가 달라질 수 있으니 신고 전 확인이 필요합니다.</div>
  `;
  $('empty').style.display = 'none';
  $('result').style.display = 'block';
}

// 취득 원인·물건 종류가 바뀌면 입력 항목을 다시 그린다
$('targetFields').addEventListener('change', (e) => {
  if (!e.target.classList.contains('t-cause') && !e.target.classList.contains('t-kind')) return;
  saveTarget();
  renderTarget();
});
$('addBtn').addEventListener('click', () => {
  others = readOthersRaw();
  others.push({ label: `보유주택${String.fromCharCode(65 + others.length)}`, kind: 'house', price: 500_000_000, status: 'normal', lowLimit: 100_000_000 });
  renderOthers();
});
$('others').addEventListener('click', (e) => {
  if (!e.target.classList.contains('del')) return;
  others = readOthersRaw();
  others.splice(Number(e.target.closest('.row-mini').dataset.i), 1);
  renderOthers();
});
$('judgeBtn').addEventListener('click', calc);

others = [{ label: '보유주택A', kind: 'house', price: 900_000_000, status: 'normal', lowLimit: 100_000_000 }];
renderTarget();
renderOthers();
